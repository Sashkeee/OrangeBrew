const assert = require('node:assert/strict');
const https = require('node:https');
const { readFileSync } = require('node:fs');

const ca = readFileSync('/usr/share/kibana/config/certs/ca/ca.crt');
const auth = `orangebrew_operator:${process.env.OPERATOR_PASSWORD}`;
function get(path) {
  return new Promise((resolve, reject) => {
    const request = https.get({ hostname: 'localhost', port: 5601, path, auth, ca, timeout: 10000 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`Kibana returned HTTP ${response.statusCode} for ${path}`));
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('Kibana request timed out')));
  });
}
(async () => {
  const view = await get(`/api/data_views/data_view/orangebrew-logs-${process.env.APP_ENV}`);
  assert.equal(view.data_view.title, `logs-orangebrew.*-${process.env.APP_ENV}`);
  const dashboard = await get('/api/saved_objects/dashboard/orangebrew-overview');
  assert.equal(dashboard.attributes.title, 'OrangeBrew Operations');
  assert.equal(dashboard.references.length, 8);
  const searches = await get('/api/saved_objects/_find?type=search&per_page=100');
  assert.equal(searches.saved_objects.filter(object => object.id.startsWith('orangebrew-')).length, 6);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
