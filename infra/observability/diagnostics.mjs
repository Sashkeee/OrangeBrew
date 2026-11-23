import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const envFile = resolve(root, '.env.observability');
if (!existsSync(envFile)) process.exit(0);
const secrets = readFileSync(envFile, 'utf8').split(/\r?\n/).flatMap(line => {
  const value = line.slice(line.indexOf('=') + 1).replace(/^['"]|['"]$/g, '');
  return line.includes('=') && value.length >= 16 ? [value] : [];
});
const files = ['docker-compose.observability.yml', ...(process.argv.includes('--ci') ? ['docker-compose.observability.ci.yml'] : [])];
const base = ['compose', '--env-file', envFile, ...files.flatMap(path => ['-f', resolve(root, path)])];
for (const command of [['ps', '-a'], ['logs', '--no-color', '--tail=80', 'elastic-bootstrap', 'logstash', 'filebeat']]) {
  const result = spawnSync('docker', [...base, ...command], { cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true });
  let output = (result.stdout || '') + (result.stderr || '');
  for (const secret of secrets) output = output.replaceAll(secret, '[REDACTED]');
  process.stdout.write(output);
}
