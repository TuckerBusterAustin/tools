/* Sample page for the "Try a sample page" button.
 * Deliberately flawed so the first audit shows a real, ranked fix list.
 * Works in Node (require) and in the browser (window.AuditfoldSample). */
(function (root) {
  'use strict';

  var HTML = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '  <meta charset="utf-8">',
    '  <!-- No <title>: the sample\'s biggest (high-severity) problem. -->',
    '</head>',
    '<body>',
    '  <h1>Acme Bakery</h1>',
    '  <h1>Fresh bread every morning</h1>',
    '  <h3>Our sourdough</h3>',
    '  <p>We bake sourdough, rye and seeded loaves in the shop every day.</p>',
    '  <img src="loaf.jpg">',
    '  <img src="shop.jpg">',
    '  <a href="/menu">Menu</a>',
    '</body>',
    '</html>'
  ].join('\n');

  var api = { HTML: HTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditfoldSample = api;
})(typeof self !== 'undefined' ? self : this);
