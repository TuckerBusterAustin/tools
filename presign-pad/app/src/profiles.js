'use strict';
// Saved profiles: serialise and validate. Secrets are dropped unless the caller
// passes { includeSecrets: true } (the UI sets this only from an explicit checkbox).
(function (root) {
  // Fields that are secret. Both spellings of the secret key are covered.
  const SECRET_FIELDS = ['secretAccessKey', 'secretKey', 'sessionToken'];
  // Fields that may always be stored.
  const SAFE_FIELDS = ['name', 'method', 'host', 'path', 'query', 'region', 'service',
    'accessKeyId', 'headers', 'unsignedPayload', 'expires'];

  /** Copy only whitelisted fields; secret fields only when includeSecrets is true. */
  function stripSecrets(profile, opts) {
    const keep = SAFE_FIELDS.concat(opts && opts.includeSecrets === true ? SECRET_FIELDS : []);
    const out = {};
    const src = profile || {};
    for (const k of keep) if (src[k] !== undefined) out[k] = src[k];
    return out;
  }

  /** Returns an array of problems (empty when valid). */
  function validateProfile(p) {
    const errs = [];
    if (!p || typeof p !== 'object') return ['Profile must be an object.'];
    if (typeof p.name !== 'string' || !p.name.trim()) errs.push('Profile needs a name.');
    if (typeof p.region !== 'string' || !p.region.trim()) errs.push('Profile needs a region.');
    return errs;
  }

  /** JSON for storage. Throws a clear Error on an invalid profile. */
  function serialise(list, opts) {
    const clean = (list || []).map((p) => stripSecrets(p, opts));
    clean.forEach((p) => { const e = validateProfile(p); if (e.length) throw new Error(e[0]); });
    return JSON.stringify(clean);
  }

  /** Parse stored JSON; bad data gives []. Secrets are stripped again unless opted in. */
  function parse(text, opts) {
    try {
      const j = JSON.parse(text);
      return Array.isArray(j)
        ? j.map((p) => stripSecrets(p, opts)).filter((p) => !validateProfile(p).length) : [];
    } catch (e) { return []; }
  }

  // ---- Storage-backed API (storage is anything with getItem/setItem) ----
  const STORAGE_KEY = 'presign-pad.profiles';
  const REGION_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  /** Problems with a name or region (empty array when fine). */
  function checkNameRegion(p) {
    const errs = [];
    const name = p && typeof p.name === 'string' ? p.name.trim() : '';
    if (!name) errs.push('Profile needs a name.');
    else if (name.length > 64 || /[\u0000-\u001f]/.test(name)) errs.push('Profile name must be 1-64 printable characters.');
    if (!p || typeof p.region !== 'string' || !REGION_RE.test(p.region)) errs.push('Region must look like us-east-1.');
    return errs;
  }

  /** Read all profiles; corrupt or missing data gives []. Secrets present only if persisted. */
  function list(storage) {
    let text = null;
    try { text = storage.getItem(STORAGE_KEY); } catch (e) { return []; }
    return parse(text, { includeSecrets: true });
  }

  /** Find one profile by name, or null. */
  function get(storage, name) {
    return list(storage).find((p) => p.name === name) || null;
  }

  /**
   * Save a profile. opts.persistSecret === true keeps secrets; opts.overwrite === true
   * replaces an existing profile of the same name. Throws on invalid input or duplicate.
   */
  function save(storage, profile, opts) {
    const o = opts || {};
    const errs = checkNameRegion(profile);
    if (errs.length) throw new Error(errs[0]);
    const clean = stripSecrets(profile, { includeSecrets: o.persistSecret === true });
    clean.name = clean.name.trim();
    const all = list(storage);
    const i = all.findIndex((p) => p.name === clean.name);
    if (i >= 0 && o.overwrite !== true) throw new Error('A profile named "' + clean.name + '" already exists.');
    if (i >= 0) all[i] = clean; else all.push(clean);
    storage.setItem(STORAGE_KEY, serialise(all, { includeSecrets: true }));
    return clean;
  }

  /** Delete by name; returns true if something was removed. */
  function remove(storage, name) {
    const all = list(storage);
    const next = all.filter((p) => p.name !== name);
    if (next.length === all.length) return false;
    storage.setItem(STORAGE_KEY, serialise(next, { includeSecrets: true }));
    return true;
  }

  const api = {
    STORAGE_KEY, save, list, get, remove,
    SECRET_FIELDS, stripSecrets, validateProfile, serialise, parse,
    serialiseProfiles: serialise, parseProfiles: parse, // older names
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PresignProfiles = api;
})(typeof self !== 'undefined' ? self : this);
