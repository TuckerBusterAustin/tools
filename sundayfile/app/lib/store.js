/* Client and file storage over an injected storage object (getItem/setItem).
   All data lives under one key as { version, clients: [], files: { [clientId]: { [type]: file } } }.
   UMD-style so that, as a classic script, it adds only window.VSStore to the shared scope. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VSStore = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var KEY = 'sundayfile:v1';
  var CORRUPT_KEY = KEY + ':corrupt';
  // Same types as VSSchema.TYPES (kept local so this file has no dependencies).
  var FILE_TYPES = ['hubspot_contacts', 'hubspot_deals', 'trello_cards'];

  /** Free plan gets 1 client workspace, Pro gets 5. */
  function maxClients(isPro) {
    return isPro ? 5 : 1;
  }

  class LimitError extends Error {
    constructor(limit) {
      super('Your plan covers ' + limit + ' client workspace' + (limit === 1 ? '' : 's') +
        '. Remove one to add another.');
      this.name = 'LimitError';
      this.limit = limit;
    }
  }

  var DUE_DAYS = 7;

  /**
   * Pure: 'never' (no date or unreadable), 'ok' (under 7 days) or 'due' (7 days or more).
   * A date in the future counts as 'ok'.
   */
  function dueStatus(lastExportedISO, nowISO) {
    if (!lastExportedISO) return 'never';
    var last = Date.parse(lastExportedISO);
    var now = Date.parse(nowISO);
    if (isNaN(last) || isNaN(now)) return 'never';
    return now - last >= DUE_DAYS * 24 * 3600 * 1000 ? 'due' : 'ok';
  }

  function emptyData() {
    return { version: 1, clients: [], files: {} };
  }

  var isObj = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };

  // Check the shape of a parsed backup; returns a clean copy or throws.
  function validate(data) {
    var ok = isObj(data) && Array.isArray(data.clients) && isObj(data.files) &&
      data.clients.every(function (c) { return c && typeof c.id === 'string' && typeof c.name === 'string'; });
    if (ok) {
      var ids = data.clients.map(function (c) { return c.id; });
      // Every file must belong to a known client, have a known type and a rows array.
      ok = Object.keys(data.files).every(function (cid) {
        var byType = data.files[cid];
        return ids.indexOf(cid) >= 0 && isObj(byType) && Object.keys(byType).every(function (t) {
          var f = byType[t];
          return isObj(f) && FILE_TYPES.indexOf(f.type) >= 0 && f.type === t && Array.isArray(f.rows);
        });
      });
    }
    if (!ok) throw new Error('This is not a Sundayfile backup.');
    return { version: 1, clients: data.clients, files: data.files };
  }

  function createStore(storage) {
    // Corrupt stored data is copied aside (once) so a later save cannot destroy it.
    function load() {
      var raw = storage.getItem(KEY);
      if (!raw) return emptyData();
      try {
        return validate(JSON.parse(raw));
      } catch (e) {
        if (!storage.getItem(CORRUPT_KEY)) storage.setItem(CORRUPT_KEY, raw);
        return emptyData();
      }
    }
    var save = function (data) { storage.setItem(KEY, JSON.stringify(data)); };
    // True when unreadable data was set aside; the UI uses this to show a notice.
    var hasCorruptBackup = function () { return !!storage.getItem(CORRUPT_KEY); };

    function addClient(name, note, limit) {
      var clean = String(name || '').trim();
      if (!clean) throw new Error('Enter a client name.');
      var data = load();
      if (typeof limit === 'number' && data.clients.length >= limit) throw new LimitError(limit);
      var n = data.clients.reduce(function (m, c) { return Math.max(m, parseInt(c.id.slice(1), 10) || 0); }, 0) + 1;
      var client = { id: 'c' + n, name: clean, note: String(note || ''), exported: {} };
      data.clients.push(client);
      save(data);
      return client;
    }

    var listClients = function () { return load().clients; };
    var getClient = function (id) { return load().clients.find(function (c) { return c.id === id; }) || null; };

    function deleteClient(id) {
      var data = load();
      var before = data.clients.length;
      data.clients = data.clients.filter(function (c) { return c.id !== id; });
      delete data.files[id];
      save(data);
      return data.clients.length < before;
    }

    // Keeps one file per type per client: a new import replaces the old one.
    function saveFile(clientId, type, rows, importedAt) {
      var data = load();
      if (!data.clients.some(function (c) { return c.id === clientId; })) throw new Error('Client not found.');
      var file = { type: type, rows: rows, importedAt: importedAt || new Date().toISOString() };
      data.files[clientId] = data.files[clientId] || {};
      data.files[clientId][type] = file;
      save(data);
      return file;
    }

    var getFiles = function (clientId) { return Object.values(load().files[clientId] || {}); };

    function markExported(clientId, type, date) {
      var data = load();
      var client = data.clients.find(function (c) { return c.id === clientId; });
      if (!client) throw new Error('Client not found.');
      client.exported = client.exported || {};
      client.exported[type] = date || new Date().toISOString();
      save(data);
      return client;
    }

    var exportBackup = function () { return JSON.stringify(load()); };

    // Parse and validate first; storage is only touched when everything is valid.
    function importBackup(json) {
      var parsed;
      try {
        parsed = JSON.parse(json);
      } catch (e) {
        throw new Error('That file is not valid JSON.');
      }
      save(validate(parsed));
    }

    var clearAll = function () { save(emptyData()); };

    return { addClient: addClient, listClients: listClients, getClient: getClient, deleteClient: deleteClient,
      saveFile: saveFile, getFiles: getFiles, markExported: markExported, exportBackup: exportBackup,
      importBackup: importBackup, clearAll: clearAll, hasCorruptBackup: hasCorruptBackup };
  }

  return { createStore: createStore, maxClients: maxClients, dueStatus: dueStatus, LimitError: LimitError,
    KEY: KEY, CORRUPT_KEY: CORRUPT_KEY, FILE_TYPES: FILE_TYPES };
});
