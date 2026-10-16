/*
 * Lapsewatch license gate. Wraps window.VSLicense, which is missing before launch.
 * UMD-style: module.exports in Node, window.LWLicense in the browser.
 * Nothing here throws: any problem means "not Pro".
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LWLicense = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The license object, or null when missing or not an object.
  function licenseOf(win) {
    var lic = win && win.VSLicense;
    return lic && typeof lic === 'object' ? lic : null;
  }

  // Promise<boolean>: true only when VSLicense.isUnlocked() returns/resolves truthy.
  function isProUnlocked(win) {
    var lic = licenseOf(win);
    if (!lic || typeof lic.isUnlocked !== 'function') return Promise.resolve(false);
    return new Promise(function (resolve) { resolve(lic.isUnlocked()); })
      .then(function (v) { return !!v; }, function () { return false; });
  }

  // Ask VSLicense to draw its unlock box in `el`. Only when it exists.
  // Returns true if it was called.
  function mountUnlockBox(win, el) {
    var lic = licenseOf(win);
    if (!lic || typeof lic.unlockBox !== 'function' || !el) return false;
    try { lic.unlockBox(el); return true; } catch (e) { return false; }
  }

  return { isProUnlocked: isProUnlocked, mountUnlockBox: mountUnlockBox };
});
