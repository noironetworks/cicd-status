/* Scan observations are evidence, never an inference that missing data means clean. */
(function (root) {
  'use strict';
  const states = new Set(['ok', 'unavailable', 'queued', 'unsupported', 'error']);
  const levels = ['C', 'H', 'M', 'L', 'U'];
  function counts(value) {
    if (Array.isArray(value)) value = value[0];
    if (!value || !levels.every(key => Number.isInteger(value[key]) && value[key] >= 0)) return null;
    return Object.fromEntries(levels.map(key => [key, value[key]]));
  }
  function observation(value, legacy) {
    if (!value || typeof value !== 'object') {
      const error = legacy.cve_error || legacy.base_cve_error;
      return {state: error ? (/queued/i.test(error) ? 'queued' : 'error') : (counts(legacy.severity) ? 'ok' : 'unavailable'),
        scanner: legacy.severity_type || 'grype', counts: error ? null : counts(legacy.severity),
        digest: legacy.sha || null, observed_at: null, freshness: 'unknown', legacy: true,
        report: legacy.severity_link || legacy.cve || null, last_success: null};
    }
    const state = states.has(value.state) && (value.state !== 'ok' || counts(value.counts || value.severity)) ? value.state : 'error';
    const policy = value.freshness && typeof value.freshness === 'object' && value.freshness;
    let freshness = policy && Number.isFinite(policy.max_age_seconds) && policy.max_age_seconds > 0 ? policy.state : 'unknown';
    if (freshness === 'fresh') {
      const observed = Date.parse(value.observed_at);
      const age = (Date.now() - observed) / 1000;
      freshness = !Number.isFinite(age) || age < 0 ? 'unknown' : (age > policy.max_age_seconds ? 'stale' : 'fresh');
    }
    const last = value.last_success;
    return {state, scanner: value.scanner || 'unknown', counts: state === 'ok' ? counts(value.counts || value.severity) : null,
      digest: value.digest || null, source_digest: value.source_digest || null, observed_at: value.observed_at || null,
      freshness: ['fresh', 'stale'].includes(freshness) ? freshness : 'unknown', legacy: false,
      report: value.report || value.report_url || null,
      last_success: last && counts(last.counts || last.severity) ? {...last, counts: counts(last.counts || last.severity)} : null};
  }
  function digestIdentity(value) {
    return typeof value === 'string' && /^(?:sha256:)?[a-f0-9]{64}$/i.test(value)
      ? value.replace(/^sha256:/i, '').toLowerCase() : null;
  }
  function subjectObservation(namespace, subject) {
    return namespace && typeof namespace === 'object'
      ? namespace[subject] || (subject === 'image' && namespace.state ? namespace : null) : null;
  }
  function normalize(image, subject) {
    const scan = image.scan || {};
    const build = subjectObservation(scan.build, subject);
    const legacy = subject === 'base' ? ((image['base-image'] || [])[0] || {}) : image;
    const currentDigest = (subject === 'base' ? legacy.sha : ((image.quay || [])[0] || {}).sha)
      || (build && (build.source_digest || build.digest));
    const currentIdentity = digestIdentity(currentDigest);
    // Build fallback is independent of refresh: adding a refresh must not hide
    // the report/counts captured by a legacy producer.
    const result = [build ? {namespace: 'build', ...observation(build, legacy)}
      : {namespace: 'legacy', ...observation(null, {...legacy, sha: currentDigest})}];
    const refresh = subjectObservation(scan.refresh, subject);
    if (refresh) {
      const observed = observation(refresh, legacy);
      // source_digest identifies the parent/index requested by the refresher;
      // digest may be the distinct linux/amd64 child that Quay actually scanned.
      const sourceIdentity = digestIdentity(observed.source_digest || observed.digest);
      const binding = currentIdentity && sourceIdentity
        ? (currentIdentity === sourceIdentity ? 'current' : 'historical') : 'unknown';
      result.push({namespace: 'refresh', ...observed, binding,
        historical: binding === 'historical', current_digest: currentDigest || null,
        freshness: binding === 'current' ? observed.freshness : 'unknown'});
    }
    return result;
  }
  const api = {normalize, observation, counts, digestIdentity};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScanStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
