'use strict';
// Browser implementation (crypto.subtle); same interface as crypto-node.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis.crypto || require('crypto').webcrypto);
  else root.PresignCrypto = factory(root.crypto);
})(typeof self !== 'undefined' ? self : this, function (webCrypto) {
  const enc = new TextEncoder();
  const bytes = (v) => (typeof v === 'string' ? enc.encode(v) : v);

  return {
    async sha256Hex(data) {
      const d = await webCrypto.subtle.digest('SHA-256', bytes(data));
      return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
    },
    async hmac(key, data) {
      const k = await webCrypto.subtle.importKey('raw', bytes(key),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      return new Uint8Array(await webCrypto.subtle.sign('HMAC', k, bytes(data)));
    },
  };
});
