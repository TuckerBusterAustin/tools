/*
 * Lapsewatch render helper: turns pasted "domain, date" text into plain
 * view data (rows, line errors, summary line). No DOM, so it is testable.
 * UMD-style: module.exports in Node, window.LWRender in the browser
 * (needs window.LWDomains loaded first).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./domains.js'));
  else root.LWRender = factory(root.LWDomains);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  var MAX_DOMAINS = 50;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // formatDate(Date) -> '12 Mar 2027' (UTC)
  function formatDate(d) {
    return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  // Status label = marker + word. marker null means the hollow circle.
  var LABELS = {
    expired: { cls: 'st-red', mark: '!', word: 'Expired' },
    urgent: { cls: 'st-red', mark: '!', word: '7 days or fewer' },
    soon: { cls: 'st-soon', mark: null, word: 'Soon' },
    ok: { cls: 'st-ok', mark: '✓', word: 'OK' }
  };

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // One-line summary, e.g. '3 checked. 1 expires in 7 days or fewer. 2 expire within 30 days.'
  // "Already expired" counts are named separately so nothing is hidden.
  function summaryLine(s) {
    var parts = [s.total + ' checked.'];
    if (s.expired) parts.push(plural(s.expired, 'certificate has expired.', 'certificates have expired.'));
    if (s.urgent) parts.push(plural(s.urgent, 'expires', 'expire') + ' in 7 days or fewer.');
    if (s.soon) parts.push(plural(s.soon, 'expires', 'expire') + ' within 30 days.');
    if (!s.expired && !s.urgent && !s.soon) parts.push('All have more than 30 days left.');
    return parts.join(' ');
  }

  // buildResults(text, now) ->
  //  { rows: [{domain, days, expires, status, cls, mark, word}] sorted soonest first,
  //    errors: [{line, message}], summary: string, tooMany: bool, empty: bool }
  function buildResults(text, now) {
    var parsed = D.parseLines(text);
    var sorted = D.sortByDays(parsed.rows, now);
    var rows = sorted.map(function (r) {
      var days = D.daysLeft(r.expiry, now);
      var status = D.statusFor(days);
      var l = LABELS[status];
      return { domain: r.domain, days: days, expires: formatDate(r.expiry),
        status: status, cls: l.cls, mark: l.mark, word: l.word };
    });
    return {
      rows: rows,
      errors: parsed.errors.map(function (e) { return { line: e.line, message: e.message }; }),
      summary: rows.length ? summaryLine(D.summarize(parsed.rows, now)) : '',
      tooMany: rows.length > MAX_DOMAINS,
      empty: !String(text == null ? '' : text).trim()
    };
  }

  return { buildResults: buildResults, formatDate: formatDate, summaryLine: summaryLine, MAX_DOMAINS: MAX_DOMAINS };
});
