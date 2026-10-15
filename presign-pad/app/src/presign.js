'use strict';
// S3 presigned URL builder (query-string SigV4). Crypto is injected, as in sigv4.js.
(function (root) {
const sigv4 = typeof module === 'object' && module.exports ? require('./sigv4') : root.PresignSigV4;

const MIN_EXPIRES = 1;
const MAX_EXPIRES = 604800; // 7 days, the AWS limit

/** Validate expiry; returns it as an integer or throws a descriptive Error. */
function validateExpires(value) {
  if (value === '' || value == null || typeof value === 'boolean') {
    throw new Error('Expires is required: enter a whole number of seconds between 1 and 604800.');
  }
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) {
    throw new Error(`Expires must be a number of seconds, got "${value}".`);
  }
  if (!Number.isInteger(n)) {
    throw new Error(`Expires must be a whole number of seconds, got ${n}.`);
  }
  if (n < MIN_EXPIRES || n > MAX_EXPIRES) {
    throw new Error(`Expires must be between ${MIN_EXPIRES} and ${MAX_EXPIRES} seconds (7 days), got ${n}.`);
  }
  return n;
}

function requireString(p, name) {
  if (typeof p[name] !== 'string' || !p[name].trim()) throw new Error(`${name} is required.`);
}

/**
 * Build a presigned S3 URL.
 * params: host (e.g. "examplebucket.s3.amazonaws.com", port allowed), path (raw, "/test.txt"),
 *   method (default GET), region, accessKeyId, secretAccessKey, sessionToken?, amzDate
 *   (YYYYMMDDTHHMMSSZ), expires (1..604800), query? (extra params, signed too),
 *   scheme? (default https).
 * Only the host header is signed; payload is UNSIGNED-PAYLOAD.
 * Returns { url, signature, canonicalRequest, stringToSign, signedHeaders }.
 */
async function presign(crypto, p) {
  ['host', 'region', 'accessKeyId', 'secretAccessKey', 'amzDate'].forEach((n) => requireString(p, n));
  if (!/^\d{8}T\d{6}Z$/.test(p.amzDate)) {
    throw new Error(`amzDate must look like 20130524T000000Z, got "${p.amzDate}".`);
  }
  const expires = validateExpires(p.expires);
  const host = p.host.trim();
  const method = (p.method || 'GET').toUpperCase();
  const path = p.path || '/';
  const scheme = p.scheme || 'https';
  const service = 's3';
  const date = p.amzDate.slice(0, 8);

  // Query pairs: caller's extras plus the X-Amz-* auth parameters.
  const pairs = sigv4.parseQuery(typeof p.query === 'string' ? p.query : '');
  if (p.query && typeof p.query === 'object') {
    for (const k of Object.keys(p.query)) pairs.push([k, p.query[k]]);
  }
  pairs.push(
    ['X-Amz-Algorithm', sigv4.ALGORITHM],
    ['X-Amz-Credential', `${p.accessKeyId}/${sigv4.credentialScope(date, p.region, service)}`],
    ['X-Amz-Date', p.amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'host'],
  );
  if (p.sessionToken) pairs.push(['X-Amz-Security-Token', p.sessionToken]);

  const cr = sigv4.canonicalRequest({
    method, path, query: pairs, headers: { host },
    payloadHash: sigv4.UNSIGNED_PAYLOAD, isS3: true,
  });
  const sts = await sigv4.stringToSign(crypto, {
    amzDate: p.amzDate, region: p.region, service, canonicalRequestText: cr.text,
  });
  const key = await sigv4.deriveKey(crypto, p.secretAccessKey, date, p.region, service);
  const signature = sigv4.toHex(await crypto.hmac(key, sts));

  const qs = sigv4.canonicalQuery(pairs) + '&X-Amz-Signature=' + signature;
  const url = `${scheme}://${host}${sigv4.canonicalUri(path, true)}?${qs}`;
  return { url, signature, canonicalRequest: cr.text, stringToSign: sts, signedHeaders: cr.signedHeaders };
}

const api = { presign, validateExpires, MIN_EXPIRES, MAX_EXPIRES };
if (typeof module === 'object' && module.exports) module.exports = api;
else root.PresignPresign = api;
})(typeof self !== 'undefined' ? self : this);
