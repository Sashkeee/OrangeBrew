#!/usr/bin/env bash
set -euo pipefail
[[ ${1:-} =~ ^[A-Za-z0-9_-]+$ ]] || exit 2
response=$(curl --silent --show-error --fail --max-time 10 --cacert config/certs/ca/ca.crt \
  -u "elastic:$ELASTIC_PASSWORD" -X POST "https://localhost:9200/logs-orangebrew.backend-*/_search" \
  -H 'Content-Type: application/json' --data "{\"query\":{\"term\":{\"event.id\":\"$1\"}},\"size\":0}")
[[ $response =~ \"value\":([1-9][0-9]*) ]]
