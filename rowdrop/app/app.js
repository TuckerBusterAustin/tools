// Rowdrop DOM glue. All real logic lives in lib/*.js (loaded through lib/browser-shim.js).
// No network. Data is kept in localStorage. Pages: landing, connect (CSV import), exports, edit, detail, settings.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var params = new URLSearchParams(location.search);
  var isApp = document.body.hasAttribute('data-app');

  // ---------- Small helpers ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // Status pill: always symbol + word.
  function pill(kind, sym, word) {
    var p = el('span', 'pill pill-' + kind);
    var s = el('span', null, sym); s.setAttribute('aria-hidden', 'true');
    p.appendChild(s); p.appendChild(document.createTextNode(' ' + word));
    return p;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function zone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'; } catch (e) { return 'local time'; } }
  function people(n) { return n + (n === 1 ? ' person' : ' people'); }
  function unlockLink() { var a = el('a', null, 'Unlock with Pro'); a.href = '#license-footer'; return a; }

  // ---------- Toasts: success = role status (6s), error = role alert (stays) ----------
  function toast(kind, text) {
    var box = $('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    var t = document.createElement('div');
    var bad = kind === 'danger';
    t.className = 'toast' + (bad ? ' danger' : '');
    t.setAttribute('role', bad ? 'alert' : 'status');
    t.innerHTML = '<span class="sym" aria-hidden="true">' + (bad ? '!' : '✓') + '</span><p></p>' +
      '<button type="button" aria-label="Close message">×</button>';
    $('p', t).textContent = text;
    $('button', t).addEventListener('click', function () { t.remove(); });
    box.appendChild(t);
    if (!bad) setTimeout(function () { t.remove(); }, 6000);
  }
  window.rowdropToast = toast;

  // ---------- Mobile menu ----------
  var menuBtn = $('.menu-btn');
  if (menuBtn) menuBtn.addEventListener('click', function () {
    var open = $('.app-nav').classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open);
  });

  // ---------- Confirm dialog (native <dialog>); Cancel focused first, focus returns to trigger ----------
  // o: { title, body, action (omit for a close-only note), href, danger, cancel, done }
  function confirmDialog(trigger, o) {
    var d = document.createElement('dialog');
    d.setAttribute('aria-labelledby', 'dlg-title');
    d.innerHTML = '<h2 id="dlg-title"></h2><p></p><div class="dialog-actions"><button type="button" class="btn btn-secondary" data-cancel></button></div>';
    $('h2', d).textContent = o.title; $('p', d).textContent = o.body;
    $('[data-cancel]', d).textContent = o.cancel || 'Cancel';
    var actions = $('.dialog-actions', d);
    if (o.action && o.href) {
      var a = el('a', 'btn btn-primary', o.action); a.href = o.href;
      a.addEventListener('click', function () { d.close(); });
      actions.appendChild(a);
    } else if (o.action) {
      var go = el('button', 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary'), o.action); go.type = 'button';
      go.addEventListener('click', function () { d.close(); if (o.done) o.done(); });
      actions.appendChild(go);
    }
    document.body.appendChild(d);
    $('[data-cancel]', d).addEventListener('click', function () { d.close(); });
    d.addEventListener('close', function () { d.remove(); if (trigger && document.contains(trigger)) trigger.focus(); });
    d.showModal();
    $('[data-cancel]', d).focus();
  }

  // ---------- Row "More" menus (delegated so rendered rows work). Esc closes, focus returns ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-menu]');
    $$('.row-menu').forEach(function (m) { if (!b || m.id !== b.getAttribute('aria-controls')) m.hidden = true; });
    if (!b) return;
    var m = document.getElementById(b.getAttribute('aria-controls'));
    m.hidden = !m.hidden; b.setAttribute('aria-expanded', !m.hidden);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    $$('.row-menu').forEach(function (m) {
      if (m.hidden) return;
      m.hidden = true;
      var b = document.querySelector('[aria-controls="' + m.id + '"]');
      if (b) { b.setAttribute('aria-expanded', 'false'); b.focus(); }
    });
  });

  // ---------- Footer: honest status line + VSLicense.unlockBox (exactly once per page) ----------
  function setupFooter() {
    var f = $('footer');
    if (!f && isApp) {
      f = document.createElement('footer');
      f.innerHTML = '<div class="wrap"><p>Rowdrop does not connect to HubSpot or send email yet. It builds files from CSVs you import, and your data stays in this browser.</p>' +
        '<p>Rowdrop is not affiliated with or endorsed by HubSpot. HubSpot is a trademark of HubSpot, Inc.</p></div>';
      document.body.appendChild(f);
    }
    if (!f) return;
    if (!f.id) f.id = 'license-footer';
    if (window.VSLicense && typeof window.VSLicense.unlockBox === 'function' && !f.dataset.unlockBox) {
      f.dataset.unlockBox = '1';
      try { window.VSLicense.unlockBox(f); } catch (e) { /* the license widget must never break the page */ }
    }
  }

  // ---------- Landing (waitlist) ----------
  function initLanding() {
    var tierField = $('#tier'), tierChip = $('#tier-chip');
    $$('[data-tier]').forEach(function (b) {
      b.addEventListener('click', function () {
        tierField.value = b.dataset.tier; $('#tier-name').textContent = b.dataset.tierLabel; tierChip.hidden = false;
        $('#waitlist').scrollIntoView(); $('#email').focus();
      });
    });
    if (tierChip) $('button', tierChip).addEventListener('click', function () { tierField.value = ''; tierChip.hidden = true; $('#email').focus(); });

    // No backend: the entry is kept in this browser only (localStorage key rowdrop_waitlist).
    var wl = $('#waitlist-form');
    if (wl) wl.addEventListener('submit', function (e) {
      e.preventDefault();
      var em = $('#email'), err = $('#email-err'), net = $('#net-err');
      net.hidden = true;
      if (!/^\S+@\S+\.\S+$/.test(em.value)) {
        em.setAttribute('aria-invalid', 'true'); err.hidden = false; err.textContent = '! That email doesn’t look right. Check for a typo.'; em.focus(); return;
      }
      em.setAttribute('aria-invalid', 'false'); err.hidden = true;
      try {
        var list = JSON.parse(localStorage.getItem('rowdrop_waitlist') || '[]');
        if (!Array.isArray(list)) list = [];
        list.push({ email: em.value.trim(), tier: tierField.value, freq: $('#freq').value, how: $('#how').value, price: $('#price').value, at: new Date().toISOString() });
        localStorage.setItem('rowdrop_waitlist', JSON.stringify(list));
      } catch (ex) {
        net.hidden = false; net.textContent = '! Your browser blocked saving, so nothing was noted. Nothing was charged.';
        return;
      }
      var card = $('#waitlist-card');
      card.innerHTML = '<div class="success-msg" id="wl-ok" tabindex="-1"><span class="big" aria-hidden="true">✓</span>' +
        '<p>Your interest is noted in this browser only. Rowdrop has no server yet, so we have not received your email and cannot contact you. Check back on this page for the launch. No charge.</p></div>';
      $('#wl-ok').focus();
    });
  }

  // ---------- App state ----------
  var Lib, store, pro = false;

  function backend() {
    try { var k = '__rowdrop_t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; }
    catch (e) {
      var mem = {};
      setTimeout(function () { toast('danger', 'Your browser is blocking storage, so nothing will be kept after you leave this page.'); }, 0);
      return { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; } };
    }
  }
  // Run a save; on failure (quota) say so and keep the screen as it is.
  function trySave(fn) {
    try { fn(); return true; } catch (e) {
      toast('danger', 'Your browser storage is full or blocked, so that was not saved. Nothing else changed. Download a backup in Settings, then clear old data.');
      return false;
    }
  }
  function limit() { return Lib.jobs.jobLimit(pro); }
  function sourceOf(job) { return store.loadSources().filter(function (s) { return s.id === job.sourceId; })[0] || null; }
  function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }
  function describe(job) { return safe(function () { return Lib.schedule.describeSchedule(job.schedule); }, 'Schedule needs fixing'); }

  function download(r) {
    var blob = new Blob([r.data], { type: r.mime });
    var url = URL.createObjectURL(blob);
    var a = el('a'); a.href = url; a.download = r.filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Build the file for a job, download it, and log the run. Returns the run record.
  function execute(job) {
    var now = new Date();
    var r = Lib.runner.runJob(job, sourceOf(job), pro, now);
    var rec = { id: uid(), jobId: job.id, at: now.toISOString(), ok: r.ok, rows: r.ok ? r.rows : null, bytes: r.ok ? r.bytes : null,
      recipients: (job.recipients || []).length, filename: r.ok ? r.filename : '', reason: r.ok ? '' : r.reason };
    if (r.ok) download(r);
    var saved = trySave(function () {
      store.saveRuns([rec].concat(store.loadRuns()).slice(0, 500));
      if (r.ok) {
        var jobs = store.loadJobs();
        jobs.forEach(function (j) { if (j.id === job.id) j.lastRunAt = rec.at; });
        store.saveJobs(jobs);
        job.lastRunAt = rec.at;
      }
    });
    if (!saved) return rec;
    if (r.ok) toast('success', 'Built ' + r.filename + ' (' + r.rows + ' rows). Rowdrop does not send email yet: open the email draft on the export page to share it.');
    else toast('danger', 'The run failed: ' + r.reason + ' Nothing was changed.');
    return rec;
  }

  function setPaused(job, paused) {
    var jobs = store.loadJobs();
    jobs.forEach(function (j) { if (j.id === job.id) j.paused = paused; });
    if (trySave(function () { store.saveJobs(jobs); })) job.paused = paused;
  }
  function deleteJob(job) {
    trySave(function () {
      store.saveJobs(store.loadJobs().filter(function (j) { return j.id !== job.id; }));
      store.saveRuns(store.loadRuns().filter(function (r) { return r.jobId !== job.id; }));
    });
  }

  // ---------- Connect: import a HubSpot CSV ----------
  function initConnect() {
    var form = $('#import-form'), err = $('#c-err');
    function fail(msg) { err.hidden = false; err.textContent = '! ' + msg; $('#csv-file').setAttribute('aria-invalid', 'true'); }
    function renderImports() {
      var list = store.loadSources(), box = $('#imports'), ul = $('#imports-list');
      box.hidden = !list.length; ul.innerHTML = '';
      list.forEach(function (s) {
        var li = el('li');
        li.appendChild(el('span', null, s.name + ' · ' + s.rows.length + ' rows, ' + s.headers.length + ' columns'));
        var rm = el('button', 'btn btn-danger', 'Remove'); rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove import ' + s.name);
        rm.addEventListener('click', function () {
          confirmDialog(rm, { title: 'Remove "' + s.name + '"?', body: 'Exports that use it will fail until you import the CSV again. Their settings are kept.', action: 'Remove import', danger: true,
            done: function () { if (trySave(function () { store.saveSources(store.loadSources().filter(function (x) { return x.id !== s.id; })); })) { toast('success', 'Removed ' + s.name + '.'); renderImports(); } } });
        });
        li.appendChild(rm); ul.appendChild(li);
      });
    }
    renderImports();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true; $('#csv-file').setAttribute('aria-invalid', 'false');
      var file = $('#csv-file').files[0];
      if (!file) { fail('Choose the CSV file you exported from HubSpot.'); $('#csv-file').focus(); return; }
      file.text().then(function (text) {
        var rows = Lib.csv.parseCsv(text).filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); });
        if (rows.length < 2) { fail('That file needs a header row and at least one data row. Nothing was imported.'); return; }
        var seen = {};
        var headers = rows[0].map(function (h, i) {
          var base = h.trim() || 'Column ' + (i + 1), n = base, k = 2;
          while (seen[n]) n = base + ' (' + k++ + ')';
          seen[n] = true; return n;
        });
        var body = rows.slice(1).map(function (r) { return headers.map(function (_, i) { return r[i] == null ? '' : r[i]; }); });
        var name = $('#src-name').value.trim() || file.name.replace(/\.csv$/i, '');
        var sources = store.loadSources();
        var existing = sources.filter(function (s) { return s.name.toLowerCase() === name.toLowerCase(); })[0];
        var src = { id: existing ? existing.id : uid(), name: name, headers: headers, rows: body, importedAt: new Date().toISOString() };
        sources = existing ? sources.map(function (s) { return s.id === src.id ? src : s; }) : sources.concat([src]);
        if (!trySave(function () { store.saveSources(sources); })) return;
        toast('success', (existing ? 'Updated ' : 'Imported ') + name + ': ' + body.length + ' rows, ' + headers.length + ' columns.');
        form.reset(); renderImports();
      }, function () { fail('We couldn’t read that file. Nothing was imported. Try exporting it again.'); });
    });
  }

  // ---------- Exports list ----------
  function initExports() {
    var jobs = store.loadJobs(), sources = store.loadSources(), settings = store.loadSettings(), runs = store.loadRuns();
    var now = new Date();
    $('#usage').textContent = jobs.length + ' of ' + limit() + ' exports used (' + (pro ? 'Pro' : 'Free') + ')';

    // Alerts area: honest status, then the missed-run banner (Pro) or its locked note (free).
    var alerts = $('#alerts'); alerts.innerHTML = '';
    var status = el('p', 'notice', 'Rowdrop does not connect to HubSpot or send email yet. Import a CSV, then press Run now to download the file. Connecting and sending are coming soon.');
    alerts.appendChild(status);
    var overdue = Lib.runner.overdueJobs(jobs, now);
    if (pro) {
      if (overdue.length && settings.missedAlerts !== false) {
        var b = el('div', 'notice danger'); b.setAttribute('role', 'alert');
        var s = el('strong', null, '! Missed run: '); b.appendChild(s);
        b.appendChild(document.createTextNode(overdue.map(function (j) { return j.name; }).join(', ') + ' was due and has not been run. Press Run now.'));
        alerts.appendChild(b);
      }
    } else {
      var lock = el('p', 'notice locked', 'Missed-run alerts show a banner when a due export was not run. '); lock.appendChild(unlockLink());
      alerts.appendChild(lock);
    }

    var state = !sources.length && !jobs.length ? 'nosource' : !jobs.length ? 'empty' : 'normal';
    $$('[data-state]').forEach(function (s) { s.hidden = s.dataset.state !== state; });

    var tbody = $('#rows'); tbody.innerHTML = '';
    jobs.forEach(function (job) { tbody.appendChild(jobRow(job, runs, now)); });

    var ne = $('#new-export');
    ne.addEventListener('click', function (e) {
      if (store.loadJobs().length < limit()) return;
      e.preventDefault();
      var n = store.loadJobs().length;
      confirmDialog(ne, pro
        ? { title: 'You’ve reached your plan’s limit', body: 'You’re using ' + n + ' of ' + limit() + ' exports. Pause or delete one to add another. You can still edit your existing exports.', cancel: 'Close' }
        : { title: 'You’ve reached your plan’s limit', body: 'You’re using ' + n + ' of ' + limit() + ' exports. Pause or delete one, or unlock Pro for up to 15. You can still edit your existing exports.',
            action: 'Unlock with Pro', href: '#license-footer', cancel: 'Close' });
    });

    var savedId = params.get('saved');
    if (savedId) {
      var row = document.getElementById('row-' + savedId), j = jobs.filter(function (x) { return x.id === savedId; })[0];
      if (row) { row.classList.add('highlight'); setTimeout(function () { row.classList.remove('highlight'); }, 2000); }
      if (j) toast('success', 'Saved. First file is due ' + Lib.runner.formatDate(Lib.runner.dueStatus(j, now).next) + ' at ' + j.schedule.time + ' (' + zone() + ').');
    }
  }

  function jobRow(job, runs, now) {
    var st = safe(function () { return Lib.runner.dueStatus(job, now); }, { state: 'scheduled', next: null });
    var src = sourceOf(job);
    var last = runs.filter(function (r) { return r.jobId === job.id; })[0];
    var tr = el('tr'); tr.id = 'row-' + job.id;
    function td(label, cls) { var c = el('td', cls || ''); if (label) c.setAttribute('data-label', label); tr.appendChild(c); return c; }

    var n = td(null, 'name'); var a = el('a', null, job.name); a.href = 'app-detail.html?id=' + encodeURIComponent(job.id); n.appendChild(a);
    td(null, 'hide-sm').textContent = src ? src.name : 'Import missing';
    td('Schedule', 'mono').textContent = describe(job);
    td(null, 'hide-sm mono').textContent = '.' + (job.format || 'csv');
    td(null, 'hide-sm').textContent = people((job.recipients || []).length);

    var next = td('Next');
    var when = st.state === 'paused' ? 'Paused' : st.next ? Lib.runner.formatDate(st.next) + ' ' + job.schedule.time : '—';
    next.appendChild(el('span', null, when + ' '));
    if (st.state === 'overdue') next.appendChild(pill('failed', '!', 'Overdue'));
    else if (st.state === 'due') next.appendChild(pill('scheduled', '◷', 'Due'));
    else if (st.state === 'paused') next.appendChild(pill('paused', '||', 'Paused'));
    else next.appendChild(pill('scheduled', '◷', 'Scheduled'));

    var res = td('Last result');
    if (!last) res.textContent = '—';
    else res.appendChild(last.ok ? pill('sent', '✓', 'Built') : pill('failed', '!', 'Failed'));

    var more = td(null, 'more');
    var box = el('div', 'row-actions');
    var run = el('button', 'btn btn-secondary', 'Run now'); run.type = 'button';
    run.setAttribute('aria-label', 'Run now: ' + job.name);
    run.addEventListener('click', function () { execute(job); refreshRows(); });
    box.appendChild(run);
    var wrap = el('div', 'menu-wrap');
    var mb = el('button', 'btn btn-secondary', 'More'); mb.type = 'button';
    mb.setAttribute('data-menu', ''); mb.setAttribute('aria-expanded', 'false'); mb.setAttribute('aria-controls', 'm-' + job.id);
    mb.setAttribute('aria-label', 'More actions for ' + job.name);
    var menu = el('div', 'row-menu'); menu.id = 'm-' + job.id; menu.hidden = true;
    var edit = el('a', null, 'Edit'); edit.href = 'app-edit.html?id=' + encodeURIComponent(job.id);
    var pz = el('button', null, job.paused ? 'Resume' : 'Pause'); pz.type = 'button';
    pz.addEventListener('click', function () {
      menu.hidden = true;
      if (job.paused) { setPaused(job, false); toast('success', 'Resumed ' + job.name + '.'); refreshRows(); return; }
      confirmDialog(mb, { title: 'Pause "' + job.name + '"?', body: 'It will not be marked due until you resume it.', action: 'Pause export',
        done: function () { setPaused(job, true); toast('success', 'Paused. ' + job.name + ' will not be marked due.'); refreshRows(); } });
    });
    var del = el('button', 'del', 'Delete'); del.type = 'button';
    del.addEventListener('click', function () {
      menu.hidden = true;
      confirmDialog(mb, { title: 'Delete "' + job.name + '"?', body: 'Its schedule and run history will be removed. This can’t be undone.', action: 'Delete export', danger: true,
        done: function () { deleteJob(job); toast('success', 'Deleted ' + job.name + '.'); refreshRows(); } });
    });
    menu.appendChild(edit); menu.appendChild(pz); menu.appendChild(del);
    wrap.appendChild(mb); wrap.appendChild(menu); box.appendChild(wrap); more.appendChild(box);
    return tr;
  }
  // Re-render the exports page in place (keeps the toast box).
  function refreshRows() { initExportsRefresh(); }
  function initExportsRefresh() {
    var jobs = store.loadJobs(), runs = store.loadRuns(), now = new Date();
    var tbody = $('#rows'); tbody.innerHTML = '';
    jobs.forEach(function (job) { tbody.appendChild(jobRow(job, runs, now)); });
    $('#usage').textContent = jobs.length + ' of ' + limit() + ' exports used (' + (pro ? 'Pro' : 'Free') + ')';
    var state = !jobs.length ? (store.loadSources().length ? 'empty' : 'nosource') : 'normal';
    $$('[data-state]').forEach(function (s) { s.hidden = s.dataset.state !== state; });
    var b = $('#alerts .notice.danger'); if (b) b.remove();
    var overdue = Lib.runner.overdueJobs(jobs, now);
    if (pro && overdue.length && store.loadSettings().missedAlerts !== false) {
      var nb = el('div', 'notice danger'); nb.setAttribute('role', 'alert');
      nb.appendChild(el('strong', null, '! Missed run: '));
      nb.appendChild(document.createTextNode(overdue.map(function (j) { return j.name; }).join(', ') + ' was due and has not been run. Press Run now.'));
      $('#alerts').appendChild(nb);
    }
  }

  // ---------- Edit ----------
  function initEdit() {
    var jobs = store.loadJobs(), sources = store.loadSources();
    var id = params.get('id');
    var job = id ? jobs.filter(function (j) { return j.id === id; })[0] : null;
    var form = $('#edit-form'), note = $('#edit-note');
    function block(msg, linkText, href) {
      form.hidden = true; var p = el('p', 'notice', msg + ' ');
      if (linkText) { var a = el('a', null, linkText); a.href = href; p.appendChild(a); }
      note.appendChild(p);
    }
    if (id && !job) return block('That export no longer exists.', 'Back to exports', 'app-exports.html');
    if (!job && jobs.length >= limit()) {
      form.hidden = true;
      var p = el('p', 'notice', 'You’re using ' + jobs.length + ' of ' + limit() + ' exports' + (pro ? '. Pause or delete one to add another. ' : ' on Free. Pause or delete one, or unlock Pro for up to 15. '));
      if (!pro) p.appendChild(unlockLink());
      note.appendChild(p);
      return;
    }
    if (!sources.length) return block('Import a HubSpot CSV before you create an export.', 'Import a CSV', 'app-connect.html');

    if (job) { $('#page-title').textContent = 'Edit export'; document.title = 'Edit export · Rowdrop preview'; }
    var selectedId = job ? job.sourceId : sources[0].id;
    var sel = $('#source-list'), cols = $('#cols'), box = $('.chip-box'), rcpt = $('#rcpt');
    cols.tabIndex = -1;

    // Source picker with search.
    function renderSources() {
      var q = $('#source-search').value.toLowerCase(), n = 0;
      sel.innerHTML = '';
      sources.forEach(function (s) {
        if (s.name.toLowerCase().indexOf(q) < 0) return;
        var o = el('option', null, s.name + ' (' + s.rows.length + ' rows)'); o.value = s.id; o.selected = s.id === selectedId; sel.appendChild(o); n++;
      });
      $('#source-empty').hidden = n > 0;
      $('#source-empty-text').textContent = 'No lists or reports match "' + $('#source-search').value + '". Check the spelling, or import the CSV from HubSpot first.';
      sel.hidden = n === 0;
    }
    function renderCols(checked) {
      var src = sources.filter(function (s) { return s.id === selectedId; })[0];
      cols.innerHTML = '';
      if (!src) { cols.appendChild(el('p', 'help', 'The imported file for this export is gone. Pick another one.')); return; }
      src.headers.forEach(function (h) {
        var l = el('label', 'check'), c = el('input'); c.type = 'checkbox'; c.value = h;
        c.checked = checked ? checked.indexOf(h) >= 0 : true;
        l.appendChild(c); l.appendChild(el('span', null, h)); cols.appendChild(l);
      });
    }
    $('#source-search').addEventListener('input', renderSources);
    sel.addEventListener('change', function () { selectedId = sel.value; renderCols(null); update(); });

    // Recipient chips: Enter/comma adds, Backspace removes the last.
    function addChip(v) {
      v = v.replace(/,/g, '').trim(); if (!v) return;
      var ok = Lib.jobs.EMAIL_RE.test(v);
      var c = el('span', 'chip mono' + (ok ? '' : ' invalid')); c.dataset.email = v;
      if (!ok) { var x = el('span', null, '! '); x.setAttribute('aria-hidden', 'true'); c.appendChild(x); c.title = 'This email doesn’t look right'; }
      c.appendChild(el('span', null, v));
      var rm = el('button', null, '×'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + v);
      rm.addEventListener('click', function () { c.remove(); rcpt.focus(); update(); });
      c.appendChild(rm); box.insertBefore(c, rcpt); rcpt.value = '';
    }
    rcpt.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addChip(rcpt.value); update(); }
      else if (e.key === 'Backspace' && !rcpt.value) { var cs = $$('.chip', box); if (cs.length) { cs[cs.length - 1].remove(); update(); } }
    });
    rcpt.addEventListener('blur', function () { addChip(rcpt.value); update(); });

    // Fill the form.
    $('#tz').value = zone();
    $('#fmt-xlsx').disabled = !pro; $('#fmt-lock').hidden = pro;
    if (job) {
      $('#name').value = job.name; $('#subject').value = job.subject || '';
      var f = $('input[name=fmt][value=' + (job.format || 'csv') + ']'); if (f) f.checked = true;
      var fq = $('input[name=freq][value=' + job.schedule.frequency + ']'); if (fq) fq.checked = true;
      $('#time').value = job.schedule.time || '08:00';
      if (job.schedule.weekday != null) $('#day').value = String(job.schedule.weekday);
      if (job.schedule.day != null) $('#dom').value = job.schedule.day;
      (job.recipients || []).forEach(addChip);
    }
    renderSources(); renderCols(job ? job.columns : null);

    function val(name) { var c = $('input[name=' + name + ']:checked'); return c ? c.value : ''; }
    function readForm() {
      var freq = val('freq'), sched = { frequency: freq, time: $('#time').value };
      if (freq === 'weekly') sched.weekday = Number($('#day').value);
      if (freq === 'monthly') sched.day = parseInt($('#dom').value, 10);
      var chips = $$('.chip', box);
      return {
        name: $('#name').value.trim(), sourceId: selectedId,
        columns: $$('input', cols).filter(function (c) { return c.checked; }).map(function (c) { return c.value; }),
        filters: job && job.filters ? job.filters : [], schedule: sched, format: val('fmt') || 'csv', subject: $('#subject').value.trim(),
        recipients: chips.filter(function (c) { return !c.classList.contains('invalid'); }).map(function (c) { return c.dataset.email; }),
        badRecipients: chips.length - chips.filter(function (c) { return !c.classList.contains('invalid'); }).length
      };
    }
    function check(v) {
      var errs = [];
      if (!v.name) errs.push({ id: 'name', msg: 'Add a name.' });
      if (!v.sourceId || !sources.some(function (s) { return s.id === v.sourceId; })) errs.push({ id: 'source-list', err: 'src-err', msg: 'Pick an imported list or report.' });
      if (!v.columns.length) errs.push({ id: 'cols', msg: 'Pick at least one column.' });
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.schedule.time)) errs.push({ id: 'time', msg: 'Choose a time, like 08:00.' });
      if (v.schedule.frequency === 'monthly' && !(v.schedule.day >= 1 && v.schedule.day <= 31)) errs.push({ id: 'dom', msg: 'Enter a day of the month from 1 to 31.' });
      if (v.badRecipients) errs.push({ id: 'rcpt', msg: 'Fix or remove the addresses marked with !.' });
      else if (!v.recipients.length) errs.push({ id: 'rcpt', msg: 'Add at least one valid recipient.' });
      var locked = Lib.jobs.formatLockedError(v.format, pro);
      if (locked) errs.push({ id: 'fmt-xlsx', err: 'fmt-lock', msg: locked });
      return errs;
    }
    var fieldIds = ['name', 'source-list', 'cols', 'time', 'dom', 'rcpt', 'fmt-xlsx'];
    function errEl(id) { var e = (id === 'source-list') ? $('#src-err') : id === 'fmt-xlsx' ? null : $('#' + id + '-err'); return e; }
    // Show errors inline; with onlyId, touch just that field (blur) and leave the summary alone.
    function showErrors(errs, onlyId) {
      fieldIds.forEach(function (id) {
        if (onlyId && id !== onlyId) return;
        var f = document.getElementById(id), e = errEl(id), hit = errs.filter(function (x) { return x.id === id; })[0];
        if (f) f.setAttribute('aria-invalid', hit ? 'true' : 'false');
        if (e) { e.hidden = !hit; e.textContent = hit ? '! ' + hit.msg : ''; }
      });
      if (onlyId) return;
      var sum = $('.error-summary', form);
      sum.hidden = !errs.length;
      var ul = $('ul', sum); ul.innerHTML = '';
      errs.forEach(function (x) { var li = el('li'), a = el('a', null, x.msg); a.href = '#' + x.id; li.appendChild(a); ul.appendChild(li); });
      if (errs.length) sum.focus();
    }
    ['name', 'time', 'dom', 'rcpt'].forEach(function (id) {
      document.getElementById(id).addEventListener('blur', function () { setTimeout(function () { showErrors(check(readForm()), id); }, 0); });
    });

    // Live summary + field visibility.
    function update() {
      var v = readForm();
      $('#day-field').hidden = v.schedule.frequency !== 'weekly';
      $('#dom-field').hidden = v.schedule.frequency !== 'monthly';
      var fn = Lib.runner.fileName({ name: v.name || 'export', format: v.format }, new Date());
      $('#name-preview').textContent = fn;
      var sched = safe(function () { return Lib.schedule.describeSchedule(v.schedule); }, null);
      $('#summary').textContent = sched ? sched + ' (' + zone() + '), ' + fn + ' to ' + people(v.recipients.length) + '.' : 'Choose a valid time to see the summary.';
      $('#summary-next').textContent = sched ? 'First file is due ' + Lib.runner.formatDate(Lib.schedule.nextDue(v.schedule, job && job.lastRunAt ? new Date(job.lastRunAt) : new Date())) + ' at ' + v.schedule.time + '.' : '';
    }
    form.addEventListener('input', update); form.addEventListener('change', update);
    update();

    $('#test-btn').addEventListener('click', function () {
      addChip(rcpt.value);
      var v = readForm(), errs = check(v);
      if (errs.length) { showErrors(errs); return; }
      showErrors([]);
      var r = Lib.runner.runJob(Object.assign({ id: 'test' }, v), sources.filter(function (s) { return s.id === v.sourceId; })[0], pro, new Date());
      if (r.ok) { download(r); toast('success', 'Test file downloaded: ' + r.filename + '. Rowdrop does not send email yet, and this test is not logged.'); }
      else toast('danger', 'The test failed: ' + r.reason + ' Nothing was changed.');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      addChip(rcpt.value);
      var v = readForm(), errs = check(v);
      if (errs.length) { showErrors(errs); return; }
      showErrors([]);
      var j = Object.assign({}, job || { id: uid(), createdAt: new Date().toISOString(), paused: false }, {
        name: v.name, sourceId: v.sourceId, columns: v.columns, filters: v.filters, schedule: v.schedule,
        recipients: v.recipients, format: v.format, subject: v.subject
      });
      var libErrs = Lib.jobs.validateJob(j);
      if (libErrs.length) { showErrors([{ id: 'name', msg: libErrs.join(' ') }]); return; }
      var all = store.loadJobs();
      if (job) all = all.map(function (x) { return x.id === j.id ? j : x; });
      else {
        var r = Lib.jobs.addJob(all, j, pro);
        if (!r.ok) { toast('danger', r.error + ' Nothing was saved.'); return; }
        all = r.jobs;
      }
      if (trySave(function () { store.saveJobs(all); })) location.href = 'app-exports.html?saved=' + encodeURIComponent(j.id);
    });
  }

  // ---------- Detail + history ----------
  function initDetail() {
    var jobs = store.loadJobs();
    if (!jobs.length) { $('#detail-empty').hidden = false; return; }
    var job = jobs.filter(function (j) { return j.id === params.get('id'); })[0] || jobs[0];
    $('#detail').hidden = false;
    if (jobs.length > 1) {
      $('#d-switch-wrap').hidden = false;
      var sw = $('#d-switch');
      jobs.forEach(function (j) { var o = el('option', null, j.name); o.value = j.id; o.selected = j.id === job.id; sw.appendChild(o); });
      sw.addEventListener('change', function () { location.search = '?id=' + encodeURIComponent(sw.value); });
    }
    document.title = job.name + ' · History · Rowdrop preview';
    $('#d-name').textContent = job.name;
    $('#d-meta').textContent = describe(job) + ' (' + zone() + ') · .' + (job.format || 'csv') + ' · ' + people((job.recipients || []).length);
    $('#d-edit').href = 'app-edit.html?id=' + encodeURIComponent(job.id);
    var mailto = $('#d-mailto'); mailto.href = Lib.runner.mailtoDraft(job, Lib.runner.fileName(job, new Date()));
    $('#d-mailto-help').textContent = 'Opens your email app. Rowdrop cannot attach the file for you.';

    function status() {
      var st = safe(function () { return Lib.runner.dueStatus(job, new Date()); }, null);
      var t = !st ? '' : st.state === 'paused' ? 'Paused. It will not be marked due.' :
        st.state === 'overdue' ? 'Overdue: it was due ' + Lib.runner.formatDate(st.next) + ' at ' + job.schedule.time + ' and has not been run.' :
        st.state === 'due' ? 'Due today at ' + job.schedule.time + '. Press Run now.' :
        'Next due ' + Lib.runner.formatDate(st.next) + ' at ' + job.schedule.time + '.';
      $('#d-status').textContent = t;
      $('#d-pause').textContent = job.paused ? 'Resume' : 'Pause';
    }
    function preview() {
      var src = sourceOf(job), box = $('#d-preview'); box.innerHTML = '';
      if (!src) { $('#d-preview-note').textContent = 'The imported file for this export is gone. Import the CSV again.'; return; }
      var t = Lib.jobs.buildTable(job, { headers: src.headers, rows: src.rows });
      $('#d-preview-note').textContent = 'First ' + Math.min(5, t.rows.length) + ' of ' + t.rows.length + ' rows that the file will contain.';
      var table = el('table'), head = el('tr');
      table.appendChild(el('caption', 'sr-only', 'Preview rows'));
      t.headers.forEach(function (h) { var th = el('th', null, h); th.scope = 'col'; head.appendChild(th); });
      var thead = el('thead'); thead.appendChild(head); table.appendChild(thead);
      var tb = el('tbody');
      t.rows.slice(0, 5).forEach(function (r) { var tr = el('tr'); r.forEach(function (c, i) { var cell = el('td', null, c); cell.setAttribute('data-label', t.headers[i]); tr.appendChild(cell); }); tb.appendChild(tr); });
      table.appendChild(tb); box.appendChild(table);
    }
    function history() {
      var runs = store.loadRuns().filter(function (r) { return r.jobId === job.id; });
      $('#run-log').hidden = !runs.length; $('#history-empty').hidden = !!runs.length;
      var tb = $('#run-rows'); tb.innerHTML = '';
      runs.forEach(function (r) {
        var d = new Date(r.at), tr = el('tr');
        function td(label, text, cls) { var c = el('td', cls || '', text); c.setAttribute('data-label', label); tr.appendChild(c); return c; }
        td('Date', Lib.runner.formatDate(d) + ', ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2), 'name');
        td('Rows', r.ok ? String(r.rows) : '—'); td('Size', r.ok ? Lib.runner.formatSize(r.bytes) : '—'); td('To', people(r.recipients || 0));
        var res = el('td'); res.setAttribute('data-label', 'Result');
        res.appendChild(r.ok ? pill('sent', '✓', 'Built') : pill('failed', '!', 'Failed'));
        if (!r.ok) {
          var rb = el('button', 'btn btn-secondary', 'Show reason'); rb.type = 'button';
          rb.setAttribute('aria-expanded', 'false'); rb.setAttribute('aria-controls', 'reason-' + r.id); rb.style.marginLeft = '8px';
          res.appendChild(rb);
          var rt = el('tr', 'reason'); rt.id = 'reason-' + r.id; rt.hidden = true;
          var rc = el('td'); rc.colSpan = 5;
          var p1 = el('p'); p1.style.margin = '0 0 8px'; p1.appendChild(el('strong', null, 'Why it failed: ')); p1.appendChild(document.createTextNode(r.reason + ' Nothing was changed.'));
          var retry = el('button', 'btn btn-secondary', 'Retry now'); retry.type = 'button';
          retry.addEventListener('click', function () { execute(job); refreshAll(); });
          rc.appendChild(p1); rc.appendChild(retry); rt.appendChild(rc);
          rb.addEventListener('click', function () { rt.hidden = !rt.hidden; rb.setAttribute('aria-expanded', !rt.hidden); });
          tr.appendChild(res); tb.appendChild(tr); tb.appendChild(rt);
        } else { tr.appendChild(res); tb.appendChild(tr); }
      });
    }
    function refreshAll() { status(); history(); }
    status(); preview(); history();

    $('#d-run').addEventListener('click', function () { execute(job); refreshAll(); });
    $('#d-pause').addEventListener('click', function () {
      var btn = $('#d-pause');
      if (job.paused) { setPaused(job, false); toast('success', 'Resumed ' + job.name + '.'); status(); return; }
      confirmDialog(btn, { title: 'Pause "' + job.name + '"?', body: 'It will not be marked due until you resume it.', action: 'Pause export',
        done: function () { setPaused(job, true); toast('success', 'Paused. ' + job.name + ' will not be marked due.'); status(); } });
    });
  }

  // ---------- Settings ----------
  function initSettings() {
    var jobs = store.loadJobs();
    function plan() {
      var n = store.loadJobs().length;
      $('#plan-name').textContent = pro ? 'Pro' : 'Free';
      $('#plan-usage').textContent = n + ' of ' + limit() + ' exports used.';
    }
    plan();
    $('#plan-lock').hidden = pro;
    var on = $('#alert-on');
    on.checked = pro && store.loadSettings().missedAlerts !== false;
    on.disabled = !pro; $('#alert-lock').hidden = pro;
    on.addEventListener('change', function () {
      var s = store.loadSettings(); s.missedAlerts = on.checked;
      if (trySave(function () { store.saveSettings(s); })) toast('success', on.checked ? 'Saved. The missed-run banner is on.' : 'Saved. The missed-run banner is off.');
    });

    $('#backup-btn').addEventListener('click', function () {
      download({ data: store.exportJson(), mime: 'application/json', filename: 'rowdrop-backup-' + Lib.runner.ymd(new Date()) + '.json' });
      toast('success', 'Backup downloaded.');
    });

    var rerr = $('#restore-err');
    $('#restore-btn').addEventListener('click', function () {
      var btn = $('#restore-btn'), file = $('#restore-file').files[0];
      rerr.hidden = true;
      if (!file) { rerr.hidden = false; rerr.textContent = '! Choose a Rowdrop JSON backup file first.'; $('#restore-file').focus(); return; }
      file.text().then(function (text) {
        confirmDialog(btn, { title: 'Restore "' + file.name + '"?', body: 'This replaces your current exports, imports and history with the backup.', action: 'Restore backup',
          done: function () {
            var r; try { r = store.importJson(text); } catch (e) { r = { ok: false, error: 'Your browser storage is full or blocked. Your data is unchanged.' }; }
            if (!r.ok) { rerr.hidden = false; rerr.textContent = '! ' + r.error; toast('danger', r.error); return; }
            toast('success', 'Restored from ' + file.name + '.'); $('#restore-file').value = ''; plan();
          } });
      }, function () { rerr.hidden = false; rerr.textContent = '! We couldn’t read that file. Your data is unchanged.'; });
    });

    $('#clear-btn').addEventListener('click', function () {
      var btn = $('#clear-btn');
      confirmDialog(btn, { title: 'Clear all Rowdrop data?', body: 'This removes your imports, exports, run history and settings from this browser. Download a backup first if you may want them back.',
        action: 'Clear all data', danger: true,
        done: function () { store.clearAll(); toast('success', 'Cleared. Rowdrop data was removed from this browser.'); plan(); on.checked = pro; } });
    });
    void jobs;
  }

  // ---------- Boot ----------
  setupFooter();
  if (!isApp) { initLanding(); return; }
  if (!window.RowdropLib || !window.RowdropLib.license) { toast('danger', 'Rowdrop could not load its code. Reload the page.'); return; }
  var R = window.RowdropLib;
  // Libs are loaded: remove the fake CommonJS globals so later scripts (VSLicense) see a plain browser.
  delete window.module; delete window.require;
  Lib = { csv: R.csv, schedule: R.schedule, jobs: R.jobs, runner: R.runner, license: R.license };
  store = R.storage.createStorage(backend());
  // Pro is checked once per page load; VSLicense.isUnlocked may be sync or a Promise.
  Lib.license.isProAsync().then(function (p) {
    pro = p;
    if ($('#import-form')) initConnect();
    else if ($('#exports-list')) initExports();
    else if ($('#edit-form')) initEdit();
    else if ($('#detail')) initDetail();
    else if ($('#backup-btn')) initSettings();
  });
})();
