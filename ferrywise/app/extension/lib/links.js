'use strict';
// Pure logic: clean, filter, dedupe and format links read from a page.
// Input links: [{text, href}]. Nothing here touches the DOM or throws on bad input.

(function () {
  // Only these schemes are kept (no ftp: browsers no longer open it). Checked on the
  // RESOLVED URL, because the URL parser strips tabs/newlines ("java\nscript:" would
  // pass a check on the raw text).
  const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:'];

  // Resolves href against base; returns '' for empty, unsafe or unparsable values.
  // The #fragment is dropped so "/x" and "/x#top" count as the same link.
  function resolveHref(href, base) {
    const h = typeof href === 'string' ? href.trim() : '';
    if (!h) return '';
    try {
      const u = new URL(h, base || undefined);
      if (!SAFE_PROTOCOLS.includes(u.protocol)) return '';
      u.hash = '';
      return u.href;
    } catch (e) {
      return '';
    }
  }

  // Cleans and dedupes (by resolved URL, first position wins, text filled from a later copy
  // when the first has none). Returns {links, duplicates}.
  function cleanLinks(raw, base) {
    const byUrl = new Map();
    let duplicates = 0;
    (Array.isArray(raw) ? raw : []).forEach((l) => {
      const url = resolveHref(l && l.href, base);
      if (!url) return;
      const text = String((l && l.text) || '').replace(/\s+/g, ' ').trim();
      const seen = byUrl.get(url);
      if (!seen) byUrl.set(url, { text, url });
      else {
        duplicates += 1;
        if (!seen.text && text) seen.text = text;
      }
    });
    return { links: Array.from(byUrl.values()), duplicates };
  }

  // Case-insensitive substring filter on link text or URL. Blank filter keeps all.
  function filterLinks(links, query) {
    const q = String(query == null ? '' : query).trim().toLowerCase();
    if (!q) return links.slice();
    return links.filter((l) => l.text.toLowerCase().includes(q) || l.url.toLowerCase().includes(q));
  }

  // One call for the popup: {links, total, duplicates} where total is before filtering.
  function extract(raw, base, query) {
    const cleaned = cleanLinks(raw, base);
    return {
      links: filterLinks(cleaned.links, query),
      total: cleaned.links.length,
      duplicates: cleaned.duplicates,
    };
  }

  // One URL per line.
  function toText(links) {
    return (links || []).map((l) => l.url).join('\n');
  }

  // Quotes a CSV cell when it holds a comma, quote, CR or LF.
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // "text,url" rows with a header; empty input gives an empty string.
  function toCsv(links) {
    if (!links || !links.length) return '';
    return ['text,url'].concat(links.map((l) => csvCell(l.text) + ',' + csvCell(l.url))).join('\r\n');
  }

  const api = { resolveHref, cleanLinks, filterLinks, extract, toText, toCsv, csvCell };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.FerrywiseLinks = api;
})();
