#!/usr/bin/env bash
set -euo pipefail
umask 027
cd /certs
if [[ ! -f ca/ca.crt ]]; then
  /usr/share/elasticsearch/bin/elasticsearch-certutil ca --silent --pem --out /certs/ca.zip
  unzip -q /certs/ca.zip -d /certs
  rm /certs/ca.zip
fi
if [[ ! -f elasticsearch/elasticsearch.crt || ! -f kibana/kibana.crt ]]; then
  cat > /tmp/instances.yml <<'YAML'
instances:
  - name: elasticsearch
    dns: [elasticsearch, localhost]
    ip: [127.0.0.1]
  - name: kibana
    dns: [kibana, localhost]
    ip: [127.0.0.1]
YAML
  /usr/share/elasticsearch/bin/elasticsearch-certutil cert --silent --pem --in /tmp/instances.yml --ca-cert /certs/ca/ca.crt --ca-key /certs/ca/ca.key --out /certs/instances.zip
  unzip -qo /certs/instances.zip -d /certs
  rm /certs/instances.zip
fi
chown -R 1000:0 /certs
find /certs -type d -exec chmod 750 {} \;
find /certs -type f -exec chmod 640 {} \;
