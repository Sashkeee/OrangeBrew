import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Run after smoke.mjs has started the disposable stack. Retain the container
// until indexing finishes: Docker removes its json-file log on container removal.
const root = fileURLToPath(new URL('../../', import.meta.url));
const name = `orangebrew-smoke-${randomUUID()}`;
const compose = ['compose', '--env-file', resolve(root, '.env.observability'), '-f', resolve(root, 'docker-compose.observability.yml')];
if (process.argv.includes('--ci')) compose.push('-f', resolve(root, 'docker-compose.observability.ci.yml'));
function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (result.error) throw result.error;
  return result;
}
const source = `
  import logger, { flushLogs } from './utils/logger.js';
  logger.child({ module: 'DockerSmoke' }).info({ requestId: process.env.CANARY_ID }, 'Winston Docker collection canary');
  await flushLogs();
  setTimeout(() => {}, 180000);
`;
let created = false;
try {
  const started = docker(['run', '-d', '--name', name, '--network', 'none', '--log-driver', 'json-file',
    '--log-opt', 'max-size=1m', '--log-opt', 'max-file=1',
    '--label', 'orangebrew_collect=true', '--label', 'orangebrew_env=test', '--label', 'orangebrew_service=backend',
    '-e', 'APP_ENV=test', '-e', 'LOG_FORMAT=json', '-e', `CANARY_ID=${name}`,
    '--entrypoint', 'node', 'orangebrew-backend-check', '--input-type=module', '-e', source]);
  assert.equal(started.status, 0, `Failed to create canary container: ${started.stderr}`);
  created = true;
  let eventId;
  const emittedBy = Date.now() + 15000;
  while (!eventId && Date.now() < emittedBy) {
    const logs = docker(['logs', name]);
    for (const line of logs.stdout.trim().split('\n')) {
      if (!line) continue;
      const record = JSON.parse(line);
      if (record['orangebrew.request.id'] === name) eventId = record['event.id'];
    }
    if (!eventId) await delay(200);
  }
  assert(eventId, 'Winston did not emit the expected ECS record');
  const indexedBy = Date.now() + 120000;
  while (Date.now() < indexedBy) {
    const result = docker([...compose, 'exec', '-T', 'elasticsearch', 'bash', '/smoke/check-canary.sh', eventId]);
    if (result.status === 0) {
      process.stdout.write(`PASS: Winston -> Docker autodiscovery -> Filebeat -> Kafka -> Logstash -> Elasticsearch (${eventId}).\n`);
      process.exitCode = 0;
      break;
    }
    await delay(2000);
  }
  assert.equal(process.exitCode, 0, 'Docker stdout canary was not indexed within 120 seconds');
} finally {
  if (created) docker(['rm', '-f', name]);
}
