'use strict';
// Local-only sign-up and tier-click recording. Nothing is sent anywhere:
// everything lives in the given storage (localStorage in the browser).

(function (root) {
  const VARIANT_KEY = 'ferrywise:variant'; // same key as src/variant.js
  const DATA_KEY = 'ferrywise:tracking:v1';
  const TIERS = ['solo', 'solo-annual', 'team'];
  const VARIANTS = ['A', 'B'];

  // Reserve follow-up copy. It never implies the product exists.
  const RESERVE_FOLLOW_UP = {
    note: 'Nothing is charged. Ferrywise is not built yet; this records your interest in this browser only.',
    question: 'What repeat task would you automate first?'
  };

  // Returns 'A' or 'B'. Assigned once, then kept. rng returns [0,1).
  function assignVariant(storage, rng) {
    try {
      const existing = storage.getItem(VARIANT_KEY);
      if (existing === 'A' || existing === 'B') return existing;
    } catch (e) { return 'A'; }
    const r = typeof rng === 'function' ? rng() : Math.random();
    const v = r < 0.5 ? 'A' : 'B';
    try { storage.setItem(VARIANT_KEY, v); } catch (e) { /* blocked: stay usable */ }
    return v;
  }

  // Simple check: name@host.tld with no spaces.
  function isValidEmail(email) {
    return typeof email === 'string' &&
      /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(email.trim());
  }

  function createTracker(storage, now) {
    const clock = typeof now === 'function' ? now : () => new Date().toISOString();

    function load() {
      try {
        const d = JSON.parse(storage.getItem(DATA_KEY));
        if (d && Array.isArray(d.signups) && Array.isArray(d.clicks)) return d;
      } catch (e) { /* fall through to empty */ }
      return { signups: [], clicks: [] };
    }
    function save(d) {
      try { storage.setItem(DATA_KEY, JSON.stringify(d)); return true; } catch (e) { return false; }
    }

    // Returns { ok, error?, duplicate?, record? }.
    function recordSignup(input) {
      const email = input && typeof input.email === 'string' ? input.email.trim() : '';
      if (!isValidEmail(email)) {
        return { ok: false, error: 'Error: enter an email like name@example.com.' };
      }
      const d = load();
      const key = email.toLowerCase();
      if (d.signups.some((s) => s.email.toLowerCase() === key)) {
        return { ok: false, duplicate: true, error: 'This email is already on the list in this browser.' };
      }
      const record = {
        email,
        workflow: ((input && input.workflow) || '').trim(),
        variant: assignVariant(storage),
        date: clock()
      };
      d.signups.push(record);
      if (!save(d)) return { ok: false, error: 'Error: this browser won\'t save data.' };
      return { ok: true, record };
    }

    // Records the click (even if the visitor later cancels the follow-up).
    function recordTierClick(tier) {
      if (TIERS.indexOf(tier) === -1) return { ok: false, error: 'Error: unknown tier.' };
      const d = load();
      const record = { tier, variant: assignVariant(storage), date: clock() };
      d.clicks.push(record);
      if (!save(d)) return { ok: false, error: 'Error: this browser won\'t save data.' };
      return { ok: true, record, followUp: RESERVE_FOLLOW_UP };
    }

    // Counts per variant: signups, signups naming a workflow, clicks per tier.
    function summarize() {
      const d = load();
      const out = {};
      VARIANTS.forEach((v) => {
        out[v] = { signups: 0, signupsWithWorkflow: 0, clicks: { 'solo': 0, 'solo-annual': 0, 'team': 0 } };
      });
      d.signups.forEach((s) => {
        const b = out[s.variant];
        if (!b) return;
        b.signups++;
        if (s.workflow) b.signupsWithWorkflow++;
      });
      d.clicks.forEach((c) => {
        const b = out[c.variant];
        if (b && b.clicks[c.tier] !== undefined) b.clicks[c.tier]++;
      });
      return out;
    }

    return { recordSignup, recordTierClick, summarize, load };
  }

  const api = { assignVariant, isValidEmail, createTracker, RESERVE_FOLLOW_UP, TIERS, DATA_KEY, VARIANT_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FerrywiseTracking = api;
})(typeof window !== 'undefined' ? window : globalThis);
