'use strict';
// Popup glue: reads the DOM, calls the lib modules, talks to the page through content.js.
// All logic (matching, rules, profiles, links) lives in lib/. No network use anywhere.

(function () {
  const Storage = window.FerrywiseStorage;
  const FieldMatch = window.FerrywiseFieldMatch;
  const Profiles = window.FerrywiseProfiles;
  const Rules = window.FerrywiseRules;
  const Links = window.FerrywiseLinks;

  const $ = (id) => document.getElementById(id);
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  const store = Storage.createStorage(hasChrome ? chrome.storage.local : Storage.createMemoryBackend());

  const app = {
    state: Profiles.emptyState(), rules: [],
    tab: null, host: '', readable: false,
    preview: null, captured: [], rawLinks: null, linkBase: '', editingId: null,
  };

  // ---------- small helpers ----------
  function el(tag, props, kids) {
    const n = document.createElement(tag);
    Object.keys(props || {}).forEach((k) => {
      if (k === 'text') n.textContent = props[k]; else n.setAttribute(k, props[k]);
    });
    (kids || []).forEach((c) => n.appendChild(c));
    return n;
  }
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
  const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  let toastTimer = null;
  // Success toasts close after 4s; error toasts stay until dismissed (or Escape).
  function toast(message, isError) {
    const box = $('toast');
    clear(box);
    clearTimeout(toastTimer);
    const t = el('div', { class: 'toast ' + (isError ? 'bad' : 'good'), role: isError ? 'alert' : 'status' });
    t.appendChild(el('span', { text: message }));
    if (isError) {
      const x = el('button', { type: 'button', class: 'btn link', 'aria-label': 'Dismiss', text: '×' });
      x.addEventListener('click', () => clear(box));
      t.appendChild(x);
    } else {
      toastTimer = setTimeout(() => clear(box), 4000);
    }
    box.appendChild(t);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { clear($('toast')); $('delete-confirm').hidden = true; }
  });

  // Disables a button and shows a working label while an async job runs.
  async function busy(btn, label, job) {
    const old = btn.textContent;
    btn.textContent = label;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    try { return await job(); } finally {
      btn.textContent = old;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  }

  async function save() {
    await store.set('state', app.state);
    await store.set('rules', app.rules);
  }

  // ---------- page access ----------
  async function pageCall(msg) {
    const id = app.tab.id;
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] });
    return chrome.tabs.sendMessage(id, msg);
  }

  async function findTab() {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    app.tab = tabs[0] || null;
    const url = app.tab && app.tab.url ? app.tab.url : '';
    app.readable = /^https?:\/\//i.test(url) && !/^https?:\/\/chromewebstore\.google\.com/i.test(url) &&
      !/^https?:\/\/chrome\.google\.com\/webstore/i.test(url) && !/^https?:\/\/microsoftedge\.microsoft\.com\/addons/i.test(url);
    app.host = app.readable ? Rules.normaliseDomain(url) : '';
  }

  // ---------- rendering ----------
  function activeProfile() { return Profiles.getActive(app.state); }

  function renderPicker() {
    const sel = $('active-profile');
    clear(sel);
    app.state.profiles.forEach((p) => {
      const o = el('option', { value: p.id, text: p.name });
      if (p.id === app.state.activeId) o.selected = true;
      sel.appendChild(o);
    });
    if (!app.state.profiles.length) sel.appendChild(el('option', { value: '', text: 'No profile' }));
    sel.disabled = !app.state.profiles.length;
  }

  function renderFillState() {
    const ok = app.readable;
    const p = activeProfile();
    $('domain').textContent = app.host ? 'Current site: ' + app.host : '';
    $('unreadable').hidden = ok;
    $('no-profile').hidden = !ok || !!p;
    $('add-profile-btn').hidden = !!p;
    ['capture-btn', 'preview-btn'].forEach((id) => {
      const off = !ok || (id === 'preview-btn' && !p);
      $(id).disabled = off;
      $(id).setAttribute('aria-disabled', String(off));
    });
    renderFillButton();
  }

  function renderFillButton() {
    const n = app.preview ? app.preview.fills.length : 0;
    const b = $('fill-btn');
    b.textContent = n ? 'Fill ' + plural(n, 'field', 'fields') : 'Fill';
    b.disabled = !n;
    b.setAttribute('aria-disabled', String(!n));
  }

  function renderProfiles() {
    const ul = $('profile-list');
    clear(ul);
    app.state.profiles.forEach((p) => {
      const count = Object.keys(p.fields).length;
      const b = el('button', { type: 'button', class: 'btn link', text: p.name + ' · ' + plural(count, 'field', 'fields') });
      b.addEventListener('click', () => openEditor(p.id));
      ul.appendChild(el('li', {}, [b]));
    });
  }

  function addEditorRow(key, value) {
    const row = el('div', { class: 'kv' });
    const k = el('input', { type: 'text', 'aria-label': 'Field name', placeholder: 'email' });
    const v = el('input', { type: 'text', 'aria-label': 'Field value', placeholder: 'client@example.com' });
    k.value = key || '';
    v.value = value || '';
    const rm = el('button', { type: 'button', class: 'btn link danger', text: 'Remove' });
    rm.addEventListener('click', () => row.remove());
    [k, v, rm].forEach((n) => row.appendChild(n));
    $('profile-rows').appendChild(row);
  }

  function openEditor(id) {
    app.editingId = id;
    const p = id === 'new' ? { name: '', fields: {} } : app.state.profiles.find((x) => x.id === id);
    $('profile-editor').hidden = false;
    $('editor-title').textContent = id === 'new' ? 'New profile' : 'Edit profile';
    $('profile-name').value = p.name;
    $('profile-error').hidden = true;
    $('delete-profile-btn').hidden = id === 'new';
    $('delete-confirm').hidden = true;
    clear($('profile-rows'));
    Object.keys(p.fields).forEach((k) => addEditorRow(k, p.fields[k]));
    if (!Object.keys(p.fields).length) addEditorRow('', '');
    $('profile-name').focus();
  }

  function renderRules() {
    const draw = (ul, list) => {
      clear(ul);
      if (!list.length) ul.appendChild(el('li', { class: 'muted', text: 'None yet' }));
      list.forEach(({ rule, index }) => {
        const rm = el('button', { type: 'button', class: 'btn link danger', text: 'Remove' });
        rm.setAttribute('aria-label', 'Remove rule for ' + rule.domain + ' ' + rule.field);
        rm.addEventListener('click', async () => {
          app.rules = Rules.removeRule(app.rules, index);
          await save();
          renderRules();
          toast('Done: Removed 1 rule.');
        });
        ul.appendChild(el('li', {}, [el('span', { text: rule.domain + ' · ' + rule.field + ' → ' + rule.key }), rm]));
      });
    };
    const all = app.rules.map((rule, index) => ({ rule, index }));
    draw($('rules-here'), all.filter((x) => app.host && Rules.domainMatches(x.rule.domain, app.host)));
    draw($('rules-all'), all);
    const sel = $('rule-key');
    clear(sel);
    const p = activeProfile();
    const keys = p ? Object.keys(p.fields) : [];
    keys.forEach((k) => sel.appendChild(el('option', { value: k, text: k })));
    if (!keys.length) sel.appendChild(el('option', { value: '', text: 'No keys yet' }));
    if (!$('rule-domain').value) $('rule-domain').value = app.host;
  }

  function renderAll() {
    renderPicker();
    renderFillState();
    renderProfiles();
    renderRules();
  }

  // ---------- Fill tab: capture ----------
  $('capture-btn').addEventListener('click', () => busy($('capture-btn'), 'Reading page…', async () => {
    try {
      const res = await pageCall({ type: 'read', withValues: true });
      const found = (res.fields || []).filter((d) => d.label && typeof d.value === 'string' && d.value.trim() && !FieldMatch.skipReason(d));
      app.captured = found.map((d) => ({ label: d.label, value: d.value }));
    } catch (e) {
      toast("Error: Couldn't read this page. Reload it and try again.", true);
      return;
    }
    const list = $('capture-list');
    clear(list);
    $('capture-empty').hidden = app.captured.length > 0;
    $('capture-form').hidden = !app.captured.length;
    app.captured.forEach((c, i) => {
      const cb = el('input', { type: 'checkbox', id: 'cap-' + i, checked: 'checked' });
      const lab = el('label', { for: 'cap-' + i, title: c.value, text: c.label + ': ' + truncate(c.value, 40) });
      list.appendChild(el('li', {}, [cb, lab]));
    });
  }));

  $('capture-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const picked = app.captured.filter((_, i) => $('cap-' + i).checked);
    const updates = Rules.captureToUpdates(picked);
    if (!Object.keys(updates).length) { toast('Error: Nothing is ticked. Tick the details to save, then try again.', true); return; }
    if (!activeProfile()) app.state = Profiles.createProfile(app.state, 'Client ' + (app.state.profiles.length + 1), {});
    const merged = Profiles.mergeCaptured(app.state, app.state.activeId, updates);
    app.state = merged.state;
    await save();
    $('capture-form').hidden = true;
    renderAll();
    toast('Done: Saved ' + plural(merged.saved, 'detail', 'details') + ' to "' + activeProfile().name + '".');
  });

  $('add-profile-btn').addEventListener('click', () => {
    document.getElementById('tab-profiles').click();
    openEditor('new');
  });

  // ---------- Fill tab: preview and fill ----------
  function statusTag(cls, text) { return el('strong', { class: 'tag ' + cls, text }); }

  function renderPreview(plan, host) {
    const list = $('preview-list');
    clear(list);
    const row = (d, tag, detail) => {
      const label = d.label || d.name || d.id || d.placeholder || '(unlabelled field)';
      const li = el('li', { 'aria-label': label + ': ' + detail.full }, [
        el('span', { text: label }), el('span', { class: 'muted', title: detail.full, text: detail.shown }), tag]);
      list.appendChild(li);
    };
    plan.fills.forEach((f) => {
      row(f.field, f.source === 'rule' ? statusTag('rule', '◆ Rule') : statusTag('ok', '✓ Will fill'),
        { shown: f.key + ' = ' + truncate(f.value, 40), full: f.key + ' = ' + f.value });
    });
    plan.ambiguous.forEach((a) => {
      row(a.field, statusTag('skip', '– Skipped: two possible matches'),
        { shown: a.keys.join(' or ') + ' · Add a rule to choose', full: a.keys.join(' or ') });
    });
    plan.skipped.forEach((s) => {
      row(s.field, statusTag('skip', '– Skipped: ' + s.reason), { shown: '', full: s.reason });
    });
    const sum = plan.fills.length + ' will fill · ' + plan.ambiguous.length + ' skipped (two possible matches) · ' +
      plan.skipped.length + ' no match';
    $('preview-summary').textContent = plan.fills.length || plan.ambiguous.length ? sum : '';
    $('preview-empty').hidden = plan.fills.length > 0 || plan.ambiguous.length > 0;
  }

  $('preview-btn').addEventListener('click', () => busy($('preview-btn'), 'Reading page…', async () => {
    const p = activeProfile();
    let res;
    try { res = await pageCall({ type: 'read' }); } catch (e) {
      toast("Error: Couldn't read this page. Reload it and try again.", true);
      return;
    }
    const plan = Rules.planWithRules(res.host || app.host, res.fields || [], p.fields, app.rules);
    app.preview = {
      plan,
      fills: plan.fills.map((f) => ({ idx: f.field.idx, sig: f.field.sig, value: f.value })),
    };
    renderPreview(plan);
    renderFillButton();
  }));

  function cancelPreview() {
    app.preview = null;
    clear($('preview-list'));
    $('preview-summary').textContent = '';
    $('preview-empty').hidden = true;
    renderFillButton();
  }
  $('cancel-btn').addEventListener('click', cancelPreview);

  $('fill-btn').addEventListener('click', () => busy($('fill-btn'), 'Filling…', async () => {
    if (!app.preview || !app.preview.fills.length) return;
    let res;
    try { res = await pageCall({ type: 'apply', fills: app.preview.fills }); } catch (e) {
      toast("Error: Couldn't reach this page. Reload it and preview again.", true);
      return;
    }
    if (!res || !res.ok) {
      toast('Error: The page changed since the preview. Preview again before filling.', true);
      return;
    }
    cancelPreview();
    toast('Done: Filled ' + plural(res.filled, 'field', 'fields') + '. Check the form before you submit it.');
  }));

  // ---------- Profiles tab ----------
  $('active-profile').addEventListener('change', async (e) => {
    if (!e.target.value) return;
    app.state = Profiles.setActive(app.state, e.target.value);
    await save();
    cancelPreview();
    renderAll();
  });
  $('new-profile-btn').addEventListener('click', () => openEditor('new'));
  $('add-field-btn').addEventListener('click', () => addEditorRow('', ''));

  $('profile-editor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields = {};
    Array.from($('profile-rows').children).forEach((row) => {
      const [k, v] = row.querySelectorAll('input');
      if (k.value.trim()) fields[k.value.trim()] = v.value;
    });
    try {
      if (app.editingId === 'new') {
        app.state = Profiles.createProfile(app.state, $('profile-name').value, fields);
        app.state = Profiles.setActive(app.state, app.state.profiles[app.state.profiles.length - 1].id);
      } else {
        app.state = Profiles.updateProfile(app.state, app.editingId, { name: $('profile-name').value, fields });
      }
    } catch (err) {
      $('profile-error').textContent = 'Error: Give the profile a name, then save again.';
      $('profile-error').hidden = false;
      return;
    }
    await save();
    $('profile-editor').hidden = true;
    renderAll();
    toast('Done: Saved profile "' + $('profile-name').value.trim() + '".');
  });

  $('delete-profile-btn').addEventListener('click', () => {
    $('delete-confirm').hidden = false;
    $('delete-no').focus();
  });
  $('delete-no').addEventListener('click', () => { $('delete-confirm').hidden = true; });
  $('delete-yes').addEventListener('click', async () => {
    app.state = Profiles.deleteProfile(app.state, app.editingId);
    await save();
    $('profile-editor').hidden = true;
    cancelPreview();
    renderAll();
    toast('Done: Deleted 1 profile.');
  });

  // ---------- Links tab ----------
  function currentLinks() {
    return Links.extract(app.rawLinks || [], app.linkBase, $('link-filter').value);
  }

  function renderLinks() {
    const list = $('links-list');
    clear(list);
    if (!app.rawLinks) { $('links-count').textContent = ''; return; }
    const r = currentLinks();
    const q = $('link-filter').value.trim();
    if (!r.total) $('links-count').textContent = 'No links found';
    else if (!r.links.length) $('links-count').textContent = 'No links match "' + q + '". Clear the filter to see all ' + r.total + '.';
    else $('links-count').textContent = plural(r.links.length, 'link', 'links') + ', ' + plural(r.duplicates, 'duplicate', 'duplicates') + ' removed';
    r.links.forEach((l) => {
      list.appendChild(el('li', { title: l.url }, [
        el('span', { text: l.text || '(no text)' }), el('code', { text: l.url })]));
    });
    ['copy-text-btn', 'copy-csv-btn'].forEach((id) => { $(id).disabled = !r.links.length; });
  }

  $('links-btn').addEventListener('click', () => busy($('links-btn'), 'Reading page…', async () => {
    try {
      const res = await pageCall({ type: 'links' });
      app.rawLinks = res.links || [];
      app.linkBase = res.base || '';
    } catch (e) {
      toast("Error: Couldn't read this page. Reload it and try again.", true);
      return;
    }
    renderLinks();
  }));
  $('link-filter').addEventListener('input', renderLinks);

  async function copyLinks(kind) {
    const r = currentLinks();
    const text = kind === 'csv' ? Links.toCsv(r.links) : Links.toText(r.links);
    try {
      await navigator.clipboard.writeText(text);
      toast('Done: ' + plural(r.links.length, 'link', 'links') + ' copied as ' + (kind === 'csv' ? 'CSV' : 'text') + '.');
    } catch (e) {
      toast("Error: Couldn't copy. Select the list and press Ctrl+C instead.", true);
    }
  }
  $('copy-text-btn').addEventListener('click', () => copyLinks('text'));
  $('copy-csv-btn').addEventListener('click', () => copyLinks('csv'));

  // ---------- Rules tab ----------
  $('rule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      app.rules = Rules.addRule(app.rules, {
        domain: $('rule-domain').value, field: $('rule-field').value, key: $('rule-key').value,
      });
    } catch (err) {
      $('rule-error').textContent = 'Error: Fill in the domain, the field label and a profile key, then add the rule again.';
      $('rule-error').hidden = false;
      return;
    }
    $('rule-error').hidden = true;
    $('rule-field').value = '';
    await save();
    renderRules();
    toast('Done: Added 1 rule.');
  });

  // ---------- Backup tab ----------
  $('export-btn').addEventListener('click', () => {
    const json = Profiles.exportJson(app.state, { rules: app.rules });
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = el('a', { href: url, download: 'ferrywise-backup.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Done: Exported ' + plural(app.state.profiles.length, 'profile', 'profiles') + ' and ' + plural(app.rules.length, 'rule', 'rules') + '.');
  });

  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const res = Profiles.importJson(await file.text());
    e.target.value = '';
    if (!res.ok) { toast("Error: That file isn't a Ferrywise backup. Nothing was imported.", true); return; }
    let rules = [];
    (Array.isArray(res.extra.rules) ? res.extra.rules : []).forEach((r) => {
      try { rules = Rules.addRule(rules, r); } catch (err) { /* skip a malformed rule */ }
    });
    app.state = res.state;
    app.rules = rules;
    await save();
    cancelPreview();
    renderAll();
    toast('Done: Imported ' + plural(res.state.profiles.length, 'profile', 'profiles') + ' and ' + plural(rules.length, 'rule', 'rules') + '.');
  });

  // ---------- tabs (ARIA tabs pattern) ----------
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  function select(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    tab.focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const last = tabs.length - 1;
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[i === last ? 0 : i + 1];
      else if (e.key === 'ArrowLeft') next = tabs[i === 0 ? last : i - 1];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[last];
      if (next) { e.preventDefault(); select(next); }
    });
  });

  // ---------- start ----------
  (async function init() {
    app.state = await store.get('state', Profiles.emptyState());
    app.rules = await store.get('rules', []);
    try { await findTab(); } catch (e) { app.readable = false; }
    renderAll();
    renderLinks();
  })();
})();
