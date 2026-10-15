/* History: last 20 audits, newest first, in a storage-like object
 * (anything with getItem/setItem/removeItem, e.g. localStorage).
 *   list(storage) -> array (empty on missing/corrupt data or storage errors)
 *   add(storage, entry) -> {ok, list}; ok is false if storage refused the write
 *   clear(storage) -> boolean
 * Works in Node (require) and in the browser (window.AuditfoldHistory). */
(function (root) {
  'use strict';

  var KEY = 'auditfold.history.v1';
  var MAX = 20;

  /** Read the saved list. Anything unexpected becomes an empty list. */
  function list(storage) {
    try {
      var data = JSON.parse(storage.getItem(KEY));
      if (!Array.isArray(data)) return [];
      return data.filter(function (e) { return e && typeof e === 'object'; }).slice(0, MAX);
    } catch (e) {
      return [];
    }
  }

  /** Put entry first, keep only the newest MAX. */
  function add(storage, entry) {
    var next = [entry].concat(list(storage)).slice(0, MAX);
    try {
      storage.setItem(KEY, JSON.stringify(next));
      return { ok: true, list: next };
    } catch (e) {
      return { ok: false, list: next };
    }
  }

  function clear(storage) {
    try { storage.removeItem(KEY); return true; } catch (e) { return false; }
  }

  var api = { KEY: KEY, MAX: MAX, list: list, add: add, clear: clear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditfoldHistory = api;
})(typeof self !== 'undefined' ? self : this);
