'use strict';
// Injected on demand by the popup (activeTab + scripting). Thin page wrapper:
//   read   -> describes the visible form fields (and their values, for capture)
//   links  -> lists the page's anchors
//   apply  -> writes values ONLY into fields the popup's approved plan names,
//             after checking each one is still the field that was previewed.
// All matching and planning logic lives in the lib modules, run in the popup.

(function () {
  if (window.__ferrywiseLoaded) return; // injected twice: keep one listener
  window.__ferrywiseLoaded = true;

  let lastFields = []; // elements from the latest "read", indexed by idx

  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 80);

  // Best human label for a field: <label>, aria-label, aria-labelledby.
  function labelOf(el) {
    if (el.labels && el.labels.length) return clean(el.labels[0].textContent);
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const ref = document.getElementById(by.split(/\s+/)[0]);
      if (ref) return clean(ref.textContent);
    }
    const wrap = el.closest ? el.closest('label') : null;
    return wrap ? clean(wrap.textContent) : '';
  }

  // Identity of a field, used to detect that the page changed after the preview.
  const signature = (d) => [d.tag, d.type, d.name, d.id, d.label].join('|');

  // Payment and password fields are never read or filled.
  const isSensitive = (el) => {
    const ac = String(el.getAttribute('autocomplete') || '').toLowerCase();
    return el.type === 'password' || /(^|\s)cc-|current-password|new-password|one-time-code/.test(ac);
  };

  // withValues is true only for a capture; fill previews never receive field values.
  function readFields(withValues) {
    const all = Array.from(document.querySelectorAll('input, select, textarea'));
    lastFields = all.filter((el) => !el.disabled && !el.readOnly && !isSensitive(el) &&
      el.getClientRects().length > 0);
    return lastFields.map((el, idx) => {
      const d = {
        idx,
        tag: el.tagName.toLowerCase(),
        type: String(el.type || '').toLowerCase(),
        name: el.name || '',
        id: el.id || '',
        label: labelOf(el),
        placeholder: el.getAttribute('placeholder') || '',
        autocomplete: el.getAttribute('autocomplete') || '',
      };
      if (withValues) d.value = String(el.value || '');
      d.sig = signature(d);
      return d;
    });
  }

  function readLinks() {
    const links = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      text: a.textContent || a.getAttribute('aria-label') || '',
      href: a.getAttribute('href'),
    }));
    return { links, base: location.href };
  }

  // Sets a value the way a user would, so frameworks notice it. Returns true on success.
  function setValue(el, value) {
    const text = String(value);
    if (el.tagName.toLowerCase() === 'select') {
      const want = text.trim().toLowerCase();
      const opt = Array.from(el.options).find((o) => String(o.value).toLowerCase() === want ||
        clean(o.textContent).toLowerCase() === want);
      if (!opt) return false;
      el.value = opt.value;
    } else {
      const proto = el.tagName.toLowerCase() === 'textarea'
        ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, text); else el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // fills: [{idx, sig, value}]. All-or-nothing check first, so a changed page gets no writes.
  function apply(fills) {
    const list = Array.isArray(fills) ? fills : [];
    const stale = list.some((f) => {
      const el = lastFields[f.idx];
      if (!el || !el.isConnected || el.disabled || el.readOnly) return true;
      const d = {
        tag: el.tagName.toLowerCase(), type: String(el.type || '').toLowerCase(),
        name: el.name || '', id: el.id || '', label: labelOf(el),
      };
      return signature(d) !== f.sig;
    });
    if (stale) return { ok: false, changed: true, filled: 0 };
    let filled = 0;
    list.forEach((f) => { if (setValue(lastFields[f.idx], f.value)) filled += 1; });
    return { ok: true, changed: false, filled };
  }

  function handle(msg) {
    if (msg && msg.type === 'read') return { ok: true, host: location.hostname, fields: readFields(msg.withValues === true) };
    if (msg && msg.type === 'links') return Object.assign({ ok: true }, readLinks());
    if (msg && msg.type === 'apply') return apply(msg.fills);
    return { ok: false };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    sendResponse(handle(msg));
  });
})();
