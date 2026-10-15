'use strict';
// Node implementation of the injected crypto interface (used by tests).
const nodeCrypto = require('crypto');

module.exports = {
  /** Hex SHA-256 of a string (UTF-8) or Uint8Array. */
  async sha256Hex(data) {
    return nodeCrypto.createHash('sha256').update(data).digest('hex');
  },
  /** HMAC-SHA256; returns raw bytes as Uint8Array. */
  async hmac(key, data) {
    return new Uint8Array(nodeCrypto.createHmac('sha256', key).update(data).digest());
  },
};
