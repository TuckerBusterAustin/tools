'use strict';
// SigV4 core. Pure functions; crypto is injected:
//   crypto.sha256Hex(data: string|Uint8Array) -> Promise<string>
//   crypto.hmac(key: string|Uint8Array, data: string) -> Promise<Uint8Array>
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PresignSigV4 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ALGORITHM = 'AWS4-HMAC-SHA256';
  const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

  /** RFC 3986 encoding as AWS wants it: only A-Za-z0-9-_.~ stay; '/' optionally kept. */
  function uriEncode(str, encodeSlash) {
    const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g,
      (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    return encodeSlash === false ? String(str).split('/').map(enc).join('/') : enc(String(str));
  }

  /** Resolve "." / ".." and empty segments (non-S3 services only). Keeps trailing slash. */
  function normalizePath(path) {
    const out = [];
    for (const seg of path.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') out.pop(); else out.push(seg);
    }
    const trailing = path.length > 1 && /\/(\.{0,2})?$/.test(path) && out.length > 0;
    return '/' + out.join('/') + (trailing ? '/' : '');
  }

  /**
   * Canonical URI from a RAW (unencoded) path.
   * S3: encoded once, no normalisation. Other services: normalised, encoded twice.
   */
  function canonicalUri(rawPath, isS3) {
    let p = rawPath || '/';
    if (p[0] !== '/') p = '/' + p;
    if (isS3) return uriEncode(p, false);
    return uriEncode(uriEncode(normalizePath(p), false), false);
  }

  /** Parse a query string ("a=1&b=2", leading "?" ok) into raw [key, value] pairs. */
  function parseQuery(qs) {
    if (!qs) return [];
    return String(qs).replace(/^\?/, '').split('&').filter(Boolean).map((kv) => {
      const i = kv.indexOf('=');
      const dec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
      return i < 0 ? [dec(kv), ''] : [dec(kv.slice(0, i)), dec(kv.slice(i + 1))];
    });
  }

  /** Canonical query from a string, an object, or an array of [k, v] (raw values). */
  function canonicalQuery(query) {
    let pairs;
    if (typeof query === 'string' || query == null) pairs = parseQuery(query);
    else if (Array.isArray(query)) pairs = query;
    else pairs = Object.keys(query).map((k) => [k, query[k]]);
    return pairs.map(([k, v]) => [uriEncode(k), uriEncode(v == null ? '' : v)])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
      .map(([k, v]) => k + '=' + v).join('&');
  }

  /** Lowercase names, trim + collapse spaces in values, sort by name. */
  function canonicalHeaders(headers) {
    const map = {};
    for (const name of Object.keys(headers || {})) {
      const v = String(headers[name]).trim().replace(/\s+/g, ' ');
      const k = name.trim().toLowerCase();
      map[k] = k in map ? map[k] + ',' + v : v;
    }
    const names = Object.keys(map).sort();
    return {
      canonicalHeaders: names.map((n) => n + ':' + map[n] + '\n').join(''),
      signedHeaders: names.join(';'),
    };
  }

  function canonicalRequest({ method, path, query, headers, payloadHash, isS3 }) {
    const h = canonicalHeaders(headers);
    return {
      text: [method.toUpperCase(), canonicalUri(path, isS3), canonicalQuery(query),
        h.canonicalHeaders, h.signedHeaders, payloadHash].join('\n'),
      signedHeaders: h.signedHeaders,
    };
  }

  const credentialScope = (date, region, service) => `${date}/${region}/${service}/aws4_request`;

  async function stringToSign(crypto, { amzDate, region, service, canonicalRequestText }) {
    return [ALGORITHM, amzDate, credentialScope(amzDate.slice(0, 8), region, service),
      await crypto.sha256Hex(canonicalRequestText)].join('\n');
  }

  async function deriveKey(crypto, secret, date, region, service) {
    const kDate = await crypto.hmac('AWS4' + secret, date);
    const kRegion = await crypto.hmac(kDate, region);
    const kService = await crypto.hmac(kRegion, service);
    return crypto.hmac(kService, 'aws4_request');
  }

  const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  /**
   * Sign a request. params: method, path (raw), query, headers, body, amzDate
   * (YYYYMMDDTHHMMSSZ), region, service, accessKeyId, secretAccessKey,
   * sessionToken?, unsignedPayload?, payloadHash?.
   * S3 (service "s3") gets single path encoding and an x-amz-content-sha256 header.
   * Returns every intermediate value so the UI can show it.
   */
  async function sign(crypto, p) {
    // Fail loudly instead of producing a confident but wrong signature.
    for (const n of ['method', 'region', 'service', 'accessKeyId', 'secretAccessKey', 'amzDate']) {
      if (typeof p[n] !== 'string' || !p[n].trim()) throw new Error(`${n} is required.`);
    }
    if (!/^\d{8}T\d{6}Z$/.test(p.amzDate)) throw new Error('amzDate must look like YYYYMMDDTHHMMSSZ.');
    const isS3 = p.service === 's3';
    const headers = Object.assign({}, p.headers);
    const has = (n) => Object.keys(headers).some((k) => k.toLowerCase() === n);
    let payloadHash = p.payloadHash;
    if (!payloadHash) {
      payloadHash = p.unsignedPayload ? UNSIGNED_PAYLOAD : await crypto.sha256Hex(p.body || '');
    }
    if (!has('x-amz-date')) headers['x-amz-date'] = p.amzDate;
    if (p.sessionToken && !has('x-amz-security-token')) headers['x-amz-security-token'] = p.sessionToken;
    if (isS3 && !has('x-amz-content-sha256')) headers['x-amz-content-sha256'] = payloadHash;

    const cr = canonicalRequest({ method: p.method, path: p.path, query: p.query, headers, payloadHash, isS3 });
    const sts = await stringToSign(crypto, { amzDate: p.amzDate, region: p.region, service: p.service, canonicalRequestText: cr.text });
    const key = await deriveKey(crypto, p.secretAccessKey, p.amzDate.slice(0, 8), p.region, p.service);
    const signature = toHex(await crypto.hmac(key, sts));
    const scope = credentialScope(p.amzDate.slice(0, 8), p.region, p.service);
    const authorization = `${ALGORITHM} Credential=${p.accessKeyId}/${scope}, SignedHeaders=${cr.signedHeaders}, Signature=${signature}`;
    headers.Authorization = authorization;
    return { canonicalRequest: cr.text, signedHeaders: cr.signedHeaders, stringToSign: sts,
      signature, authorization, payloadHash, headers };
  }

  /**
   * Same input as sign(); returns only the intermediates the explainer diffs:
   * canonicalRequest, stringToSign, signedHeaders, credentialScope, signature.
   * Delegates to sign() so the two can never disagree.
   */
  async function signInternals(crypto, p) {
    const r = await sign(crypto, p);
    return {
      canonicalRequest: r.canonicalRequest,
      stringToSign: r.stringToSign,
      signedHeaders: r.signedHeaders,
      credentialScope: credentialScope(p.amzDate.slice(0, 8), p.region, p.service),
      signature: r.signature,
    };
  }

  return { ALGORITHM, UNSIGNED_PAYLOAD, uriEncode, normalizePath, canonicalUri, parseQuery,
    canonicalQuery, canonicalHeaders, canonicalRequest, credentialScope, stringToSign,
    deriveKey, toHex, sign, signInternals };
});
