'use strict';
// CSV serialisation with RFC 4180 style escaping.

(function () {
function escapeField(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// rows: array of objects; columns: array of keys (header row uses the keys).
function toCsv(rows, columns) {
  const lines = [columns.map(escapeField).join(',')];
  rows.forEach((row) => {
    lines.push(columns.map((c) => escapeField(row[c])).join(','));
  });
  return lines.join('\r\n');
}

if (typeof module !== 'undefined' && module.exports) module.exports = { toCsv, escapeField };
else window.FerrywiseCsv = { toCsv, escapeField }; // plain <script> use in the browser
})();
