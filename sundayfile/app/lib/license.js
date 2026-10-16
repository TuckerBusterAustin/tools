/* License gate. Paid features are locked unless window.VSLicense.isUnlocked() resolves true.
   UMD-style so that, as a classic script, it adds only window.VSLicenseGate to the shared scope. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VSLicenseGate = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Looked up on every call so tests and late-loading license scripts both work.
  function getLicense() {
    return typeof window !== 'undefined' && window && window.VSLicense ? window.VSLicense : null;
  }

  /** True only when VSLicense exists and isUnlocked() resolves to exactly true. */
  async function isPro() {
    var lic = getLicense();
    if (!lic || typeof lic.isUnlocked !== 'function') return false;
    try {
      return (await lic.isUnlocked()) === true;
    } catch (e) {
      return false;
    }
  }

  /** Shows the unlock box in `el` if the license script provides one; otherwise does nothing. */
  function mountUnlockBox(el) {
    var lic = getLicense();
    if (!lic || typeof lic.unlockBox !== 'function') return false;
    lic.unlockBox(el);
    return true;
  }

  return { isPro: isPro, mountUnlockBox: mountUnlockBox };
});
