/* Fixed output columns, header aliases, type detection and row normalising.
   UMD-style: CommonJS in node, window.VSSchema in the browser.
   NOTE: alias names are assumed common export headers, not verified against live exports. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VSSchema = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var TYPES = ['hubspot_contacts', 'hubspot_deals', 'trello_cards'];

  /* The fixed output columns, in the fixed order. */
  var COLUMNS = {
    hubspot_contacts: ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'lifecycle_stage', 'owner', 'created_at', 'updated_at'],
    hubspot_deals: ['deal_name', 'amount', 'stage', 'pipeline', 'close_date', 'owner', 'company', 'created_at', 'updated_at'],
    trello_cards: ['card_name', 'list', 'board', 'labels', 'members', 'due_date', 'description', 'url']
  };

  /* Aliases per type and column. Written in readable form; matched after simplify(). */
  var ALIASES = {
    hubspot_contacts: {
      first_name: ['First Name', 'Firstname'],
      last_name: ['Last Name', 'Lastname', 'Surname'],
      email: ['Email', 'Email Address', 'E-mail'],
      phone: ['Phone Number', 'Phone', 'Mobile Phone Number'],
      company: ['Company Name', 'Company', 'Associated Company'],
      job_title: ['Job Title', 'Title'],
      lifecycle_stage: ['Lifecycle Stage'],
      owner: ['Contact Owner', 'Owner', 'HubSpot Owner'],
      created_at: ['Create Date', 'Created Date', 'Created At'],
      updated_at: ['Last Modified Date', 'Last Activity Date', 'Updated At']
    },
    hubspot_deals: {
      deal_name: ['Deal Name', 'Name'],
      amount: ['Amount', 'Deal Amount'],
      stage: ['Deal Stage', 'Stage'],
      pipeline: ['Pipeline'],
      close_date: ['Close Date', 'Expected Close Date'],
      owner: ['Deal Owner', 'Owner', 'HubSpot Owner'],
      company: ['Associated Company', 'Company Name', 'Company'],
      created_at: ['Create Date', 'Created Date', 'Created At'],
      updated_at: ['Last Modified Date', 'Last Activity Date', 'Updated At']
    },
    trello_cards: {
      card_name: ['Card Name', 'Card Title'],
      list: ['List', 'List Name'],
      board: ['Board', 'Board Name'],
      labels: ['Labels', 'Label'],
      members: ['Members', 'Member', 'Assigned To'],
      due_date: ['Due Date', 'Due'],
      description: ['Description', 'Card Description'],
      url: ['Card URL', 'URL', 'Link']
    }
  };

  /* Columns that must be present for a header row to count as this type. */
  var REQUIRED = {
    hubspot_contacts: ['email'],
    hubspot_deals: ['deal_name', 'stage'],
    trello_cards: ['card_name', 'list']
  };

  /* Lowercase and drop everything except letters and digits ("First Name" -> "firstname"). */
  function simplify(h) {
    return String(h == null ? '' : h).replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /* Pre-compute: type -> simplified alias -> column. */
  var LOOKUP = {};
  TYPES.forEach(function (t) {
    LOOKUP[t] = {};
    COLUMNS[t].forEach(function (col) {
      ALIASES[t][col].forEach(function (a) {
        var k = simplify(a);
        if (!(k in LOOKUP[t])) LOOKUP[t][k] = col;
      });
    });
  });

  /* Map header -> fixed column for one type. First matching header wins per column. */
  function mapHeaders(type, headers) {
    var map = {}, used = {};
    headers.forEach(function (h) {
      var col = LOOKUP[type][simplify(h)];
      if (col && !used[col]) { used[col] = true; map[h] = col; }
    });
    return map;
  }

  /* detectType(headers) -> type or null. All required columns must match;
     the type with the most matched columns wins (ties go to the earlier type). */
  function detectType(headers) {
    if (!Array.isArray(headers)) return null;
    var best = null, bestScore = 0;
    TYPES.forEach(function (t) {
      var cols = {};
      var m = mapHeaders(t, headers);
      Object.keys(m).forEach(function (h) { cols[m[h]] = true; });
      var ok = REQUIRED[t].every(function (c) { return cols[c]; });
      var score = Object.keys(cols).length;
      if (ok && score > bestScore) { best = t; bestScore = score; }
    });
    return best;
  }

  /* normalizeRows(type, rows) -> array of objects with exactly the fixed columns, in order.
     rows: array of objects keyed by header, or array of arrays whose first row is the headers
     (the shape parseCsv returns). Unknown columns are dropped; missing ones become ''. */
  function normalizeRows(type, rows) {
    if (!COLUMNS[type]) throw new Error('Unknown type: ' + type);
    if (!Array.isArray(rows) || !rows.length) return [];
    var objs = rows;
    if (Array.isArray(rows[0])) {
      var head = rows[0];
      objs = rows.slice(1).map(function (r) {
        var o = {};
        head.forEach(function (h, i) { o[h] = r[i]; });
        return o;
      });
    }
    var headers = [];
    objs.forEach(function (o) {
      Object.keys(o).forEach(function (h) { if (headers.indexOf(h) < 0) headers.push(h); });
    });
    var map = mapHeaders(type, headers); // header -> column
    var byCol = {};
    Object.keys(map).forEach(function (h) { byCol[map[h]] = h; });
    return objs.map(function (o) {
      var out = {};
      COLUMNS[type].forEach(function (col) {
        var v = byCol[col] !== undefined ? o[byCol[col]] : '';
        out[col] = v == null ? '' : String(v).trim();
      });
      return out;
    });
  }

  /* The delivered layout promised on the landing page: one set of columns for every type. */
  var UNIFIED = ['client', 'source', 'record_type', 'name', 'stage', 'owner', 'updated_at', 'board', 'list'];

  /* File-name part per type; matches the example files on the landing page. */
  var FILE_SLUGS = {
    hubspot_contacts: 'hubspot-contacts',
    hubspot_deals: 'hubspot-deals',
    trello_cards: 'trello-boards'
  };

  /* toUnified(type, rows, clientName) -> rows (from normalizeRows) mapped into UNIFIED columns.
     Trello cards have no stage or updated_at column, so those stay empty; members fill owner. */
  function toUnified(type, rows, clientName) {
    if (!COLUMNS[type]) throw new Error('Unknown type: ' + type);
    return (rows || []).map(function (r) {
      var o = { client: clientName || '', source: type.split('_')[0], stage: '', owner: '',
        updated_at: '', board: '', list: '' };
      if (type === 'hubspot_contacts') {
        o.record_type = 'contact';
        o.name = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || '';
        o.stage = r.lifecycle_stage; o.owner = r.owner; o.updated_at = r.updated_at;
      } else if (type === 'hubspot_deals') {
        o.record_type = 'deal';
        o.name = r.deal_name; o.stage = r.stage; o.owner = r.owner; o.updated_at = r.updated_at;
      } else {
        o.record_type = 'card';
        o.name = r.card_name; o.owner = r.members; o.board = r.board; o.list = r.list;
      }
      var out = {};
      UNIFIED.forEach(function (c) { out[c] = o[c] == null ? '' : String(o[c]); });
      return out;
    });
  }

  return { TYPES: TYPES, COLUMNS: COLUMNS, ALIASES: ALIASES, UNIFIED: UNIFIED, FILE_SLUGS: FILE_SLUGS,
    detectType: detectType, normalizeRows: normalizeRows, toUnified: toUnified };
});
