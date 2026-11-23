import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'orangebrew-observability-'));
const dummy = 'ValidationOnly_NotARealCredential_123456789';
const values = {
  APP_ENV: 'test', ELASTIC_PASSWORD: dummy, KIBANA_SYSTEM_PASSWORD: dummy,
  LOGSTASH_PASSWORD: dummy, OPERATOR_PASSWORD: dummy, KIBANA_ENCRYPTION_KEY: dummy,
  KAFKA_CLUSTER_ID: 'MkU3OEVBNTcwNTJENDM2Qk', JWT_SECRET: dummy,
  KAFKA_BROKERS: 'kafka:9092', KAFKA_SSL: 'true', KAFKA_SASL_USERNAME: 'validation',
  KAFKA_SASL_PASSWORD: dummy,
  KAFKA_FILEBEAT_USERNAME: 'validation', KAFKA_FILEBEAT_PASSWORD: dummy,
  KAFKA_LOGSTASH_JAAS_CONFIG: 'org.apache.kafka.common.security.scram.ScramLoginModule required username="validation" password="validation";',
  KAFKA_TRUSTSTORE_PASSWORD: dummy, ELASTICSEARCH_URL: 'https://elasticsearch.example:9200',
  OBSERVABILITY_CERTS_DIR: temporary,
};
const envFile = join(temporary, 'validation.env');
writeFileSync(envFile, Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n'));
const environment = {...process.env, ...values, DOCKER_CONFIG: temporary};
function compose(files, extras = []) {
  const result = spawnSync('docker', ['compose', '--env-file', envFile, ...files.flatMap(file => ['-f', resolve(root, file)]), ...extras, 'config', '--format', 'json'], {cwd: root, env: environment, encoding: 'utf8', timeout: 30000});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Compose validation failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}
try {
  const config = compose(['docker-compose.observability.yml']);
  const services = config.services;
  assert(!services.kafka.ports?.length, 'Kafka must not publish the plaintext listener');
  for (const name of ['elasticsearch', 'kibana']) assert(services[name].ports.every(port => port.host_ip === '127.0.0.1'), `${name} must bind localhost only`);
  assert.equal(services.kafka.environment.KAFKA_AUTO_CREATE_TOPICS_ENABLE, 'false');
  assert.equal(services.kafka.environment.KAFKA_TRANSACTION_STATE_LOG_MIN_ISR, '1');
  for (const name of ['kafka', 'elasticsearch', 'logstash', 'filebeat']) assert(services[name].volumes.some(volume => volume.type === 'volume'), `${name} needs persistent storage`);
  assert(config.networks.observability.internal, 'Test Kafka network must be internal');
  const ci = compose(['docker-compose.observability.yml', 'docker-compose.observability.ci.yml']);
  assert.equal(ci.services.elasticsearch.environment.ES_JAVA_OPTS, '-Xms512m -Xmx512m');
  for (const [app, overlay] of [['docker-compose.test.yml', 'docker-compose.kafka.yml'], ['docker-compose.prod.yml', 'docker-compose.kafka.prod.yml']]) {
    const merged = compose([app, overlay]);
    assert(!merged.services.vector, 'Legacy Vector service must be removed');
    const backend = merged.services[app.includes('test') ? 'backend-test' : 'backend-prod'];
    assert.equal(backend.environment.KAFKA_PUBLISH_ENABLED, 'true');
    assert(Object.hasOwn(backend.networks, 'observability'), 'Kafka-enabled application must join the provisioned network');
    assert.equal(backend.logging.driver, 'json-file');
  }
  const component = JSON.parse(readFileSync(resolve(root, 'infra/elastic/component-template.json'), 'utf8'));
  const production = compose(['docker-compose.observability.production.yml']);
  assert(!production.services.kafka && !production.services.elasticsearch, 'Production collectors use separately provisioned clusters');
  assert(!production.services.filebeat.ports?.length && !production.services.logstash.ports?.length, 'Production ingest has no public listener');
  assert(production.services.filebeat.environment.KAFKA_FILEBEAT_USERNAME !== undefined);
  assert.equal(component.template.mappings.dynamic, false, 'Unknown fields must not create arbitrary mappings');
  const saved = readFileSync(resolve(root, 'infra/kibana/orangebrew.ndjson'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const ids = new Set(saved.map(object => `${object.type}:${object.id}`));
  assert(saved.some(object => object.type === 'dashboard'));
  for (const object of saved) for (const ref of object.references || []) assert(ids.has(`${ref.type}:${ref.id}`), `Missing saved object reference ${ref.id}`);
  const pipeline = readFileSync(resolve(root, 'infra/logstash/pipeline/logs.conf'), 'utf8');
  assert(pipeline.includes('enable_auto_commit => false'));
  assert(!pipeline.match(/topics\s*=>[^\n]*quarantine/), 'Quarantine must not be recursively consumed');
  if (process.argv.includes('--runtime')) {
    const certificates = spawnSync('docker', ['compose', '--env-file', envFile, '-f', resolve(root, 'docker-compose.observability.yml'), 'run', '--rm', '--no-deps', 'certificates'], {cwd: root, env: environment, stdio: 'inherit', timeout: 180000});
    assert.equal(certificates.status, 0, 'Certificate provisioning for runtime validation failed');
    const runtimeCommands = [
      ['filebeat', 'filebeat', 'test', 'config', '-e', '--strict.perms=false'],
      ['logstash', '/usr/share/logstash/bin/logstash', '--config.test_and_exit'],
    ];
    for (const [service, ...command] of runtimeCommands) {
      const result = spawnSync('docker', ['compose', '--env-file', envFile, '-f', resolve(root, 'docker-compose.observability.yml'), 'run', '--rm', '--no-deps', service, ...command], {cwd: root, env: environment, stdio: 'inherit', timeout: 180000});
      assert.equal(result.status, 0, `${service} runtime configuration check failed`);
    }
  }
  process.stdout.write('Validated Compose topology, app overlays, persistence, private listeners, mappings and Kibana references.\n');
} finally {
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
  assert(basename(temporary).startsWith('orangebrew-observability-'));
  rmSync(temporary, {recursive: true, force: true});
}
