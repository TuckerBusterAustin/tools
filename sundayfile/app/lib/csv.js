/* CSV parsing and writing. UMD-style: CommonJS in node, window.VSCsv in the browser. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VSCsv = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /* parseCsv(text) -> array of rows, each an array of strings.
     Handles a leading BOM, quoted fields, "" escapes, commas/newlines inside quotes,
     CRLF / LF / CR line ends, and drops trailing blank lines. */
  function parseCsv(text) {
    text = String(text == null ? '' : text);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], field = '', inQuotes = false, i = 0, n = text.length;
    while (i < n) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; }
      else if (c === ',') { row.push(field); field = ''; i++; }
      else if (c === '\r' || c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
        i += (c === '\r' && text[i + 1] === '\n') ? 2 : 1;
      } else { field += c; i++; }
    }
    // Flush the last row if the file did not end with a newline.
    if (field !== '' || row.length > 0 || inQuotes) { row.push(field); rows.push(row); }
    // Skip trailing blank lines.
    while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
    // Flag a quote that never closed (the rest of the file ended up in one field).
    // The property is only set when true, so normal results compare equal to plain arrays.
    if (inQuotes) rows.unterminated = true;
    return rows;
  }

  /* Quote a field only when it needs it (comma, quote, CR or LF). */
  function escapeField(v) {
    var s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* toCsv(rows, columns)
     - rows of arrays, no columns: written as is.
     - rows of objects with columns: a header line of the column names, then each
       row's values in that column order (missing values become empty).
     - rows of arrays with columns: columns is written as the header line first.
     Lines end with "\n", including the last one. */
  function toCsv(rows, columns) {
    var lines = [];
    if (columns) lines.push(columns.map(escapeField).join(','));
    (rows || []).forEach(function (r) {
      var cells = Array.isArray(r) ? r : (columns || Object.keys(r)).map(function (k) { return r[k]; });
      lines.push(cells.map(escapeField).join(','));
    });
    return lines.length ? lines.join('\n') + '\n' : '';
  }

  return { parseCsv: parseCsv, toCsv: toCsv };
});
