// Single smoke test: node scripts/smoke.js (no network, no docker, no cluster needed)
const assert = require('assert');
const path = require('path');
const { detect, guess } = require('../services/detector');
const { dockerfileFor } = require('../services/dockerfiles');
const { render, sanitizeName } = require('../services/manifest');
const { redactText } = require('../services/shell');

const s = (n) => path.join(__dirname, '..', 'sample-repos', n);

assert.strictEqual(detect(s('node-sample')).stack, 'node');
assert.strictEqual(detect(s('python-sample')).stack, 'python');
assert.strictEqual(detect(s('static-sample')).stack, 'static');
assert.deepStrictEqual(guess(['Dockerfile'], 'FROM x\nEXPOSE 8080'), { stack: 'existing-dockerfile', port: 8080 });
assert.strictEqual(guess(['README.md'], '').stack, null);

assert.ok(dockerfileFor(detect(s('node-sample')), 3000).includes('CMD ["npm", "start"]'));
assert.ok(dockerfileFor(detect(s('python-sample')), 8000).includes('CMD ["python", "app.py"]'));

assert.strictEqual(sanitizeName('My_Repo.Name!'), 'my-repo-name');
assert.strictEqual(sanitizeName('---'), 'app');
const y = render({ name: 'x', namespace: 'deploysync', image: 'u/x:abc1234', port: 3000, replicas: 2, mode: 'cloud', repo: 'o/x', commit: 'abc' });
assert.ok(y.includes('type: LoadBalancer') && y.includes('replicas: 2'));
assert.ok(render({ name: 'x', namespace: 'n', image: 'i', port: 1, replicas: 1, mode: 'local' }).includes('type: NodePort'));

assert.strictEqual(redactText('clone https://x-access-token:SECRET@github.com', ['SECRET']), 'clone https://x-access-token:***@github.com');
const crypto = require('crypto');
const { verifySignature } = require('../services/github');
const body = Buffer.from('{"a":1}');
const sig = 'sha256=' + crypto.createHmac('sha256', 'k').update(body).digest('hex');
assert.ok(verifySignature(body, sig, 'k'));
assert.ok(!verifySignature(body, sig, 'other'));
assert.ok(!verifySignature(body, 'sha256=00', 'k'));
assert.ok(!verifySignature(body, undefined, 'k'));

const { isAllowed } = require('../services/access');
delete process.env.ALLOWED_GITHUB_USERS;
assert.ok(isAllowed('anyone'));
process.env.ALLOWED_GITHUB_USERS = ' Alice, bob ';
assert.ok(isAllowed('alice') && isAllowed('BOB') && !isAllowed('mallory'));

const { pickHost } = require('../services/hosts');
const owners = { 'app.example.in': 'alice' };
const pick = (o) => pickHost({ domain: 'example.in', ownerOf: (h) => owners[h] || null, previous: null, ...o });
assert.strictEqual(pick({ appName: 'app', userSlug: 'alice', login: 'alice' }), 'app.example.in');
assert.strictEqual(pick({ appName: 'app', userSlug: 'bob', login: 'bob' }), 'app-bob.example.in');
assert.strictEqual(pick({ appName: 'deploy', userSlug: 'bob', login: 'bob' }), 'deploy-app.example.in');
assert.strictEqual(pick({ appName: 'app', userSlug: 'bob', login: 'bob', previous: 'app-bob.example.in' }), 'app-bob.example.in');
assert.strictEqual(pickHost({ appName: 'a', userSlug: 'b', login: 'b', domain: '', ownerOf: () => null }), null);
const withHost = render({ name: 'x', namespace: 'n', image: 'i', port: 3000, replicas: 1, mode: 'local', host: 'x.example.in' });
assert.ok(withHost.includes('kind: Ingress') && withHost.includes('host: "x.example.in"') && withHost.includes('type: ClusterIP'));
assert.ok(!render({ name: 'x', namespace: 'n', image: 'i', port: 1, replicas: 1, mode: 'cloud' }).includes('kind: Ingress'));

console.log('smoke: all checks passed');
