/*
 * Lapsewatch saved domain list. Storage is injected (anything with
 * getItem/setItem, e.g. window.localStorage or a test stub).
 * UMD-style: module.exports in Node, window.LWStore in the browser
 * (needs window.LWDomains loaded first).
 *
 * An entry is { domain: 'clientsite.com', expires: '2026-12-01' }.
 * Every change returns { ok, list, error?, code? }. Nothing here throws.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./domains.js'));
  else root.LWStore = factory(root.LWDomains);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  var KEY = 'lapsewatch.domains';
  var FREE_LIMIT = 5;
  var PRO_LIMIT = 100;

  function limitFor(isPro) { return isPro ? PRO_LIMIT : FREE_LIMIT; }

  // Date -> 'YYYY-MM-DD' (UTC)
  function toIso(d) { return d.toISOString().slice(0, 10); }

  // Check one entry. Returns { entry } or { error }.
  function clean(domain, expires) {
    var v = D.validateDomain(domain);
    if (!v.valid) return { error: v.error };
    var d = D.parseDate(typeof expires === 'string' ? expires : '');
    if (!d) return { error: "Date isn't valid. Use YYYY-MM-DD, like 2026-12-01" };
    return { entry: { domain: v.domain, expires: toIso(d) } };
  }

  function createStore(storage, key) {
    var k = key || KEY;

    // Read the list. Missing, corrupt or wrongly shaped data gives [].
    function load() {
      var raw;
      try { raw = storage.getItem(k); } catch (e) { return []; }
      if (!raw) return [];
      var data;
      try { data = JSON.parse(raw); } catch (e) { return []; }
      if (!Array.isArray(data)) return [];
      var seen = {}, out = [];
      data.forEach(function (x) {
        if (!x || typeof x !== 'object') return;
        var c = clean(x.domain, x.expires);
        if (c.error || seen[c.entry.domain]) return;
        seen[c.entry.domain] = true;
        out.push(c.entry);
      });
      return out;
    }

    function save(list) {
      try { storage.setItem(k, JSON.stringify(list)); return true; } catch (e) { return false; }
    }

    function fail(list, code, error) { return { ok: false, list: list, code: code, error: error }; }

    // Save and report; a storage failure (private mode, full) is an error.
    function commit(list) {
      return save(list) ? { ok: true, list: list }
        : fail(load(), 'storage', "Your browser wouldn't save the list. Check that it allows site storage, then try again.");
    }

    function indexOf(list, domain) {
      for (var i = 0; i < list.length; i++) if (list[i].domain === domain) return i;
      return -1;
    }

    function add(domain, expires, isPro) {
      var list = load();
      var c = clean(domain, expires);
      if (c.error) return fail(list, 'invalid', c.error);
      if (indexOf(list, c.entry.domain) > -1) {
        return fail(list, 'duplicate', c.entry.domain + ' is already in your list.');
      }
      if (list.length >= limitFor(isPro)) {
        return fail(list, 'limit', isPro
          ? 'Your list is full at ' + PRO_LIMIT + ' domains. Remove one to add another.'
          : 'The free list holds ' + FREE_LIMIT + ' domains. Unlock with Pro for up to ' + PRO_LIMIT + ' domains.');
      }
      list.push(c.entry);
      return commit(list);
    }

    // Change one entry, found by its current domain name.
    function update(oldDomain, domain, expires) {
      var list = load();
      var old = D.validateDomain(oldDomain).domain;
      var i = indexOf(list, old);
      if (i < 0) return fail(list, 'missing', "That domain isn't in your list any more.");
      var c = clean(domain, expires);
      if (c.error) return fail(list, 'invalid', c.error);
      var j = indexOf(list, c.entry.domain);
      if (j > -1 && j !== i) return fail(list, 'duplicate', c.entry.domain + ' is already in your list.');
      list[i] = c.entry;
      return commit(list);
    }

    function remove(domain) {
      var list = load();
      var i = indexOf(list, D.validateDomain(domain).domain);
      if (i < 0) return fail(list, 'missing', "That domain isn't in your list any more.");
      list.splice(i, 1);
      return commit(list);
    }

    return { load: load, add: add, update: update, remove: remove };
  }

  return { createStore: createStore, limitFor: limitFor, KEY: KEY, FREE_LIMIT: FREE_LIMIT, PRO_LIMIT: PRO_LIMIT };
});
