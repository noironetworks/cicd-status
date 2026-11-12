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
  const result = normalize({scan: {refresh: {base: {state, counts: state === 'ok' ? zero : undefined, freshness: {state: 'stale', max_age_seconds: 60}}}}}, 'base').find(value => value.namespace === 'refresh');
  assert.equal(result.state, state); assert.equal(result.freshness, 'unknown'); assert.deepEqual(result.counts, state === 'ok' ? zero : null);
});

test('published freshness without a policy is unknown and malformed success is error', () => {
  assert.equal(normalize({scan:{refresh:{image:{state:'ok',counts:zero,freshness:{state:'fresh'}}}}},'image').find(value => value.namespace === 'refresh').freshness,'unknown');
  assert.equal(normalize({scan:{refresh:{image:{state:'ok'}}}},'image').find(value => value.namespace === 'refresh').state,'error');
});

test('an explicitly fresh observation expires under its age policy', () => {
  const observation = {state:'ok',counts:zero,observed_at:'2000-01-01T00:00:00Z',freshness:{state:'fresh',max_age_seconds:60}};
  assert.equal(normalize({quay:[{sha:'a'.repeat(64)}],scan:{refresh:{image:{...observation,digest:'sha256:'+'a'.repeat(64)}}}},'image').find(value => value.namespace === 'refresh').freshness,'stale');
});

const digest = letter => 'sha256:' + letter.repeat(64);
const currentRefresh = image => normalize(image, 'image').find(value => value.namespace === 'refresh');
test('a refresh of A is historical after build B replaces it', () => {
  const result = currentRefresh({quay:[{sha:digest('b')}],scan:{build:{image:{state:'ok',digest:digest('b'),counts:zero}},
    refresh:{image:{state:'ok',source_digest:digest('a'),digest:digest('f'),counts:zero,
      observed_at:new Date().toISOString(),freshness:{state:'fresh',max_age_seconds:60}}}}});
  assert.equal(result.binding, 'historical'); assert.equal(result.historical, true);
  assert.equal(result.freshness, 'unknown'); assert.equal(result.source_digest, digest('a'));
  assert.equal(result.current_digest, digest('b'));
});
test('index versus platform child uses normalized source identity', () => {
  const result = currentRefresh({quay:[{sha:'A'.repeat(64)}],scan:{refresh:{image:{state:'ok',source_digest:digest('a'),digest:digest('f'),
    counts:zero,observed_at:new Date().toISOString(),freshness:{state:'fresh',max_age_seconds:60}}}}});
  assert.equal(result.binding, 'current'); assert.equal(result.historical, false); assert.equal(result.freshness, 'fresh');
});
test('unknown source identity cannot make a refresh fresh', () => {
  const result = currentRefresh({scan:{refresh:{image:{state:'ok',digest:digest('a'),counts:zero,
    observed_at:new Date().toISOString(),freshness:{state:'fresh',max_age_seconds:60}}}}});
  assert.equal(result.binding, 'unknown'); assert.equal(result.freshness, 'unknown');
});
test('first refresh preserves legacy image and base build observations', () => {
  const image = {quay:[{sha:digest('a')}],severity:[{...zero,H:6}],cve:'legacy-image.txt',
    'base-image':[{sha:digest('b'),severity:[{...zero,H:7}],cve:'legacy-base.txt'}],
    scan:{refresh:{image:{state:'error',source_digest:digest('a')},base:{state:'unsupported',source_digest:digest('b')}}}};
  for (const [subject, high, report] of [['image',6,'legacy-image.txt'],['base',7,'legacy-base.txt']]) {
    const result = normalize(image,subject);
    assert.equal(result.length,2); assert.equal(result[0].namespace,'legacy');
    assert.equal(result[0].state,'ok'); assert.equal(result[0].counts.H,high); assert.equal(result[0].report,report);
    assert.equal(result[1].namespace,'refresh');
  }
});
test('base matching uses the build-time digest rather than a moved current tag', () => {
  const result = normalize({'base-image':[{sha:digest('a')}],scan:{refresh:{current_base:{digest:digest('b')},base:{state:'ok',source_digest:digest('a'),digest:digest('f'),counts:zero}}}},'base').find(value=>value.namespace==='refresh');
  assert.equal(result.binding,'current'); assert.equal(result.historical,false);
});
