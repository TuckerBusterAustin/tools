/* Lapsewatch page glue.
   Reads the lib modules (LWDomains, LWRender, LWStore, LWExports, LWLicense),
   keeps the saved domain list in localStorage only, and gates Pro features
   through window.VSLicense (via LWLicense). It makes no network calls. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Menu (phone) ---------- */
  var menuBtn = $('#menu-btn'), nav = $('#site-nav');
  if (menuBtn && nav) {
    var setMenu = function (open) {
      nav.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
    };
    menuBtn.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); menuBtn.focus(); }
    });
    $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  }

  /* ---------- Toast ---------- */
  function toast(text, kind) {
    var region = $('#toast-region'); if (!region) return;
    var t = document.createElement('div');
    t.className = 'toast' + (kind === 'error' ? ' error' : '');
    t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    var msg = document.createElement('span');
    msg.textContent = (kind === 'error' ? '! ' : '✓ ') + text;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn-text'; b.textContent = 'Dismiss';
    t.appendChild(msg); t.appendChild(b); region.appendChild(t);
    var timer, paused = false;
    var close = function () { clearTimeout(timer); t.remove(); };
    var arm = function () { clearTimeout(timer); timer = setTimeout(function () { if (!paused) close(); }, 6000); };
    b.addEventListener('click', close);
    ['mouseenter', 'focusin'].forEach(function (ev) { t.addEventListener(ev, function () { paused = true; clearTimeout(timer); }); });
    ['mouseleave', 'focusout'].forEach(function (ev) { t.addEventListener(ev, function () { paused = false; arm(); }); });
    arm();
  }

  /* ---------- Shared helpers ---------- */
  function working(btn, on, label) {
    if (on) {
      btn.dataset.label = btn.querySelector('.lbl').textContent;
      btn.style.minWidth = btn.offsetWidth + 'px'; // keep width
      btn.querySelector('.lbl').textContent = label;
      btn.classList.add('is-working'); btn.disabled = true;
    } else {
      btn.querySelector('.lbl').textContent = btn.dataset.label;
      btn.classList.remove('is-working'); btn.disabled = false; btn.style.minWidth = '';
    }
  }
  function setError(input, textEl, msg) {
    if (msg) { input.setAttribute('aria-invalid', 'true'); textEl.textContent = msg; textEl.hidden = false; }
    else { input.removeAttribute('aria-invalid'); textEl.textContent = ''; textEl.hidden = true; }
  }

  // One table maps a lib status (from LWDomains.statusFor) to its label, CSS
  // class, marker and the value used by the Domains page status filter.
  var LAB = {
    expired: { filter: 'attention', cls: 'st-red', mark: '!', word: 'Expired' },
    urgent: { filter: 'attention', cls: 'st-red', mark: '!', word: '7 days or fewer' },
    soon: { filter: 'soon', cls: 'st-soon', mark: null, word: 'Soon' },
    ok: { filter: 'ok', cls: 'st-ok', mark: '✓', word: 'OK' }
  };
  function cell(cls, label) {
    var td = document.createElement('td'); td.className = cls; if (label) td.dataset.label = label; return td;
  }
  // The "Status" cell: marker + word, from a LAB entry.
  function statusCell(s) {
    var c = cell('c-status', 'Status');
    var st = document.createElement('span'); st.className = 'status ' + s.cls;
    var m = document.createElement('span'); m.setAttribute('aria-hidden', 'true');
    if (s.mark) { m.className = 'marker'; m.textContent = s.mark; } else m.className = 'hollow';
    var w = document.createElement('span'); w.textContent = s.word;
    st.appendChild(m); st.appendChild(w); c.appendChild(st);
    return c;
  }

  /* ---------- Free checker (landing page and checker page) ---------- */
  /* The user types "domain, date" lines; LWRender parses and sorts them in the
     browser. Nothing is stored or sent. */
  var cform = $('#checker-form');
  if (cform && window.LWRender) {
    var eta = $('#domains'), eerr = $('#domains-error'), elist = $('#line-errors');
    var eEmpty = $('#results-empty'), eDone = $('#results-done');
    cform.addEventListener('submit', function (e) {
      e.preventDefault();
      var res = window.LWRender.buildResults(eta.value, new Date());
      elist.textContent = '';
      eDone.hidden = true; eEmpty.hidden = false;
      if (res.empty) {
        setError(eta, eerr, '! Paste at least one line, like clientsite.com, 2026-12-01, then check again.'); eta.focus(); return;
      }
      if (res.tooMany) {
        setError(eta, eerr, '! That is ' + res.rows.length + ' domains. Remove some to get to ' + window.LWRender.MAX_DOMAINS + ' or fewer, then check again.');
        eta.focus(); return;
      }
      if (res.errors.length) {
        var lines = res.errors.map(function (x) { return x.line; });
        setError(eta, eerr, '! ' + res.errors.length + (res.errors.length === 1 ? " line isn't valid: line " : " lines aren't valid: line ") +
          lines.join(', ') + '. Fix them or remove them, then check again. Valid lines are still shown below.');
        res.errors.forEach(function (x) {
          var li = document.createElement('li'); li.textContent = 'Line ' + x.line + ': ' + x.message; elist.appendChild(li);
        });
      } else setError(eta, eerr, '');
      if (!res.rows.length) { eta.focus(); return; }
      var tbody = $('#results-body'); tbody.textContent = '';
      res.rows.forEach(function (r) {
        var tr = document.createElement('tr'); tr.className = 'row'; tr.dataset.domain = r.domain;
        var c1 = cell('c-domain', 'Domain'); c1.textContent = r.domain;
        var c2 = cell('c-days', 'Days left'); c2.textContent = String(r.days);
        var c4 = cell('c-expires', 'Expires'); c4.textContent = r.expires;
        [c1, c2, statusCell(r), c4].forEach(function (c) { tr.appendChild(c); });
        tbody.appendChild(tr);
      });
      $('#results-summary').textContent = res.summary;
      eEmpty.hidden = true; eDone.hidden = false;
    });
  }

  /* ---------- Pro state (window.VSLicense, may be missing) ---------- */
  // pro.on is false until the license check says otherwise; pages listen for 'lw-pro'.
  var pro = { on: false };
  if (window.LWLicense) {
    window.LWLicense.isProUnlocked(window).then(function (on) {
      pro.on = on;
      document.dispatchEvent(new Event('lw-pro'));
    });
    // Footer unlock box on the pages that have one.
    window.LWLicense.mountUnlockBox(window, $('#unlock-box'));
  }

  // Show or hide every Pro control: locked controls are disabled and the
  // "Unlock with Pro" note stays visible next to the description.
  function applyProLock() {
    $$('[data-pro]').forEach(function (el) {
      el.disabled = !pro.on;
      el.setAttribute('aria-disabled', String(!pro.on));
    });
    $$('.pro-note').forEach(function (n) { n.hidden = pro.on; });
  }

  // Saved list for pages that only read it (alerts).
  function openStore() {
    var st = null;
    try { st = window.localStorage; } catch (e) { st = null; }
    var m = {};
    if (!st) st = { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = v; } };
    return window.LWStore.createStore(st);
  }
  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- Pricing buttons pre-select plan ---------- */
  var PLANS = { freelancer: ['Freelancer', '$9 a month'], agency: ['Agency', '$19 a month'], annual: ['Agency Annual', '$182 a year'] };
  function updatePayLabel() {
    var sel = $('input[name="plan"]:checked'), el = $('#pay-price');
    if (el) el.textContent = sel ? PLANS[sel.value][1] : 'this plan';
  }
  $$('[data-plan]').forEach(function (b) {
    b.addEventListener('click', function () {
      var r = $('input[name="plan"][value="' + b.dataset.plan + '"]');
      if (r) { r.checked = true; updatePayLabel(); }
    });
  });
  $$('input[name="plan"]').forEach(function (r) { r.addEventListener('change', updatePayLabel); });

  /* ---------- Waitlist form (nothing is sent anywhere) ---------- */
  var wform = $('#waitlist-form');
  if (wform) {
    var summary = $('#wl-errors'), netErr = $('#wl-net'), wbtn = $('#join-btn');
    var checks = [
      { id: 'email', test: function () { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('#email').value.trim()); }, msg: '! Enter an email address like name@agency.com', field: '#email', err: '#email-error' },
      { id: 'count', test: function () { return !!$('input[name="count"]:checked'); }, msg: '! Choose how many client domains you manage', field: 'input[name="count"]', err: '#count-error' },
      { id: 'alerts', test: function () { return !!$('input[name="alerts"]:checked'); }, msg: '! Choose whether your current tools alert you', field: 'input[name="alerts"]', err: '#alerts-error' },
      { id: 'plan', test: function () { return !!$('input[name="plan"]:checked'); }, msg: '! Choose the plan you would pick', field: 'input[name="plan"]', err: '#plan-error' },
      { id: 'pay', test: function () { return !!$('input[name="pay"]:checked'); }, msg: '! Choose yes, maybe or no', field: 'input[name="pay"]', err: '#pay-error' }
    ];
    wform.addEventListener('submit', function (e) {
      e.preventDefault();
      netErr.hidden = true;
      var fails = checks.filter(function (c) {
        var el = $(c.err), bad = !c.test();
        el.textContent = bad ? c.msg : ''; el.hidden = !bad;
        var f = $(c.field); if (c.id === 'email') { if (bad) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid'); }
        return bad;
      });
      summary.textContent = '';
      if (fails.length) {
        var h = document.createElement('strong'); h.textContent = '! Fix ' + fails.length + (fails.length === 1 ? ' thing' : ' things') + ' to join:';
        var ul = document.createElement('ul');
        fails.forEach(function (c) {
          var li = document.createElement('li'), a = document.createElement('a');
          a.href = '#' + (c.id === 'email' ? 'email' : c.id + '-group'); a.textContent = c.msg;
          a.addEventListener('click', function (ev) { ev.preventDefault(); $(c.field).focus(); });
          li.appendChild(a); ul.appendChild(li);
        });
        summary.appendChild(h); summary.appendChild(ul); summary.hidden = false; summary.focus(); return;
      }
      summary.hidden = true;
      working(wbtn, true, 'Joining…');
      setTimeout(function () {
        working(wbtn, false);
        // An address starting "fail@" shows the failure state (for testing the layout).
        if (/^fail@/i.test($('#email').value.trim())) { netErr.hidden = false; return; }
        wform.hidden = true;
        var ok = $('#wl-success'); ok.hidden = false; $('#wl-success-title').focus();
        toast("You're on the list. Nothing is charged.", 'success');
      }, reduce ? 300 : 1200);
    });
  }

  /* ---------- App: Domains ---------- */
  /* Saved list: real data in localStorage via LWStore (free 5, Pro 100). */
  var tbodyApp = $('#app-body');
  if (tbodyApp && window.LWStore && window.LWDomains) {
    var D = window.LWDomains, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var storage = null;
    try { storage = window.localStorage; } catch (e) { storage = null; }
    // Without storage, fall back to a list that lives until the page closes.
    var mem = {};
    if (!storage) storage = { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = v; } };
    var store = window.LWStore.createStore(storage);
    // Pro check: VSLicense may be missing or throw before launch, so the answer is then "not Pro".
    var isPro = function () { return pro.on; };
    var tableBox = $('#table-box'), filters = $('#filters'), empty = $('#app-empty'), count = $('#app-count'), fine = $('#app-fine');
    var limitNote = $('#limit-note'), panel = $('#add-panel'), editPanel = $('#edit-panel'), editing = null;
    var now = function () { return new Date(); };
    var fmt = function (d) { return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
    var plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };

    var actionBtn = function (label, domain, fn) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn-text'; b.textContent = label;
      b.setAttribute('aria-label', label + ' ' + domain);
      b.addEventListener('click', fn); return b;
    };

    var applyFilter = function () {
      var q = $('#search').value.trim().toLowerCase(), f = $('#status-filter').value, shown = 0;
      $$('tr.row', tbodyApp).forEach(function (tr) {
        var ok = (!q || tr.dataset.domain.indexOf(q) > -1) && (f === 'all' || tr.dataset.status === f);
        tr.hidden = !ok; if (ok) shown++;
      });
      $('#filter-note').textContent = shown ? '' : 'No domains match. Clear the search or choose All.';
    };

    // Draw the table, count line and notices from what is stored.
    var refresh = function () {
      var list = store.load(), n = now();
      var items = D.sortByDays(list.map(function (x) { return { domain: x.domain, expiry: D.parseDate(x.expires) }; }), n);
      tbodyApp.textContent = '';
      items.forEach(function (it) {
        var days = D.daysLeft(it.expiry, n), s = LAB[D.statusFor(days)];
        var tr = document.createElement('tr'); tr.className = 'row'; tr.dataset.status = s.filter; tr.dataset.domain = it.domain;
        var c1 = cell('c-domain', 'Domain'); c1.textContent = it.domain;
        var c2 = cell('c-days', 'Days left'); c2.textContent = String(days);
        var c4 = cell('c-expires', 'Expires'); c4.textContent = fmt(it.expiry);
        var c5 = cell('c-issuer c-actions', 'Actions');
        c5.appendChild(actionBtn('Edit', it.domain, function () { openEdit(it.domain); }));
        c5.appendChild(actionBtn('Remove', it.domain, function () { doRemove(it.domain); }));
        [c1, c2, statusCell(s), c4, c5].forEach(function (c) { tr.appendChild(c); });
        tbodyApp.appendChild(tr);
      });
      var sum = D.summarize(items, n), need = sum.expired + sum.urgent;
      var has = list.length > 0;
      tableBox.hidden = !has; filters.hidden = !has; empty.hidden = has;
      count.textContent = has ? plural(list.length, 'domain') + ', ' + need + (need === 1 ? ' needs' : ' need') + ' attention' : '0 domains';
      if (has && !need && !sum.soon) {
        var next = items[0];
        fine.textContent = '✓ All ' + plural(list.length, 'certificate') +
          ' ' + (list.length === 1 ? 'has' : 'have') + ' more than 30 days left. Next one: ' + next.domain + ' in ' + plural(D.daysLeft(next.expiry, n), 'day') + '.';
        fine.hidden = false;
      } else fine.hidden = true;
      var max = window.LWStore.limitFor(isPro());
      if (list.length >= max) {
        limitNote.textContent = isPro() ? 'Your list is full at ' + max + ' domains.' :
          'Your free list is full at ' + max + ' domains. Unlock with Pro for up to ' + window.LWStore.PRO_LIMIT + ' domains.';
        limitNote.hidden = false;
      } else limitNote.hidden = true;
      applyFilter();
    };

    var openEdit = function (domain) {
      var item = store.load().filter(function (x) { return x.domain === domain; })[0];
      if (!item) return;
      editing = domain; panel.hidden = true; editPanel.hidden = false;
      $('#edit-domain').value = item.domain; $('#edit-date').value = item.expires;
      setError($('#edit-date'), $('#edit-error'), '');
      $('#edit-domain').focus();
    };
    var doRemove = function (domain) {
      var r = store.remove(domain);
      refresh();
      if (r.ok) { toast(domain + ' removed.', 'success'); $('#search').focus(); }
      else toast(r.error, 'error');
    };

    $('#search').addEventListener('input', applyFilter);
    $('#status-filter').addEventListener('change', applyFilter);
    $$('.open-add').forEach(function (b) {
      b.addEventListener('click', function () { editPanel.hidden = true; panel.hidden = false; $('#domains').focus(); });
    });
    $('#close-add').addEventListener('click', function () { panel.hidden = true; $('.open-add').focus(); });
    $('#close-edit').addEventListener('click', function () { editPanel.hidden = true; editing = null; $('.open-add').focus(); });

    $('#add-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var ta2 = $('#domains'), er = $('#domains-error');
      if (!ta2.value.trim()) { setError(ta2, er, '! Paste at least one line, like clientsite.com, 2026-12-01, then add again.'); ta2.focus(); return; }
      var p = D.parseLines(ta2.value);
      if (p.errors.length) {
        setError(ta2, er, '! ' + p.errors.length + (p.errors.length === 1 ? " line isn't valid: line " : " lines aren't valid: line ") +
          p.errors.map(function (x) { return x.line; }).join(', ') + '. ' + p.errors[0].message + '. Fix or remove them, then add again. Nothing was added.');
        ta2.focus(); return;
      }
      // Add one by one; stop at the first problem and say what happened.
      var added = 0, problem = '';
      for (var i = 0; i < p.rows.length; i++) {
        var r = store.add(p.rows[i].domain, p.rows[i].expiry.toISOString().slice(0, 10), isPro());
        if (!r.ok) { problem = r.error; break; }
        added++;
      }
      refresh();
      if (problem) {
        setError(ta2, er, '! ' + (added ? plural(added, 'domain') + ' added. ' : '') + problem + (added ? ' Remove the lines already added, then try again.' : ''));
        if (added) ta2.value = p.rows.slice(added).map(function (x) { return x.domain + ', ' + x.expiry.toISOString().slice(0, 10); }).join('\n');
        ta2.focus(); return;
      }
      setError(ta2, er, ''); panel.hidden = true; ta2.value = '';
      toast(plural(added, 'domain') + ' added.', 'success');
      $('.open-add').focus();
    });

    $('#edit-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var r = store.update(editing, $('#edit-domain').value, $('#edit-date').value);
      if (!r.ok) { setError($('#edit-date'), $('#edit-error'), '! ' + r.error); return; }
      setError($('#edit-date'), $('#edit-error'), '');
      editPanel.hidden = true; editing = null; refresh();
      toast('Changes saved.', 'success'); $('.open-add').focus();
    });

    /* CSV export and import (Pro) */
    var csvMsg = $('#csv-msg');
    var csvSay = function (text, bad) { csvMsg.hidden = false; csvMsg.className = 'banner ' + (bad ? 'error' : 'ok'); csvMsg.textContent = text; };
    $('#csv-export').addEventListener('click', function () {
      if (!pro.on) return;
      var list = store.load();
      if (!list.length) { csvSay('! There are no domains to export yet. Add domains first.', true); return; }
      download('lapsewatch-domains.csv', window.LWExports.toCsv(list), 'text/csv');
      csvSay('Exported ' + plural(list.length, 'domain') + '.', false);
    });
    $('#csv-import').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!pro.on || !file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var parsed = window.LWExports.fromCsv(String(reader.result)), added = 0, skipped = [];
        parsed.rows.forEach(function (r) {
          var res = store.add(r.domain, r.expires, true);
          if (res.ok) added++; else skipped.push(r.domain + ': ' + res.error);
        });
        refresh();
        var bad = parsed.errors.map(function (x) { return 'row ' + x.line + ': ' + x.message; }).concat(skipped);
        if (bad.length) csvSay('! ' + plural(added, 'domain') + ' imported. ' + plural(bad.length, 'row') + " weren't added. " + bad.slice(0, 5).join('; ') + (bad.length > 5 ? '; and more.' : '.'), true);
        else csvSay('Imported ' + plural(added, 'domain') + '.', false);
        e.target.value = '';
      };
      reader.onerror = function () { csvSay("! That file couldn't be read. Choose a .csv file and try again.", true); };
      reader.readAsText(file);
    });
    document.addEventListener('lw-pro', function () { applyProLock(); refresh(); });
    applyProLock();

    refresh();
  }

  /* ---------- App: Alerts ---------- */
  // Thresholds view and Pro reminder text / calendar file, from the saved list.
  if ($('#threshold-view')) {
    var aStore = openStore(), X = window.LWExports;
    var drawThresholds = function () {
      var list = aStore.load(), box = $('#threshold-view'); box.textContent = '';
      if (!list.length) { box.textContent = 'No saved domains yet. Add domains on the Domains screen to see who is close to lapsing.'; return; }
      X.THRESHOLDS.forEach(function (t) {
        var due = X.dueItems(list, new Date(), t), p = document.createElement('p');
        p.textContent = t + ' days or fewer: ' + (due.length ? due.map(function (d) { return d.domain + ' (' + d.days + ')'; }).join(', ') : 'none');
        box.appendChild(p);
      });
    };
    var showText = function (text) { $('#reminder-text').value = text; $('#reminder-wrap').hidden = false; };
    $('#make-slack').addEventListener('click', function () { if (pro.on) showText(X.slackText(aStore.load(), new Date())); });
    $('#make-email').addEventListener('click', function () {
      if (!pro.on) return;
      var m = X.emailText(aStore.load(), new Date()); showText('Subject: ' + m.subject + '\n\n' + m.body);
    });
    $('#download-ics').addEventListener('click', function () {
      if (!pro.on) return;
      var list = aStore.load(), note = $('#ics-msg'); note.hidden = false;
      if (!list.length) { note.className = 'banner error'; note.textContent = '! There are no saved domains yet. Add domains first.'; return; }
      download('lapsewatch-reminders.ics', X.buildIcs(list, new Date()), 'text/calendar');
      note.className = 'banner ok'; note.textContent = 'Calendar file downloaded. It has alerts at 30, 14 and 7 days.';
    });
    document.addEventListener('lw-pro', applyProLock);
    applyProLock(); drawThresholds();
  }
})();
