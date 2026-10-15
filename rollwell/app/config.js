/* Owner settings. Edit these before deploying. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ROLLWELL_CONFIG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {
    // Where waitlist and "I'd pay" emails are sent. Replace before deploying.
    waitlistEmail: 'waitlist@example.com',
    // Public URL of the site, no trailing slash. Replace before deploying.
    siteBaseUrl: 'https://example.com/rollwell',
    // Prefix for every localStorage key this site uses.
    storageKeyPrefix: 'rollwell:'
  };
});
