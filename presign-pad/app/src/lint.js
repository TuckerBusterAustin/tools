'use strict';
// Pre-send checks on request inputs. Returns an array of {rule, message}.
// Input: {host, region, expires (seconds), amzDate ('YYYYMMDDTHHMMSSZ'), now (Date or ms)}

(function (root) {
const MAX_EXPIRES = 7 * 24 * 3600; // S3 presign limit
const MAX_SKEW_MS = 15 * 60 * 1000;
const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d+$/; // e.g. us-east-1, us-gov-west-1

// Parse basic-format ISO timestamp to ms; NaN if invalid.
function parseAmzDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(s || ''));
  if (!m) return NaN;
  return Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function lint(input) {
  const i = input || {};
  const w = [];
  if (!i.host || !String(i.host).trim()) {
    w.push({ rule: 'host-missing', message: 'Host is empty; Host must be signed.' });
  }
  if (!REGION_RE.test(String(i.region || ''))) {
    w.push({ rule: 'region-format', message: 'Region "' + (i.region || '') + '" does not look like us-east-1.' });
  }
  if (i.expires !== undefined && i.expires !== null && i.expires !== '') {
    const e = Number(i.expires);
    if (!Number.isFinite(e) || e < 1) {
      w.push({ rule: 'expires-invalid', message: 'Expiry must be a positive number of seconds.' });
    } else if (e > MAX_EXPIRES) {
      w.push({ rule: 'expires-too-long', message: 'Expiry exceeds 7 days (604800 seconds).' });
    }
  }
  if (i.amzDate !== undefined && i.amzDate !== '') {
    const t = parseAmzDate(i.amzDate);
    if (Number.isNaN(t)) {
      w.push({ rule: 'date-format', message: 'Date must look like 20130524T000000Z.' });
    } else {
      const now = i.now instanceof Date ? i.now.getTime() : (i.now === undefined ? Date.now() : Number(i.now));
      if (Math.abs(now - t) > MAX_SKEW_MS) {
        w.push({ rule: 'clock-skew', message: 'Signing date differs from the current time by more than 15 minutes.' });
      }
    }
  }
  return w;
}

const api = { lint, parseAmzDate, MAX_EXPIRES };
if (typeof module === 'object' && module.exports) module.exports = api;
else root.PresignLint = api;
})(typeof self !== 'undefined' ? self : this);
