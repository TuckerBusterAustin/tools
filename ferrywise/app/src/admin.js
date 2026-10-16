'use strict';
// Browser glue for admin.html. Pure helpers are exported for tests (Node + fake storage).

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const storeLib = isNode ? require('./store') : root.FerrywiseStore;
  const metrics = isNode ? require('./metrics') : root.FerrywiseMetrics;
  const evidenceLib = isNode ? require('../lib/evidence') : root.FerrywiseEvidence;
  const csvLib = isNode ? require('./csv') : root.FerrywiseCsv;

  const WORKFLOWS = 3;
  const SIGNUP_COLUMNS = ['timestamp', 'email', 'workflow', 'variant', 'tier'];
  // Evidence threads live in the shared store under this kind (evidence.html writes it),
  // so JSON export/import on this page covers them too.
  const EVIDENCE_KIND = 'evidence';

  // Evidence list from the shared store; corrupt data reads as [].
  function loadEvidence(store) {
    return store.list(EVIDENCE_KIND);
  }

  // Gate view for the owner page: the single gate in lib/evidence.js, same as evidence.html.
  function evidenceGate(evidence, now) {
    const g = evidenceLib.gate(evidence, now);
    return Object.assign({ status: g.passed ? 'pass' : 'fail' }, g);
  }

  // Stores one breakage-log row (day 1-7, workflow name, broke yes/no, fix minutes).
  function addBreakage(store, input) {
    const day = Number(input.day);
    const workflow = String(input.workflow || '').trim();
    const errors = [];
    if (!Number.isInteger(day) || day < 1 || day > 7) errors.push('day must be 1 to 7');
    if (!workflow) errors.push('workflow is required');
    const broke = input.broke === true || input.broke === 'yes';
    const fixMinutes = broke ? Number(input.fixMinutes || 0) : 0;
    if (!(fixMinutes >= 0) || !isFinite(fixMinutes)) errors.push('fix minutes must be 0 or more');
    if (errors.length) return { ok: false, errors };
    store.addRecord('breakage', { day, workflow, broke, fixMinutes });
    return { ok: true };
  }

  // Per-workflow fixes = number of breakages logged for it; feeds metrics.breakageStatus.
  function breakageForMetrics(entries) {
    const by = new Map();
    entries.forEach((e) => {
      const k = String(e.workflow).trim().toLowerCase();
      if (!by.has(k)) by.set(k, { workflow: e.workflow, fixes: 0 });
      if (e.broke) by.get(k).fixes += 1;
    });
    return Array.from(by.values());
  }

  const VISITORS_ID = 'visitors';
  const toCount = (v) => { const n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; };

  // Hand-entered visitor counts per variant, kept in the shared store (kind 'settings').
  function loadVisitors(store) {
    const rec = store.list('settings').find((r) => r.id === VISITORS_ID) || {};
    return { A: toCount(rec.A), B: toCount(rec.B) };
  }

  // Saves visitor counts; blank or invalid become 0.
  function saveVisitors(store, a, b) {
    store.remove('settings', VISITORS_ID);
    store.addRecord('settings', { id: VISITORS_ID, A: toCount(a), B: toCount(b) });
  }

  // Builds the whole results view-model from a store.
  // `evidence` is the list from loadEvidence(store); omitted means none logged.
  function buildResults(store, now, evidence) {
    const events = store.list('events');
    const signups = store.list('signups');
    const views = events.filter((e) => e.type === 'view');
    const clicks = events.filter((e) => e.type === 'tier_click');
    const named = signups.filter((s) => String(s.workflow || '').trim() !== '');

    const variants = { A: { visitors: 0, signups: 0, paidClicks: 0 }, B: { visitors: 0, signups: 0, paidClicks: 0 } };
    const bump = (list, field) => list.forEach((r) => { if (variants[r.variant]) variants[r.variant][field] += 1; });
    bump(views, 'visitors'); bump(signups, 'signups'); bump(clicks, 'paidClicks');
    // Hand-entered visitor counts (owner-approved source) replace local view counts when set.
    const manual = loadVisitors(store);
    ['A', 'B'].forEach((k) => { if (manual[k] > 0) variants[k].visitors = manual[k]; });
    const visitorTotal = variants.A.visitors + variants.B.visitors;

    const tierClicks = {};
    clicks.forEach((c) => { tierClicks[c.tier] = (tierClicks[c.tier] || 0) + 1; });

    const breakageEntries = store.list('breakage');
    const deposits = null; // deposits are deferred in this phase: never tested, never a pass
    const data = {
      visitors: Math.max(views.length, visitorTotal), signups: signups.length, workflowNamed: named.length,
      paidClicks: clicks.length, variants, deposits,
      breakage: breakageForMetrics(breakageEntries),
    };
    const ev = metrics.evaluate(data, now);
    const gate = evidenceGate(evidence || [], now);

    let workflowStatus = 'insufficient data';
    if (signups.length > 0) {
      workflowStatus = ev.rates.workflowNamed >= metrics.THRESHOLDS.workflowNamedPass ? 'pass' : 'iterate';
    }

    return {
      visitors: data.visitors, signups: data.signups, workflowNamed: data.workflowNamed,
      paidClicks: data.paidClicks, deposits,
      rates: ev.rates,
      variants: metrics.variantBreakdown(variants),
      tierClicks, gate,
      criteria: [
        { key: 'signup', label: 'Sign-up rate (visitors to sign-ups)', status: ev.signup },
        { key: 'workflow', label: 'Sign-ups naming a workflow', status: workflowStatus },
        { key: 'tierClick', label: 'Tier click rate', status: ev.paidClicks },
        { key: 'deposits', label: 'Deposits', status: ev.deposits },
        { key: 'gate', label: 'Evidence thread gate', status: gate.status },
        { key: 'breakage', label: '7-day breakage test', status: ev.breakage },
      ],
    };
  }

  // CSV of sign-ups: header row plus one row per signup.
  function signupsCsv(store) {
    return csvLib.toCsv(store.list('signups'), SIGNUP_COLUMNS);
  }

  const pct = (x) => (Math.round(x * 1000) / 10) + '%';

  function init(doc, storage) {
    const store = storeLib.createStore(storage);
    const $ = (id) => doc.getElementById(id);
    const text = (tag, s) => { const e = doc.createElement(tag); e.textContent = s; return e; };
    const row = (cells) => {
      const tr = doc.createElement('tr');
      cells.forEach((c) => tr.appendChild(text('td', String(c))));
      return tr;
    };
    const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
    const download = (name, mime, body) => {
      const a = doc.createElement('a');
      a.href = URL.createObjectURL(new Blob([body], { type: mime }));
      a.download = name;
      doc.body.appendChild(a);
      a.click();
      doc.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 0);
    };

    function render() {
      const r = buildResults(store, new Date(), loadEvidence(store));
      $('gate-status').textContent = 'Gate: ' + r.gate.status.toUpperCase() + ' – ' + r.gate.threads +
        ' counted threads (need ' + r.gate.needThreads + '), ' + r.gate.notSolved +
        ' where free tools failed (need ' + r.gate.needNotSolved + '); ' +
        r.gate.older + ' older than 12 months. Add threads on the evidence page.';

      $('totals').textContent = 'Visitors ' + r.visitors + ', sign-ups ' + r.signups +
        ' (sign-up rate ' + pct(r.rates.signup) + '), naming a workflow ' + pct(r.rates.workflowNamed) +
        ', tier clicks ' + r.paidClicks + ' (' + pct(r.rates.paidClicks) + ').';

      const vb = $('variant-rows'); clear(vb);
      Object.keys(r.variants).forEach((k) => {
        const v = r.variants[k];
        vb.appendChild(row([k, v.visitors, v.signups, pct(v.signupRate), v.paidClicks, pct(v.tierClickRate)]));
      });
      const tb = $('tier-rows'); clear(tb);
      Object.keys(r.tierClicks).forEach((k) => tb.appendChild(row([k, r.tierClicks[k]])));

      const cb = $('criteria-rows'); clear(cb);
      r.criteria.forEach((c) => cb.appendChild(row([c.label, c.status])));

      const bk = $('breakage-rows'); clear(bk);
      store.list('breakage').forEach((b) => bk.appendChild(row([b.day, b.workflow, b.broke ? 'yes' : 'no', b.fixMinutes])));
    }

    // Visitor inputs (visitors-a / visitors-b): save on change and re-render results.
    const vis = loadVisitors(store);
    $('visitors-a').value = vis.A || '';
    $('visitors-b').value = vis.B || '';
    const onVisitors = () => { saveVisitors(store, $('visitors-a').value, $('visitors-b').value); render(); };
    $('visitors-a').addEventListener('input', onVisitors);
    $('visitors-b').addEventListener('input', onVisitors);

    $('breakage-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const res = addBreakage(store, {
        day: $('b-day').value, workflow: $('b-workflow').value,
        broke: $('b-broke').value === 'yes', fixMinutes: $('b-minutes').value,
      });
      $('breakage-errors').textContent = res.ok ? '' : res.errors.join('; ');
      if (res.ok) $('breakage-form').reset();
      render();
    });

    $('export-json').addEventListener('click', () => download('ferrywise-export.json', 'application/json', store.exportJSON()));
    $('export-csv').addEventListener('click', () => download('ferrywise-signups.csv', 'text/csv', signupsCsv(store)));
    $('import-json').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          $('import-status').textContent = 'Imported ' + store.importJSON(String(reader.result)) + ' new records.';
        } catch (err) {
          $('import-status').textContent = 'Import failed: ' + err.message;
        }
        render();
      };
      reader.readAsText(file);
    });

    render();
  }

  const api = { loadVisitors, saveVisitors, loadEvidence, evidenceGate, EVIDENCE_KIND, addBreakage, breakageForMetrics, buildResults, signupsCsv, init, SIGNUP_COLUMNS, WORKFLOWS };
  if (isNode) module.exports = api;
  else root.FerrywiseAdmin = api;
})(typeof window !== 'undefined' ? window : globalThis);
