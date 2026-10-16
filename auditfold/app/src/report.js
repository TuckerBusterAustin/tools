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

  // Plain-language "why it matters" line per check id.
  var WHY = {
    'title-present': 'Search results show the title as the clickable headline. Without one, visitors have little reason to click.',
    'title-length': 'Search results cut off long titles and short ones say too little about the page.',
    'meta-description': 'Search results show this text under your title. Without it, Google picks a snippet for you.',
    'meta-description-length': 'Search results cut off long summaries, and very short ones do not explain the page.',
    'h1': 'The main heading tells visitors and search engines what the page is about.',
    'heading-order': 'A clear heading outline helps screen readers and search engines follow the page.',
    'img-alt': 'Alt text describes pictures to people using screen readers and to search engines.',
    'noindex': 'A noindex instruction asks search engines to leave this page out of their results.',
    'canonical': 'A canonical tag tells search engines which address is the main version of the page.',
    'viewport': 'Without a viewport tag, phones may show a tiny desktop layout, which hurts mobile visitors.',
    'lang': 'The page language helps screen readers pronounce text and helps show the page to the right audience.',
    'open-graph': 'These tags control the title, text and picture shown when the page is shared.'
  };
  var WHY_DEFAULT = 'Fixing this makes the page clearer for visitors and search engines.';

  /** Page-derived text is shown without link schemes so the report holds no web addresses. */
  function plain(s) { return String(s == null ? '' : s).replace(/https?:\/\//gi, ''); }

  function bandWord(score) { return score >= 80 ? 'Good' : score >= 50 ? 'Needs work' : 'Poor'; }

  /** 2-3 plain sentences summarising the result. */
  function summary(m) {
    var band = bandWord(m.score);
    if (!m.fixes.length) return 'This page scores ' + m.score + ' out of 100 (' + band + '). ' + noIssues(m);
    var n = m.fixes.length;
    return 'This page scores ' + m.score + ' out of 100 (' + band + '). We found ' + n + (n === 1 ? ' fix' : ' fixes') +
      ': ' + counts(m) + '. Start at the top of the list, as the items are ordered by importance.';
  }

  var CSS = 'body{font:11pt/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#1B2330;background:#fff;max-width:720px;margin:0 auto;padding:48px}' +
    'h1{font-size:20pt;line-height:1.25;margin:0 0 8px}h2{font-size:14pt;margin:32px 0 12px}h3{font-size:12pt;margin:8px 0 4px}' +
    '.meta{color:#556070;margin:0;overflow-wrap:anywhere}.score{font-size:32pt;font-weight:700;line-height:1;margin:24px 0 4px}' +
    'ol{padding:0;margin:0;list-style:none}.fix{border-top:1px solid #D9DEE5;padding:16px 0;break-inside:avoid;page-break-inside:avoid}' +
    '.sev{display:inline-block;border:1px solid #1B2330;border-radius:999px;padding:2px 8px;font-size:9pt;font-weight:600;text-transform:uppercase;letter-spacing:.04em}' +
    '.found{color:#556070;margin:4px 0 0;overflow-wrap:anywhere}p{margin:4px 0}.ok{border:1px solid #D9DEE5;padding:16px}' +
    '@media print{body{max-width:none;padding:0}@page{margin:18mm}}';

  /** Standalone client report: inline CSS only, no external requests. */
  function renderHtml(audit, o) {
    var m = meta(audit, o), h = [];
    var client = m.client || 'Your client';
    var ttl = 'SEO fix list for ' + client;
    h.push('<!doctype html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + esc(ttl) + '</title><style>' + CSS + '</style></head><body>',
      '<h1>' + esc(ttl) + '</h1>');
    if (m.url) h.push('<p class="meta">Page: ' + esc(plain(m.url)) + '</p>');
    if (m.consultant) h.push('<p class="meta">Prepared by ' + esc(m.consultant) + '</p>');
    h.push('<p class="meta">Date: ' + esc(m.date) + '</p>');
    h.push('<p class="score">' + m.score + ' <span class="meta">out of 100, ' + bandWord(m.score) + '</span></p>',
      '<p>' + esc(summary(m)) + '</p>', '<h2>Fix list, most important first</h2>');
    if (!m.fixes.length) h.push('<p class="ok">' + esc(noIssues(m)) + '</p>');
    else {
      h.push('<ol>');
      m.fixes.forEach(function (f, i) {
        h.push('<li class="fix"><span class="sev">' + esc(sev(f)) + '</span> <h3>' + (i + 1) + '. ' + esc(f.name) + '</h3>' +
          '<p><strong>Why it matters:</strong> ' + esc(WHY[f.id] || WHY_DEFAULT) + '</p>' +
          '<p><strong>How to fix:</strong> ' + esc(f.fix) + '</p>' +
          (f.message ? '<p class="found">What we found: ' + esc(plain(f.message)) + '</p>' : '') + '</li>');
      });
      h.push('</ol>');
    }
    h.push('</body></html>');
    return h.join('\n');
  }

  /** Spec entry point: buildReport({audit, consultant, client, date}) -> html string. */
  function buildReport(p) {
    p = p || {};
    return renderHtml(p.audit, { client: p.client, consultant: p.consultant, date: p.date });
  }

  /** Report HTML for the print copy; '' unless Pro is unlocked (free users get nothing to print). */
  function printableReport(unlocked, audit, o) {
    return unlocked === true && audit ? renderHtml(audit, o) : '';
  }

  var api = { printableReport: printableReport, buildReport: buildReport, renderMarkdown: renderMarkdown, renderText: renderText, renderHtml: renderHtml, escapeHtml: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditfoldReport = api;
})(typeof self !== 'undefined' ? self : this);
