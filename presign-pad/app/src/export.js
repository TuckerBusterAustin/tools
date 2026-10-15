'use strict';
// Build shell commands (curl, aws cli) from a signed request. Pure string work.
(function (root) {
  /** POSIX single-quote a value: a'b becomes 'a'\''b'. */
  function shellQuote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
  }

  /** curl command. req = { method, url, headers: {name: value}, body }. */
  function toCurl(req) {
    const r = req || {};
    const parts = ['curl', '-X', shellQuote((r.method || 'GET').toUpperCase())];
    const h = r.headers || {};
    for (const k of Object.keys(h)) parts.push('-H', shellQuote(k + ': ' + h[k]));
    if (r.body !== undefined && r.body !== null && r.body !== '') parts.push('--data-binary', shellQuote(r.body));
    parts.push(shellQuote(r.url));
    return parts.join(' ');
  }

  /**
   * `aws s3 presign` for an S3 GET presigned URL; null for any other method or
   * a URL we cannot map to bucket/key. Handles virtual-hosted and path-style hosts.
   */
  function toAwsCli(req) {
    const r = req || {};
    if (String(r.method || '').toUpperCase() !== 'GET') return null;
    let u;
    try { u = new URL(r.url); } catch (e) { return null; }
    const m = /^(?:(.+)\.)?s3[.-]([a-z0-9-]+\.)?amazonaws\.com$/.exec(u.hostname)
      || /^(?:(.+)\.)?s3\.amazonaws\.com$/.exec(u.hostname);
    if (!m) return null;
    let bucket = m[1];
    let path = u.pathname.replace(/^\//, '');
    if (!bucket) { // path-style: first segment is the bucket
      const i = path.indexOf('/');
      if (i < 0) return null;
      bucket = path.slice(0, i); path = path.slice(i + 1);
    }
    if (!bucket || !path) return null;
    let key;
    try { key = decodeURIComponent(path); } catch (e) { return null; }
    const cred = u.searchParams.get('X-Amz-Credential') || '';
    const region = cred.split('/')[2];
    const expires = u.searchParams.get('X-Amz-Expires');
    const parts = ['aws', 's3', 'presign', shellQuote('s3://' + bucket + '/' + key)];
    if (expires && /^\d+$/.test(expires)) parts.push('--expires-in', expires);
    if (region) parts.push('--region', shellQuote(region));
    return parts.join(' ');
  }

  const api = { shellQuote, toCurl, toAwsCli };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PresignExport = api;
})(typeof self !== 'undefined' ? self : this);
