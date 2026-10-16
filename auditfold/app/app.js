/* Browser glue only: DOM events, localStorage, copy/download/print.
 * All audit, report and history logic lives in src/ (loaded by script tags). */
(function () {
  'use strict';

  var A = window.AuditfoldAudit, R = window.AuditfoldReport, H = window.AuditfoldHistory;
  var F = window.AuditfoldFixlist, G = window.AuditfoldGate;
  var proUnlocked = false;   // set by the gate; only Pro panels read it

  /** Re-apply the Pro gate (locked/unlocked, and "needs an audit") to the two Pro panels. */
  function refreshGate() { G.applyGate(proUnlocked, document, !!current); }
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
  function opts() {
    // Names live in the Pro report card; when locked they are empty.
    return { client: $('client').value.trim() || current.client, consultant: $('consultant').value.trim() || current.consultant, date: current.date };
  }
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
    $('copy-txt').disabled = false;   // free: never gated
    refreshGate();

    var note = $('saved-note');
    note.hidden = !savedAt;
    note.textContent = savedAt ? 'Saved audit from ' + fmtDate(savedAt) : '';

    $('score').textContent = a.score;
    var band = a.score >= 80 ? 'Good' : a.score >= 50 ? 'Needs work' : 'Poor';
    $('band').textContent = band;
    $('band').className = 'badge band ' + band.toLowerCase().replace(' ', '-');
    $('score-line').setAttribute('aria-label', 'Score ' + a.score + ' out of 100, ' + band);
    $('bar').setAttribute('aria-label', 'Score ' + a.score + ' out of 100, ' + band);
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

    fillPrintArea();
  }

  /** Print-only copy of the report (report.js escapes everything). Empty unless Pro is unlocked. */
  function fillPrintArea() {
    var html = current ? R.printableReport(proUnlocked, current.audit, opts()) : '';
    if (!html) { $('print-area').textContent = ''; return; }
    var doc = new DOMParser().parseFromString(html, 'text/html');
    $('print-area').innerHTML = doc.body.innerHTML;
  }

  /** Saved history list (Pro). Each row has Open and Delete buttons. */
  function renderHistory(saveFailed) {
    var items = H.list(storage), ul = $('hist-list');
    ul.textContent = '';
    $('hist-empty').hidden = items.length > 0;
    $('hist-warn').hidden = !saveFailed;
    items.forEach(function (e) {
      var li = el('li', 'hist-item');
      var name = e.url || e.client || 'Untitled page';
      var left = el('span', 'hist-left');
      var n = el('span', 'hist-client', name);
      n.title = name;
      left.appendChild(n);
      left.appendChild(el('span', 'hist-url muted', fmtDate(e.savedAt) + ' · ' + e.score + '/100 · ' + F.band(e.score)));
      var open = el('button', 'secondary', 'Open');
      open.type = 'button';
      open.setAttribute('aria-label', 'Open saved audit: ' + name);
      open.addEventListener('click', function () { reopen(e); });
      var del = el('button', 'ghost danger', 'Delete');
      del.type = 'button';
      del.setAttribute('aria-label', 'Delete saved audit: ' + name);
      del.addEventListener('click', function () {
        if (H.remove(storage, e.id)) { renderHistory(false); toast('Saved audit deleted.'); }
      });
      li.appendChild(left); li.appendChild(open); li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function reopen(e) {
    if (!e.audit || !e.audit.fixes) return;
    current = { audit: e.audit, client: e.client || '', consultant: e.consultant || '', date: (e.savedAt || '').slice(0, 10) || today(), id: e.id };
    $('url').value = e.url || '';
    if (e.client != null) $('client').value = e.client;
    if (e.consultant != null) $('consultant').value = e.consultant;
    $('html').value = '' /* history never stores the pasted HTML */;
    clearError();
    render(current, e.savedAt);
    renderHistory(false);
    $('results-h').focus();
  }

  // ---- run ----
  function run() {
    var html = $('html').value;
    var check = A.auditChecked(html, {});
    if (!check.ok) return showError(check.error);
    clearError();

    var btn = $('run'), started = Date.now();
    btn.textContent = 'Checking…';
    btn.disabled = true;
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
        renderHistory(false);   // saving is a Pro action (Save this audit), never automatic
        btn.textContent = 'Run audit';
        btn.disabled = false;
        $('results').removeAttribute('aria-busy');
        $('live').textContent = 'Audit done. Score ' + a.score + ' out of 100, ' + F.band(a.score) + '. ' + a.fixes.length + ' fixes found.';
        $('results-h').focus();
      }, wait);
    }, 0);
  }

  $('form').addEventListener('submit', function (e) { e.preventDefault(); run(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && $('form').contains(e.target)) { e.preventDefault(); run(); }
    if (e.key === 'Escape') hideToast();
  });
  $('html').addEventListener('input', clearError);

  // Sample page: fill the box with a flawed example and run the audit.
  function useSample() {
    $('url').value = 'https://example.com/sample';
    $('html').value = window.AuditfoldSample.HTML;
    run();
  }
  $('sample').addEventListener('click', useSample);
  $('sample-empty').addEventListener('click', useSample);
  $('clear-input').addEventListener('click', function () {
    $('url').value = ''; $('html').value = '';
    clearError();
    $('html').focus();
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
  $('copy-txt').addEventListener('click', function () { if (current) copy(F.toText(current.audit)); });
  $('save').addEventListener('click', function () {
    if (!current || !proUnlocked) return;
    var o = opts();
    var res = H.save(storage, { id: current.id, savedAt: new Date().toISOString(), client: o.client, consultant: o.consultant, url: current.audit.url || $('url').value.trim(), score: current.audit.score, audit: current.audit, html: $('html').value });
    renderHistory(!res.ok);
    if (res.ok) toast('Audit saved.' + (res.dropped ? ' Your oldest saved audit was removed to keep the last ' + H.MAX + '.' : ''));
  });
  $('print').addEventListener('click', function () { if (current && proUnlocked) window.print(); });
  $('download').addEventListener('click', function () {
    if (!current || !proUnlocked) return;
    var o = opts();
    var base = (o.client || 'your-client').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'your-client';
    var name = 'auditfold-report-' + base + '-' + current.date + '.html';
    try {
      var blob = new Blob([R.buildReport({ audit: current.audit, client: o.client, consultant: o.consultant, date: o.date })], { type: 'text/html' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
      toast('Report downloaded: ' + name);
    } catch (e) {
      toast("Error: The report couldn't be downloaded. Try Print report instead.", true);
    }
  });

  // ---- start ----
  renderHistory(false);
  // Gate the Pro panels. Without window.VSLicense this resolves locked and throws nothing.
  G.initGate(window, document, false).then(function (u) { proUnlocked = u; refreshGate(); fillPrintArea(); });
})();
