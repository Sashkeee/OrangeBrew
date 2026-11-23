#!/usr/bin/env bash
set -euo pipefail
umask 027
cd /certs
if [[ ! -f ca/ca.crt ]]; then
  /usr/share/elasticsearch/bin/elasticsearch-certutil ca --silent --pem --out ca.zip
  unzip -q ca.zip
  rm ca.zip
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
  /usr/share/elasticsearch/bin/elasticsearch-certutil cert --silent --pem --in /tmp/instances.yml --ca-cert ca/ca.crt --ca-key ca/ca.key --out instances.zip
  unzip -qo instances.zip
  rm instances.zip
fi
chown -R 1000:0 /certs
find /certs -type d -exec chmod 750 {} \;
find /certs -type f -exec chmod 640 {} \;
