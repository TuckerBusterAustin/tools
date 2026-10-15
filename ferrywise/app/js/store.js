'use strict';
// Shared v3 store: one versioned JSON document in a localStorage-like object.
// Shape: { version: 1, collections: { name: [records with id] }, settings: { key: value } }
// No browser globals are used; pass in any object with getItem/setItem.

(function () {
const VERSION = 1;
const KEY = 'ferrywise.v3'; // distinct from the v2 'ferrywise:' keys

// In-memory stand-in for localStorage, used by tests.
function createMemoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function emptyDoc() {
  return { version: VERSION, collections: {}, settings: {} };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Checks a parsed document; throws a plain Error if it is not Ferrywise data v1.
function validateDoc(doc) {
  if (!isObj(doc)) throw new Error('Not Ferrywise data');
  if (doc.version !== VERSION) throw new Error('Unsupported version');
  if (!isObj(doc.collections)) throw new Error('Missing collections');
  if (doc.settings !== undefined && !isObj(doc.settings)) throw new Error('Bad settings');
  Object.keys(doc.collections).forEach((name) => {
    const arr = doc.collections[name];
    if (!Array.isArray(arr)) throw new Error('Bad collection: ' + name);
    arr.forEach((r) => {
      if (!isObj(r) || typeof r.id !== 'string' || !r.id) throw new Error('Record without id in ' + name);
    });
  });
  return doc;
}

function createStore(storage) {
  let counter = 0;

  // Reads the document; corrupt or foreign data reads as empty (never throws).
  function load() {
    let raw = null;
    try { raw = storage.getItem(KEY); } catch (e) { return emptyDoc(); }
    if (!raw) return emptyDoc();
    try {
      const doc = validateDoc(JSON.parse(raw));
      return { version: VERSION, collections: doc.collections, settings: doc.settings || {} };
    } catch (e) {
      return emptyDoc();
    }
  }

  // Single write; throws if storage is full or blocked, leaving old data intact.
  function save(doc) {
    storage.setItem(KEY, JSON.stringify(doc));
  }

  function newId() {
    counter += 1;
    return Date.now().toString(36) + '-' + counter + '-' + Math.random().toString(36).slice(2, 8);
  }

  const get = (key, fallback) => {
    const s = load().settings;
    return Object.prototype.hasOwnProperty.call(s, key) ? s[key] : fallback;
  };

  function set(key, value) {
    const doc = load();
    doc.settings[key] = value;
    save(doc);
    return value;
  }

  const list = (name) => (load().collections[name] || []).slice();

  // Appends a record (id assigned if missing). A repeated id replaces nothing and is returned as null.
  function add(name, record) {
    const doc = load();
    const arr = doc.collections[name] || (doc.collections[name] = []);
    const rec = Object.assign({}, record);
    if (!rec.id) rec.id = newId();
    if (arr.some((r) => r.id === rec.id)) return null;
    arr.push(rec);
    save(doc);
    return rec;
  }

  // Replaces a whole collection (used by modules that edit records in place).
  function replaceAll(name, records) {
    const doc = load();
    doc.collections[name] = records.slice();
    save(doc);
  }

  const exportAll = () => JSON.parse(JSON.stringify(load()));

  // Merges exported JSON text. Existing records and settings win; duplicates are skipped.
  // Returns { added: {name: n}, skipped: n }. Throws before writing anything if invalid.
  function importMerge(json) {
    let incoming;
    try { incoming = JSON.parse(json); } catch (e) { throw new Error('Not valid JSON'); }
    validateDoc(incoming);
    const doc = load();
    const added = {};
    let skipped = 0;
    Object.keys(incoming.collections).forEach((name) => {
      const arr = doc.collections[name] || (doc.collections[name] = []);
      const ids = new Set(arr.map((r) => r.id));
      added[name] = 0;
      incoming.collections[name].forEach((r) => {
        if (ids.has(r.id)) { skipped += 1; return; }
        ids.add(r.id);
        arr.push(r);
        added[name] += 1;
      });
    });
    Object.keys(incoming.settings || {}).forEach((k) => {
      if (!Object.prototype.hasOwnProperty.call(doc.settings, k)) doc.settings[k] = incoming.settings[k];
    });
    save(doc);
    return { added, skipped };
  }

  return { get, set, list, add, replaceAll, exportAll, importMerge };
}

const api = { VERSION, KEY, createStore, createMemoryStorage };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.FerrywiseV3Store = api; // plain <script> use in the browser
})();
