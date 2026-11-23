#!/usr/bin/env bash
set -euo pipefail
[[ ${APP_ENV:-} =~ ^(test|prod|development)$ ]] || { echo 'Invalid APP_ENV' >&2; exit 1; }
sed "s/__APP_ENV__/$APP_ENV/g" /bootstrap/orangebrew.ndjson > /tmp/orangebrew.ndjson
response=$(curl --silent --show-error --fail-with-body --max-time 60 --cacert /certs/ca/ca.crt \
  -u "elastic:$ELASTIC_PASSWORD" -X POST 'https://kibana:5601/api/saved_objects/_import?overwrite=true' \
  -H 'kbn-xsrf: bootstrap' -F file=@/tmp/orangebrew.ndjson)
[[ $response == *'"success":true'* ]] || { echo 'Kibana saved object import failed; inspect bootstrap container response securely.' >&2; exit 1; }
echo 'Kibana data view, dashboard and saved investigations are ready.'
