const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalize, counts} = require('../docs/scanStatus');
const zero = {C: 0, H: 0, M: 0, L: 0, U: 0};
test('legacy requires complete non-negative counts and treats errors as unavailable evidence', () => {
  assert.equal(normalize({severity: [zero]}, 'image')[0].state, 'ok');
  assert.equal(normalize({}, 'base')[0].state, 'unavailable');
  assert.equal(normalize({severity: [zero], cve_error: 'Scanning Queued in Quay'}, 'image')[0].counts, null);
  assert.equal(counts({C: 0}), null);
  assert.equal(counts({...zero, U: -1}), null);
});
test('build and refresh are independent; absent freshness policy stays unknown', () => {
  const result = normalize({scan: {build: {image: {state: 'ok', counts: zero}}, refresh: {image: {state: 'error', counts: zero, last_success: {digest: 'sha256:old', observed_at: '2020-01-01', counts: zero}}}}}, 'image');
  assert.deepEqual(result.map(x => [x.namespace, x.state, x.freshness]), [['build', 'ok', 'unknown'], ['refresh', 'error', 'unknown']]);
  assert.equal(result[1].counts, null);
  assert.equal(result[1].last_success.digest, 'sha256:old');
});
for (const state of ['ok', 'unavailable', 'queued', 'unsupported', 'error']) test(`normalizes ${state} without manufacturing counts`, () => {
  const result = normalize({scan: {refresh: {base: {state, counts: state === 'ok' ? zero : undefined, freshness: {state: 'stale', max_age_seconds: 60}}}}}, 'base')[0];
  assert.equal(result.state, state); assert.equal(result.freshness, 'stale'); assert.deepEqual(result.counts, state === 'ok' ? zero : null);
});

test('published freshness without a policy is unknown and malformed success is error', () => {
  assert.equal(normalize({scan:{refresh:{image:{state:'ok',counts:zero,freshness:{state:'fresh'}}}}},'image')[0].freshness,'unknown');
  assert.equal(normalize({scan:{refresh:{image:{state:'ok'}}}},'image')[0].state,'error');
});
