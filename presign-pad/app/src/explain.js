'use strict';
// Error response parser and plain-words explanations. Pure, no I/O.

(function (root) {
// Known AWS error codes -> explanation.
const EXPLANATIONS = {
  SignatureDoesNotMatch: {
    summary: 'The signature AWS computed differs from the one you sent.',
    likelyCauses: [
      'Wrong secret access key (or stray whitespace in it)',
      'Canonical request differs: path encoding, query order, or header values',
      'A signed header was changed or added in transit (e.g. by a proxy)',
      'Wrong region or service in the credential scope',
    ],
    fixHint: 'Compare the server StringToSign/CanonicalRequest with yours using the diff helper.',
  },
  InvalidAccessKeyId: {
    summary: 'AWS does not recognise this access key ID.',
    likelyCauses: ['Typo in the access key ID', 'Key was deleted or deactivated', 'Key belongs to a different partition or account'],
    fixHint: 'Re-copy the access key ID and confirm it is active in IAM.',
  },
  ExpiredToken: {
    summary: 'The session token has expired.',
    likelyCauses: ['Temporary credentials passed their lifetime'],
    fixHint: 'Get fresh temporary credentials and sign again.',
  },
  RequestTimeTooSkewed: {
    summary: 'Your clock and the AWS clock differ by more than 15 minutes.',
    likelyCauses: ['Local system clock is wrong', 'X-Amz-Date was reused from an old request'],
    fixHint: 'Sync your clock and regenerate the timestamp.',
  },
  AccessDenied: {
    summary: 'The signature was valid but the identity is not allowed to do this.',
    likelyCauses: ['IAM or bucket policy denies the action', 'Presigned URL expired', 'Wrong bucket or object key'],
    fixHint: 'Check the IAM policy and bucket policy for this action and resource.',
  },
  AuthorizationHeaderMalformed: {
    summary: 'The Authorization header is not in the expected format.',
    likelyCauses: ['Credential scope has the wrong region, date or service', 'Missing SignedHeaders or Signature part'],
    fixHint: 'Use the region named in the error message and the form AKID/date/region/service/aws4_request.',
  },
  MissingSecurityHeader: {
    summary: 'A required header is missing from the request.',
    likelyCauses: ['Host or x-amz-date not sent', 'x-amz-content-sha256 missing for S3'],
    fixHint: 'Add the header named in the message and include it in SignedHeaders.',
  },
  AuthorizationQueryParametersError: {
    summary: 'The presigned URL query parameters are missing, malformed or inconsistent.',
    likelyCauses: ['X-Amz-Credential has the wrong scope format', 'X-Amz-Expires is not a number or is above 604800 seconds',
      'X-Amz-Algorithm, X-Amz-Date or X-Amz-SignedHeaders missing'],
    fixHint: 'Re-generate the URL and check each X-Amz-* parameter against the message.',
  },
  ExpiredRequest: {
    summary: 'The presigned request has expired.',
    likelyCauses: ['X-Amz-Expires elapsed', 'Clock skew when signing'],
    fixHint: 'Generate a new presigned URL with a longer (max 7 days) expiry.',
  },
  InvalidToken: {
    summary: 'The security token is not valid.',
    likelyCauses: ['Token truncated or mistyped', 'Token from a different account or partition'],
    fixHint: 'Re-copy the full session token.',
  },
  NoSuchBucket: {
    summary: 'The bucket does not exist.',
    likelyCauses: ['Typo in bucket name', 'Wrong region endpoint'],
    fixHint: 'Verify the bucket name and host.',
  },
  NoSuchKey: {
    summary: 'The object key does not exist.',
    likelyCauses: ['Typo in key', 'Key not URL-encoded as expected'],
    fixHint: 'Verify the object key.',
  },
};

// Strip optional CDATA wrapper and decode basic XML entities.
function unxml(s) {
  const m = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(s);
  if (m) return m[1];
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function xmlTag(text, tag) {
  const m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(text);
  return m ? unxml(m[1]) : undefined;
}

// Parse an XML or JSON error body. Never throws.
// Returns {code, message, stringToSign?, canonicalRequest?}
function parseError(body) {
  const out = { code: undefined, message: undefined };
  if (typeof body !== 'string' || !body.trim()) return out;
  const text = body.trim();
  if (text[0] === '{') {
    try {
      const j = JSON.parse(text);
      if (j && typeof j === 'object') {
        let code = j.code || j.Code || j.__type || j.errorCode;
        if (typeof code === 'string') code = code.split('#').pop().split(':')[0];
        out.code = typeof code === 'string' ? code : undefined;
        const msg = j.message || j.Message || j.errorMessage;
        out.message = typeof msg === 'string' ? msg : undefined;
      }
    } catch (e) { /* malformed JSON: fall through with empty result */ }
    return out;
  }
  out.code = xmlTag(text, 'Code');
  out.message = xmlTag(text, 'Message');
  const sts = xmlTag(text, 'StringToSign');
  const cr = xmlTag(text, 'CanonicalRequest');
  if (sts !== undefined) out.stringToSign = sts;
  if (cr !== undefined) out.canonicalRequest = cr;
  const sp = xmlTag(text, 'SignatureProvided');
  const ak = xmlTag(text, 'AWSAccessKeyId');
  if (sp !== undefined) out.signatureProvided = sp.trim();
  if (ak !== undefined) out.accessKeyId = ak.trim();
  return out;
}

// Parse and explain. Returns {code, summary, likelyCauses[], fixHint, message, stringToSign?, canonicalRequest?}
function explain(body) {
  const p = parseError(body);
  const known = p.code && Object.prototype.hasOwnProperty.call(EXPLANATIONS, p.code)
    ? EXPLANATIONS[p.code] : null;
  const res = known
    ? { code: p.code, summary: known.summary, likelyCauses: known.likelyCauses.slice(), fixHint: known.fixHint }
    : p.code
      ? { code: p.code, summary: 'AWS returned error "' + p.code + '", which this tool has no specific advice for.',
          likelyCauses: ['See the message from the server for details'],
          fixHint: 'Search the AWS documentation for this error code.' }
      : { code: null, summary: 'No error code could be read from this response.',
          likelyCauses: ['The text is empty, not XML/JSON, or not an AWS error'],
          fixHint: 'Paste the complete response body.' };
  res.message = p.message || '';
  if (p.stringToSign !== undefined) res.stringToSign = p.stringToSign;
  if (p.canonicalRequest !== undefined) res.canonicalRequest = p.canonicalRequest;
  if (p.signatureProvided !== undefined) res.signatureProvided = p.signatureProvided;
  if (p.accessKeyId !== undefined) res.accessKeyId = p.accessKeyId;
  return res;
}

// ---- Diff against locally computed values ----

const HINTS = {
  method: 'The HTTP method differs. Sign with the exact method you send.',
  path: 'The path differs. Check URL encoding (S3 encodes once, "/" kept) and that the key is the raw, unencoded one.',
  query: 'The query string differs. Check parameter order, encoding and any extra parameters added in transit.',
  header: 'A signed header differs. Its value must match byte for byte what is sent (watch case, spaces and proxies).',
  signedHeaders: 'The list of signed headers differs. Sign and send the same set of headers.',
  payloadHash: 'The payload hash differs. Check the body, or use UNSIGNED-PAYLOAD consistently.',
  algorithm: 'The signing algorithm differs. Expected AWS4-HMAC-SHA256.',
  timestamp: 'The request timestamp (x-amz-date) differs. Sign with the same timestamp you send.',
  date: 'The credential-scope date differs from the one the server used. Check the timestamp.',
  region: 'The region in the credential scope differs. Sign for the bucket\'s actual region.',
  service: 'The service in the credential scope differs. S3 requests use "s3".',
  scope: 'The credential scope is malformed or differs.',
  stringToSign: 'The hashed canonical request differs; see the canonical request differences.',
  accessKeyId: 'The access key ID differs from the one you entered locally.',
  signature: 'The signature the server received is not the one computed locally from these inputs.',
};

function diff(field, server, local, name) {
  const d = { field, server, local, hint: HINTS[field] };
  if (name !== undefined) d.name = name;
  return d;
}

// Split a canonical request into parts. Tolerant of short or odd input.
function splitCanonical(text) {
  const lines = String(text).split(/\r?\n/);
  const n = lines.length;
  const headers = {};
  for (const l of lines.slice(3, Math.max(3, n - 3))) {
    const i = l.indexOf(':');
    if (i > 0) headers[l.slice(0, i)] = l.slice(i + 1);
  }
  return { method: lines[0], path: lines[1], query: lines[2], headers,
    signedHeaders: n >= 2 ? lines[n - 2] : undefined, payloadHash: n >= 1 ? lines[n - 1] : undefined };
}

function diffCanonical(server, local) {
  const s = splitCanonical(server), l = splitCanonical(local), out = [];
  for (const f of ['method', 'path', 'query']) if (s[f] !== l[f]) out.push(diff(f, s[f], l[f]));
  const names = Array.from(new Set(Object.keys(s.headers).concat(Object.keys(l.headers)))).sort();
  for (const h of names) if (s.headers[h] !== l.headers[h]) out.push(diff('header', s.headers[h], l.headers[h], h));
  for (const f of ['signedHeaders', 'payloadHash']) if (s[f] !== l[f]) out.push(diff(f, s[f], l[f]));
  return out;
}

function diffStringToSign(server, local, skipHash) {
  const a = String(server).split(/\r?\n/), b = String(local).split(/\r?\n/), out = [];
  if (a[0] !== b[0]) out.push(diff('algorithm', a[0], b[0]));
  if (a[1] !== b[1]) out.push(diff('timestamp', a[1], b[1]));
  if (a[2] !== b[2]) {
    const sp = (a[2] || '').split('/'), lp = (b[2] || '').split('/');
    // Scope is date/region/service/aws4_request: 4 parts.
    if (sp.length !== 4 || lp.length !== 4) out.push(diff('scope', a[2], b[2]));
    else {
      if (sp[0] !== lp[0]) out.push(diff('date', sp[0], lp[0]));
      if (sp[1] !== lp[1]) out.push(diff('region', sp[1], lp[1]));
      if (sp[2] !== lp[2]) out.push(diff('service', sp[2], lp[2]));
    }
  }
  // The hash line always changes when the canonical request does; do not repeat the cause.
  if (!skipHash && a[3] !== b[3]) out.push(diff('stringToSign', a[3], b[3]));
  return out;
}

/**
 * Explain an S3 error body and diff it against local values.
 * local: {canonicalRequest?, stringToSign?, signature?, accessKeyId?} (from sigv4.signInternals).
 * Never throws. Returns {ok, error?, code, message, summary, likelyCauses, fixHint,
 * differences[{field, server, local, hint, name?}], compared, hint}.
 */
function diagnose(body, local) {
  try {
    const r = explain(body);
    if (!r.code) {
      return Object.assign(r, { ok: false, error: 'Could not find an error Code in the pasted text.',
        differences: [], compared: false, hint: r.fixHint });
    }
    const L = local && typeof local === 'object' ? local : {};
    const differences = [];
    let compared = false;
    let crDiffers = false;
    if (typeof r.canonicalRequest === 'string' && typeof L.canonicalRequest === 'string') {
      compared = true;
      const d = diffCanonical(r.canonicalRequest, L.canonicalRequest);
      crDiffers = d.length > 0;
      differences.push(...d);
    }
    if (typeof r.stringToSign === 'string' && typeof L.stringToSign === 'string') {
      compared = true;
      differences.push(...diffStringToSign(r.stringToSign, L.stringToSign, crDiffers));
    }
    if (r.accessKeyId && typeof L.accessKeyId === 'string' && r.accessKeyId !== L.accessKeyId) {
      compared = true;
      differences.push(diff('accessKeyId', r.accessKeyId, L.accessKeyId));
    }
    let hint = r.fixHint;
    if (r.code === 'SignatureDoesNotMatch') {
      if (!compared) hint = 'The error has no CanonicalRequest/StringToSign to compare (or no local values). ' + r.fixHint;
      else if (differences.length === 0) {
        hint = 'Canonical request and string to sign match what was computed locally, so check the secret key '
          + '(typos, whitespace, wrong key for this access key ID).';
        if (r.signatureProvided && typeof L.signature === 'string' && r.signatureProvided !== L.signature) {
          differences.push(diff('signature', r.signatureProvided, L.signature));
        }
      } else hint = 'Fix the listed differences first; the first one is usually the root cause.';
    }
    return Object.assign(r, { ok: true, differences, compared, hint });
  } catch (e) {
    return { ok: false, error: 'Unexpected problem reading the input: ' + (e && e.message), code: null,
      message: '', summary: '', likelyCauses: [], fixHint: '', differences: [], compared: false, hint: '' };
  }
}

// Compare server vs local text line by line.
// Returns null when equal, else {line (1-based), server, local}.
function diffFirst(server, local) {
  const a = String(server == null ? '' : server).split(/\r?\n/);
  const b = String(local == null ? '' : local).split(/\r?\n/);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return { line: i + 1, server: a[i], local: b[i] };
  }
  return null;
}

// Every line of both texts side by side: [{line, server, local, same}].
// A line missing on one side is undefined there and counts as different.
function diffLines(server, local) {
  const a = String(server == null ? '' : server).split(/\r?\n/);
  const b = String(local == null ? '' : local).split(/\r?\n/);
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    out.push({ line: i + 1, server: a[i], local: b[i], same: a[i] === b[i] });
  }
  return out;
}

const api = { explain, parseError, diffFirst, diffLines, diagnose, EXPLANATIONS };
if (typeof module === 'object' && module.exports) module.exports = api;
else root.PresignExplain = api;
})(typeof self !== 'undefined' ? self : this);
