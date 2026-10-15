/* Browser glue only: DOM events, localStorage, copy/download/print.
 * All audit, report and history logic lives in src/ (loaded by script tags). */
(function () {
  'use strict';

  var A = window.AuditfoldAudit, R = window.AuditfoldReport, H = window.AuditfoldHistory;
  var $ = function (id) { return document.getElementById(id); };
  var SEV = { high: 'High', medium: 'Medium', low: 'Low' };

  var current = null;   // {audit, client, consultant, date, id}
  var toastTimer = null;

  /** localStorage can throw (private mode, file:// restrictions); fall back to a dud. */
  function getStorage() {
    try { var s = window.localStorage; s.getItem('x'); return s; }
    catch (e) { return { getItem: function () { return null; }, setItem: function () { throw e; }, removeItem: function () { throw e; } }; }
  }
  var storage = getStorage();

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // textContent: page text is never parsed as HTML
    return n;
  }

  // ---- toast ----
  function toast(msg, isError) {
    var t = $('toast');
    $('toast-text').textContent = msg;
    t.className = 'toast ' + (isError ? 'err' : 'ok');
    if (isError) t.setAttribute('role', 'alert'); else t.removeAttribute('role');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4000);
  }
  function hideToast() { $('toast').hidden = true; clearTimeout(toastTimer); }
  ['mouseenter', 'focusin'].forEach(function (ev) { $('toast').addEventListener(ev, function () { clearTimeout(toastTimer); }); });
  $('toast-x').addEventListener('click', hideToast);

  // ---- helpers ----
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getDate() + ' ' + m + ' ' + d.getFullYear() + ', ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function today() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function opts() { return { client: current.client, consultant: current.consultant, date: current.date }; }
  function isNarrow() { return window.matchMedia && window.matchMedia('(max-width: 959px)').matches; }

  // ---- validation ----
  function showError(msg) {
    var e = $('html-err'), t = $('html');
    e.textContent = msg; e.hidden = false;
    t.setAttribute('aria-invalid', 'true');
    t.focus();
  }
  function clearError() {
    $('html-err').hidden = true;
    $('html').removeAttribute('aria-invalid');
  }

  // ---- rendering ----
  function render(c, savedAt) {
    var a = c.audit, s = a.summary;
    $('empty').hidden = true;
    $('output').hidden = false;
    $('hint').hidden = true;
    ['copy-md', 'download', 'print', 'copy-txt'].forEach(function (id) { $(id).disabled = false; });

    var note = $('saved-note');
    note.hidden = !savedAt;
    note.textContent = savedAt ? 'Saved audit from ' + fmtDate(savedAt) : '';

    $('score').textContent = a.score;
    $('bar').setAttribute('aria-label', 'Score ' + a.score + ' out of 100');
    $('bar-fill').style.width = a.score + '%';
    $('counts').textContent = s.high + ' high · ' + s.medium + ' medium · ' + s.low + ' low · ' + s.passed + ' passed';

    var ni = $('no-issues');
    ni.hidden = a.fixes.length > 0;
    ni.textContent = 'No issues found. This page passes all ' + s.total + ' checks we run. ' +
      'That covers on-page basics only, not speed, backlinks or the rest of the site.';

    var ol = $('fixes');
    ol.textContent = '';
    a.fixes.forEach(function (f, i) {
      var li = el('li', 'fix');
      var head = el('div', 'fix-head');
      head.appendChild(el('span', 'rank muted', (i + 1) + '.'));
      head.appendChild(el('span', 'badge ' + f.severity, SEV[f.severity] || 'Low'));
      head.appendChild(el('h3', null, f.name));
      li.appendChild(head);
      li.appendChild(el('p', 'fix-text', f.fix));
      if (f.message) li.appendChild(el('p', 'found muted', 'What we found: ' + f.message));
      ol.appendChild(li);
    });

    $('passed-sum').textContent = 'Passed checks (' + a.passes.length + ')';
    var pl = $('passed-list');
    pl.textContent = '';
    a.passes.forEach(function (p) {
      var li = el('li');
      li.appendChild(el('span', 'tick', '✓ '));
      li.appendChild(document.createTextNode(p.name + ' '));
      li.appendChild(el('span', 'passed-word', 'Passed'));
      pl.appendChild(li);
    });

    // Print-only copy of the report (report.js escapes everything).
    var doc = new DOMParser().parseFromString(R.renderHtml(a, opts()), 'text/html');
    $('print-area').innerHTML = doc.body.innerHTML;
  }

  function renderHistory(saveFailed) {
    var items = H.list(storage), ul = $('hist-list');
    ul.textContent = '';
    $('hist-empty').hidden = items.length > 0;
    $('hist-warn').hidden = !saveFailed;
    $('clear-row').hidden = items.length === 0;
    items.forEach(function (e) {
      var li = el('li'), b = el('button', 'hist-row');
      b.type = 'button';
      var left = el('span', 'hist-left');
      left.appendChild(el('span', 'hist-client', e.client || 'No client name'));
      var u = el('span', 'hist-url muted', e.url || 'No URL');
      u.title = e.url || 'No URL';
      left.appendChild(u);
      var right = el('span', 'hist-right muted', e.score + ' out of 100 · ' + fmtDate(e.savedAt));
      b.appendChild(left); b.appendChild(right);
      if (current && current.id === e.id) {
        b.setAttribute('aria-current', 'true');
        b.className += ' current';
        b.appendChild(el('span', 'sr-only', ' (open now)'));
      }
      b.addEventListener('click', function () { reopen(e); });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function reopen(e) {
    if (!e.audit || !e.audit.fixes) return;
    current = { audit: e.audit, client: e.client || '', consultant: e.consultant || '', date: (e.savedAt || '').slice(0, 10) || today(), id: e.id };
    $('url').value = e.url || '';
    $('client').value = e.client || '';
    $('consultant').value = e.consultant || '';
    $('html').value = e.html || '';
    clearError();
    render(current, e.savedAt);
    renderHistory(false);
    $('results-h').focus();
  }

  // ---- run ----
  function run() {
    var html = $('html').value;
    if (!html.trim()) return showError("Error: Paste the page's HTML first. Copy it from View Source (Ctrl+U).");
    if (html.indexOf('<') === -1) return showError("Error: This doesn't look like HTML. Paste the page source, not the visible text.");
    clearError();

    var btn = $('run'), started = Date.now();
    btn.textContent = 'Checking…';
    $('results').setAttribute('aria-busy', 'true');
    var big = html.length > 1000000;

    setTimeout(function () {   // lets the label paint; big inputs stay visible 300ms
      var url = $('url').value.trim(), client = $('client').value.trim(), consultant = $('consultant').value.trim();
      var a = A.audit(html, { url: url });
      var now = new Date();
      current = { audit: a, client: client, consultant: consultant, date: today(), id: String(now.getTime()) + Math.random().toString(36).slice(2, 6) };
      var wait = big ? Math.max(0, 300 - (Date.now() - started)) : 0;
      setTimeout(function () {
        render(current, null);
        var res = H.add(storage, { id: current.id, savedAt: now.toISOString(), client: client, consultant: consultant, url: url, score: a.score, audit: a });
        renderHistory(!res.ok);
        btn.textContent = 'Run audit';
        $('results').removeAttribute('aria-busy');
        $('live').textContent = 'Audit done. Score ' + a.score + ' out of 100. ' + a.fixes.length + ' fixes, ' + a.summary.high + ' high.';
        $('results-h').focus();
      }, wait);
    }, 0);
  }

  $('form').addEventListener('submit', function (e) { e.preventDefault(); run(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && $('form').contains(e.target)) { e.preventDefault(); run(); }
    if (e.key === 'Escape') { hideToast(); cancelClear(); }
  });
  $('html').addEventListener('input', clearError);

  $('show-howto').addEventListener('click', function () {
    var d = $('howto'); d.open = true; d.querySelector('summary').focus();
  });

  // ---- report actions ----
  function copy(text) {
    var done = function () { toast('Copied. Paste it into your email or doc.'); $('fallback').hidden = true; };
    var fail = function () {
      toast('Error: Your browser blocked copying.', true);
      var f = $('fallback-text'); $('fallback').hidden = false; f.value = text; f.focus(); f.select();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
    else fail();
  }
  $('copy-md').addEventListener('click', function () { if (current) copy(R.renderMarkdown(current.audit, opts())); });
  $('copy-txt').addEventListener('click', function () { if (current) copy(R.renderText(current.audit, opts())); });
  $('print').addEventListener('click', function () { if (current) window.print(); });
  $('download').addEventListener('click', function () {
    if (!current) return;
    var base = (current.client || current.audit.url || 'page').toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page';
    var blob = new Blob([R.renderHtml(current.audit, opts())], { type: 'text/html' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'auditfold-' + base + '-' + current.date + '.html';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    toast('Report downloaded.');
  });

  // ---- clear history (inline confirm) ----
  function cancelClear() { $('confirm').hidden = true; $('clear').hidden = false; }
  $('clear').addEventListener('click', function () {
    $('confirm-text').textContent = 'Clear all ' + H.list(storage).length + ' saved audits? ';
    $('confirm').hidden = false; $('clear').hidden = true; $('clear-yes').focus();
  });
  $('clear-no').addEventListener('click', function () { cancelClear(); $('clear').focus(); });
  $('clear-yes').addEventListener('click', function () { H.clear(storage); cancelClear(); renderHistory(false); });

  // ---- start ----
  document.querySelector('.where').textContent = isNarrow() ? 'above' : 'on the left';
  renderHistory(false);
})();
