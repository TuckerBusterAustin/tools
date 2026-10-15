/* Pure logic: email check, price parsing, signup records and the mailto link.
 * Works as a <script> (global RollwellWaitlist) and under Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RollwellWaitlist = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var USE_TODAY = ['github-actions', 'cli', 'manual', 'other'];

  var MESSAGES = {
    emailEmpty: 'Enter your email address.',
    emailFormat: 'Enter an email like name@example.com.',
    price: 'Enter a number like 9 or 9.50, or leave it blank.',
    duplicate: 'This email is already on the waitlist in this browser.',
    useToday: 'Choose one of the options, or leave it blank.'
  };

  /* One "@", no whitespace, and a dot inside the domain with text around it. */
  function isValidEmail(email) {
    if (typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
  }

  /* Accepts '9', '$9', '9.50'. Blank gives {value: null}.
   * Negative numbers and text give {error}. Returns {value} or {error}. */
  function parsePrice(input) {
    if (input == null) return { value: null };
    var text = String(input).trim();
    if (text === '') return { value: null };
    if (text.charAt(0) === '$') text = text.slice(1).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: MESSAGES.price };
    return { value: parseFloat(text) };
  }

  /* fields: {email, useToday, price, host}; existingSignups: array of signups.
   * Returns {ok:true, signup} or {ok:false, errors:{field: message}}. */
  function buildSignup(fields, existingSignups, now) {
    var f = fields || {};
    var existing = Array.isArray(existingSignups) ? existingSignups : [];
    var errors = {};

    var email = typeof f.email === 'string' ? f.email.trim().toLowerCase() : '';
    if (!email) errors.email = MESSAGES.emailEmpty;
    else if (!isValidEmail(email)) errors.email = MESSAGES.emailFormat;
    else if (existing.some(function (s) { return s && s.email === email; })) {
      errors.email = MESSAGES.duplicate;
    }

    var price = parsePrice(f.price);
    if (price.error) errors.price = price.error;

    var useToday = f.useToday == null || f.useToday === '' ? null : String(f.useToday);
    if (useToday !== null && USE_TODAY.indexOf(useToday) === -1) {
      errors.useToday = MESSAGES.useToday;
    }

    if (Object.keys(errors).length) return { ok: false, errors: errors };

    var host = typeof f.host === 'string' ? f.host.trim() : '';
    var t = now == null ? new Date() : now;
    return {
      ok: true,
      signup: {
        email: email,
        useToday: useToday,
        price: price.value,
        host: host,
        createdAt: (t instanceof Date ? t : new Date(t)).toISOString()
      }
    };
  }

  /* Builds a mailto: link; subject and body are URL-encoded (no raw spaces
   * or newlines; line breaks become %0D%0A). */
  function buildMailto(ownerEmail, signup) {
    var s = signup || {};
    var lines = [
      'Please add me to the Rollwell waitlist.',
      '',
      'Email: ' + (s.email || ''),
      'What I use today: ' + (s.useToday || 'not answered'),
      'Price per month (USD): ' + (s.price == null ? 'not answered' : s.price),
      'Host I need: ' + (s.host || 'not answered')
    ];
    var subject = 'Rollwell waitlist';
    return 'mailto:' + encodeURIComponent(ownerEmail).replace(/%40/g, '@') +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(lines.join('\r\n'));
  }

  return {
    USE_TODAY: USE_TODAY,
    MESSAGES: MESSAGES,
    isValidEmail: isValidEmail,
    parsePrice: parsePrice,
    buildSignup: buildSignup,
    buildMailto: buildMailto
  };
});
