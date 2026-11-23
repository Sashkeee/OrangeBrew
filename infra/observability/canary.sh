#!/bin/sh
set -eu
case "${CANARY_ID:-}" in ''|*[!A-Za-z0-9_-]*) echo 'Invalid CANARY_ID' >&2; exit 1;; esac
timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
printf '{"@timestamp":"%s","message":"OrangeBrew end-to-end logging canary","ecs":{"version":"8.11.0"},"log":{"level":"info","logger":"Smoke"},"event":{"id":"%s","action":"logging.canary"}}\n' "$timestamp" "$CANARY_ID" >> /fixtures/canary.ndjson
echo "Wrote canary $CANARY_ID"
