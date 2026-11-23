#!/usr/bin/env bash
set -euo pipefail
[[ ${APP_ENV:-} =~ ^(test|prod|development)$ ]] || { echo 'Invalid APP_ENV' >&2; exit 1; }
brokers=${KAFKA_BROKERS:-kafka:9092}
create_topic() {
  local suffix=$1 partitions=$2 retention_ms=$3 timestamp_type=${4:-LogAppendTime}
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$brokers" --create --if-not-exists \
    --topic "orangebrew.$APP_ENV.$suffix" --partitions "$partitions" --replication-factor 1 \
    --config min.insync.replicas=1 --config cleanup.policy=delete \
    --config "retention.ms=$retention_ms" --config retention.bytes=5368709120 \
    --config max.message.bytes=1048576 --config "message.timestamp.type=$timestamp_type"
}
create_topic logs.backend.v1 3 259200000
create_topic logs.device.v1 3 259200000
create_topic logs.proxy.v1 1 259200000
create_topic logs.quarantine.v1 1 604800000
create_topic process.events.v1 3 2592000000
create_topic device.telemetry.v1 3 259200000
create_topic audit.events.v1 1 2592000000
create_topic process.events.dlq.v1 1 1209600000
echo 'Kafka topics are ready (single-node test replication).'
