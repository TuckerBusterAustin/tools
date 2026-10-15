/* Report generator: renderMarkdown, renderText, renderHtml.
 *   fn(audit, {client, consultant, date}) -> string
 * `audit` is the object from audit.js. All user/page strings are escaped in HTML.
 * Works in Node (require) and in the browser (window.AuditfoldReport). */
(function (root) {
  'use strict';

  var SEV = { high: 'High', medium: 'Medium', low: 'Low' };
  var NO_ISSUES = 'No issues found. This page passes all %N% checks we run. ' +
    'That covers on-page basics only, not speed, backlinks or the rest of the site.';

  /** Escape text for safe use in HTML content and attributes. */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Normalise inputs; date may be a Date or string, defaults to today. */
  function meta(audit, o) {
    o = o || {};
    var d = o.date instanceof Date ? o.date.toISOString().slice(0, 10) : (o.date ? String(o.date) : new Date().toISOString().slice(0, 10));
    var fixes = (audit && audit.fixes) || [];
    var s = (audit && audit.summary) || {};
    return {
      client: o.client ? String(o.client) : '',
      consultant: o.consultant ? String(o.consultant) : '',
      date: d,
      url: (audit && audit.url) || '',
      score: audit && typeof audit.score === 'number' ? audit.score : 0,
      fixes: fixes,
      passes: (audit && audit.passes) || [],
      total: s.total || fixes.length + ((audit && audit.passes) || []).length
    };
  }

  function title(m) { return 'SEO fix list for ' + (m.client || 'your page'); }
  function noIssues(m) { return NO_ISSUES.replace('%N%', m.total); }
  function counts(m) {
    var c = { high: 0, medium: 0, low: 0 };
    m.fixes.forEach(function (f) { if (c[f.severity] != null) c[f.severity]++; });
    return c.high + ' high · ' + c.medium + ' medium · ' + c.low + ' low · ' + m.passes.length + ' passed';
  }
  function sev(f) { return SEV[f.severity] || 'Low'; }

  function renderMarkdown(audit, o) {
    var m = meta(audit, o), L = ['# ' + title(m), ''];
    if (m.url) L.push('- URL: ' + m.url);
    L.push('- Date: ' + m.date);
    if (m.consultant) L.push('- Prepared by: ' + m.consultant);
    L.push('- Score: ' + m.score + ' out of 100', '- ' + counts(m), '');
    L.push('## Fix list, most important first', '');
    if (!m.fixes.length) L.push(noIssues(m), '');
    m.fixes.forEach(function (f, i) {
      L.push((i + 1) + '. **' + f.name + '** (' + sev(f) + ')', '   ' + f.fix);
      if (f.message) L.push('   *What we found:* ' + f.message);
      L.push('');
    });
    if (m.passes.length) {
      L.push('## Passed checks', '');
      m.passes.forEach(function (p) { L.push('- ' + p.name + ': Passed'); });
      L.push('');
    }
    return L.join('\n');
  }

  function renderText(audit, o) {
    var m = meta(audit, o), L = [title(m).toUpperCase(), ''];
    if (m.url) L.push('URL: ' + m.url);
    L.push('Date: ' + m.date);
    if (m.consultant) L.push('Prepared by: ' + m.consultant);
    L.push('Score: ' + m.score + ' out of 100', counts(m), '', 'FIX LIST, MOST IMPORTANT FIRST', '');
    if (!m.fixes.length) L.push(noIssues(m), '');
    m.fixes.forEach(function (f, i) {
      L.push((i + 1) + '. [' + sev(f) + '] ' + f.name, '   ' + f.fix);
      if (f.message) L.push('   What we found: ' + f.message);
      L.push('');
    });
    return L.join('\n');
  }

  var CSS = 'body{font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1C1F23;background:#fff;max-width:760px;margin:0 auto;padding:32px 16px}' +
    'h1{font-size:1.5rem;line-height:1.25;margin:0 0 8px}h2{font-size:1.25rem;margin:32px 0 12px}h3{font-size:1.0625rem;margin:0 0 4px}' +
    '.meta{color:#5A6169;font-size:.875rem;margin:0;overflow-wrap:anywhere}.score{font-size:3rem;font-weight:700;line-height:1;margin:24px 0 4px}' +
    '.fix{border:1px solid rgba(90,97,105,.4);border-radius:12px;padding:16px;margin:0 0 12px;break-inside:avoid;list-style-position:inside}' +
    '.sev{font-weight:600}.found{color:#5A6169;font-size:.875rem;margin:4px 0 0;overflow-wrap:anywhere}ol{padding:0;list-style:decimal}' +
    '.ok{background:#E8F4EC;color:#1E7A46;border-radius:12px;padding:16px}' +
    '@media print{body{max-width:none;padding:0}@page{margin:2cm}}';

  function renderHtml(audit, o) {
    var m = meta(audit, o), h = [];
    h.push('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + esc(title(m)) + '</title><style>' + CSS + '</style></head><body>',
      '<h1>' + esc(title(m)) + '</h1>');
    if (m.url) h.push('<p class="meta">URL: ' + esc(m.url) + '</p>');
    h.push('<p class="meta">Date: ' + esc(m.date) + '</p>');
    if (m.consultant) h.push('<p class="meta">Prepared by ' + esc(m.consultant) + '</p>');
    h.push('<p class="score">' + m.score + ' <span class="meta">out of 100</span></p>',
      '<p class="meta">' + esc(counts(m)) + '</p>', '<h2>Fix list, most important first</h2>');
    if (!m.fixes.length) h.push('<p class="ok">' + esc(noIssues(m)) + '</p>');
    else {
      h.push('<ol>');
      m.fixes.forEach(function (f) {
        h.push('<li class="fix"><h3><span class="sev">' + esc(sev(f)) + '</span>: ' + esc(f.name) + '</h3><p>' + esc(f.fix) + '</p>' +
          (f.message ? '<p class="found">What we found: ' + esc(f.message) + '</p>' : '') + '</li>');
      });
      h.push('</ol>');
    }
    h.push('</body></html>');
    return h.join('\n');
  }

  var api = { renderMarkdown: renderMarkdown, renderText: renderText, renderHtml: renderHtml, escapeHtml: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditfoldReport = api;
})(typeof self !== 'undefined' ? self : this);
