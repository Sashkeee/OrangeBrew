import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const base = ['compose', '--env-file', resolve(root, '.env.observability'), '-f', resolve(root, 'docker-compose.observability.yml')];
if (process.argv.includes('--ci')) base.push('-f', resolve(root, 'docker-compose.observability.ci.yml'));
function compose(args, timeout = 30000) {
  const result = spawnSync('docker', [...base, ...args], { cwd: root, stdio: 'inherit', timeout, windowsHide: true });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Kibana smoke failed: compose ${args[0]}`);
}
// The hosted runner cannot hold every JVM and Kibana in memory concurrently.
// Stop ingest only after its independent checks, keeping Elasticsearch intact.
if (process.argv.includes('--ci')) compose(['stop', 'filebeat', 'logstash', 'kafka'], 120000);
compose(['up', '-d', '--wait', '--wait-timeout', '240', 'kibana'], 300000);
compose(['run', '--rm', '--no-deps', 'kibana-bootstrap'], 120000);
if (process.argv.includes('--ci')) compose(['exec', '-T', 'kibana', '/usr/share/kibana/node/bin/node', '/smoke/check-kibana.cjs'], 30000);
process.stdout.write(process.argv.includes('--ci')
  ? 'PASS: Kibana HTTPS, operator login, imported data view, dashboard and saved investigations.\n'
  : 'PASS: Kibana HTTPS readiness and saved object import.\n');
