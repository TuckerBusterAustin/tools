'use strict';
// Browser glue for workbench.html. Task 2: tabs + evidence tab. All user text goes in via textContent.
(function () {
const Store = window.FerrywiseV3Store;
const Ev = window.FerrywiseEvidence;
const $ = (id) => document.getElementById(id);

let store;
let storageOk = true;
try { store = Store.createStore(window.localStorage); store.list('threads'); } catch (e) {
  storageOk = false;
  store = Store.createStore(Store.createMemoryStorage()); // keeps the page usable; nothing persists
}
if (!storageOk) $('storage-banner').hidden = false;

// Local-time today as YYYY-MM-DD (the date input uses local dates too).
function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ---- toast ----
let toastTimer;
function toast(text, isError) {
  const t = $('toast');
  $('toast-text').textContent = (isError ? '! Error: ' : '✓ Saved: ') + text;
  t.className = 'toast' + (isError ? ' error' : '');
  t.setAttribute('role', isError ? 'alert' : 'status');
  t.hidden = false;
  clearTimeout(toastTimer);
  if (!isError) toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}
$('toast-close').addEventListener('click', () => { $('toast').hidden = true; });

// ---- tabs (WAI-ARIA pattern, selected tab kept in the URL hash) ----
const tabs = Array.prototype.slice.call(document.querySelectorAll('[role=tab]'));
function selectTab(name, focus) {
  let found = tabs.find((t) => t.dataset.tab === name) || tabs[0];
  tabs.forEach((t) => {
    const on = t === found;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(t.getAttribute('aria-controls')).hidden = !on;
  });
  if (focus) found.focus();
  if (location.hash !== '#' + found.dataset.tab) history.replaceState(null, '', '#' + found.dataset.tab);
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t.dataset.tab));
  t.addEventListener('keydown', (e) => {
    const n = tabs.length;
    const next = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectTab(tabs[next].dataset.tab, true);
  });
});
window.addEventListener('hashchange', () => selectTab(location.hash.slice(1)));
selectTab(location.hash.slice(1));

// ---- evidence tab ----
const svg = (path) => '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2">' + path + '</svg>';
const GLYPH = {
  pass: svg('<path d="M3 8.5l3.5 3.5L13 4.5"/>'),
  fail: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  none: svg('<path d="M4 8h8"/>'),
};

function setBar(barId, numId, value, max, label) {
  const bar = $(barId);
  bar.setAttribute('aria-valuenow', String(Math.min(value, max)));
  bar.setAttribute('aria-valuemax', String(max));
  bar.setAttribute('aria-label', label + ', ' + value + ' of ' + max);
  bar.firstElementChild.style.width = Math.min(100, (value / max) * 100) + '%';
  $(numId).textContent = value + ' / ' + max; // real number, even when over target
}

function renderGate(threads) {
  const g = Ev.evaluateGate(threads);
  $('gate-counts').textContent = g.total + ' of ' + Ev.NEED_THREADS + " threads · " + g.freeFailed + ' of ' + Ev.NEED_FREE_FAILED + " where free tools didn't solve it";
  setBar('bar-total', 'num-total', g.total, Ev.NEED_THREADS, 'Threads logged');
  setBar('bar-free', 'num-free', g.freeFailed, Ev.NEED_FREE_FAILED, "Threads where free tools didn't solve it");
  const badge = $('gate-badge');
  // Not enough data until at least one thread is logged; then Pass or Fail.
  const kind = g.pass ? 'pass' : g.total === 0 ? 'none' : 'fail';
  badge.className = 'badge' + (kind === 'pass' ? ' pass' : kind === 'fail' ? ' fail' : '');
  badge.innerHTML = GLYPH[kind] + '<span></span>';
  badge.lastChild.textContent = g.pass ? 'Pass' : g.total === 0 ? 'Not enough data' : 'Fail';
  $('gate-missing').textContent = g.pass
    ? "Gate passed: " + g.total + " threads, " + g.freeFailed + " where free tools didn't solve it."
    : g.missing;
  return g;
}

function cell(tr, label, text, cls) {
  const td = document.createElement('td');
  td.dataset.label = label;
  if (cls) td.className = cls;
  td.textContent = text;
  tr.appendChild(td);
  return td;
}

function renderTable(threads) {
  const body = $('thread-body');
  body.textContent = '';
  threads.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).forEach((t) => {
    const tr = document.createElement('tr');
    cell(tr, 'Date', t.date, 'mono');
    const td = cell(tr, 'Link', '');
    const a = document.createElement('span');
    a.className = 'url mono';
    a.title = t.url;
    a.textContent = t.url;
    const full = document.createElement('span');
    full.className = 'sr';
    full.textContent = t.url;
    td.appendChild(a); td.appendChild(full);
    cell(tr, 'Workflow', t.workflow);
    cell(tr, 'Tools', (t.tools || []).join(', ') || '–');
    cell(tr, 'Free tool failed', t.freeToolFailed ? 'Yes' : 'No');
    cell(tr, 'Price', t.price === null || t.price === undefined ? '–' : String(t.price), 'mono');
    body.appendChild(tr);
  });
  $('thread-table').hidden = threads.length === 0;
  $('thread-empty').hidden = threads.length !== 0;
  $('dl-csv').disabled = threads.length === 0;
}

function renderEvidence() {
  const threads = store.list(Ev.COLLECTION);
  renderTable(threads);
  return renderGate(threads);
}

// Date limits: max today, min today minus 12 months.
$('f-date').max = today();
$('f-date').min = Ev.oldestAllowed(today());
$('f-date').value = today();

const FIELDS = ['url', 'date', 'workflow', 'price'];
function showErrors(errors) {
  let first = null;
  FIELDS.forEach((f) => {
    const input = $('f-' + f);
    const msg = errors[f] || '';
    $('f-' + f + '-err').textContent = msg;
    if (msg) { input.setAttribute('aria-invalid', 'true'); first = first || input; } else input.removeAttribute('aria-invalid');
  });
  if (first) first.focus();
}

$('thread-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = {
    url: $('f-url').value, date: $('f-date').value, workflow: $('f-workflow').value,
    tools: $('f-tools').value, freeToolFailed: $('f-free').checked, price: $('f-price').value,
  };
  let res;
  try { res = Ev.addThread(store, input, today()); } catch (err) {
    $('storage-banner').hidden = false;
    toast("this browser won't save data. Export what you have now.", true);
    return;
  }
  showErrors(res.errors);
  if (!res.ok) return; // form keeps the typed values
  ['url', 'workflow', 'tools', 'price'].forEach((f) => { $('f-' + f).value = ''; });
  $('f-free').checked = false; // date is kept on purpose
  const g = renderEvidence();
  $('f-url').focus();
  toast('Thread added. ' + g.total + ' of ' + Ev.NEED_THREADS + ' · ' + g.freeFailed + ' of ' + Ev.NEED_FREE_FAILED + ' free-tool-failed.');
});

$('dl-csv').addEventListener('click', () => {
  const blob = new Blob([Ev.toCsv(store.list(Ev.COLLECTION))], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ferrywise-evidence-' + today() + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

renderEvidence();

// ---- breakage tab ----
const Br = window.FerrywiseBreakage;
let editing = null; // { workflow, day } while the inline editor is open
let lastCell = null;

function setBadge(el, kind, word) {
  el.className = 'badge' + (kind === 'pass' ? ' pass' : kind === 'fail' ? ' fail' : '');
  el.innerHTML = GLYPH[kind] + '<span></span>';
  el.lastChild.textContent = word;
}

function renderBreakage() {
  const entries = Br.latestEntries(store.list(Br.COLLECTION));
  const names = Br.getNames(store);
  const r = Br.evaluateBreakage(entries);
  $('br-text').textContent = 'Workflows with more than ' + r.limit + ' fix: ' + r.workflowsOverLimit + ' of ' + Br.WORKFLOWS +
    ' (limit ' + r.limit + ') · Days logged: ' + r.daysLogged + ' of ' + r.daysNeeded +
    (r.daysLogged === 0 ? ' · Not enough data. Re-run each hand-built workflow once a day and log the result here.' : '');
  if (r.daysLogged === 0) setBadge($('br-badge'), 'none', 'Not enough data');
  else if (r.status === 'fail') setBadge($('br-badge'), 'fail', 'Fail');
  else if (r.status === 'pass') setBadge($('br-badge'), 'pass', 'Pass');
  else setBadge($('br-badge'), 'pass', 'Pass so far');
  $('br-incomplete').hidden = r.complete;

  const grid = $('br-grid');
  grid.textContent = '';
  names.forEach((name, wi) => {
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h3');
    h.textContent = name + ' · ' + r.fixesPerWorkflow[wi] + ' fixes this week';
    const days = document.createElement('div');
    days.className = 'br-days';
    for (let d = 1; d <= Br.DAYS; d += 1) {
      const en = entries.find((x) => x.workflow === wi + 1 && x.day === d);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'br-cell' + (en && en.broke ? ' broke' : '');
      b.dataset.workflow = String(wi + 1);
      b.dataset.day = String(d);
      const state = !en ? '–' : en.broke ? 'Broke · ' + en.fixes + (en.fixes === 1 ? ' fix' : ' fixes') : '✓ OK';
      b.setAttribute('aria-label', 'Workflow ' + (wi + 1) + ', day ' + d + ': ' +
        (!en ? 'not logged' : en.broke ? 'broke, ' + en.fixes + (en.fixes === 1 ? ' fix' : ' fixes') : 'OK') + '. Edit');
      if (editing && editing.workflow === wi + 1 && editing.day === d) b.setAttribute('aria-pressed', 'true');
      const dayLbl = document.createElement('span');
      dayLbl.className = 'br-day';
      dayLbl.textContent = 'Day ' + d;
      b.appendChild(dayLbl);
      b.appendChild(document.createTextNode(state));
      b.addEventListener('click', () => openEditor(wi + 1, d, en, b));
      days.appendChild(b);
    }
    card.appendChild(h);
    card.appendChild(days);
    grid.appendChild(card);
  });
}

function renderNames() {
  const box = $('br-names');
  box.textContent = '';
  Br.getNames(store).forEach((n, i) => {
    const f = document.createElement('div');
    f.className = 'field';
    const l = document.createElement('label');
    l.htmlFor = 'br-name-' + i;
    l.textContent = 'Workflow ' + (i + 1) + ' name';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'br-name-' + i; inp.value = n; inp.maxLength = 60;
    inp.addEventListener('change', () => {
      const vals = [0, 1, 2].map((k) => $('br-name-' + k).value);
      try { Br.setNames(store, vals); } catch (err) { toast("this browser won't save data.", true); return; }
      renderBreakage();
    });
    f.appendChild(l); f.appendChild(inp);
    box.appendChild(f);
  });
}

function openEditor(workflow, day, entry, btn) {
  editing = { workflow, day };
  lastCell = btn;
  $('br-form-title').textContent = Br.getNames(store)[workflow - 1] + ', day ' + day;
  $('br-broke').checked = !!(entry && entry.broke);
  $('br-fixes').value = entry ? entry.fixes : 0;
  $('br-minutes').value = entry && entry.minutes !== null && entry.minutes !== undefined ? entry.minutes : '';
  ['fixes', 'minutes'].forEach((f) => { $('br-' + f + '-err').textContent = ''; $('br-' + f).removeAttribute('aria-invalid'); });
  $('br-form').hidden = false;
  renderBreakage();
  $('br-broke').focus();
}

function closeEditor() {
  editing = null;
  $('br-form').hidden = true;
  renderBreakage();
  const b = lastCell && document.querySelector('.br-cell[data-workflow="' + lastCell.dataset.workflow + '"][data-day="' + lastCell.dataset.day + '"]');
  if (b) b.focus();
}

$('br-cancel').addEventListener('click', closeEditor);
$('br-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!editing) return;
  const res = Br.recordEntry(store_(), {
    workflow: editing.workflow, day: editing.day, broke: $('br-broke').checked,
    fixes: $('br-fixes').value, minutes: $('br-minutes').value,
  });
  let first = null;
  ['fixes', 'minutes'].forEach((f) => {
    const msg = res.errors[f] || '';
    $('br-' + f + '-err').textContent = msg;
    if (msg) { $('br-' + f).setAttribute('aria-invalid', 'true'); first = first || $('br-' + f); } else $('br-' + f).removeAttribute('aria-invalid');
  });
  if (first) { first.focus(); return; }
  const label = Br.getNames(store)[editing.workflow - 1];
  const day = editing.day;
  closeEditor();
  toast(res.replaced ? 'Day ' + day + ' for ' + label + ' updated (replaced the earlier entry).' : 'Day ' + day + ' for ' + label + ' saved.');
});

// Storage write failures show the persistent banner instead of crashing.
function store_() {
  return {
    list: store.list, get: store.get,
    set: store.set,
    replaceAll: (n, r) => {
      try { store.replaceAll(n, r); } catch (err) { $('storage-banner').hidden = false; toast("this browser won't save data. Export what you have now.", true); }
    },
  };
}

renderNames();
renderBreakage();

// ---- results tab ----
const Res = window.FerrywiseResults;
const Tr = window.FerrywiseTracking;
const BADGE = {
  'pass': ['pass', 'Pass', GLYPH.pass],
  'fail': ['fail', 'Fail', GLYPH.fail],
  'iterate': ['iterate', 'Iterate', svg('<path d="M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3"/>')],
  'not-enough-data': ['', 'Not enough data', GLYPH.none],
  'deferred': ['deferred', 'Deferred', svg('<path d="M6 3v10M10 3v10"/>')],
};

function renderResults() {
  // Visitor counts are typed in; sign-ups and clicks come from the tracking record.
  let summary;
  try { summary = Tr.createTracker(window.localStorage).summarize(); } catch (e) { summary = undefined; }
  const r = Res.evaluateResults({
    summary,
    gate: Ev.evaluateGate(store.list(Ev.COLLECTION)),
    breakage: Br.evaluateBreakage(Br.latestEntries(store.list(Br.COLLECTION))),
    visitors: { A: $('res-a').value, B: $('res-b').value },
    impressions: $('res-imp').value,
  });
  const list = $('res-list');
  list.textContent = '';
  r.criteria.forEach((c) => {
    const li = document.createElement('li');
    const head = document.createElement('div');
    head.className = 'res-head';
    const b = BADGE[c.status];
    const badge = document.createElement('span');
    badge.className = 'badge ' + b[0];
    badge.innerHTML = b[2] + '<span></span>';
    badge.lastChild.textContent = b[1];
    const name = document.createElement('span');
    name.textContent = c.metric;
    head.appendChild(badge); head.appendChild(name);
    const val = document.createElement('div');
    val.className = 'res-val';
    val.textContent = c.value + ' vs target: ' + c.target;
    const sentence = document.createElement('div');
    sentence.textContent = c.sentence;
    li.appendChild(head); li.appendChild(val); li.appendChild(sentence);
    list.appendChild(li);
  });
  const kills = $('res-kills');
  kills.textContent = '';
  r.killSignals.forEach((k) => {
    const li = document.createElement('li');
    li.textContent = '! ' + k;
    kills.appendChild(li);
  });
  $('res-kills-empty').hidden = r.killSignals.length > 0;
  const cannot = $('res-cannot');
  cannot.textContent = '';
  r.cannotCheck.forEach((t) => { const li = document.createElement('li'); li.textContent = t; cannot.appendChild(li); });
  const note = $('res-imp-note');
  note.hidden = r.impressions === null;
  if (r.impressions !== null) note.textContent = 'Search Console impressions noted: ' + r.impressions + '. Shown for context only; no check uses them.';
}

['res-a', 'res-b', 'res-imp'].forEach((id) => $(id).addEventListener('input', renderResults));
$('res-form').addEventListener('submit', (e) => { e.preventDefault(); renderResults(); });
tabs.forEach((t) => t.addEventListener('click', renderResults)); // data may have changed in other tabs
window.addEventListener('hashchange', renderResults);
renderResults();
})();
