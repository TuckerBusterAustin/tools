/* Free/paid gate for the two Pro panels (client report, saved history).
 * DOM is injected (`doc` needs getElementById and querySelectorAll) so tests can fake it.
 *   applyGate(unlocked, doc, hasAudit) sets the locked/unlocked state of the panels
 *   initGate(win, doc, hasAudit) -> Promise<boolean>; never throws, even without VSLicense
 * Markup contract:
 *   [data-pro-lock]     lock note, hidden when unlocked
 *   [data-pro-unlocked] content shown only when unlocked
 *   [data-pro-control]  disabled when locked; also disabled without an audit if [data-needs-audit]
 * Works in Node (require) and in the browser (window.AuditfoldGate). */
(function (root) {
  'use strict';

  var license = typeof require === 'function' && typeof module !== 'undefined' ? require('./license.js') : root.AuditfoldLicense;

  function each(doc, sel, fn) {
    var list = doc.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) fn(list[i]);
  }

  function applyGate(unlocked, doc, hasAudit) {
    each(doc, '[data-pro-lock]', function (n) { n.hidden = !!unlocked; });
    each(doc, '[data-pro-unlocked]', function (n) { n.hidden = !unlocked; });
    each(doc, '[data-pro-control]', function (n) {
      var needs = n.hasAttribute && n.hasAttribute('data-needs-audit');
      n.disabled = !unlocked || (needs && !hasAudit);
    });
    return !!unlocked;
  }

  function initGate(win, doc, hasAudit) {
    applyGate(false, doc, !!hasAudit);   // locked until the licence says otherwise
    try {
      var lic = win && win.VSLicense;
      if (lic && typeof lic.unlockBox === 'function') {
        var mount = doc.getElementById('unlock-mount') || doc.getElementById('unlock-box');
        if (mount) lic.unlockBox(mount);   // called once
      }
    } catch (e) { /* the unlock box is optional; never show a licence error */ }
    return license.isProUnlocked(win).then(function (u) { return applyGate(u, doc, !!hasAudit); });
  }

  var api = { applyGate: applyGate, initGate: initGate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditfoldGate = api;
})(typeof self !== 'undefined' ? self : this);
