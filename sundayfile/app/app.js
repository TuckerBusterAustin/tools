/* Sundayfile browser glue: reads the DOM, calls lib/ modules, renders pages.
   No parsing or column mapping lives here (see lib/importer.js, lib/schema.js, lib/store.js).
   Pages set <body data-page="...">; each init function below handles one page.

   README: manual check list
   1. Open app.html: "No clients yet". Click Add client, type "Acme Co", Save client.
      You land on Clients with Acme Co listed and "1 of 1 client workspaces used".
   2. Open Acme Co. Paste or choose a HubSpot contacts CSV (headers like First Name, Last Name, Email).
      Click Preview rows: type is detected and the first 20 rows show with the fixed columns
      (client, source, record_type, name, ...). Click Save file.
   3. Saved files lists "HubSpot contacts", row count and imported date. Click Download:
      the file is acme-co-hubspot-contacts-YYYY-MM-DD.csv with the landing-page columns
      (client, source, record_type, name, stage, owner, updated_at, board, list).
   4. A CSV with unknown headers shows a type dropdown; an empty file shows a plain error.
   5. Back on Clients, Add client is disabled with the Pro note ("Unlock with Pro").
      Opening add-client.html directly shows the same refusal.
   6. Reload any page: the client and its saved file are still there (localStorage).
   Scheduling and Drive delivery are shown as "coming soon" only. */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* Storage: localStorage when it works, otherwise an in-memory stub (data lasts until reload). */
  function pickStorage() {
    try {
      var s = window.localStorage; s.setItem('sf:probe', '1'); s.removeItem('sf:probe'); return s;
    } catch (e) {
      var mem = {};
      return { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); } };
    }
  }
  var store = window.VSStore ? window.VSStore.createStore(pickStorage()) : null;
  /* Number of client workspaces this visitor may have (1 free, 5 Pro). */
  function planLimit() {
    var gate = window.VSLicenseGate;
    var p = gate ? gate.isPro().catch(function () { return false; }) : Promise.resolve(false);
    return p.then(function (pro) { return window.VSStore ? window.VSStore.maxClients(pro) : 1; });
  }
  /* Plain message in place of the page body when storage code is missing. */
  function noStore() {
    var m = $('main') || document.body, p = document.createElement('p');
    p.className = 'error'; p.setAttribute('role', 'alert');
    p.textContent = 'Sundayfile could not load its storage code. Reload the page, or try another browser.';
    m.prepend(p);
  }

  /* ---------- toast: one at a time, errors stay until dismissed ---------- */
  var toastTimer;
  function toast(msg, isError) {
    var region = $('#toast-region');
    if (!region) { region = document.createElement('div'); region.id = 'toast-region'; document.body.appendChild(region); }
    clearTimeout(toastTimer);
    region.innerHTML = '';
    var t = document.createElement('div');
    t.className = 'toast' + (isError ? ' error' : '');
    t.setAttribute('role', isError ? 'alert' : 'status');
    var p = document.createElement('p'); p.textContent = (isError ? '! ' : '✓ ') + msg;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn-text'; b.textContent = 'Dismiss';
    function close() { t.remove(); }
    b.addEventListener('click', close);
    t.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    t.append(p, b); region.appendChild(t);
    function arm() { if (!isError) toastTimer = setTimeout(close, 6000); }
    t.addEventListener('mouseenter', function () { clearTimeout(toastTimer); });
    t.addEventListener('focusin', function () { clearTimeout(toastTimer); });
    t.addEventListener('mouseleave', arm); t.addEventListener('focusout', arm);
    arm();
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { var t = $('.toast'); if (t) t.remove(); }
  });

  /* ---------- confirm dialog (native <dialog>; returns focus to opener) ---------- */
  function confirmDialog(opts, opener) {
    var d = document.createElement('dialog');
    d.setAttribute('aria-labelledby', 'dlg-title');
    d.innerHTML = '<h2 id="dlg-title"></h2><p class="muted"></p><div class="dialog-actions">' +
      '<button type="button" class="btn btn-secondary" value="cancel">Cancel</button>' +
      '<button type="button" class="btn btn-danger" value="ok"></button></div>';
    $('h2', d).textContent = opts.title; $('p', d).textContent = opts.body;
    var ok = $('.btn-danger', d); ok.textContent = opts.confirm;
    $('.btn-secondary', d).addEventListener('click', function () { d.close(); });
    ok.addEventListener('click', function () { d.close('ok'); });
    d.addEventListener('close', function () {
      var done = d.returnValue === 'ok'; d.remove();
      if (opener) opener.focus();
      if (done && opts.onConfirm) opts.onConfirm();
    });
    document.body.appendChild(d); d.showModal();
  }
  $$('[data-confirm]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      confirmDialog({ title: btn.dataset.title, body: btn.dataset.body, confirm: btn.dataset.confirm,
        onConfirm: function () {
          if (btn.dataset.after === 'clients') { location.href = 'app.html'; }
          else { var li = btn.closest('li'); if (li) li.remove(); toast(btn.dataset.done || 'Done.'); }
        } }, btn);
    });
  });

  /* ---------- busy buttons: label changes, width locked, spinner on the left ---------- */
  function busy(btn, label) {
    btn.style.minWidth = btn.offsetWidth + 'px';
    btn.dataset.label = btn.textContent;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span></span>';
    btn.lastChild.textContent = label; btn.setAttribute('aria-disabled', 'true'); btn.disabled = true;
  }
  function idle(btn) { btn.textContent = btn.dataset.label; btn.removeAttribute('aria-disabled'); btn.disabled = false; btn.style.minWidth = ''; }

  /* ---------- inline errors tied to fields with aria-describedby ---------- */
  function setError(input, msg) {
    clearError(input);
    var p = document.createElement('p'); p.className = 'error'; p.id = input.id + '-error'; p.textContent = msg;
    var wrap = input.closest('.field'); wrap.appendChild(p);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', ((input.dataset.help || '') + ' ' + p.id).trim());
  }
  function clearError(input) {
    var old = $('#' + input.id + '-error'); if (old) old.remove();
    input.removeAttribute('aria-invalid');
    if (input.dataset.help) input.setAttribute('aria-describedby', input.dataset.help); else input.removeAttribute('aria-describedby');
  }
  /* Validates fields marked data-check="required|email"; focuses first invalid; summary if > 1. */
  function validate(scope, summary) {
    var bad = [];
    $$('[data-check]', scope).forEach(function (f) {
      var v = f.value.trim(), kind = f.dataset.check;
      if (!v) { setError(f, f.dataset.empty); bad.push(f); }
      else if (kind === 'email' && !EMAIL.test(v)) { setError(f, 'Enter an email address like name@agency.com.'); bad.push(f); }
      else clearError(f);
    });
    if (summary) { summary.hidden = bad.length < 2; if (bad.length > 1) summary.textContent = bad.length + ' fields need attention. Fix them below.'; }
    if (bad[0]) bad[0].focus();
    return bad.length === 0;
  }

  /* ---------- small DOM helpers ---------- */
  function el(tag, text, cls) {
    var n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ---------- landing: waitlist ---------- */
  function initLanding() {
    var form = $('#waitlist-form'); if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate(form)) return;
      var card = $('#waitlist-card');
      // No network call and nothing stored: say so, rather than promise an email.
      card.innerHTML = '<h2 id="waitlist-done" tabindex="-1">Thanks, noted.</h2><p>This prototype does not send or keep your email yet, so nothing was saved. The real waitlist form is not connected.</p>';
      $('#waitlist-done').focus();
    });
  }

  /* ---------- Clients home: stored clients, plan limit, Pro note ---------- */
  function initClients() {
    var list = $('#client-list'), empty = $('#empty-state'), usage = $('#usage-line');
    var add = $('#add-client'), why = $('#limit-reason');
    $('#loading').hidden = true;
    if (!store) { noStore(); return; }
    if (store.hasCorruptBackup()) toast('Saved data could not be read. A copy was kept under "' + window.VSStore.CORRUPT_KEY + '".', true);
    planLimit().then(function (limit) {
      var clients = store.listClients();
      list.innerHTML = '';
      empty.hidden = clients.length > 0;
      list.hidden = clients.length === 0;
      $('#page-head-add').hidden = clients.length === 0;
      clients.forEach(function (c) {
        var files = store.getFiles(c.id);
        var li = el('li', null, 'card client-row' + (params.get('new') === c.id ? ' is-new' : ''));
        var a = el('a', null, 'client-link'); a.href = 'client.html?id=' + encodeURIComponent(c.id);
        var head = el('div', null, 'client-name');
        head.appendChild(el('h3', c.name));
        head.appendChild(el('span', files.length ? '✓ ' + plural(files.length, 'file', 'files') + ' saved' : '○ No files yet',
          'pill ' + (files.length ? 'pill-ok' : 'pill-wait')));
        a.appendChild(head);
        var last = files.reduce(function (m, f) { return f.importedAt > m ? f.importedAt : m; }, '');
        a.appendChild(el('div', last ? 'Last import: ' + fmtDate(last) : 'Last import: none yet', 'client-meta'));
        var open = el('span', 'Open ', 'client-open');
        open.appendChild(el('span', '›')); open.lastChild.setAttribute('aria-hidden', 'true');
        open.appendChild(el('span', ' ' + c.name, 'sr-only'));
        a.appendChild(open); li.appendChild(a); list.appendChild(li);
      });
      usage.hidden = clients.length === 0;
      $('.usage-text', usage).textContent = clients.length + ' of ' + limit + ' client workspaces used';
      $('.usage-bar', usage).textContent = new Array(limit + 1).join('□').split('').map(function (_, i) { return i < clients.length ? '■' : '□'; }).join('');
      if (clients.length >= limit) {
        add.setAttribute('aria-disabled', 'true'); add.removeAttribute('href');
        add.addEventListener('click', function (e) { e.preventDefault(); });
        why.textContent = new window.VSStore.LimitError(limit).message; why.hidden = false;
        if (limit === 1) {
          $('#pro-note').hidden = false;
          if (window.VSLicenseGate) window.VSLicenseGate.mountUnlockBox($('#unlock-box'));
        }
      }
      var fresh = params.get('new') && store.getClient(params.get('new'));
      if (fresh) toast(fresh.name + ' is added. Open it to import a CSV.');
    });
  }

  /* ---------- Add client: one form, creates a stored client ---------- */
  function initAdd() {
    if (!store) { noStore(); return; }
    var form = $('#add-form'), btn = $('#next'), note = $('#limit-note');
    function refuse(msg) {
      note.textContent = msg + ' Unlock with Pro for up to 5 client workspaces.'; note.hidden = false;
      btn.setAttribute('aria-disabled', 'true');
    }
    planLimit().then(function (limit) {
      if (store.listClients().length >= limit) refuse(new window.VSStore.LimitError(limit).message);
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.getAttribute('aria-disabled') === 'true') return;
      if (!validate(form)) return;
      planLimit().then(function (limit) {
        try {
          var c = store.addClient($('#client-name').value, $('#client-note').value, limit);
          location.href = 'app.html?new=' + encodeURIComponent(c.id);
        } catch (err) {
          if (err.name === 'LimitError') refuse(err.message);
          else toast('We couldn’t save that. Check your connection and try again.', true);
        }
      });
    });
  }

  /* ---------- Client page: import, preview, save, download ---------- */
  function initClient() {
    if (!store) { noStore(); return; }
    var client = store.getClient(params.get('id') || '');
    if (!client) { $('#not-found').hidden = false; return; }
    $('#client-body').hidden = false;
    $('#client-title').textContent = client.name;
    $('#crumb-name').textContent = client.name;
    document.title = client.name + ' · Sundayfile prototype';

    var paste = $('#paste-input'), typeField = $('#type-field'), typeSel = $('#type-select');
    var errBox = $('#import-error'), card = $('#preview-card'), current = null;

    function showError(msg) { errBox.textContent = msg; errBox.hidden = !msg; }
    function clearPreview() { current = null; card.hidden = true; }

    function renderPreview(res) {
      var head = $('#preview-table thead'), body = $('#preview-table tbody');
      head.innerHTML = ''; body.innerHTML = '';
      var tr = el('tr');
      res.columns.forEach(function (c) { var th = el('th', c); th.scope = 'col'; tr.appendChild(th); });
      head.appendChild(tr);
      res.preview.forEach(function (r) {
        var row = el('tr');
        res.columns.forEach(function (c) { row.appendChild(el('td', r[c])); });
        body.appendChild(row);
      });
      $('#preview-summary').textContent = window.VSImporter.LABELS[res.type] + ': ' + plural(res.rows.length, 'row', 'rows') +
        '. Showing the first ' + res.preview.length + '.';
      card.hidden = false;
    }

    /* Runs the lib import on the current text; manual type applies only when chosen. */
    function runPreview() {
      showError(''); clearPreview();
      var res = window.VSImporter.prepareImport(paste.value, typeSel.value || undefined, client.name);
      if (res.needsType) typeField.hidden = false;
      if (res.error) { showError(res.error); return; }
      current = res; renderPreview(res);
    }

    $('#import-form').addEventListener('submit', function (e) { e.preventDefault(); runPreview(); });
    typeSel.addEventListener('change', function () { if (typeSel.value) runPreview(); });
    $('#file-input').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { paste.value = String(reader.result); typeSel.value = ''; typeField.hidden = true; runPreview(); };
      reader.onerror = function () { showError('We could not read that file. Try another file, or paste the CSV text.'); };
      reader.readAsText(f);
    });
    paste.addEventListener('input', clearPreview);

    $('#save-file').addEventListener('click', function () {
      if (!current) return;
      try {
        store.saveFile(client.id, current.type, current.rows);
        toast(window.VSImporter.LABELS[current.type] + ' saved: ' + plural(current.rows.length, 'row', 'rows') + '.');
        paste.value = ''; $('#file-input').value = ''; typeSel.value = ''; typeField.hidden = true;
        clearPreview(); renderFiles();
      } catch (err) {
        toast('We couldn’t save that. Your data is kept on this page. Try again.', true);
      }
    });

    /* Download through a Blob link: client-type-YYYY-MM-DD.csv */
    function download(file, quiet) {
      var d = window.VSImporter.buildDownload(client.name, file);
      var url = URL.createObjectURL(new Blob([d.content], { type: 'text/csv;charset=utf-8' }));
      var a = document.createElement('a'); a.href = url; a.download = d.filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      try { store.markExported(client.id, file.type); } catch (e) { /* not critical */ }
      if (!quiet) toast('Downloaded ' + d.filename + '.');
      renderDue();
    }

    /* Pro: per-type "export due" checklist and one-click download of all files. */
    var proOn = false;
    function renderDue() {
      if (!proOn) return;
      var list = $('#due-list'), fresh = store.getClient(client.id) || client;
      var files = store.getFiles(client.id), now = new Date().toISOString();
      list.innerHTML = '';
      Object.keys(window.VSImporter.LABELS).forEach(function (type) {
        var last = (fresh.exported || {})[type];
        var st = window.VSStore.dueStatus(last, now);
        var has = files.some(function (f) { return f.type === type; });
        var li = el('li');
        li.appendChild(el('span', window.VSImporter.LABELS[type] + (has ? '' : ' (no file saved)')));
        var word = st === 'never' ? '○ Never exported' : st === 'due' ? '! Due' : '✓ Up to date';
        li.appendChild(el('span', word + (last ? ' · last exported ' + fmtDate(last) : ''), 'num small'));
        list.appendChild(li);
      });
      var none = files.length === 0;
      $('#download-all').setAttribute('aria-disabled', none ? 'true' : 'false');
      $('#download-all-why').hidden = !none;
    }
    (window.VSLicenseGate ? window.VSLicenseGate.isPro() : Promise.resolve(false)).then(function (pro) {
      proOn = pro;
      $('#due-locked').hidden = pro;
      $('#due-pro').hidden = !pro;
      if (pro) renderDue();
    });
    $('#download-all').addEventListener('click', function () {
      if (!proOn) return;
      var files = store.getFiles(client.id);
      if (!files.length) return;
      // Stagger the downloads so browsers do not block the later ones.
      files.forEach(function (f, i) { setTimeout(function () { download(f, true); }, i * 300); });
      toast('Downloading ' + plural(files.length, 'file', 'files') + '.');
    });

    function renderFiles() {
      var files = store.getFiles(client.id), body = $('#files-body');
      body.innerHTML = '';
      $('#files-empty').hidden = files.length > 0;
      $('#files-table').hidden = files.length === 0;
      files.forEach(function (f) {
        var tr = el('tr');
        var t = el('td', window.VSImporter.LABELS[f.type]); t.dataset.label = 'Type';
        var n = el('td', String(f.rows.length), 'num'); n.dataset.label = 'Rows';
        var i = el('td', fmtDate(f.importedAt), 'num'); i.dataset.label = 'Imported';
        var dl = el('td'); dl.dataset.label = 'Download';
        var b = el('button', 'Download', 'btn btn-secondary'); b.type = 'button';
        b.setAttribute('aria-label', 'Download ' + window.VSImporter.LABELS[f.type] + ' CSV');
        b.addEventListener('click', function () { download(f); });
        dl.appendChild(b); tr.append(t, n, i, dl); body.appendChild(tr);
      });
    }
    renderFiles();

    var rm = $('#remove-client');
    rm.addEventListener('click', function () {
      confirmDialog({ title: 'Remove ' + client.name + '? Its saved files will be deleted.',
        body: 'This only affects data stored in this browser. It frees one client workspace.', confirm: 'Remove client',
        onConfirm: function () { store.deleteClient(client.id); location.href = 'app.html'; } }, rm);
    });
  }

  /* ---------- Settings ---------- */
  function initSettings() {
    if (!store) { noStore(); return; }
    /* Data: backup, restore, clear. */
    $('#backup-btn').addEventListener('click', function () {
      var url = URL.createObjectURL(new Blob([store.exportBackup()], { type: 'application/json' }));
      var a = document.createElement('a'); a.href = url; a.download = 'sundayfile-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('Backup downloaded.');
    });
    var restoreErr = $('#restore-error');
    $('#restore-input').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      restoreErr.hidden = true;
      var reader = new FileReader();
      reader.onload = function () {
        try { store.importBackup(String(reader.result)); toast('Backup restored: ' + plural(store.listClients().length, 'client', 'clients') + '.'); }
        catch (err) { restoreErr.textContent = err.message + ' Nothing was changed.'; restoreErr.hidden = false; }
        e.target.value = '';
      };
      reader.onerror = function () { restoreErr.textContent = 'We could not read that file. Try again.'; restoreErr.hidden = false; };
      reader.readAsText(f);
    });
    var clearBtn = $('#clear-btn');
    clearBtn.addEventListener('click', function () {
      confirmDialog({ title: 'Clear all data? Every client and file will be deleted.',
        body: 'This only affects this browser. Download a backup first if you may need it.', confirm: 'Clear all data',
        onConfirm: function () { store.clearAll(); toast('All data cleared.'); } }, clearBtn);
    });

    var form = $('#settings-form'), btn = $('#save');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('#alert-email');
      if ($('#alert-on').checked) { if (!validate(form)) return; } else clearError(email);
      busy(btn, 'Saving…');
      setTimeout(function () { idle(btn); toast('Settings saved.'); }, 1000);
    });
  }

  /* Every page gets a footer that hosts the unlock box (no-op without VSLicense.unlockBox). */
  function mountFooter() {
    if (!window.VSLicenseGate) return;
    var f = document.createElement('footer'); f.id = 'unlock-footer'; f.className = 'wrap';
    document.body.appendChild(f);
    window.VSLicenseGate.mountUnlockBox(f);
  }
  mountFooter();

  var init = { landing: initLanding, clients: initClients, add: initAdd, client: initClient, settings: initSettings }[document.body.dataset.page];
  if (init) init();
})();
