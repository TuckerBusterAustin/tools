/* Pure logic: record and read events using an injected storage object.
 * storage needs only getItem(key) and setItem(key, value), so localStorage
 * or an in-memory fake both work. Works as a <script> (global RollwellEvents)
 * and under Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RollwellEvents = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EVENT_TYPES = ['view', 'signup', 'tier_click', 'tier_click_email'];

  /* options:
   *   storage    - object with getItem/setItem (required)
   *   prefix     - storage key prefix, e.g. "rollwell:" (default "rollwell:")
   *   getVariant - function returning the current headline variant ("A"/"B")
   *   now        - function returning a Date or ms number (default: Date.now) */
  function createEvents(options) {
    var storage = options && options.storage;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      throw new TypeError('storage with getItem and setItem is required');
    }
    var key = (options.prefix == null ? 'rollwell:' : String(options.prefix)) + 'events';
    var getVariant = options.getVariant || function () { return null; };
    var now = options.now || Date.now;

    /* Returns the stored list, or [] when missing, corrupt or not an array. */
    function readEvents() {
      var raw;
      try { raw = storage.getItem(key); } catch (e) { return []; }
      if (!raw) return [];
      try {
        var list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    }

    /* Appends an event and returns it. Throws on an unknown type.
     * setItem errors (blocked or full storage) propagate so callers can show them. */
    function recordEvent(type, payload) {
      if (EVENT_TYPES.indexOf(type) === -1) {
        throw new Error('Unknown event type: ' + type);
      }
      var t = now();
      var event = {
        type: type,
        variant: getVariant() || null,
        timestamp: t instanceof Date ? t.toISOString() : new Date(t).toISOString(),
        payload: payload == null ? {} : payload
      };
      var list = readEvents();
      list.push(event);
      storage.setItem(key, JSON.stringify(list));
      return event;
    }

    return { recordEvent: recordEvent, readEvents: readEvents, key: key };
  }

  return { EVENT_TYPES: EVENT_TYPES, createEvents: createEvents };
});
