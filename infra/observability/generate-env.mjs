import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const environment = process.argv[2] || 'test';
if (!['test', 'development'].includes(environment)) {
  throw new Error('This generator prepares a single-node local/test stack; use a reviewed production secret store for prod.');
}
const secret = () => randomBytes(32).toString('base64url');
const target = resolve('.env.observability');
const values = {
  APP_ENV: environment,
  ELASTIC_PASSWORD: secret(),
  KIBANA_SYSTEM_PASSWORD: secret(),
  LOGSTASH_PASSWORD: secret(),
  OPERATOR_PASSWORD: secret(),
  KIBANA_ENCRYPTION_KEY: secret(),
  KAFKA_CLUSTER_ID: randomBytes(16).toString('base64url'),
  ELASTIC_PORT: '9200', KIBANA_PORT: '5601', FILEBEAT_SMOKE_ENABLED: 'false',
};
writeFileSync(target, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', {flag: 'wx', mode: 0o600});
process.stdout.write('Created .env.observability with random secrets. Keep this file private; existing files are never overwritten.\n');
