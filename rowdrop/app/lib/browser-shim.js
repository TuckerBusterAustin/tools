// Browser-only loader for the CommonJS libs, so plain <script> tags work (no bundler, no network).
// Load this first, then each lib/*.js, then app.js. `module.exports = x` inside a lib is caught by
// a setter that files x under the script's own name; `require('./csv')` then returns it.
(function (w) {
  'use strict';
  var registry = {};
  var last = {};
  var mod = {};
  Object.defineProperty(mod, 'exports', {
    get: function () { return last; },
    set: function (v) {
      last = v;
      var s = document.currentScript;
      if (s && s.src) registry[s.src.split('/').pop().replace(/\.js.*$/, '')] = v;
    }
  });
  w.module = mod;
  w.require = function (p) {
    var k = String(p).split('/').pop().replace(/\.js$/, '');
    if (!registry[k]) throw new Error('Rowdrop lib not loaded: ' + k);
    return registry[k];
  };
  w.RowdropLib = registry;
})(window);
