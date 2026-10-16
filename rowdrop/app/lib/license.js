(function () { // IIFE: keeps names out of the shared browser global scope
'use strict';
// Single place that asks "is this a Pro user?". Tests stub global.window.

/** True only when window.VSLicense.isUnlocked() returns exactly true. Never throws. */
function isPro() {
  try {
    if (typeof window === 'undefined' || !window || !window.VSLicense) return false;
    if (typeof window.VSLicense.isUnlocked !== 'function') return false;
    return window.VSLicense.isUnlocked() === true;
  } catch (e) {
    return false;
  }
}

/**
 * Promise<boolean>: true when window.VSLicense.isUnlocked() is (or resolves to) exactly true.
 * Handles both a sync boolean and a Promise. Never rejects.
 */
function isProAsync() {
  try {
    if (typeof window === 'undefined' || !window || !window.VSLicense) return Promise.resolve(false);
    if (typeof window.VSLicense.isUnlocked !== 'function') return Promise.resolve(false);
    return Promise.resolve(window.VSLicense.isUnlocked()).then(function (v) { return v === true; }, function () { return false; });
  } catch (e) {
    return Promise.resolve(false);
  }
}

module.exports = { isPro, isProAsync };
})();
