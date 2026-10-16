/* Import and download logic for one CSV file. Keeps app.js free of parsing and mapping.
   UMD-style: CommonJS in node, window.VSImporter in the browser (needs VSCsv and VSSchema). */
(function (root, factory) {
  var csv = typeof module === 'object' && module.exports ? require('./csv') : root.VSCsv;
  var schema = typeof module === 'object' && module.exports ? require('./schema') : root.VSSchema;
  var api = factory(csv, schema);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VSImporter = api;
})(typeof window !== 'undefined' ? window : this, function (csv, schema) {
  'use strict';

  var PREVIEW_ROWS = 20;
  var LABELS = {
    hubspot_contacts: 'HubSpot contacts',
    hubspot_deals: 'HubSpot deals',
    trello_cards: 'Trello cards'
  };

  /* prepareImport(text, forcedType?) -> one of
       { error }                       unusable file (empty, header only, nothing matched)
       { needsType: true, error }      headers not recognised: ask the user to pick a type
       { type, rows, preview, columns } ready to preview and save */
  function prepareImport(text, forcedType, clientName) {
    if (!String(text == null ? '' : text).trim()) {
      return { error: 'This file is empty. Choose a CSV export that has a header row and data.' };
    }
    var table = csv.parseCsv(text);
    if (table.unterminated) {
      return { error: 'This file has an unclosed quote, so it cannot be read safely. Export it again from the tool.' };
    }
    // Drop blank lines anywhere in the file (every cell empty), keeping the header first.
    table = table.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
    if (table.length < 2) {
      return { error: 'This file has a header row but no data rows. Export again with records included.' };
    }
    if (forcedType && schema.TYPES.indexOf(forcedType) < 0) {
      return { error: 'Unknown file type. Choose HubSpot contacts, HubSpot deals or Trello cards.' };
    }
    var type = forcedType || schema.detectType(table[0]);
    if (!type) {
      return { needsType: true, error: 'We could not tell what kind of export this is from its column headers. Choose the type below.' };
    }
    var rows = schema.normalizeRows(type, table);
    var anyData = rows.some(function (r) {
      return schema.COLUMNS[type].some(function (c) { return r[c] !== ''; });
    });
    if (!anyData) {
      return { needsType: true, error: 'None of the column headers match ' + LABELS[type] +
        '. Check the type below, or export again from the tool.' };
    }
    // rows keep the per-type fields (stored as is); preview shows the delivered unified layout.
    return { type: type, rows: rows, columns: schema.UNIFIED,
      preview: schema.toUnified(type, rows.slice(0, PREVIEW_ROWS), clientName) };
  }

  /* Lowercase, hyphen-separated, safe for a file name. */
  function slug(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client';
  }

  /* Local-time YYYY-MM-DD. */
  function dateStamp(d) {
    d = d || new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* buildDownload(clientName, file, date?) -> { filename, content }.
     filename is client-type-YYYY-MM-DD.csv, e.g. acme-co-hubspot-contacts-2026-10-15.csv;
     content uses the unified columns shown on the landing page. */
  /* Neutralise spreadsheet formulas: a cell starting with = + - @ or tab/CR gets a leading quote. */
  function safeCell(v) {
    var s = v == null ? '' : String(v);
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  }

  /* The UNIFIED layout is the column promise made on the landing page; per-type fields
     (email, amount, ...) are kept in storage only and are not delivered. */
  function buildDownload(clientName, file, date) {
    var unified = schema.toUnified(file.type, file.rows, clientName).map(function (r) {
      var out = {};
      schema.UNIFIED.forEach(function (c) { out[c] = safeCell(r[c]); });
      return out;
    });
    return {
      filename: slug(clientName) + '-' + schema.FILE_SLUGS[file.type] + '-' + dateStamp(date) + '.csv',
      content: csv.toCsv(unified, schema.UNIFIED)
    };
  }

  return { prepareImport: prepareImport, buildDownload: buildDownload, slug: slug, dateStamp: dateStamp,
    LABELS: LABELS, PREVIEW_ROWS: PREVIEW_ROWS };
});
