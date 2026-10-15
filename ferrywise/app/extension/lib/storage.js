'use strict';
// Storage adapter with an injectable backend.
// A backend has the same promise shape as chrome.storage.local:
//   get(keys) -> {key: value}, set({key: value}), remove(keys).
// Values are cloned through JSON so callers never share references with storage.

(function () {
  // In-memory backend, used by tests and as a fallback outside the browser.
  function createMemoryBackend() {
    const data = {};
    return {
      async get(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        const out = {};
        list.forEach((k) => {
          if (Object.prototype.hasOwnProperty.call(data, k)) out[k] = data[k];
        });
        return out;
      },
      async set(obj) {
        Object.keys(obj).forEach((k) => { data[k] = obj[k]; });
      },
      async remove(keys) {
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => { delete data[k]; });
      },
    };
  }

  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  // Wraps a backend in a small get/set/remove API with default values.
  function createStorage(backend) {
    if (!backend || typeof backend.get !== 'function' ||
        typeof backend.set !== 'function' || typeof backend.remove !== 'function') {
      throw new Error('Storage backend needs get, set and remove');
    }
    return {
      // Returns the stored value, or `fallback` when the key is missing.
      async get(key, fallback) {
        const res = await backend.get([key]);
        return Object.prototype.hasOwnProperty.call(res, key) ? clone(res[key]) : fallback;
      },
      async set(key, value) {
        await backend.set({ [key]: clone(value) });
      },
      async remove(key) {
        await backend.remove([key]);
      },
    };
  }

  const api = { createStorage, createMemoryBackend };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.FerrywiseStorage = api; // plain <script> use in the popup
})();
