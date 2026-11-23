# Normalise the nested Filebeat payload. The source cannot overwrite collector
# routing/environment, and unknown fields never become root Elasticsearch fields.
require "time"

def register(params)
  @environment = params.fetch("environment")
  raise "Invalid APP_ENV" unless %w[test prod development].include?(@environment)
end

def nested(value, *path)
  path.reduce(value) { |current, key| current.is_a?(Hash) ? current[key] : nil }
end

def merge_fields!(destination, source)
  source.each do |key, value|
    if destination.key?(key)
      raise ArgumentError, "Conflicting ECS keys" unless destination[key].is_a?(Hash) && value.is_a?(Hash)
      merge_fields!(destination[key], value)
    else
      destination[key] = value
    end
  end
end

def expand_object(value, depth = 0)
  result = {}
  value.each do |key, item|
    raise ArgumentError, "Invalid ECS key" unless key.is_a?(String) && key.length <= 256
    parts = key.split(".", -1)
    raise ArgumentError, "Invalid ECS path" if parts.any?(&:empty?) || depth + parts.length > 8
    leaf = item.is_a?(Hash) ? expand_object(item, depth + parts.length) : item
    branch = parts.reverse.reduce(leaf) { |child, part| {part => child} }
    merge_fields!(result, branch)
  end
  result
end

def safe_string(value, limit = 8192)
  return nil if value.nil? || value.is_a?(Hash) || value.is_a?(Array)
  value.to_s[0, limit]
end

def bounded_context(value, depth = 0)
  return "[depth limit]" if depth > 4
  case value
  when Hash
    value.first(32).to_h.transform_keys { |key| key.to_s[0, 80] }.transform_values { |item| bounded_context(item, depth + 1) }.each_with_object({}) do |(key, item), result|
      result[key] = key.match?(/password|token|authorization|cookie|secret|api[_-]?key/i) ? "[REDACTED]" : item
    end
  when Array
    value.first(8).map { |item| bounded_context(item, depth + 1) }
  when String
    value[0, 2048]
  when Numeric, TrueClass, FalseClass, NilClass
    value
  else
    value.to_s[0, 2048]
  end
end

def quarantine(event, reason)
  # Retain the already source-redacted payload for investigation, under bounded
  # retention and restricted Kafka access. Never consume quarantine in this input.
  event.set("[orangebrew_quarantine][reason]", reason)
  event.set("[orangebrew_quarantine][environment]", @environment)
  event.set("[@metadata][quarantine]", true)
  [event]
end

def filter(event)
  source = event.get("orangebrew_source")
  raw = event.get("orangebrew_raw")
  return quarantine(event, "unknown_source") unless source.is_a?(Hash) && source["environment"] == @environment && %w[backend proxy].include?(source["service"])
  return quarantine(event, "invalid_json") unless raw.is_a?(Hash) && !(event.get("tags") || []).include?("_jsonparsefailure") && event.get("[error][type]") != "json"
  return quarantine(event, "invalid_message") unless raw["message"].is_a?(String) && !raw["message"].empty?
  # ECS Winston emits dotted keys. Filebeat's ndjson target may retain them;
  # accept both representations without silently overwriting conflicting paths.
  begin
    raw = expand_object(raw)
  rescue ArgumentError
    return quarantine(event, "unexpanded_or_conflicting_keys")
  end

  begin
    source_time = LogStash::Timestamp.parse_iso8601(raw.fetch("@timestamp"))
  rescue StandardError
    return quarantine(event, "invalid_timestamp")
  end
  now = LogStash::Timestamp.now
  level = nested(raw, "log", "level") || "info"
  return quarantine(event, "invalid_level") unless %w[trace debug info warn error fatal].include?(level)
  dataset = source["service"] == "proxy" ? "orangebrew.proxy" : "orangebrew.backend"
  dataset = "orangebrew.device" if source["service"] == "backend" && nested(raw, "event", "dataset") == "orangebrew.device"
  dataset = "orangebrew.debug" if source["service"] == "backend" && %w[trace debug].include?(level)

  # Keep metadata Kafka offsets for recovery; replace all ordinary root fields.
  event.to_hash.keys.each { |key| event.remove(key) unless key == "@metadata" }
  event.set("@timestamp", source_time)
  event.set("message", raw["message"][0, 65536])
  event.set("[ecs][version]", safe_string(nested(raw, "ecs", "version"), 32) || "8.11.0")
  event.set("[log][level]", level)
  event.set("[log][logger]", safe_string(nested(raw, "log", "logger"), 128) || source["service"])
  event.set("[service][name]", source["service"] == "proxy" ? "orangebrew-proxy" : "orangebrew-backend")
  version = safe_string(nested(raw, "service", "version"), 128)
  event.set("[service][version]", version) if version
  event.set("[deployment][environment][name]", @environment)
  event.set("[container][id]", safe_string(source["container_id"], 128))
  event.set("[event][ingested]", now)
  event.set("[event][dataset]", dataset)
  event.set("[orangebrew][ingestion_delay_ms]", [(now.to_f - source_time.to_f) * 1000, 0].max)

  paths = [
    %w[event id], %w[event action], %w[user id], %w[trace id], %w[span id],
    %w[orangebrew request id], %w[orangebrew correlation id], %w[orangebrew device id],
    %w[orangebrew session id], %w[orangebrew process state], %w[orangebrew http route],
    %w[http request method], %w[url path], %w[error type], %w[error message], %w[error stack_trace]
  ]
  paths.each do |path|
    value = safe_string(nested(raw, *path), path == %w[error stack_trace] ? 32768 : 8192)
    event.set("[#{path.join("][")}]", value) if value
  end
  status = nested(raw, "http", "response", "status_code")
  event.set("[http][response][status_code]", status.to_i) if status.to_s.match?(/\A[1-5][0-9]{2}\z/)
  duration = nested(raw, "event", "duration")
  duration = raw["orangebrew_duration_seconds"].to_f * 1_000_000_000 if source["service"] == "proxy" && raw["orangebrew_duration_seconds"]
  event.set("[event][duration]", duration.to_i) if duration.is_a?(Numeric) && duration >= 0
  reserved = %w[@timestamp message ecs log service deployment event user error http url trace span container host data_stream orangebrew orangebrew_duration_seconds req res headers body]
  context = raw.reject { |key, _| reserved.include?(key) }
  explicit_context = nested(raw, "orangebrew", "context")
  context = context.merge(explicit_context) if explicit_context.is_a?(Hash)
  event.set("[orangebrew][context]", bounded_context(context)) unless context.empty?
  metrics = {
    "rss_mb" => raw["rssMemMb"], "heap_mb" => raw["heapUsedMb"],
    "ui_clients" => raw["uiClients"], "hw_clients" => raw["hwClients"],
    "uptime_seconds" => raw["uptime"], "outbox_pending" => nested(raw, "outbox", "pendingEvents"),
    "outbox_pending_bytes" => nested(raw, "outbox", "pendingBytes"),
    "outbox_oldest_age_ms" => nested(raw, "outbox", "oldestAgeMs"),
    "log_dropped" => nested(raw, "logger", "dropped")
  }
  metrics.each { |name, value| event.set("[orangebrew][metrics][#{name}]", value) if value.is_a?(Numeric) && value.finite? && value >= 0 }
  event.set("[data_stream][type]", "logs")
  event.set("[data_stream][dataset]", dataset)
  event.set("[data_stream][namespace]", @environment)
  event.set("[@metadata][dataset]", dataset)
  [event]
end

test "trusted routing wins over source payload" do
  parameters { {"environment" => "test"} }
  in_event do
    {"orangebrew_source" => {"environment" => "test", "service" => "backend", "container_id" => "abc"},
     "orangebrew_raw" => {"@timestamp" => "2026-11-23T10:00:00Z", "message" => "canary", "log" => {"level" => "info"}, "service" => {"name" => "attacker"}, "data_stream" => {"namespace" => "prod"}}}
  end
  expect("uses deployment identity") { |events| events[0].get("[service][name]") == "orangebrew-backend" && events[0].get("[data_stream][namespace]") == "test" }
end

test "invalid JSON is quarantined" do
  parameters { {"environment" => "test"} }
  in_event { {"orangebrew_source" => {"environment" => "test", "service" => "backend"}, "message" => "broken"} }
  expect("does not enter Elasticsearch") { |events| events[0].get("[@metadata][quarantine]") == true }
end

test "dotted key collisions are quarantined" do
  parameters { {"environment" => "test"} }
  in_event do
    {"orangebrew_source" => {"environment" => "test", "service" => "backend"}, "orangebrew_raw" => {"@timestamp" => "2026-11-23T10:00:00Z", "message" => "x", "log.level" => "warn", "log" => {"level" => "info"}}}
  end
  expect("rejects conflicting representation") { |events| events[0].get("[@metadata][quarantine]") == true }
end

test "flat Winston ECS payload survives Docker ndjson target" do
  parameters { {"environment" => "test"} }
  in_event do
    {"orangebrew_source" => {"environment" => "test", "service" => "backend", "container_id" => "docker-canary"},
     "orangebrew_raw" => {"@timestamp" => "2026-11-23T10:00:00Z", "message" => "Winston canary", "log.level" => "info",
       "log.logger" => "DockerSmoke", "ecs.version" => "8.10.0", "event.id" => "flat-canary", "event.dataset" => "orangebrew.backend",
       "orangebrew.request.id" => "request-canary", "service.name" => "untrusted"}}
  end
  expect("expands ECS while preserving trusted routing") do |events|
    event = events[0]
    event.get("[@metadata][quarantine]") != true && event.get("[event][id]") == "flat-canary" &&
      event.get("[orangebrew][request][id]") == "request-canary" && event.get("[log][logger]") == "DockerSmoke" &&
      event.get("[service][name]") == "orangebrew-backend"
  end
end

test "Winston heartbeat metadata and numeric metrics survive normalization" do
  parameters { {"environment" => "test"} }
  in_event do
    {"orangebrew_source" => {"environment" => "test", "service" => "backend", "container_id" => "abc"},
     "orangebrew_raw" => {"@timestamp" => "2026-11-23T10:00:00Z", "message" => "Heartbeat", "log" => {"level" => "info", "logger" => "Health"},
       "rssMemMb" => 120, "heapUsedMb" => 40, "uiClients" => 3, "hwClients" => 2, "uptime" => 100,
       "outbox" => {"pendingEvents" => 4, "pendingBytes" => 1024, "oldestAgeMs" => 900},
       "relay" => {"running" => true}, "logger" => {"dropped" => 2}, "customTarget" => 65}}
  end
  expect("retains numeric metrics and bounded diagnostic context") do |events|
    events[0].get("[orangebrew][metrics][rss_mb]") == 120 &&
      events[0].get("[orangebrew][metrics][outbox_pending]") == 4 &&
      events[0].get("[orangebrew][metrics][log_dropped]") == 2 &&
      events[0].get("[orangebrew][context][customTarget]") == 65 &&
      events[0].get("[orangebrew][context][relay][running]") == true
  end
end
