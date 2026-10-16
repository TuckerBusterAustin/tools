/*
 * Lapsewatch core logic: domains, expiry dates, days left, status.
 * UMD-style: module.exports in Node, window.LWDomains in the browser.
 * No dependencies. All date maths is in UTC whole days.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LWDomains = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY_MS = 86400000;
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // Build a UTC-midnight Date, or null if the calendar date does not exist.
  function makeDate(y, m, d) {
    var dt = new Date(Date.UTC(y, m, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null;
    return dt;
  }

  // validateDomain('Example.com.') -> { valid: true, domain: 'example.com' }
  // On failure: { valid: false, domain: '', error: 'reason' }
  function validateDomain(input) {
    var s = typeof input === 'string' ? input.trim().toLowerCase() : '';
    if (s.charAt(s.length - 1) === '.') s = s.slice(0, -1);
    if (!s) return { valid: false, domain: '', error: 'Enter a domain like clientsite.com' };
    if (s.length > 253) return { valid: false, domain: '', error: 'Domain is too long' };
    var labels = s.split('.');
    if (labels.length < 2) return { valid: false, domain: '', error: 'Domain needs a dot, like clientsite.com' };
    for (var i = 0; i < labels.length; i++) {
      if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(labels[i])) {
        return { valid: false, domain: '', error: s + " doesn't look like a domain" };
      }
    }
    var tld = labels[labels.length - 1];
    if (!/^([a-z]{2,}|xn--[a-z0-9-]+)$/.test(tld)) {
      return { valid: false, domain: '', error: s + " doesn't look like a domain" };
    }
    return { valid: true, domain: s };
  }

  // parseDate accepts ISO 'YYYY-MM-DD' and openssl notAfter, e.g.
  // 'notAfter=Dec  1 12:00:00 2026 GMT' (the 'notAfter=' prefix is optional).
  // Returns a Date at UTC midnight of that day, or null.
  function parseDate(input) {
    if (typeof input !== 'string') return null;
    var s = input.trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return makeDate(+m[1], +m[2] - 1, +m[3]);
    m = /^(?:notAfter\s*=\s*)?([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(\d{4})\s+GMT$/i.exec(s);
    if (m) {
      var mon = MONTHS.indexOf(m[1].toLowerCase());
      if (mon < 0) return null;
      return makeDate(+m[6], mon, +m[2]);
    }
    return null;
  }

  // Whole UTC days from the day of `now` to the expiry day.
  // 0 on the expiry day, -1 the day after.
  // UTC is used on purpose: certificate dates are UTC (openssl prints GMT) and
  // it keeps results identical on every machine and in tests. In the evening
  // in the Americas the UTC day is already tomorrow, so "days left" can be
  // one lower than a local calendar would show.
  function daysLeft(expiry, now) {
    var n = now === undefined ? new Date() : now;
    var a = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
    var b = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    return Math.round((a - b) / DAY_MS);
  }

  // 'expired' (<0), 'urgent' (0-7), 'soon' (8-30), 'ok' (>30)
  function statusFor(days) {
    if (days < 0) return 'expired';
    if (days <= 7) return 'urgent';
    if (days <= 30) return 'soon';
    return 'ok';
  }

  // One 'domain, date' per line. Blank lines are ignored. Bad lines are
  // skipped and reported with their 1-based line number.
  // Returns { rows: [{domain, expiry, line}], errors: [{line, text, message}] }
  function parseLines(text) {
    var rows = [];
    var errors = [];
    var lines = String(text == null ? '' : text).split(/\r?\n/);
    lines.forEach(function (raw, i) {
      var line = i + 1;
      var t = raw.trim();
      if (!t) return;
      var m = /^([^,\s]+)\s*(?:,|\s)\s*(.+)$/.exec(t);
      if (!m) {
        errors.push({ line: line, text: raw, message: 'Add an expiry date after the domain, like clientsite.com, 2026-12-01' });
        return;
      }
      // Users paste URLs: drop a leading scheme and any trailing path/query.
      var token = m[1].replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/[\/?#].*$/, '');
      var v = validateDomain(token);
      if (!v.valid) {
        errors.push({ line: line, text: raw, message: v.error });
        return;
      }
      var expiry = parseDate(m[2]);
      if (!expiry) {
        errors.push({ line: line, text: raw, message: "Date '" + m[2].trim() + "' isn't a date. Use YYYY-MM-DD or an openssl notAfter line" });
        return;
      }
      rows.push({ domain: v.domain, expiry: expiry, line: line });
    });
    return { rows: rows, errors: errors };
  }

  // Soonest (or most expired) first. Stable: equal days keep input order.
  // Returns a new array; does not change the input.
  function sortByDays(rows, now) {
    return rows
      .map(function (r, i) { return { r: r, i: i, d: daysLeft(r.expiry, now) }; })
      .sort(function (a, b) { return a.d - b.d || a.i - b.i; })
      .map(function (x) { return x.r; });
  }

  // Counts per status: { total, expired, urgent, soon, ok }
  function summarize(rows, now) {
    var out = { total: rows.length, expired: 0, urgent: 0, soon: 0, ok: 0 };
    rows.forEach(function (r) { out[statusFor(daysLeft(r.expiry, now))]++; });
    return out;
  }

  return {
    validateDomain: validateDomain,
    parseDate: parseDate,
    parseLines: parseLines,
    daysLeft: daysLeft,
    statusFor: statusFor,
    sortByDays: sortByDays,
    summarize: summarize
  };
});
