/* Dependency-free HTML extractor. Never throws; always returns a full object.
 * Works in Node (require) and in the browser (window.AuditfoldParse). */
(function (root) {
  'use strict';

  var NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '\u00a9', ndash: '\u2013', mdash: '\u2014' };

  /** Decode the common HTML entities (named + numeric). */
  function decode(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e[0] === '#') {
        var n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return String.fromCodePoint(n); } catch (err) { return m; }
      }
      var v = NAMED[e.toLowerCase()];
      return v === undefined ? m : v;
    });
  }

  /** Strip tags, decode entities, collapse whitespace. */
  function textOf(html) {
    return decode(html.replace(/<[^>]*>?/g, ' ')).replace(/\s+/g, ' ').trim();
  }

  /** Parse an attribute string into {lowercase-name: value}. */
  function attrs(str) {
    var out = {}, re = /([^\s=\/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, m;
    while ((m = re.exec(str))) {
      var name = m[1].toLowerCase();
      if (name in out) continue; // first wins, like browsers
      var v = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
      out[name] = decode(v);
    }
    return out;
  }

  // An opening tag whose attributes may contain quoted ">" characters.
  function openTag(name) {
    return '<' + name + '\\b((?:"[^"]*"|\'[^\']*\'|[^>"\'])*)>';
  }

  function parse(input) {
    var result = {
      title: null, metaDescription: null, h: [], images: [], links: [],
      canonical: null, robots: null, viewport: null, lang: null, og: {}, wordCount: 0
    };
    if (typeof input !== 'string' || !input) return result;
    try {
      // Remove comments, then script/style blocks (unclosed ones run to the end).
      var html = input
        .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
        .replace(/<script\b[\s\S]*?(?:<\/script\s*>|$)/gi, ' ')
        .replace(/<style\b[\s\S]*?(?:<\/style\s*>|$)/gi, ' ');

      var m = new RegExp(openTag('html'), 'i').exec(html);
      if (m) { var la = attrs(m[1]).lang; if (la) result.lang = la; }

      // Prefer a <title> inside <head> (an inline SVG title in the body must not win).
      var headM = /<head\b[\s\S]*?(?:<\/head\s*>|$)/i.exec(html);
      m = (headM && /<title\b[^>]*>([^<]*)/i.exec(headM[0])) || /<title\b[^>]*>([^<]*)/i.exec(html);
      if (m) result.title = textOf(m[1]);

      var re, a;
      re = new RegExp(openTag('meta'), 'gi');
      while ((m = re.exec(html))) {
        a = attrs(m[1]);
        var key = (a.name || a.property || '').toLowerCase();
        if (!key || a.content === undefined) continue;
        if (key === 'description' && result.metaDescription === null) result.metaDescription = a.content.trim();
        else if (key === 'robots' && result.robots === null) result.robots = a.content.trim();
        else if (key === 'viewport' && result.viewport === null) result.viewport = a.content.trim();
        else if (key.indexOf('og:') === 0 && !(key.slice(3) in result.og)) result.og[key.slice(3)] = a.content.trim();
      }

      re = new RegExp(openTag('link'), 'gi');
      while ((m = re.exec(html))) {
        a = attrs(m[1]);
        if (result.canonical === null && a.href !== undefined && /(^|\s)canonical(\s|$)/i.test(a.rel || '')) {
          result.canonical = a.href.trim();
        }
      }

      // Headings: run to the closing tag, or to the next heading if unclosed.
      re =/<h([1-6])(?![a-z0-9])(?:"[^"]*"|'[^']*'|[^>"'])*>([\s\S]*?)(?=<\/h[1-6]\s*>|<h[1-6](?![a-z0-9])|$)/gi;
      while ((m = re.exec(html))) result.h.push({ level: Number(m[1]), text: textOf(m[2]) });

      re = new RegExp(openTag('img'), 'gi');
      while ((m = re.exec(html))) {
        a = attrs(m[1]);
        // alt: null = attribute missing, '' = present but empty.
        result.images.push({ src: a.src !== undefined ? a.src : '', alt: a.alt !== undefined ? a.alt : null });
      }

      re = /<a\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)(?:<\/a\s*>|(?=<a\b)|$)/gi;
      while ((m = re.exec(html))) {
        a = attrs(m[1]);
        if (a.href !== undefined) {
          var link = { href: a.href.trim(), text: textOf(m[2]) };
          // Accessible name when there is no visible text: aria-label, title or an inner image's alt.
          var img = /<img\b[^>]*\balt\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(m[2]);
          var label = a['aria-label'] || a.title || (img && (img[1] || img[2]));
          if (label && label.trim()) link.label = label.trim();
          result.links.push(link);
        }
      }

      // Word count: visible text only (no head, scripts, styles, comments).
      var body = html.replace(/<head\b[\s\S]*?(?:<\/head\s*>|$)/gi, ' ');
      var words = textOf(body).split(' ').filter(function (w) { return /[\p{L}\p{N}]/u.test(w); });
      result.wordCount = words.length;
    } catch (err) {
      // Defensive: return whatever was gathered so far.
    }
    return result;
  }

  var api = { parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditfoldParse = api;
})(typeof self !== 'undefined' ? self : this);
