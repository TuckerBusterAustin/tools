/*
 * Lapsewatch Pro exports: CSV, calendar (.ics) and reminder text.
 * UMD-style: module.exports in Node, window.LWExports in the browser
 * (needs window.LWDomains loaded first).
 *
 * Items are { domain: 'clientsite.com', expires: '2026-12-01' }.
 * `now` is always a parameter so results are repeatable.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./domains.js'));
  else root.LWExports = factory(root.LWDomains);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  var THRESHOLDS = [30, 14, 7];
  var DAY_MS = 86400000;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ---------- CSV ---------- */

  function csvField(s) {
    s = String(s == null ? '' : s);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // items -> 'domain,expires\r\n...' (CRLF, as CSV readers expect)
  function toCsv(items) {
    var lines = ['domain,expires'];
    items.forEach(function (x) { lines.push(csvField(x.domain) + ',' + csvField(x.expires)); });
    return lines.join('\r\n') + '\r\n';
  }

  // Split CSV text into records of fields. Handles quotes, "" and newlines in quotes.
  function splitCsv(text) {
    var recs = [], rec = [], f = '', q = false, quoted = false, line = 1, start = 1;
    function endField() { rec.push({ v: f, quoted: quoted }); f = ''; quoted = false; }
    function endRec() { endField(); recs.push({ fields: rec, line: start }); rec = []; start = line; }
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (q) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { f += '"'; i++; } else q = false;
        } else { if (c === '\n') line++; f += c; }
      } else if (c === '"' && f.trim() === '') { q = true; quoted = true; f = ''; }
      else if (c === ',') endField();
      else if (c === '\r') { /* handled with \n */ }
      else if (c === '\n') { line++; endRec(); start = line; }
      else f += c;
    }
    if (f !== '' || rec.length) endRec();
    return recs;
  }

  // CSV text -> { rows: [{domain, expires}], errors: [{line, text, message}] }
  // Header row is optional. Blank rows are skipped. Bad rows are reported, not added.
  function fromCsv(text) {
    var rows = [], errors = [], seen = {};
    var recs = splitCsv(String(text == null ? '' : text).replace(/^\uFEFF/, ''));
    recs.forEach(function (r, idx) {
      var vals = r.fields.map(function (x) { return x.v.trim(); });
      if (vals.every(function (v) { return v === ''; })) return;
      if (idx === 0 && vals[0].toLowerCase() === 'domain') return; // header
      var raw = vals.join(',');
      if (vals.length !== 2) {
        errors.push({ line: r.line, text: raw, message: 'Expected two columns: domain,expires' });
        return;
      }
      var v = D.validateDomain(vals[0]);
      if (!v.valid) { errors.push({ line: r.line, text: raw, message: v.error }); return; }
      var d = D.parseDate(vals[1]);
      if (!d) {
        errors.push({ line: r.line, text: raw, message: "Date '" + vals[1] + "' isn't a date. Use YYYY-MM-DD, like 2026-12-01" });
        return;
      }
      if (seen[v.domain]) { errors.push({ line: r.line, text: raw, message: v.domain + ' appears twice' }); return; }
      seen[v.domain] = true;
      rows.push({ domain: v.domain, expires: d.toISOString().slice(0, 10) });
    });
    return { rows: rows, errors: errors };
  }

  /* ---------- Calendar (.ics) ---------- */

  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function ymd(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }
  function stamp(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'); }
  // Fold long lines at 73 characters, continuation lines start with a space.
  // RFC 5545 allows 75 octets per line; 73 leaves a safe margin for the
  // leading space. Content is ASCII only (validated domains, fixed text), so
  // characters equal octets and no multi-byte character can be split.
  function fold(line) {
    var out = [];
    while (line.length > 73) { out.push(line.slice(0, 73)); line = ' ' + line.slice(73); }
    out.push(line);
    return out.join('\r\n');
  }

  // One all-day event per domain per threshold (30/14/7 days before expiry).
  // Events whose day is already before today are left out. CRLF line endings.
  function buildIcs(items, now) {
    var n = now || new Date();
    var today = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lapsewatch//Expiry reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    items.forEach(function (x) {
      var exp = D.parseDate(x.expires);
      if (!exp) return;
      THRESHOLDS.forEach(function (t) {
        var day = exp.getTime() - t * DAY_MS;
        if (day < today) return;
        var start = new Date(day), end = new Date(day + DAY_MS);
        lines.push('BEGIN:VEVENT');
        lines.push('UID:' + icsEscape(x.domain) + '-' + t + 'd-' + ymd(exp) + '@lapsewatch');
        lines.push('DTSTAMP:' + stamp(n));
        lines.push('DTSTART;VALUE=DATE:' + ymd(start));
        lines.push('DTEND;VALUE=DATE:' + ymd(end));
        lines.push('SUMMARY:' + icsEscape('Certificate for ' + x.domain + ' expires in ' + t + ' days'));
        lines.push('DESCRIPTION:' + icsEscape('The SSL certificate for ' + x.domain + ' expires on ' + x.expires +
          '. Lapsewatch only reminds you. Renew the certificate yourself or ask your host.'));
        lines.push('END:VEVENT');
      });
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n');
  }

  /* ---------- Reminder text ---------- */

  function fmt(d) { return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  // Domains with `threshold` days or fewer left (expired included), soonest first.
  // -> [{domain, expires, days, date}]
  function dueItems(items, now, threshold) {
    var n = now || new Date(), limit = threshold == null ? 30 : threshold, out = [];
    items.forEach(function (x) {
      var exp = D.parseDate(x.expires);
      if (!exp) return;
      var days = D.daysLeft(exp, n);
      if (days <= limit) out.push({ domain: x.domain, expires: x.expires, days: days, date: exp });
    });
    return out.sort(function (a, b) { return a.days - b.days; });
  }

  function line(it) {
    var when = it.days < 0 ? 'expired ' + plural(-it.days, 'day') + ' ago'
      : it.days === 0 ? 'expires today' : plural(it.days, 'day') + ' left';
    return it.domain + ': ' + when + ' (expires ' + fmt(it.date) + ')';
  }

  var FOOT = 'Lapsewatch only reminds you. Renew each certificate yourself or ask your host.';

  // Ready-to-paste Slack message (plain text, soonest first).
  function slackText(items, now, threshold) {
    var due = dueItems(items, now, threshold), limit = threshold == null ? 30 : threshold;
    if (!due.length) return 'Certificate check: nothing expires within ' + plural(limit, 'day') + '.\n' + FOOT;
    return ':lock: Certificates expiring within ' + plural(limit, 'day') + ':\n' +
      due.map(function (it) { return '• ' + line(it); }).join('\n') + '\n' + FOOT;
  }

  // Ready-to-paste email: { subject, body }.
  function emailText(items, now, threshold) {
    var due = dueItems(items, now, threshold), limit = threshold == null ? 30 : threshold;
    if (!due.length) {
      return { subject: 'Certificate check: nothing expires within ' + plural(limit, 'day'),
        body: 'Hello,\n\nNo certificate on the list expires within ' + plural(limit, 'day') + '.\n\n' + FOOT };
    }
    return {
      subject: plural(due.length, 'certificate') + ' to renew within ' + plural(limit, 'day'),
      body: 'Hello,\n\nThese certificates expire within ' + plural(limit, 'day') + ', soonest first:\n\n' +
        due.map(function (it) { return '- ' + line(it); }).join('\n') + '\n\n' + FOOT
    };
  }

  return {
    THRESHOLDS: THRESHOLDS, toCsv: toCsv, fromCsv: fromCsv, buildIcs: buildIcs,
    dueItems: dueItems, slackText: slackText, emailText: emailText
  };
});
