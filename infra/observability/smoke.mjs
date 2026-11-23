import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const envFile = resolve(root, '.env.observability');
if (!existsSync(envFile)) throw new Error('Run node infra/observability/generate-env.mjs first.');
const id = `smoke-${randomUUID()}`;
const environment = {...process.env, FILEBEAT_SMOKE_ENABLED: 'true', CANARY_ID: id};
const base = ['compose', '--env-file', envFile, '-f', resolve(root, 'docker-compose.observability.yml')];
const ci = process.argv.includes('--ci');
if (ci) base.push('-f', resolve(root, 'docker-compose.observability.ci.yml'));
function run(args, options = {}) {
  const result = spawnSync('docker', [...base, ...args], {cwd: root, env: environment, encoding: 'utf8', timeout: 120000, ...options});
  if (result.error) throw result.error;
  return result;
}
if (process.argv.includes('--start')) {
  const services = ci ? ['elasticsearch', 'kafka-bootstrap', 'elastic-bootstrap', 'logstash', 'filebeat'] : [];
  const started = run(['up', '-d', ...services], {stdio: 'inherit', timeout: 300000});
  if (started.status !== 0) throw new Error('Stack startup failed.');
} else {
  const enabled = run(['up', '-d', '--no-deps', 'filebeat'], {stdio: 'inherit'});
  if (enabled.status !== 0) throw new Error('Start the observability stack before running smoke.');
}
const canary = run(['run', '--rm', '--no-deps', 'canary']);
if (canary.status !== 0) throw new Error(`Canary emission failed: ${canary.stderr}`);
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  const result = run(['exec', '-T', 'elasticsearch', 'bash', '/smoke/check-canary.sh', id]);
  if (result.status === 0) {
    process.stdout.write(`PASS: ${id} travelled through Filebeat -> Kafka -> Logstash -> Elasticsearch. Open Kibana and filter event.id : "${id}".\n`);
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
}
throw new Error(`Canary ${id} was not indexed within 120 seconds. Inspect bootstrap, Filebeat, Kafka lag and Logstash DLQ.`);
