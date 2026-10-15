/* Pure logic: pick, validate and persist the headline variant ('a' or 'b').
 * Works as a <script> (global RollwellVariant) and under Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RollwellVariant = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VARIANTS = ['a', 'b'];

  function isVariant(v) {
    return typeof v === 'string' && VARIANTS.indexOf(v) !== -1;
  }

  /* Reads ?v=a or ?v=b (case-insensitive) from a query string.
   * Returns 'a', 'b' or null when missing or invalid. */
  function parseOverride(search) {
    if (typeof search !== 'string') return null;
    var query = search.charAt(0) === '?' ? search.slice(1) : search;
    var parts = query.split('&');
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (eq === -1) continue;
      if (parts[i].slice(0, eq) !== 'v') continue;
      var value = parts[i].slice(eq + 1).toLowerCase();
      return isVariant(value) ? value : null;
    }
    return null;
  }

  /* random is a number in [0, 1). Below 0.5 gives 'a', otherwise 'b'. */
  function pickVariant(random) {
    return random < 0.5 ? 'a' : 'b';
  }

  /* Order: URL override, stored value, new random pick (which is stored).
   * An override is also stored so the visitor keeps seeing it.
   * Blocked storage never throws: the variant is just not remembered.
   * random is a function returning [0, 1) (default Math.random). */
  function getVariant(storage, random, search, prefix) {
    var key = (prefix == null ? 'rollwell:' : String(prefix)) + 'variant';
    var rand = typeof random === 'function' ? random : Math.random;

    function save(v) {
      try { storage.setItem(key, v); } catch (e) { /* not remembered */ }
      return v;
    }

    var override = parseOverride(search);
    if (override) return save(override);

    var stored = null;
    try { stored = storage.getItem(key); } catch (e) { stored = null; }
    if (isVariant(stored)) return stored;

    return save(pickVariant(rand()));
  }

  return {
    VARIANTS: VARIANTS,
    parseOverride: parseOverride,
    pickVariant: pickVariant,
    getVariant: getVariant
  };
});
