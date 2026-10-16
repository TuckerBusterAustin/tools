'use strict';
// Browser glue for index.html. Pure helpers are exported for tests.

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const content = isNode ? require('./content') : root.FerrywiseContent;
  const storeLib = isNode ? require('./store') : root.FerrywiseStore;
  const variantLib = isNode ? require('./variant') : root.FerrywiseVariant;

  const VIEW_KEY = 'ferrywise:viewed';

  // Simple email check: something@something.tld (tld 2+ chars), no spaces.
  function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(email.trim());
  }

  // Logs one 'view' per visitor (guarded by a storage flag). Returns true if logged.
  function logViewOnce(storage, store, variant) {
    if (storage.getItem(VIEW_KEY)) return false;
    store.addRecord('events', { type: 'view', variant });
    storage.setItem(VIEW_KEY, '1');
    return true;
  }

  function logTierClick(store, tier, variant) {
    return store.addRecord('events', { type: 'tier_click', tier, variant });
  }

  // Validates and stores a signup. Returns { ok, error?, record? }.
  function submitSignup(store, input) {
    if (!isValidEmail(input.email)) return { ok: false, error: 'Please enter a valid email address.' };
    const record = store.addRecord('signups', {
      type: 'signup',
      email: input.email.trim(),
      workflow: (input.workflow || '').trim(),
      variant: input.variant,
      tier: input.tier || null
    });
    return { ok: true, record };
  }

  function init(doc, storage) {
    const store = storeLib.createStore(storage);
    const variant = variantLib.assignVariant(storage);
    const $ = (id) => doc.getElementById(id);
    let chosenTier = null;
    // Optional local tracker (js/tracking.js); present only when that script is loaded.
    const tracker = root.FerrywiseTracking ? root.FerrywiseTracking.createTracker(storage) : null;

    // Problems, features and FAQ are static HTML (works without JS); only the
    // headline variant and the dynamic notes are filled in here.
    $('headline').textContent = content.headlines[variant];
    $('pricing-note').textContent = content.pricingNote;
    $('waitlist-note').textContent = content.waitlistNote;
    $('workflow-label').textContent = content.workflowQuestion;
    const dialog = $('reserve-dialog');

    const tierBox = $('tiers');
    content.tiers.forEach((t) => {
      const card = doc.createElement('div'); card.className = 'tier';
      const h = doc.createElement('h3'); h.textContent = t.name;
      const p = doc.createElement('p'); p.className = 'price'; p.textContent = '$' + t.price;
      const per = doc.createElement('p'); per.className = 'muted';
      per.textContent = 'per ' + t.period + ', billed ' + (t.period === 'year' ? 'yearly' : 'monthly');
      const ul = doc.createElement('ul');
      fill(ul, (content.includes[t.id] || []).map((x) => li(doc, x)));
      const b = doc.createElement('button'); b.type = 'button';
      b.className = 'secondary';
      b.textContent = t.label;
      b.addEventListener('click', () => {
        chosenTier = t.id;
        logTierClick(store, t.id, variant);
        if (tracker) tracker.recordTierClick(t.id);
        $('reserve-chosen').textContent =
          "You're reserving: " + t.name + ' ($' + t.price + '/' + t.period + ', planned)';
        $('reserve-error').textContent = '';
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        $('reserve-email').focus();
      });
      card.appendChild(h); card.appendChild(p); card.appendChild(per);
      card.appendChild(ul); card.appendChild(b);
      tierBox.appendChild(card);
    });

    // The hero button scrolls to the visible form and focuses it (no tier chosen).
    $('join-cta').addEventListener('click', (e) => {
      e.preventDefault();
      chosenTier = null;
      $('chosen').hidden = true;
      $('waitlist').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('email').focus();
    });

    // Reserve follow-up dialog: stores the signup with the chosen tier, locally only.
    function closeDialog() {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    $('reserve-close').addEventListener('click', closeDialog);
    $('reserve-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const res = submitSignup(store, { email: $('reserve-email').value, variant, tier: chosenTier });
      $('reserve-error').textContent = res.ok ? '' : res.error;
      if (!res.ok) { $('reserve-email').focus(); return; }
      if (tracker) tracker.recordSignup({ email: $('reserve-email').value, workflow: '' });
      closeDialog();
      $('waitlist-form').hidden = true;
      $('thanks').hidden = false;
    });

    $('waitlist-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const res = submitSignup(store, {
        email: $('email').value, workflow: $('workflow').value, variant, tier: chosenTier
      });
      $('form-error').textContent = res.ok ? '' : res.error;
      if (!res.ok) {
        $('email').setAttribute('aria-invalid', 'true');
        $('email').focus();
      } else {
        $('email').removeAttribute('aria-invalid');
      }
      if (res.ok) {
        if (tracker) tracker.recordSignup({ email: $('email').value, workflow: $('workflow').value });
        $('waitlist-form').hidden = true;
        $('thanks').hidden = false;
      }
    });

    logViewOnce(storage, store, variant);
  }

  function li(doc, text) { const e = doc.createElement('li'); e.textContent = text; return e; }
  function fill(el, nodes) { nodes.forEach((n) => el.appendChild(n)); }

  const api = { isValidEmail, logViewOnce, logTierClick, submitSignup, init };
  if (isNode) module.exports = api;
  else root.FerrywiseLanding = api;
})(typeof window !== 'undefined' ? window : globalThis);
