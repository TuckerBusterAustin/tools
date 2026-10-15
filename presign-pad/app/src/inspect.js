'use strict';
// Presigned URL inspector: parse, validate, compute expiry, optionally verify the signature.
// Crypto is injected (same shape as sigv4.js). The clock is a parameter: nothing reads Date.now().
(function (root) {
const sigv4 = typeof module === 'object' && module.exports ? require('./sigv4') : root.PresignSigV4;

const MAX_EXPIRES = 604800; // 7 days, the AWS limit
const REQUIRED = ['X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Expires',
  'X-Amz-SignedHeaders', 'X-Amz-Signature'];

/** "20130524T000000Z" -> epoch seconds, or null if malformed. */
function parseAmzDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || '');
  if (!m) return null;
  const ms = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(ms) ? null : ms / 1000;
}

/** "AKID/20130524/us-east-1/s3/aws4_request" -> parts, or null if not 5 segments. */
function parseCredential(c) {
  const p = String(c || '').split('/');
  if (p.length !== 5) return null;
  return { accessKeyId: p[0], date: p[1], region: p[2], service: p[3], terminator: p[4] };
}

/** Case-insensitive lookup of the first query parameter by name. */
function makeGetter(pairs) {
  return (name) => {
    const hit = pairs.find(([k]) => k.toLowerCase() === name.toLowerCase());
    return hit ? hit[1] : undefined;
  };
}

/**
 * Inspect a presigned URL.
 * @param {string} urlString
 * @param {object} opts  now (Date or epoch ms, required), secret? + crypto? (to verify),
 *                       method? (default GET)
 * @returns {Promise<object>} { error } for a non-URL, otherwise a report; never throws on bad input.
 */
async function inspect(urlString, opts) {
  const o = opts || {};
  let url;
  try { url = new URL(String(urlString).trim()); } catch (e) {
    return { error: 'Not a valid URL. Paste the full presigned URL, including the scheme (https).' };
  }
  if (!/^https?:$/.test(url.protocol)) return { error: `Unsupported scheme "${url.protocol}". Expected http(s).` };
  if (o.now == null) return { error: 'inspect() needs a current time (opts.now).' };
  const nowSec = (o.now instanceof Date ? o.now.getTime() : Number(o.now)) / 1000;

  const pairs = sigv4.parseQuery(url.search);
  const get = makeGetter(pairs);
  const warnings = [];

  const missing = REQUIRED.filter((n) => get(n) === undefined || get(n) === '');
  if (missing.length) warnings.push(`Missing parameters: ${missing.join(', ')}.`);

  const algorithm = get('X-Amz-Algorithm');
  if (algorithm && algorithm !== sigv4.ALGORITHM) {
    warnings.push(`Algorithm "${algorithm}" is not ${sigv4.ALGORITHM} (SigV4).`);
  }

  const credential = parseCredential(get('X-Amz-Credential'));
  if (get('X-Amz-Credential') && !credential) {
    warnings.push('Credential should have 5 parts: accessKey/date/region/service/aws4_request.');
  }
  if (credential && credential.terminator !== 'aws4_request') {
    warnings.push(`Credential terminator is "${credential.terminator}", expected aws4_request.`);
  }

  const amzDate = get('X-Amz-Date');
  const issuedAt = parseAmzDate(amzDate);
  if (amzDate && issuedAt === null) warnings.push('X-Amz-Date is not in YYYYMMDDTHHMMSSZ form.');
  if (credential && amzDate && credential.date !== amzDate.slice(0, 8)) {
    warnings.push(`Credential date ${credential.date} does not match X-Amz-Date date ${amzDate.slice(0, 8)}.`);
  }

  const expRaw = get('X-Amz-Expires');
  const expires = expRaw !== undefined && /^\d+$/.test(expRaw) ? Number(expRaw) : null;
  if (expRaw && expires === null) warnings.push(`X-Amz-Expires "${expRaw}" is not a whole number.`);
  if (expires !== null && expires > MAX_EXPIRES) {
    warnings.push(`Expires ${expires} is over the ${MAX_EXPIRES} second (7 day) maximum.`);
  }

  const signedHeaders = (get('X-Amz-SignedHeaders') || '').split(';').filter(Boolean);
  if (get('X-Amz-SignedHeaders') && !signedHeaders.includes('host')) {
    warnings.push('host is not in X-Amz-SignedHeaders; it must be signed.');
  }

  // Expiry: expired once now >= issuedAt + expires.
  let expiresAt = null, expired = null, secondsLeft = null;
  if (issuedAt !== null && expires !== null) {
    expiresAt = issuedAt + expires;
    secondsLeft = Math.max(0, Math.floor(expiresAt - nowSec));
    expired = nowSec >= expiresAt;
  }
  if (issuedAt !== null && issuedAt - nowSec > 900) warnings.push('X-Amz-Date is more than 15 minutes in the future.');

  const report = {
    url: url.href,
    host: url.host,
    path: url.pathname,
    algorithm: algorithm || null,
    credential,
    accessKeyId: credential ? credential.accessKeyId : null,
    amzDate: amzDate || null,
    expires,
    expiresAt: expiresAt === null ? null : new Date(expiresAt * 1000).toISOString(),
    expired,
    secondsLeft,
    signedHeaders,
    signature: get('X-Amz-Signature') || null,
    securityToken: get('X-Amz-Security-Token') || null,
    warnings,
    verification: null,
  };

  if (o.secret) report.verification = await verify(url, pairs, report, o);
  return report;
}

/** Recompute the signature and compare. Returns { status: match|mismatch|skipped, ... }. */
async function verify(url, pairs, r, o) {
  if (!o.crypto) return { status: 'skipped', reason: 'No crypto provided.' };
  if (!r.credential || !r.signature || !r.amzDate || parseAmzDate(r.amzDate) === null) {
    return { status: 'skipped', reason: 'Credential, X-Amz-Date or Signature is missing or malformed.' };
  }
  if (r.algorithm !== sigv4.ALGORITHM) return { status: 'skipped', reason: 'Not a SigV4 URL.' };
  // Only host is reconstructable from a URL; other signed headers are unknown.
  const extra = r.signedHeaders.filter((h) => h !== 'host');
  if (extra.length || !r.signedHeaders.includes('host')) {
    return { status: 'skipped', reason: 'Signed headers other than host cannot be rebuilt from a URL.' };
  }
  const { region, service, date } = r.credential;
  const query = pairs.filter(([k]) => k.toLowerCase() !== 'x-amz-signature');
  const isS3 = service === 's3';
  // Decode per segment, then re-encode each segment and join with "/". An encoded slash
  // (%2F) stays encoded; decoding the whole path at once would turn it into a real "/".
  let uri;
  try {
    uri = url.pathname.split('/').map((s) => sigv4.uriEncode(decodeURIComponent(s))).join('/');
  } catch (e) { uri = url.pathname; }
  if (!isS3) uri = sigv4.uriEncode(uri, false); // other services encode the path twice
  const payloadHash = (pairs.find(([k]) => k.toLowerCase() === 'x-amz-content-sha256') || [])[1]
    || sigv4.UNSIGNED_PAYLOAD;
  const cr = sigv4.canonicalRequest({
    method: o.method || 'GET', path: '/', query, headers: { host: url.host },
    payloadHash, isS3,
  });
  // canonicalRequest encodes a raw path itself; ours is already encoded, so set line 2 directly.
  const lines = cr.text.split('\n');
  lines[1] = uri;
  cr.text = lines.join('\n');
  const sts = await sigv4.stringToSign(o.crypto, {
    amzDate: r.amzDate, region, service, canonicalRequestText: cr.text,
  });
  const key = await sigv4.deriveKey(o.crypto, o.secret, date, region, service);
  const computed = sigv4.toHex(await o.crypto.hmac(key, sts));
  return {
    status: computed === r.signature.toLowerCase() ? 'match' : 'mismatch',
    computed, provided: r.signature, canonicalRequest: cr.text, stringToSign: sts,
  };
}

const api = { inspect, parseAmzDate, parseCredential, MAX_EXPIRES };
if (typeof module === 'object' && module.exports) module.exports = api;
else root.PresignInspect = api;
})(typeof self !== 'undefined' ? self : this);
