'use strict';
// Pure profile logic. State shape: { profiles: [{id, name, fields: {key: value}}], activeId }.
// Every function returns a new state and never mutates its input.

(function () {
  const FORMAT = 'ferrywise-backup';
  const VERSION = 1;

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  function emptyState() {
    return { profiles: [], activeId: null };
  }

  // Next id is "p" + one more than the highest existing number, so ids are stable and unique.
  function nextId(state) {
    let max = 0;
    state.profiles.forEach((p) => {
      const m = /^p(\d+)$/.exec(p.id);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return 'p' + (max + 1);
  }

  // Keeps only non-empty string keys with string values (trimmed).
  function cleanFields(fields) {
    const out = {};
    Object.keys(fields || {}).forEach((k) => {
      const key = String(k).trim();
      const val = fields[k];
      if (key && typeof val === 'string' && val.trim() !== '') out[key] = val.trim();
    });
    return out;
  }

  function requireName(name) {
    if (typeof name !== 'string' || !name.trim()) throw new Error('Profile name is required');
    return name.trim();
  }

  function findIndex(state, id) {
    const i = state.profiles.findIndex((p) => p.id === id);
    if (i < 0) throw new Error('No such profile: ' + id);
    return i;
  }

  // Adds a profile; the first profile becomes the active one.
  function createProfile(state, name, fields) {
    const next = clone(state);
    const id = nextId(next);
    next.profiles.push({ id, name: requireName(name), fields: cleanFields(fields) });
    if (!next.activeId) next.activeId = id;
    return next;
  }

  // Changes name and/or fields. `fields`, when given, replaces the old fields.
  function updateProfile(state, id, changes) {
    const next = clone(state);
    const p = next.profiles[findIndex(next, id)];
    if (changes && changes.name !== undefined) p.name = requireName(changes.name);
    if (changes && changes.fields !== undefined) p.fields = cleanFields(changes.fields);
    return next;
  }

  // Removes a profile; if it was active, the first remaining one takes over.
  function deleteProfile(state, id) {
    const next = clone(state);
    next.profiles.splice(findIndex(next, id), 1);
    if (next.activeId === id) next.activeId = next.profiles.length ? next.profiles[0].id : null;
    return next;
  }

  function setActive(state, id) {
    findIndex(state, id);
    const next = clone(state);
    next.activeId = id;
    return next;
  }

  function getActive(state) {
    return state.profiles.find((p) => p.id === state.activeId) || null;
  }

  // Merges captured {key: value} into a profile. Existing values are overwritten
  // by captured ones; blank captured values are ignored. Returns {state, saved}.
  function mergeCaptured(state, id, captured) {
    const clean = cleanFields(captured);
    const next = clone(state);
    const p = next.profiles[findIndex(next, id)];
    Object.assign(p.fields, clean);
    return { state: next, saved: Object.keys(clean).length };
  }

  // Serialises state (plus optional extras such as rules) to a JSON string.
  function exportJson(state, extra) {
    const doc = Object.assign({}, extra || {}, {
      format: FORMAT,
      version: VERSION,
      profiles: clone(state.profiles),
      activeId: state.activeId,
    });
    return JSON.stringify(doc, null, 2);
  }

  // Parses and validates a backup. Returns {ok:true, state, extra} or {ok:false, error}.
  function importJson(text) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) { return { ok: false, error: 'Not valid JSON' }; }
    if (!isObj(doc) || doc.format !== FORMAT) return { ok: false, error: 'Not a Ferrywise backup' };
    if (doc.version !== VERSION) return { ok: false, error: 'Unsupported backup version' };
    if (!Array.isArray(doc.profiles)) return { ok: false, error: 'Profiles must be a list' };
    const seen = new Set();
    const profiles = [];
    for (const p of doc.profiles) {
      if (!isObj(p)) return { ok: false, error: 'Each profile must be an object' };
      if (typeof p.id !== 'string' || !p.id || seen.has(p.id)) return { ok: false, error: 'Profile ids must be unique text' };
      if (typeof p.name !== 'string' || !p.name.trim()) return { ok: false, error: 'Each profile needs a name' };
      if (!isObj(p.fields)) return { ok: false, error: 'Profile fields must be an object' };
      for (const k of Object.keys(p.fields)) {
        if (typeof p.fields[k] !== 'string') return { ok: false, error: 'Field values must be text' };
      }
      seen.add(p.id);
      profiles.push({ id: p.id, name: p.name, fields: Object.assign({}, p.fields) });
    }
    let activeId = typeof doc.activeId === 'string' && seen.has(doc.activeId) ? doc.activeId : null;
    if (!activeId && profiles.length) activeId = profiles[0].id;
    const extra = {};
    Object.keys(doc).forEach((k) => {
      if (!['format', 'version', 'profiles', 'activeId'].includes(k)) extra[k] = doc[k];
    });
    return { ok: true, state: { profiles, activeId }, extra };
  }

  const api = {
    emptyState, createProfile, updateProfile, deleteProfile, setActive, getActive,
    mergeCaptured, exportJson, importJson,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.FerrywiseProfiles = api;
})();
