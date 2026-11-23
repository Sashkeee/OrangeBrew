#!/usr/bin/env bash
set -euo pipefail
[[ ${APP_ENV:-} =~ ^(test|prod|development)$ ]] || { echo 'Invalid APP_ENV' >&2; exit 1; }
for name in ELASTIC_PASSWORD KIBANA_SYSTEM_PASSWORD LOGSTASH_PASSWORD OPERATOR_PASSWORD; do
  value=${!name:-}
  [[ $value =~ ^[A-Za-z0-9_-]{24,}$ && $value != REPLACE* ]] || { echo "Generate a base64url secret for $name" >&2; exit 1; }
done
api() {
  local method=$1 path=$2 payload=${3:-} response
  response=$(mktemp)
  local -a body=()
  [[ -z $payload ]] || body=(--data-binary "$payload")
  if ! curl --silent --show-error --fail-with-body --max-time 30 --cacert /certs/ca/ca.crt \
    -u "elastic:$ELASTIC_PASSWORD" -X "$method" "https://elasticsearch:9200/$path" \
    -H 'Content-Type: application/json' "${body[@]}" --output "$response"; then
    echo "Elasticsearch bootstrap failed: $method /$path" >&2
    sed -e "s/$ELASTIC_PASSWORD/[REDACTED]/g" -e "s/$LOGSTASH_PASSWORD/[REDACTED]/g" \
      -e "s/$KIBANA_SYSTEM_PASSWORD/[REDACTED]/g" -e "s/$OPERATOR_PASSWORD/[REDACTED]/g" "$response" >&2
    rm "$response"
    return 1
  fi
  rm "$response"
}
api POST _security/user/kibana_system/_password "{\"password\":\"$KIBANA_SYSTEM_PASSWORD\"}"
api PUT _component_template/orangebrew-ecs-v1 "$(cat /bootstrap/component-template.json)"
for dataset in backend device proxy audit debug; do
  case $dataset in audit) days=30;; debug) days=3;; *) days=14;; esac
  api PUT "_ilm/policy/orangebrew-$dataset" "{\"policy\":{\"phases\":{\"hot\":{\"actions\":{\"rollover\":{\"max_age\":\"7d\",\"max_primary_shard_size\":\"20gb\"}}},\"delete\":{\"min_age\":\"${days}d\",\"actions\":{\"delete\":{}}}}}}"
  api PUT "_index_template/orangebrew-$dataset-$APP_ENV" "{\"index_patterns\":[\"logs-orangebrew.$dataset-$APP_ENV\"],\"priority\":501,\"data_stream\":{},\"composed_of\":[\"orangebrew-ecs-v1\"],\"template\":{\"settings\":{\"index.lifecycle.name\":\"orangebrew-$dataset\",\"number_of_shards\":1,\"number_of_replicas\":0}}}"
  # PUT data stream returns 400 if it already exists; inspect existence first.
  if ! curl --silent --fail --max-time 15 --cacert /certs/ca/ca.crt -u "elastic:$ELASTIC_PASSWORD" "https://elasticsearch:9200/_data_stream/logs-orangebrew.$dataset-$APP_ENV" >/dev/null; then
    # The create-data-stream API does not accept an HTTP request body.
    api PUT "_data_stream/logs-orangebrew.$dataset-$APP_ENV"
  fi
done
api PUT _security/role/orangebrew_ingest "{\"cluster\":[\"monitor\"],\"indices\":[{\"names\":[\"logs-orangebrew.*-$APP_ENV\"],\"privileges\":[\"create_doc\",\"view_index_metadata\"]}]}"
api PUT _security/user/orangebrew_ingest "{\"password\":\"$LOGSTASH_PASSWORD\",\"roles\":[\"orangebrew_ingest\"]}"
api PUT _security/role/orangebrew_reader "{\"cluster\":[],\"indices\":[{\"names\":[\"logs-orangebrew.backend-$APP_ENV\",\"logs-orangebrew.device-$APP_ENV\",\"logs-orangebrew.proxy-$APP_ENV\",\"logs-orangebrew.debug-$APP_ENV\"],\"privileges\":[\"read\",\"view_index_metadata\"]}]}"
api PUT _security/user/orangebrew_operator "{\"password\":\"$OPERATOR_PASSWORD\",\"roles\":[\"orangebrew_reader\",\"kibana_admin\"]}"
echo 'Elasticsearch streams, lifecycle, ingest and operator roles are ready.'
