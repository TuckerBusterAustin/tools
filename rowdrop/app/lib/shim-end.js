// Load right after the last lib. Removes the fake CommonJS globals so any script loaded later
// (e.g. the VSLicense widget, which uses a UMD check) sees a plain browser and sets window.VSLicense.
// Only window.RowdropLib stays.
(function (w) {
  'use strict';
  delete w.module;
  delete w.require;
})(window);
