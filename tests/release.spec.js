const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
async function pageWithFixture(page, fixture) {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cdnjs.cloudflare.com') return route.fulfill({contentType: 'application/javascript', body: fs.readFileSync(path.join(path.dirname(require.resolve('js-yaml')), 'dist/js-yaml.min.js'))});
    if (url.pathname.endsWith('/release_artifacts/releases.yaml')) return route.fulfill({contentType: 'text/yaml', body: fixture});
    const file = path.join(root, 'docs', path.basename(url.pathname));
    if (!fs.existsSync(file)) return route.abort();
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/javascript'});
  });
  await page.goto('http://portal.test/release.html?release=6.1.1.z');
  return errors;
}
test('real release page renders legacy, missing, every result, historical evidence, and safe labels', async ({page}) => {
  const errors = await pageWithFixture(page, fs.readFileSync(path.join(__dirname, 'fixtures/releases.yaml'), 'utf8'));
  await expect(page.locator('#container-release-table tbody tr')).toHaveCount(7);
  const row = name => page.locator('#container-release-table tbody tr').filter({has: page.locator('td:first-child', {hasText: new RegExp(`^${name}$`)})});
  await expect(row('legacy').locator('.scan-image')).toContainText('Legacy scan');
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
