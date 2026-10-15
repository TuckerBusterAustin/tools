'use strict';
// Pure logic: per-domain rules, capture, and the rule-first fill plan.
// Rule: {domain, field, key}. `field` is a field label or a simple selector
// ("#id", '[name="x"]'). Rules always win over automatic matching.

(function () {
  const FM = (typeof module !== 'undefined' && module.exports)
    ? require('./fieldmatch') : window.FerrywiseFieldMatch;

  // Common multi-part public suffixes: small built-in list, not the full public suffix list.
  const SHARED_SUFFIXES = ['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'com.au', 'net.au', 'org.au',
    'co.nz', 'org.nz', 'co.za', 'co.in', 'co.jp', 'com.br', 'com.mx', 'com.sg', 'com.cn', 'com.tr'];

  // Reduces "https://App.Example.com/path" or "*.example.com" to "app.example.com".
  function normaliseDomain(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^\*\./, '')
      .replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  }

  // A rule for example.com applies to example.com and any subdomain, never notexample.com.
  function domainMatches(pattern, host) {
    const p = normaliseDomain(pattern);
    const h = normaliseDomain(host);
    if (!p || !h) return false;
    return h === p || h.endsWith('.' + p);
  }

  // Returns a new rule list with the rule added, or throws a readable error.
  // An existing rule for the same domain and field is replaced.
  function addRule(rules, rule) {
    const domain = normaliseDomain(rule && rule.domain);
    const field = String((rule && rule.field) || '').trim();
    const key = String((rule && rule.key) || '').trim();
    if (!domain) throw new Error('Rule needs a domain');
    // "com" or "co.uk" would match every site under that suffix.
    if (!domain.includes('.') || SHARED_SUFFIXES.includes(domain)) {
      throw new Error('Rule domain must be a full site name like example.com');
    }
    if (!field) throw new Error('Rule needs a field label');
    if (!key) throw new Error('Rule needs a profile key');
    const same = (r) => r.domain === domain && FM.words(r.field) === FM.words(field);
    return (rules || []).filter((r) => !same(r)).concat([{ domain, field, key }]);
  }

  function removeRule(rules, index) {
    return (rules || []).filter((_, i) => i !== index);
  }

  // Rules that apply to a host, most specific (longest) domain first.
  function rulesForHost(rules, host) {
    return (rules || []).filter((r) => domainMatches(r.domain, host))
      .sort((a, b) => b.domain.length - a.domain.length);
  }

  // Does the rule's field text point at this page field?
  function fieldMatches(ruleField, d) {
    const rf = String(ruleField || '').trim();
    const id = /^#(.+)$/.exec(rf);
    if (id) return String(d.id || '') === id[1];
    const nm = /^\[name=["']?([^"'\]]+)["']?\]$/.exec(rf);
    if (nm) return String(d.name || '') === nm[1];
    const w = FM.words(rf);
    if (!w) return false;
    return [d.label, d.name, d.id, d.placeholder].some((t) => FM.words(t) === w);
  }

  // Rule-first plan: {fills, ambiguous, skipped}. Fills carry source 'rule' or 'auto'.
  // A matching rule decides the field even when its key has no value (then skipped).
  function planWithRules(host, fields, profileFields, rules) {
    const applicable = rulesForHost(rules, host);
    const ruled = [];
    const rest = [];
    const plan = { fills: [], ambiguous: [], skipped: [] };
    (fields || []).forEach((d) => {
      const rule = applicable.find((r) => fieldMatches(r.field, d));
      const unsafe = rule && FM.skipReason(d);
      if (unsafe) plan.skipped.push({ field: d, reason: unsafe });
      else if (rule) ruled.push({ d, rule });
      else rest.push(d);
    });
    ruled.forEach(({ d, rule }) => {
      const value = (profileFields || {})[rule.key];
      if (typeof value === 'string' && value.trim() !== '') {
        plan.fills.push({ field: d, key: rule.key, value, confidence: 1, source: 'rule' });
      } else {
        plan.skipped.push({ field: d, reason: 'rule key has no value' });
      }
    });
    const auto = FM.planFill(rest, profileFields);
    auto.fills.forEach((f) => plan.fills.push(Object.assign({ source: 'auto' }, f)));
    plan.ambiguous.push(...auto.ambiguous);
    plan.skipped.push(...auto.skipped);
    return plan;
  }

  // Turns captured [{label, value}] into profile updates {key: value}.
  // Labels in a known synonym group share its name ("E-mail" -> "email"), so a
  // different site's "Email address" field finds the value. Blanks are dropped;
  // the first value for a repeated key wins.
  function captureToUpdates(pairs) {
    const out = {};
    (pairs || []).forEach((p) => {
      const value = p && typeof p.value === 'string' ? p.value.trim() : '';
      const label = p && p.label;
      if (!value || !FM.words(label)) return;
      const key = FM.groupFor(label) || FM.words(label);
      if (!(key in out)) out[key] = value;
    });
    return out;
  }

  const api = {
    normaliseDomain, domainMatches, addRule, removeRule, rulesForHost,
    fieldMatches, planWithRules, captureToUpdates,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.FerrywiseRules = api;
})();
