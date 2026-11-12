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
    const freshness = policy && Number.isFinite(policy.max_age_seconds) && policy.max_age_seconds > 0 ? policy.state : 'unknown';
    const last = value.last_success;
    return {state, scanner: value.scanner || 'unknown', counts: state === 'ok' ? counts(value.counts || value.severity) : null,
      digest: value.digest || null, observed_at: value.observed_at || null,
      freshness: ['fresh', 'stale'].includes(freshness) ? freshness : 'unknown', legacy: false,
      report: value.report || value.report_url || null,
      last_success: last && counts(last.counts || last.severity) ? {...last, counts: counts(last.counts || last.severity)} : null};
  }
  function normalize(image, subject) {
    const legacy = subject === 'base' ? ((image['base-image'] || [])[0] || {}) : image;
    const scan = image.scan || {};
    const result = [];
    for (const namespace of ['build', 'refresh']) {
      const namespaceValue = scan[namespace];
      if (namespaceValue && typeof namespaceValue === 'object') {
        const value = namespaceValue[subject] || (subject === 'image' && namespaceValue.state ? namespaceValue : null);
        if (value) result.push({namespace, ...observation(value, legacy)});
      }
    }
    if (!result.length) result.push({namespace: 'legacy', ...observation(null, legacy)});
    return result;
  }
  const api = {normalize, observation, counts};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScanStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
