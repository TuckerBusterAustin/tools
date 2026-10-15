'use strict';
// Pure field matching: scores page field descriptors against profile keys.
// Descriptor: {tag, type, name, id, label, placeholder, autocomplete}.

(function () {
  // Synonym groups. The first entry names the group; all are compared in compact form.
  const GROUPS = [
    ['email', 'e-mail', 'email address', 'mail'],
    ['phone', 'tel', 'telephone', 'phone number', 'mobile', 'cell'],
    ['company', 'organization', 'organisation', 'org', 'company name', 'business', 'business name', 'employer'],
    ['first name', 'firstname', 'given name', 'forename', 'fname'],
    ['last name', 'lastname', 'family name', 'surname', 'lname'],
    ['name', 'full name', 'fullname', 'your name', 'contact name'],
    ['address', 'street address', 'address line 1', 'address1', 'street', 'address line1'],
    ['city', 'town', 'locality', 'address level2'],
    ['postcode', 'postal code', 'zip', 'zip code', 'postal', 'zipcode'],
    ['state', 'province', 'region', 'county', 'address level1'],
    ['country', 'country name'],
    ['website', 'url', 'web site', 'homepage', 'site'],
    ['vat', 'vat number', 'tax id', 'vat id'],
  ];

  const SKIP_TYPES = ['password', 'hidden', 'submit', 'button', 'reset', 'image', 'file', 'checkbox', 'radio'];
  const MIN_SCORE = 30;

  // Lowercases, splits camelCase and punctuation into single-spaced words.
  function words(s) {
    return String(s == null ? '' : s)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  const compact = (s) => words(s).replace(/ /g, '');

  // Returns the synonym list for a profile key (its group, or just itself).
  function synonymsFor(key) {
    const c = compact(key);
    const group = GROUPS.find((g) => g.some((s) => compact(s) === c));
    return group || [key];
  }

  // Group name for a label: exact synonym, or a synonym contained as whole words.
  // The longest synonym wins, so "company name" beats "name". Returns '' when none.
  function groupFor(text) {
    const w = words(text);
    if (!w) return '';
    const c = w.replace(/ /g, '');
    const exact = GROUPS.find((g) => g.some((s) => compact(s) === c));
    if (exact) return exact[0];
    const padded = ' ' + w + ' ';
    let best = '';
    let bestLen = 0;
    GROUPS.forEach((g) => g.forEach((s) => {
      const sw = words(s);
      if (sw.length > bestLen && padded.includes(' ' + sw + ' ')) { best = g[0]; bestLen = sw.length; }
    }));
    return best;
  }

  // Score one text against synonyms: exact match -> exactScore, whole-word containment -> containsScore.
  function textScore(text, syns, exactScore, containsScore) {
    const w = words(text);
    if (!w) return 0;
    const c = w.replace(/ /g, '');
    if (syns.some((s) => compact(s) === c)) return exactScore;
    const padded = ' ' + w + ' ';
    if (syns.some((s) => words(s) && padded.includes(' ' + words(s) + ' '))) return containsScore;
    return 0;
  }

  // Score of one descriptor against one profile key (0 = no match).
  function scoreField(d, key) {
    const syns = synonymsFor(key);
    const signals = [];
    // autocomplete may hold several tokens such as "billing email": the last one counts.
    const ac = String(d.autocomplete || '').trim().split(/\s+/).pop();
    if (ac && ac !== 'off' && ac !== 'on') signals.push(textScore(ac, syns, 100, 0));
    const type = String(d.type || '').toLowerCase();
    const typeKey = { email: 'email', tel: 'phone', url: 'website' }[type];
    if (typeKey && synonymsFor(typeKey)[0] === syns[0]) signals.push(80);
    signals.push(textScore(d.name, syns, 70, 45));
    signals.push(textScore(d.id, syns, 70, 45));
    signals.push(textScore(d.label, syns, 65, 40));
    signals.push(textScore(d.placeholder, syns, 40, 25));
    const hits = signals.filter((s) => s > 0).sort((a, b) => b - a);
    if (!hits.length) return 0;
    // Best signal plus a small bonus for each agreeing signal.
    return Math.min(99, hits[0] + 3 * (hits.length - 1)) + (hits[0] === 100 ? 1 : 0);
  }

  // Why a field can never be filled, or null.
  function skipReason(d) {
    const tag = String(d.tag || '').toLowerCase();
    const type = String(d.type || '').toLowerCase();
    if (!['input', 'select', 'textarea'].includes(tag)) return 'not a form field';
    if (SKIP_TYPES.includes(type)) return type + ' field';
    // Payment, one-time-code and password-manager fields are never filled, whatever their type.
    if (/(^|\s)cc-|current-password|new-password|one-time-code/i.test(String(d.autocomplete || ''))) {
      return 'sensitive field';
    }
    return null;
  }

  // Builds a fill plan: {fills, ambiguous, skipped}.
  //  fills:     [{field, key, value, confidence}]  confident single best match
  //  ambiguous: [{field, keys}]                    top score tied: never filled
  //  skipped:   [{field, reason}]                  unsafe or unknown fields
  function planFill(fields, profileFields) {
    const keys = Object.keys(profileFields || {}).filter((k) => String(profileFields[k]).trim() !== '');
    const plan = { fills: [], ambiguous: [], skipped: [] };
    (fields || []).forEach((d) => {
      const reason = skipReason(d);
      if (reason) { plan.skipped.push({ field: d, reason }); return; }
      const scored = keys.map((k) => ({ key: k, score: scoreField(d, k) }))
        .filter((s) => s.score >= MIN_SCORE).sort((a, b) => b.score - a.score);
      if (!scored.length) { plan.skipped.push({ field: d, reason: 'no match' }); return; }
      const tied = scored.filter((s) => s.score === scored[0].score);
      if (tied.length > 1) { plan.ambiguous.push({ field: d, keys: tied.map((t) => t.key) }); return; }
      plan.fills.push({
        field: d, key: scored[0].key, value: profileFields[scored[0].key],
        confidence: Math.round(scored[0].score) / 100,
      });
    });
    return plan;
  }

  const api = { planFill, scoreField, synonymsFor, groupFor, words, skipReason };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.FerrywiseFieldMatch = api;
})();
