/* Fix list helpers: rank, band, plain-text copy. Free feature: never checks the licence.
 *   rankFixes(fixes) -> new array, High then Medium then Low (stable within a level)
 *   band(score) -> 'Good' | 'Needs work' | 'Poor'
 *   toText(audit) -> plain text, one numbered line per finding with its severity
 * Works in Node (require) and in the browser (window.AuditfoldFixlist). */
(function (root) {
  'use strict';

  var ORDER = { high: 0, medium: 1, low: 2 };
  var LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
  var NONE = 'No fixes found. This page passes every check Auditfold runs: title, meta description, ' +
    'headings, image alt text, links, canonical, viewport and Open Graph.';

  function rankFixes(fixes) {
    return (fixes || []).map(function (f, i) { return { f: f, i: i }; })
      .sort(function (a, b) {
        var d = (ORDER[a.f.severity] != null ? ORDER[a.f.severity] : 3) - (ORDER[b.f.severity] != null ? ORDER[b.f.severity] : 3);
        return d || a.i - b.i;
      })
      .map(function (x) { return x.f; });
  }

  function band(score) { return score >= 80 ? 'Good' : score >= 50 ? 'Needs work' : 'Poor'; }

  function toText(audit) {
    var fixes = rankFixes(audit && audit.fixes);
    if (!fixes.length) return NONE;
    var score = audit && typeof audit.score === 'number' ? audit.score : 0;
    var lines = ['Score ' + score + ' out of 100, ' + band(score), ''];
    fixes.forEach(function (f, i) {
      lines.push((i + 1) + '. [' + (LABEL[f.severity] || 'Low') + '] ' + f.name);
      if (f.fix) lines.push('   How to fix: ' + f.fix);
      if (f.message) lines.push('   What we found: ' + f.message);
    });
    return lines.join('\n');
  }

  var api = { rankFixes: rankFixes, band: band, toText: toText, NONE: NONE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditfoldFixlist = api;
})(typeof self !== 'undefined' ? self : this);
