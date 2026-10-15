'use strict';
// DOM glue for evidence.html. All logic lives in lib/evidence.js. Data stays in localStorage.
(function () {
  const Ev = window.FerrywiseEvidence;
  const KIND = 'evidence';
  const $ = (id) => document.getElementById(id);
  // Shared store: same one admin.html exports/imports (dedupe by id, versioned JSON).
  const store = window.FerrywiseStore.createStore(localStorage);

  function load() { return store.list(KIND); }

  // Runs a store write; a failing write (quota, blocked storage) is shown in #e-errors, not thrown.
  function tryWrite(fn) {
    try { fn(); return true; } catch (e) {
      $('e-errors').textContent = 'Error: Could not save, browser storage is full or blocked. Nothing was changed.';
      return false;
    }
  }

  // One-time move of the older unversioned list into the shared store.
  (function migrateLegacy() {
    try {
      const old = JSON.parse(localStorage.getItem('ferrywise:evidence'));
      if (Array.isArray(old) && old.length && load().length === 0) {
        old.forEach((e) => { if (e && e.url) store.addRecord(KIND, e); });
        localStorage.removeItem('ferrywise:evidence');
      }
    } catch (e) { /* unreadable or full: leave the old data where it is */ }
  })();

  function counter(name, n, need, passed) {
    $('p-' + name).value = Math.min(n, need);
    $('c-' + name).textContent = n + ' of ' + need;
    $('s-' + name).textContent = passed ? '✓ Passed' : '✕ Not yet';
  }

  function render() {
    const list = load();
    const g = Ev.gate(list, new Date());
    counter('threads', g.threads, g.needThreads, g.threadsPassed);
    counter('failed', g.notSolved, g.needNotSolved, g.notSolvedPassed);
    $('e-empty').hidden = list.length > 0;
    $('e-csv').disabled = list.length === 0;
    const ul = $('e-list');
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    Ev.sortNewestFirst(list).forEach((e) => {
      const li = document.createElement('li');
      const d = Ev.parseDate(e.date);
      const old = d && Ev.isOlderThan12Months(d, new Date());
      const url = document.createElement('code');
      url.textContent = e.url; url.title = e.url;
      li.appendChild(url);
      li.appendChild(document.createTextNode(' ' + e.date + ' · ' + e.workflow + ' · Free tools solved it: ' + e.solved +
        (old ? ' · Older than 12 months · not counted' : '') + ' '));
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'secondary'; rm.textContent = 'Remove';
      rm.addEventListener('click', () => { if (tryWrite(() => store.remove(KIND, e.id))) render(); });
      li.appendChild(rm);
      ul.appendChild(li);
    });
  }

  $('evidence-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const checked = document.querySelector('input[name="solved"]:checked');
    const list = load();
    const before = Ev.gate(list, new Date());
    const r = Ev.validateEntry({
      url: $('e-url').value, date: $('e-date').value, workflow: $('e-workflow').value,
      tools: $('e-tools').value, solved: checked ? checked.value : 'unknown', price: $('e-price').value,
    }, list, new Date());
    $('e-errors').textContent = r.ok ? '' : r.errors.join(' ');
    if (!r.ok) return; // keep what the user typed
    if (!tryWrite(() => store.addRecord(KIND, r.entry))) return; // keep the form as typed
    $('evidence-form').reset();
    const after = Ev.gate(load(), new Date());
    $('e-toast').textContent = (after.threadsPassed && !before.threadsPassed)
      ? 'Done: Gate threshold reached for distinct threads.'
      : 'Done: Thread added. ' + after.threads + ' of ' + after.needThreads + '.';
    render();
  });

  $('e-csv').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([Ev.toCsv(load(), new Date())], { type: 'text/csv' }));
    a.download = 'ferrywise-evidence.csv';
    document.body.appendChild(a); // some browsers ignore click() on a detached anchor
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  });

  render();
})();
