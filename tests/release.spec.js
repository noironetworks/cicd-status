const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
async function pageWithFixture(page, fixture) {
  await page.clock.install({time: new Date('2026-11-12T01:00:00Z')});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'portal.test') return route.abort();
    if (url.pathname.endsWith('/release_artifacts/releases.yaml')) return route.fulfill({contentType: 'text/yaml', body: fixture});
    const docs = path.join(root, 'docs');
    const file = path.resolve(docs, '.' + url.pathname);
    if (!file.startsWith(docs + path.sep) || !fs.existsSync(file)) return route.abort();
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/javascript'});
  });
  await page.goto('http://portal.test/release.html?release=6.1.1.z');
  return errors;
}
test('real release page renders legacy, missing, every result, historical evidence, and safe labels', async ({page}) => {
  const errors = await pageWithFixture(page, fs.readFileSync(path.join(__dirname, 'fixtures/releases.yaml'), 'utf8'));
  await expect(page.locator('#container-release-table tbody tr')).toHaveCount(7);
  const row = name => page.locator('#container-release-table tbody tr').filter({has: page.locator('td:first-child', {hasText: new RegExp(`^${name}$`)})});
  await expect(row('legacy').locator('.scan-image')).toContainText('Legacy build scan');
  await expect(row('legacy').locator('.scan-image')).toContainText('H:2');
  await expect(row('missing').locator('.scan-base')).toContainText('Result: unavailable');
  for (const state of ['ok', 'unavailable', 'queued', 'unsupported', 'error']) {
    await expect(row(state).locator('.scan-image .scan-refresh')).toContainText(`Result: ${state}`);
    await expect(row(state).locator('.scan-image .scan-build')).toContainText('H:3');
    await expect(row(state).locator('.scan-base .scan-refresh')).toContainText('Result: unsupported');
    if (state !== 'ok') await expect(row(state).locator('.scan-image .scan-refresh > .cve-letter')).toHaveCount(0);
  }
  await expect(row('ok').locator('.scan-image .scan-refresh')).toContainText('Freshness: fresh');
  await expect(row('queued').locator('.scan-image .scan-refresh')).toContainText('Freshness: unknown');
  await expect(row('error').locator('.scan-image .scan-refresh')).toContainText('Freshness: stale');
  await expect(row('error').locator('.scan-history')).toContainText('Historical last successful scan');
  await expect(row('error').locator('.scan-history')).toContainText('sha256:historical');
  await expect(row('error').locator('.scan-history')).toContainText('2020-01-01');
  await expect(page.locator('img')).toHaveCount(0); expect(await page.evaluate(() => window.hostile)).toBeUndefined();
  expect(errors).toEqual([]);
});
test('unavailable release data gets a visible result', async ({page}) => {
  await pageWithFixture(page, '{"releases":[]}');
  await expect(page.locator('#container-release-table')).toContainText('Release unavailable');
});

test('refresh binding keeps replaced builds historical and preserves legacy build reports', async ({page}) => {
  const digest = letter => 'sha256:' + letter.repeat(64);
  const counts = {C:0,H:0,M:0,L:0,U:0};
  const observation = (source, child) => ({state:'ok',source_digest:digest(source),digest:digest(child),scanner:'quay',counts,
    observed_at:'2026-11-12T00:00:00Z',freshness:{state:'fresh',max_age_seconds:86400}});
  const images = [
    {name:'legacy-refresh',quay:[{sha:digest('a')}],severity:[{...counts,H:6}],cve:'legacy-image.txt',
      'base-image':[{sha:digest('b'),severity:[{...counts,H:7}],cve:'legacy-base.txt'}],
      scan:{refresh:{image:{state:'error',source_digest:digest('a')},base:{state:'unsupported',source_digest:digest('b')}}}},
    {name:'replaced-build',quay:[{sha:digest('b')}],'base-image':[{sha:digest('d')}],
      scan:{build:{image:{state:'ok',digest:digest('b'),counts:{...counts,H:8}},base:{state:'ok',digest:digest('d'),counts:{...counts,H:9}}},
        refresh:{image:observation('a','f'),base:observation('c','e')}}},
    {name:'index-child',quay:[{sha:'A'.repeat(64)}],scan:{refresh:{image:observation('a','f')}}}
  ];
  const fixture = JSON.stringify({releases:[{release_tag:'6.1.1',release_streams:[{release_name:'6.1.1.z',container_images:images}]}]});
  const errors = await pageWithFixture(page, fixture);
  await expect(page.locator('#container-release-table tbody tr')).toHaveCount(3);
  const row = name => page.locator('#container-release-table tbody tr').filter({has:page.locator('td:first-child',{hasText:new RegExp(`^${name}$`)})});
  const legacy = row('legacy-refresh');
  await expect(legacy.locator('.scan-image .scan-legacy')).toContainText('H:6');
  await expect(legacy.locator('.scan-base .scan-legacy')).toContainText('H:7');
  await expect(legacy.locator('.scan-image .scan-legacy a')).toHaveAttribute('href','http://portal.test/legacy-image.txt');
  await expect(legacy.locator('.scan-base .scan-legacy a')).toHaveAttribute('href','http://portal.test/legacy-base.txt');
  await expect(legacy.locator('.scan-image .scan-refresh')).toContainText('Result: error');
  const replaced = row('replaced-build');
  for (const subject of ['image','base']) {
    await expect(replaced.locator(`.scan-${subject} .scan-refresh`)).toHaveClass(/scan-historical/);
    await expect(replaced.locator(`.scan-${subject} .scan-refresh`)).toContainText('Historical refresh scan');
    await expect(replaced.locator(`.scan-${subject} .scan-refresh`)).toContainText('Freshness: unknown');
    await expect(replaced.locator(`.scan-${subject} .scan-refresh`)).not.toContainText('Freshness: fresh');
  }
  await expect(replaced.locator('.scan-image .scan-build')).toContainText('H:8');
  await expect(replaced.locator('.scan-image .scan-refresh')).toContainText('Source digest: ' + digest('a'));
  await expect(row('index-child').locator('.scan-image .scan-refresh')).not.toHaveClass(/scan-historical/);
  await expect(row('index-child').locator('.scan-image .scan-refresh')).toContainText('Freshness: fresh');
  expect(errors).toEqual([]);
});

for (const file of ['unsafe-js-function.yaml','unsafe-js-regexp.yaml']) {
  test(`production YAML parser rejects ${file}`, async ({page}) => {
    const fixture = fs.readFileSync(path.join(__dirname,'fixtures',file),'utf8');
    const errors = await pageWithFixture(page,fixture);
    await expect(page.locator('#container-release-table')).toContainText('Release data unavailable');
    const rejection = await page.evaluate(text => {
      try { window.jsyaml.load(text); return null; } catch (error) { return error.reason; }
    },fixture);
    expect(rejection).toContain('unknown tag');
    expect(await page.evaluate(() => window.yamlExecuted)).toBeUndefined();
    expect(errors).toEqual([]);
    await expect(page.locator('script[src*="vendor/js-yaml-4.3.2/js-yaml.min.js"]')).toHaveCount(1);
    await expect(page.locator('script[src^="https://"]')).toHaveCount(0);
  });
}

test('actual YAML metadata stays text, malformed links do not abort rows, and legacy zeros are unverified', async ({page}) => {
  const errors = await pageWithFixture(page,fs.readFileSync(path.join(__dirname,'fixtures/hostile-metadata.yaml'),'utf8'));
  const rows = page.locator('#container-release-table tbody tr');
  await expect(rows).toHaveCount(2);
  const hostile = rows.filter({hasText:'<img src=x onerror="window.domExecuted=true">'});
  await expect(hostile.locator('.scan-image .scan-legacy')).toContainText('Legacy build scan (unverified)');
  await expect(hostile.locator('.scan-image .scan-legacy')).toContainText('Result: unknown (legacy, unverified)');
  await expect(hostile.locator('.scan-image .scan-legacy')).not.toContainText('Result: ok');
  await expect(hostile.locator('.scan-image .legacy-counts')).toContainText('Historical unverified counts');
  await expect(hostile.locator('.scan-image .legacy-counts')).toContainText('C:0');
  await expect(hostile.locator('.scan-base .legacy-counts')).toContainText('H:2');
  await expect(hostile.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(hostile.locator('a', {hasText:'SBoM'})).toHaveCount(0);
  await expect(hostile.locator('span', {hasText:'SBoM'})).toHaveCount(1);
  await expect(hostile.locator('span', {hasText:'Scan report'})).toHaveCount(2);
  await expect(page.locator('#container-release-table img, #container-release-table script')).toHaveCount(0);
  await expect(rows.filter({hasText:'after-bad-link'}).locator('.scan-build')).toContainText('Result: ok');
  expect(await page.evaluate(() => window.domExecuted)).toBeUndefined();
  expect(errors).toEqual([]);
});
