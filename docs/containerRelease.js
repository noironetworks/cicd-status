/* Keep the static release table and render all metadata as text. */
(function () {
  'use strict';
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function link(href, text) {
    const node = element('a', text);
    if (typeof href === 'string') {
      const url = new URL(href, window.location.href);
      if (['https:', 'http:'].includes(url.protocol)) node.href = url.href;
    }
    return node;
  }
  function appendCounts(parent, counts) {
    if (!counts) { parent.appendChild(element('div', 'Counts unavailable')); return; }
    for (const key of ['C', 'H', 'M', 'L', 'U']) {
      parent.appendChild(element('div', `${key}:${counts[key]}`, `cve-letter cve-${key.toLowerCase()}`));
    }
  }
  function scanCell(image, subject) {
    const cell = element('td', null, `scan-cell scan-${subject}`);
    for (const scan of ScanStatus.normalize(image, subject)) {
      const block = element('section', null, `scan-observation scan-${scan.namespace}`);
      block.appendChild(element('strong', scan.namespace === 'legacy' ? 'Legacy scan' : `${scan.namespace === 'build' ? 'Build' : 'Refresh'} scan`));
      block.appendChild(element('div', `Scanner: ${scan.scanner}`));
      block.appendChild(element('div', `Result: ${scan.state}`));
      block.appendChild(element('div', `Freshness: ${scan.freshness}`));
      if (scan.observed_at) block.appendChild(element('div', `Observed: ${scan.observed_at}`));
      if (scan.digest) block.appendChild(element('div', `Digest: ${scan.digest}`, 'scan-digest'));
      if (scan.state === 'ok') appendCounts(block, scan.counts);
      if (scan.report) block.appendChild(link(scan.report, 'Scan report'));
      if (scan.last_success) {
        const historical = element('details', null, 'scan-history');
        historical.appendChild(element('summary', 'Historical last successful scan'));
        historical.appendChild(element('div', `Digest: ${scan.last_success.digest || 'unknown'}`, 'scan-digest'));
        historical.appendChild(element('div', `Observed: ${scan.last_success.observed_at || 'unknown'}`));
        appendCounts(historical, scan.last_success.counts);
        block.appendChild(historical);
      }
      cell.appendChild(block);
    }
    return cell;
  }
  function tags(image, registry) {
    const cell = element('td');
    const list = element('ul');
    for (const tag of Array.isArray(image[registry]) ? image[registry] : []) {
      const item = element('li'); item.appendChild(link(tag.link, tag.tag)); list.appendChild(item);
    }
    cell.appendChild(list); return cell;
  }
  function digestCell(image, registry, releaseName) {
    const cell = element('td');
    const sha = ((image[registry] || [])[0] || {}).sha;
    if (typeof sha === 'string' && sha !== 'error') {
      cell.appendChild(link(`manifest-sha.html?release=${encodeURIComponent(releaseName)}&dq=${registry}`, sha.replace(/^sha256:/, '').slice(0, 12)));
    } else cell.textContent = 'Unavailable';
    return cell;
  }
  function render(data) {
    const body = document.querySelector('#container-release-table tbody');
    const releaseName = new URLSearchParams(window.location.search).get('release') || '';
    const releaseTag = releaseName.replace(/(\.z|\.rc[0-9]+)$/, '');
    const release = (data.releases || []).find(item => item.release_tag === releaseTag);
    const stream = ((release || {}).release_streams || []).find(item => item.release_name === releaseName);
    if (!stream) { const row = element('tr'); const cell = element('td', 'Release unavailable'); cell.colSpan = 11; row.appendChild(cell); body.appendChild(row); return; }
    if (releaseName === releaseTag && stream.released === false) {
      const row = element('tr'); const cell = element('td'); cell.colSpan = 11;
      cell.appendChild(link(`release.html?release=${encodeURIComponent(releaseName + '.z')}`, 'The final release is not yet available. View the continuous release.'));
      row.appendChild(cell); body.appendChild(row); return;
    }
    const deferred = ['aci-containers-certmanager', 'aci-containers-webhook', 'aci-containers-host-ovscni', 'acc-provision-operator'];
    const rank = name => deferred.includes(name) ? deferred.indexOf(name) + 1 : 0;
    const images = [...(stream.container_images || [])].sort((a, b) => rank(a.name) - rank(b.name) || String(a.name).localeCompare(String(b.name)));
    for (const image of images) {
      const row = element('tr'); row.appendChild(element('td', image.name));
      const commit = ((image.commit || [])[0] || {}); const commitCell = element('td');
      if (commit.sha) commitCell.appendChild(link(commit.link, String(commit.sha).slice(0, 7)));
      row.appendChild(commitCell);
      for (const registry of ['quay', 'docker']) { row.appendChild(tags(image, registry)); row.appendChild(digestCell(image, registry, releaseName)); }
      row.appendChild(scanCell(image, 'base'));
      const baseCell = element('td'); const base = ((image['base-image'] || [])[0] || {});
      baseCell.textContent = base.sha ? String(base.sha).replace(/^sha256:/, '').slice(0, 12) : 'Unavailable'; row.appendChild(baseCell);
      const sbomCell = element('td'); if (image.sbom) sbomCell.appendChild(link(image.sbom, 'SBoM')); row.appendChild(sbomCell);
      row.appendChild(scanCell(image, 'image'));
      const logs = element('td'); if (image['build-logs']) logs.appendChild(link(image['build-logs'], image['build-time'] || 'Build Logs')); row.appendChild(logs);
      body.appendChild(row);
    }
  }
  fetch('release_artifacts/releases.yaml').then(response => { if (!response.ok) throw new Error('release data unavailable'); return response.text(); })
    .then(text => render(jsyaml.load(text) || {})).catch(error => {
      const body = document.querySelector('#container-release-table tbody'); const row = element('tr'); const cell = element('td', 'Release data unavailable'); cell.colSpan = 11; row.appendChild(cell); body.appendChild(row); console.error(error);
    });
})();
