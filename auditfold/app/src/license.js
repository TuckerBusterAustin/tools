/* License check. isProUnlocked(win) -> Promise<boolean>.
 * Resolves false when win.VSLicense is missing, isUnlocked is not a function,
 * or it throws/rejects; otherwise resolves true only when isUnlocked() returns or resolves to exactly true.
 * No DOM use: `win` is injected so tests can stub it.
 * Works in Node (require) and in the browser (window.AuditfoldLicense). */
(function (root) {
  'use strict';

  function isProUnlocked(win) {
    return new Promise(function (resolve) {
      try {
        var lic = win && win.VSLicense;
        if (!lic || typeof lic.isUnlocked !== 'function') return resolve(false);
        // Promise.resolve unwraps sync values and promises alike.
        Promise.resolve(lic.isUnlocked()).then(
          function (v) { resolve(v === true); },
          function () { resolve(false); }
        );
      } catch (e) {
        resolve(false);
      }
    });
  }

  var api = { isProUnlocked: isProUnlocked };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditfoldLicense = api;
})(typeof self !== 'undefined' ? self : this);
