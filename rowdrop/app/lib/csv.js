/* Rowdrop CSV helpers (RFC 4180). Works as CommonJS and as a browser global. */
(function (root) {
  'use strict';

  var BOM = '﻿';

  /**
   * Parse CSV text into an array of rows (arrays of strings).
   * Handles quoted commas, doubled quotes, newlines in quotes, CRLF/CR and a leading BOM.
   * Empty input returns [].
   */
  function parseCsv(text) {
    if (text == null) return [];
    text = String(text);
    if (text.charAt(0) === BOM) text = text.slice(1);
    if (text === '') return [];

    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;
    var n = text.length;

    while (i < n) {
      var c = text.charAt(i);
      if (inQuotes) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; }
      else if (c === ',') { row.push(field); field = ''; i++; }
      else if (c === '\r' || c === '\n') {
        if (c === '\r' && text.charAt(i + 1) === '\n') i++;
        i++;
        row.push(field); rows.push(row);
        row = []; field = '';
      } else { field += c; i++; }
    }
    // Last record without a trailing newline.
    if (field !== '' || row.length > 0 || inQuotes) {
      row.push(field); rows.push(row);
    }
    return rows;
  }

  // Quote a single field only when needed.
  function quote(v) {
    var s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /**
   * Serialise rows to CSV text with CRLF line endings.
   * options.bom: prepend a UTF-8 BOM (helps Excel open UTF-8 files).
   */
  function toCsv(rows, options) {
    var out = (rows || []).map(function (r) {
      return r.map(quote).join(',');
    }).join('\r\n');
    if (out !== '') out += '\r\n';
    return (options && options.bom ? BOM : '') + out;
  }

  var api = { parseCsv: parseCsv, toCsv: toCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RowdropCsv = api;
})(typeof window !== 'undefined' ? window : this);
