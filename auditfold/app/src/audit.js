/* Audit runner: parse -> run checks -> rank fixes -> score.
 *   audit(html, {url}) -> {url, score, fixes, passes, summary}
 * fixes are the failed checks, most important first; passes are the rest.
 * Works in Node (require) and in the browser (window.AuditfoldAudit). */
(function (root) {
  'use strict';

  var parseApi = typeof require === 'function' && typeof module !== 'undefined' ? require('./parse.js') : root.AuditfoldParse;
  var checksApi = typeof require === 'function' && typeof module !== 'undefined' ? require('./checks.js') : root.AuditfoldChecks;

  var RANK = { high: 0, medium: 1, low: 2 };

  /** Sort order: severity (high first), then weight (bigger first), then id (A-Z). */
  function compareFixes(a, b) {
    if (RANK[a.severity] !== RANK[b.severity]) return RANK[a.severity] - RANK[b.severity];
    if (a.weight !== b.weight) return b.weight - a.weight;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  /** Score = share of check weight that passed, as an integer 0-100. */
  function computeScore(results) {
    var total = 0, earned = 0;
    results.forEach(function (r) {
      var w = Number(r.weight) > 0 ? Number(r.weight) : 0;
      total += w;
      if (r.passed) earned += w;
    });
    if (total === 0) return 0;
    var s = Math.round(100 * earned / total);
    return Math.max(0, Math.min(100, s));
  }

  /** Audit one page's HTML source. Never throws on odd input. */
  function audit(html, opts) {
    var url = opts && opts.url ? String(opts.url) : '';
    var results = checksApi.runChecks(parseApi.parse(typeof html === 'string' ? html : ''));
    var fixes = results.filter(function (r) { return !r.passed; }).sort(compareFixes);
    var passes = results.filter(function (r) { return r.passed; })
      .sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var summary = { high: 0, medium: 0, low: 0, passed: passes.length, total: results.length };
    fixes.forEach(function (f) { summary[f.severity]++; });
    return { url: url, score: computeScore(results), fixes: fixes, passes: passes, summary: summary };
  }

  var api = { audit: audit, computeScore: computeScore, compareFixes: compareFixes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditfoldAudit = api;
})(typeof self !== 'undefined' ? self : this);
