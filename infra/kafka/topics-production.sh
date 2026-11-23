#!/usr/bin/env bash
set -euo pipefail
[[ ${APP_ENV:-prod} == prod ]] || { echo 'Production topic bootstrap requires APP_ENV=prod' >&2; exit 1; }
: "${KAFKA_BROKERS:?Set production bootstrap servers}"
: "${KAFKA_CLIENT_CONFIG:?Provide the private SASL_SSL administrative client properties file}"
[[ -f $KAFKA_CLIENT_CONFIG ]] || { echo 'Missing administrative Kafka client properties' >&2; exit 1; }
create_topic() {
  local suffix=$1 partitions=$2 retention_ms=$3
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$KAFKA_BROKERS" --command-config "$KAFKA_CLIENT_CONFIG" \
    --create --if-not-exists --topic "orangebrew.prod.$suffix" --partitions "$partitions" --replication-factor 3 \
    --config min.insync.replicas=2 --config cleanup.policy=delete --config "retention.ms=$retention_ms" \
    --config retention.bytes=5368709120 --config max.message.bytes=1048576 --config message.timestamp.type=LogAppendTime
}
create_topic logs.backend.v1 3 259200000
create_topic logs.device.v1 3 259200000
create_topic logs.proxy.v1 1 259200000
create_topic logs.quarantine.v1 1 604800000
create_topic process.events.v1 3 2592000000
create_topic device.telemetry.v1 3 259200000
create_topic audit.events.v1 1 2592000000
create_topic process.events.dlq.v1 1 1209600000
echo 'Production topic creation completed; inspect existing topic settings, ACLs and quotas separately.'
