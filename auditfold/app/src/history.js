/* History: last 50 audits, newest first, in a storage-like object
 * (anything with getItem/setItem/removeItem, e.g. localStorage).
 *   list(storage) -> array (empty on missing/corrupt data or storage errors)
 *   save(storage, entry) -> {ok, list, id, dropped}; adds an id if missing
 *   get(storage, id) -> entry or null; remove(storage, id) -> boolean
 *   add(storage, entry) -> {ok, list}; ok is false if storage refused the write
 *   clear(storage) -> boolean
 * Works in Node (require) and in the browser (window.AuditfoldHistory). */
(function (root) {
  'use strict';

  var KEY = 'auditfold.history.v1';
  var MAX = 50;

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

  /** Save an entry (newest first, cap MAX). Returns {ok, list, dropped, id};
   *  dropped is true when the oldest entry was removed to stay within the cap. */
  function save(storage, entry) {
    var e = Object.assign({}, entry);
    if (e.id == null) e.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var before = list(storage).length;
    var r = add(storage, e);
    return { ok: r.ok, list: r.list, id: e.id, dropped: r.ok && before >= MAX };
  }

  /** Find one saved entry by id, or null. */
  function get(storage, id) {
    var l = list(storage);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }

  function clear(storage) {
    try { storage.removeItem(KEY); return true; } catch (e) { return false; }
  }

  /** Remove the entry with this id. Returns true on success. */
  function remove(storage, id) {
    try {
      storage.setItem(KEY, JSON.stringify(list(storage).filter(function (e) { return e.id !== id; })));
      return true;
    } catch (e) { return false; }
  }

  var api = { KEY: KEY, MAX: MAX, list: list, add: add, save: save, get: get, remove: remove, clear: clear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditfoldHistory = api;
})(typeof self !== 'undefined' ? self : this);
