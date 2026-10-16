// Minimal .xlsx writer: a ZIP of stored (uncompressed) entries with CRC32.
// Every cell is an inline string, so numbers stay as text (nothing gets reformatted).
(function (root) {
  'use strict';

  var enc = new TextEncoder();

  // ---- CRC32 (IEEE, table driven) ----
  var TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  /** CRC32 of a Uint8Array (or string, UTF-8 encoded). Returns unsigned int. */
  function crc32(data) {
    if (typeof data === 'string') data = enc.encode(data);
    var c = 0xFFFFFFFF;
    for (var i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /** Escape text for XML; drops characters XML 1.0 forbids. */
  function escapeXml(s) {
    return String(s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  /** 0 -> A, 25 -> Z, 26 -> AA */
  function colName(i) {
    var s = '';
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  /** Build sheet1.xml from an array of row arrays. */
  function sheetXml(rows) {
    var cols = 0;
    rows.forEach(function (r) { if (r.length > cols) cols = r.length; });
    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    if (rows.length && cols) xml += '<dimension ref="A1:' + colName(cols - 1) + rows.length + '"/>';
    xml += '<sheetData>';
    rows.forEach(function (r, ri) {
      xml += '<row r="' + (ri + 1) + '">';
      r.forEach(function (v, ci) {
        var text = v === null || v === undefined ? '' : String(v);
        xml += '<c r="' + colName(ci) + (ri + 1) + '" t="inlineStr"><is><t xml:space="preserve">' +
          escapeXml(text) + '</t></is></c>';
      });
      xml += '</row>';
    });
    return xml + '</sheetData></worksheet>';
  }

  var HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  var NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  var NS_DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  function u16(v, n) { v.push(n & 0xFF, (n >>> 8) & 0xFF); }
  function u32(v, n) { u16(v, n & 0xFFFF); u16(v, (n >>> 16) & 0xFFFF); }

  /** Write a stored ZIP from [{name, data:Uint8Array}] entries. */
  function zip(entries) {
    var parts = [], central = [], offset = 0;
    entries.forEach(function (e) {
      var name = enc.encode(e.name), crc = crc32(e.data), h = [];
      u32(h, 0x04034b50); u16(h, 20); u16(h, 0x0800); u16(h, 0); // version, UTF-8 flag, stored
      u16(h, 0); u16(h, 0x21);                                   // time 00:00, date 1980-01-01
      u32(h, crc); u32(h, e.data.length); u32(h, e.data.length);
      u16(h, name.length); u16(h, 0);
      parts.push(Uint8Array.from(h), name, e.data);
      var c = [];
      u32(c, 0x02014b50); u16(c, 20); u16(c, 20); u16(c, 0x0800); u16(c, 0);
      u16(c, 0); u16(c, 0x21);
      u32(c, crc); u32(c, e.data.length); u32(c, e.data.length);
      u16(c, name.length); u16(c, 0); u16(c, 0); u16(c, 0); u16(c, 0); u32(c, 0); u32(c, offset);
      central.push(Uint8Array.from(c), name);
      offset += h.length + name.length + e.data.length;
    });
    var cdSize = 0;
    central.forEach(function (p) { cdSize += p.length; });
    var end = [];
    u32(end, 0x06054b50); u16(end, 0); u16(end, 0);
    u16(end, entries.length); u16(end, entries.length);
    u32(end, cdSize); u32(end, offset); u16(end, 0);
    var all = parts.concat(central, [Uint8Array.from(end)]);
    var total = 0;
    all.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  /**
   * Build an .xlsx workbook with one sheet.
   * rows: array of arrays (first row is usually the header). Returns Uint8Array.
   * options.sheetName: defaults to "Export" (invalid chars removed, max 31 chars).
   */
  function buildXlsx(rows, options) {
    rows = rows || [];
    var sheet = String((options && options.sheetName) || 'Export')
      .replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31) || 'Export';
    var files = [
      ['[Content_Types].xml', HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>'],
      ['_rels/.rels', HEAD + '<Relationships xmlns="' + NS_REL + '">' +
        '<Relationship Id="rId1" Type="' + NS_DOC + '/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', HEAD + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + NS_DOC + '">' +
        '<sheets><sheet name="' + escapeXml(sheet) + '" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', HEAD + '<Relationships xmlns="' + NS_REL + '">' +
        '<Relationship Id="rId1" Type="' + NS_DOC + '/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
      ['xl/worksheets/sheet1.xml', sheetXml(rows)]
    ];
    return zip(files.map(function (f) { return { name: f[0], data: enc.encode(f[1]) }; }));
  }

  var api = { buildXlsx: buildXlsx, crc32: crc32, escapeXml: escapeXml, colName: colName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RowdropXlsx = api;
})(typeof window !== 'undefined' ? window : this);
