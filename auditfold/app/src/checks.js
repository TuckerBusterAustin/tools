/* The 12 on-page checks. Each takes the object from parse() and returns
 *   {id, name, passed, severity, weight, message, fix}
 * message = what we found (plain text, may include page text; escape on output).
 * fix     = what to do and why; always non-empty when passed is false, '' when passed.
 * Works in Node (require) and in the browser (window.AuditfoldChecks). */
(function (root) {
  'use strict';

  // Weight = how many score points a failure costs. Higher severity costs more.
  var W = { high: 15, medium: 8, low: 4 };

  /** Build a result object. */
  function res(id, name, severity, passed, message, fix) {
    return { id: id, name: name, passed: passed, severity: severity, weight: W[severity],
      message: message, fix: passed ? '' : fix };
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // Each check is {id, name, run(page)}; run returns a result.
  var CHECKS = [
    {
      id: 'title-present', name: 'Page title',
      run: function (p) {
        var ok = !!p.title;
        return res(this.id, this.name, 'high', ok,
          ok ? 'Title found.' : 'No page title found.',
          'Add a page title. Search results show it as the clickable headline, and this page has none. Aim for 50–60 characters that say what the page is about.');
      }
    },
    {
      id: 'title-length', name: 'Title length',
      run: function (p) {
        // A missing title is already reported by title-present, so don't double count.
        if (!p.title) return res(this.id, this.name, 'low', true, 'Skipped: there is no title (see Page title).', '');
        var n = p.title.length;
        if (n > 60) {
          return res(this.id, this.name, n > 75 ? 'medium' : 'low', false,
            'Title is ' + n + ' characters.',
            'Shorten the page title to about 60 characters or fewer. Search results cut off long titles, so visitors may miss the end of yours.');
        }
        if (n < 20) {
          return res(this.id, this.name, 'low', false, 'Title is only ' + n + ' characters.',
            'Make the page title more descriptive. Aim for 50–60 characters that say what the page is about, so searchers know what they will get.');
        }
        return res(this.id, this.name, 'low', true, 'Title is ' + n + ' characters.', '');
      }
    },
    {
      id: 'meta-description', name: 'Meta description',
      run: function (p) {
        var ok = !!p.metaDescription;
        return res(this.id, this.name, 'medium', ok,
          ok ? 'Meta description found.' : 'No meta description found.',
          'Add a meta description. This is the short summary search engines often show under the title, and this page has none. Write one or two sentences, about 120–160 characters, that make people want to click.');
      }
    },
    {
      id: 'meta-description-length', name: 'Meta description length',
      run: function (p) {
        if (!p.metaDescription) return res(this.id, this.name, 'low', true, 'Skipped: there is no meta description (see Meta description).', '');
        var n = p.metaDescription.length;
        if (n > 160) {
          return res(this.id, this.name, 'low', false, 'Meta description is ' + n + ' characters.',
            'Trim the meta description (the short summary shown under the title in search results) to about 160 characters. Longer text gets cut off.');
        }
        if (n < 50) {
          return res(this.id, this.name, 'low', false, 'Meta description is only ' + n + ' characters.',
            'Expand the meta description (the short summary shown under the title in search results) to about 120–160 characters so it explains the page.');
        }
        return res(this.id, this.name, 'low', true, 'Meta description is ' + n + ' characters.', '');
      }
    },
    {
      id: 'h1', name: 'One main heading (H1)',
      run: function (p) {
        var n = p.h.filter(function (h) { return h.level === 1; }).length;
        if (n === 0) {
          return res(this.id, this.name, 'high', false, 'No H1 heading found.',
            'Add one H1 heading. It is the main headline of the page and tells visitors and search engines what the page is about.');
        }
        if (n > 1) {
          return res(this.id, this.name, 'medium', false, 'Found ' + n + ' H1 headings.',
            'Keep just one H1 heading and turn the others into H2 or H3. One main headline makes the topic of the page clear.');
        }
        return res(this.id, this.name, 'high', true, 'One H1 heading found.', '');
      }
    },
    {
      id: 'heading-order', name: 'Heading order',
      run: function (p) {
        // A heading should not jump more than one level deeper (e.g. H2 straight to H4).
        var prev = 0, skips = 0;
        p.h.forEach(function (h) {
          if (prev && h.level > prev + 1) skips++;
          prev = h.level;
        });
        return res(this.id, this.name, 'low', skips === 0,
          skips === 0 ? 'Headings are in a sensible order.' : plural(skips, 'heading skips', 'headings skip') + ' a level.',
          'Fix the heading order so levels go down one step at a time (H2, then H3, not H2 then H4). This helps screen readers and search engines follow the page outline.');
      }
    },
    {
      id: 'img-alt', name: 'Image descriptions (alt text)',
      run: function (p) {
        // alt === null means missing. alt="" is allowed (decorative image).
        var n = p.images.filter(function (i) { return i.alt === null; }).length;
        return res(this.id, this.name, 'medium', n === 0,
          n === 0 ? (p.images.length ? 'All ' + plural(p.images.length, 'image has', 'images have') + ' an alt attribute.' : 'No images found.')
            : plural(n, 'image has', 'images have') + ' no alt text.',
          'Add alt text to ' + (n === 1 ? 'the image' : 'each image') + ' that has none. Alt text is a short written description of a picture; it helps people using screen readers and tells search engines what the image shows. Use alt="" for purely decorative images.');
      }
    },
    {
      id: 'noindex', name: 'Visible to search engines',
      run: function (p) {
        var bad = !!p.robots && /(^|[\s,])(noindex|none)([\s,]|$)/i.test(p.robots);
        return res(this.id, this.name, 'high', !bad,
          bad ? 'Robots tag says "' + p.robots + '".' : 'No noindex instruction found.',
          'Remove the "noindex" instruction from the robots meta tag if you want this page to appear in search. Right now it tells search engines to leave the page out of their results.');
      }
    },
    {
      id: 'canonical', name: 'Canonical tag',
      run: function (p) {
        var ok = !!p.canonical;
        return res(this.id, this.name, 'low', ok,
          ok ? 'Canonical tag points to ' + p.canonical + '.' : 'No canonical tag found.',
          'Add a canonical tag. It tells search engines which version of a page is the main one, which avoids problems when the same content is reachable at several addresses.');
      }
    },
    {
      id: 'viewport', name: 'Mobile viewport',
      run: function (p) {
        var ok = !!p.viewport;
        return res(this.id, this.name, 'medium', ok,
          ok ? 'Viewport tag found.' : 'No viewport tag found.',
          'Add a viewport meta tag, for example <meta name="viewport" content="width=device-width, initial-scale=1">. It tells phones to fit the page to the screen, and search engines favour pages that work well on mobile.');
      }
    },
    {
      id: 'lang', name: 'Page language',
      run: function (p) {
        var ok = !!p.lang;
        return res(this.id, this.name, 'low', ok,
          ok ? 'Language set to "' + p.lang + '".' : 'No language set on the html tag.',
          'Set the page language on the opening html tag, for example <html lang="en">. It helps screen readers pronounce the text and helps search engines show the page to the right audience.');
      }
    },
    {
      id: 'open-graph', name: 'Social sharing preview',
      run: function (p) {
        var missing = ['title', 'description', 'image'].filter(function (k) { return !p.og || !p.og[k]; });
        return res(this.id, this.name, 'low', missing.length === 0,
          missing.length === 0 ? 'Social sharing tags found.' : 'Missing social sharing tags: og:' + missing.join(', og:') + '.',
          'Add Open Graph tags (og:title, og:description and og:image). They control the title, text and picture shown when someone shares this page on social media or in chat apps.');
      }
    }
  ];

  /** Run every check against a parsed page. Returns an array of results. */
  function runChecks(page) {
    var p = page || {};
    p = { title: p.title || null, metaDescription: p.metaDescription || null, h: p.h || [],
      images: p.images || [], links: p.links || [], canonical: p.canonical || null,
      robots: p.robots || null, viewport: p.viewport || null, lang: p.lang || null, og: p.og || {} };
    return CHECKS.map(function (c) { return c.run.call(c, p); });
  }

  var api = { CHECKS: CHECKS, runChecks: runChecks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditfoldChecks = api;
})(typeof self !== 'undefined' ? self : this);
