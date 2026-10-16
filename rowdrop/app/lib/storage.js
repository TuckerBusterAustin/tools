(function () { // IIFE: keeps names out of the shared browser global scope
'use strict';
// Storage (CommonJS) over an injected localStorage-like object (getItem/setItem/removeItem).

const PREFIX = 'rowdrop.';
const COLLECTIONS = ['jobs', 'sources', 'runs']; // stored as arrays
const DEFAULT_SETTINGS = { alertEmail: '', timeZone: '' };

function createStorage(backend) {
  function read(name, fallback) {
    let raw = null;
    try { raw = backend.getItem(PREFIX + name); } catch (e) { return fallback; }
    if (raw == null) return fallback;
    try {
      const v = JSON.parse(raw);
      return Array.isArray(fallback) === Array.isArray(v) && v !== null ? v : fallback;
    } catch (e) { return fallback; }
  }
  function write(name, value) { backend.setItem(PREFIX + name, JSON.stringify(value)); }

  const api = {
    loadJobs: function () { return read('jobs', []); },
    saveJobs: function (v) { write('jobs', v); },
    loadSources: function () { return read('sources', []); },
    saveSources: function (v) { write('sources', v); },
    loadRuns: function () { return read('runs', []); },
    saveRuns: function (v) { write('runs', v); },
    loadSettings: function () { return Object.assign({}, DEFAULT_SETTINGS, read('settings', {})); },
    saveSettings: function (v) { write('settings', v); },

    /** Remove every Rowdrop key. */
    clearAll: function () {
      COLLECTIONS.concat(['settings']).forEach(function (n) { backend.removeItem(PREFIX + n); });
    },

    /** JSON backup text of everything. */
    exportJson: function () {
      return JSON.stringify({
        app: 'rowdrop', version: 1,
        jobs: api.loadJobs(), sources: api.loadSources(), runs: api.loadRuns(), settings: api.loadSettings()
      }, null, 2);
    },

    /**
     * Restore from backup text. Validates everything first; on any problem nothing is written.
     * Returns { ok: true } or { ok: false, error }.
     */
    importJson: function (text) {
      let data;
      try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'That file is not valid JSON. Your data is unchanged.' }; }
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.app !== 'rowdrop') {
        return { ok: false, error: 'That file is not a Rowdrop backup. Your data is unchanged.' };
      }
      for (const n of COLLECTIONS) {
        if (!Array.isArray(data[n])) return { ok: false, error: 'Backup is missing "' + n + '". Your data is unchanged.' };
      }
      if (data.settings !== undefined && (data.settings === null || typeof data.settings !== 'object' || Array.isArray(data.settings))) {
        return { ok: false, error: 'Backup settings are not valid. Your data is unchanged.' };
      }
      const bad = data.jobs.find(function (j) { return !j || typeof j !== 'object' || typeof j.id !== 'string' || typeof j.name !== 'string'; });
      if (bad !== undefined) return { ok: false, error: 'Backup contains an export without an id or name. Your data is unchanged.' };
      api.saveJobs(data.jobs);
      api.saveSources(data.sources);
      api.saveRuns(data.runs);
      api.saveSettings(data.settings || {});
      return { ok: true };
    }
  };
  return api;
}

module.exports = { createStorage, DEFAULT_SETTINGS };
})();
