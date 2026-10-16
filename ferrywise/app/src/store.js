'use strict';
// Record store over a storage object with getItem/setItem (localStorage or a fake).

(function () {
const PREFIX = 'ferrywise:';

function createStore(storage, opts) {
  const now = (opts && opts.now) || (() => new Date().toISOString());
  let counter = 0;

  function read(kind) {
    const raw = storage.getItem(PREFIX + kind);
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return []; // corrupt data is treated as empty
    }
  }

  function write(kind, records) {
    storage.setItem(PREFIX + kind, JSON.stringify(records));
  }

  function newId() {
    counter += 1;
    return Date.now().toString(36) + '-' + counter + '-' + Math.random().toString(36).slice(2, 8);
  }

  // Adds a record with a timestamp (and an id if absent); returns the stored record.
  function addRecord(kind, obj) {
    const rec = Object.assign({}, obj);
    if (!rec.id) rec.id = newId();
    rec.timestamp = now();
    const all = read(kind);
    all.push(rec);
    write(kind, all);
    return rec;
  }

  function list(kind) {
    return read(kind);
  }

  // Index of kinds is kept so export knows what to include.
  function kinds() {
    const raw = storage.getItem(PREFIX + '__kinds');
    try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  }
  function trackKind(kind) {
    const k = kinds();
    if (!k.includes(kind)) { k.push(kind); storage.setItem(PREFIX + '__kinds', JSON.stringify(k)); }
  }

  const baseAdd = addRecord;
  function addTracked(kind, obj) {
    trackKind(kind);
    return baseAdd(kind, obj);
  }

  function exportJSON() {
    const data = {};
    kinds().forEach((k) => { data[k] = read(k); });
    return JSON.stringify({ version: 1, data }, null, 2);
  }

  // Merges by id; existing records win. Returns number of records added.
  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed.data !== 'object' || parsed.data === null) {
      throw new Error('Invalid export: missing data');
    }
    let added = 0;
    Object.keys(parsed.data).forEach((kind) => {
      const incoming = parsed.data[kind];
      if (!Array.isArray(incoming)) return;
      trackKind(kind);
      const existing = read(kind);
      const ids = new Set(existing.map((r) => r.id));
      incoming.forEach((r) => {
        if (r && r.id && !ids.has(r.id)) {
          ids.add(r.id);
          existing.push(r);
          added += 1;
        }
      });
      write(kind, existing);
    });
    return added;
  }

  // Removes the record with this id; returns true if one was removed.
  function remove(kind, id) {
    const all = read(kind);
    const rest = all.filter((r) => r.id !== id);
    if (rest.length === all.length) return false;
    write(kind, rest);
    return true;
  }

  return { addRecord: addTracked, list, remove, exportJSON, importJSON };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createStore };
else window.FerrywiseStore = { createStore }; // plain <script> use in the browser
})();
