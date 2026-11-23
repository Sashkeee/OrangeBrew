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
for (const command of [['ps', '-a'], ['logs', '--no-color', '--tail=80', 'elastic-bootstrap', 'logstash', 'filebeat', 'kibana', 'kibana-bootstrap']]) {
  const result = spawnSync('docker', [...base, ...command], { cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true });
  let output = (result.stdout || '') + (result.stderr || '');
  for (const secret of secrets) output = output.replaceAll(secret, '[REDACTED]');
  process.stdout.write(output);
}
// Only synthetic CI data is inspected. Select known diagnostic fields instead
// of printing payloads, credentials, arbitrary context or device messages.
if (process.argv.includes('--ci')) {
  const commands = [
    ['exec', '-T', 'elasticsearch', 'bash', '-c', 'curl --silent --fail --cacert config/certs/ca/ca.crt -u "elastic:$ELASTIC_PASSWORD" "https://localhost:9200/logs-orangebrew.*/_search?size=5&filter_path=hits.total,hits.hits._index,hits.hits._source.event.id,hits.hits._source.data_stream"'],
    ['exec', '-T', 'logstash', 'curl', '--silent', '--fail', 'http://localhost:9600/_node/stats/pipelines?filter_path=pipelines.*.events,pipelines.*.dead_letter_queue'],
  ];
  for (const command of commands) {
    const result = spawnSync('docker', [...base, ...command], { cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true });
    let output = (result.stdout || '') + (result.stderr || '');
    for (const secret of secrets) output = output.replaceAll(secret, '[REDACTED]');
    process.stdout.write(`${command[2]} summary: ${output}\n`);
  }
  const record = spawnSync('docker', [...base, 'exec', '-T', 'kafka', '/opt/kafka/bin/kafka-console-consumer.sh',
    '--bootstrap-server', 'localhost:9092', '--topic', 'orangebrew.test.logs.quarantine.v1',
    '--from-beginning', '--max-messages', '1', '--timeout-ms', '10000'], { cwd: root, encoding: 'utf8', timeout: 20000, windowsHide: true });
  for (const line of (record.stdout || '').split('\n')) {
    try {
      const value = JSON.parse(line);
      process.stdout.write(`Quarantine summary: ${JSON.stringify({ reason: value.orangebrew_quarantine?.reason,
        source: value.orangebrew_source, rootKeys: Object.keys(value), rawKeys: Object.keys(value.orangebrew_raw || {}) })}\n`);
    } catch { /* empty stream or non-JSON diagnostic line */ }
  }
}
