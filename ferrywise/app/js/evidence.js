'use strict';
// Evidence-gate log: validate and add threads, normalize URLs, dedupe, evaluate the gate, make CSV.
// No browser globals. "today" is always passed in as 'YYYY-MM-DD' so tests are deterministic.

(function () {
const COLLECTION = 'threads';
const NEED_THREADS = 15;
const NEED_FREE_FAILED = 5;

// Query parameters that only track where a visitor came from.
const TRACKING = /^(utm_.*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref|ref_src|ref_url|share_id|context)$/i;

// Returns a canonical string for a http(s) URL, or null if it is not one.
// Lowercases the host, drops the #fragment, tracking params and a trailing slash.
function normalizeUrl(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  let u;
  try { u = new URL(text); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname) return null;
  u.hash = '';
  const keep = [];
  u.searchParams.forEach((v, k) => { if (!TRACKING.test(k)) keep.push([k, v]); });
  u.search = '';
  keep.forEach(([k, v]) => u.searchParams.append(k, v));
  let path = u.pathname.replace(/\/+$/, '');
  const query = u.search;
  // URL lowercases the host already; rebuild without the trailing slash.
  return u.protocol + '//' + u.host + path + query;
}

// True when s is a real calendar date written YYYY-MM-DD.
function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// today minus 12 months as 'YYYY-MM-DD' (29 Feb falls back to 28 Feb).
function oldestAllowed(today) {
  const y = Number(today.slice(0, 4)) - 1;
  const m = today.slice(5, 7);
  let d = today.slice(8, 10);
  if (m === '02' && d === '29') d = '28';
  return String(y).padStart(4, '0') + '-' + m + '-' + d;
}

// Accepts 'a, b' or ['a','b']; returns a clean, de-duplicated list.
function parseTools(tools) {
  const arr = Array.isArray(tools) ? tools : String(tools == null ? '' : tools).split(',');
  const out = [];
  arr.forEach((t) => {
    const s = String(t).trim();
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  });
  return out;
}

// Checks one candidate thread against the already-logged ones.
// Returns { ok, errors: {field: message}, thread } (thread only when ok).
function validateThread(input, existing, today) {
  const src = input || {};
  const errors = {};
  const url = normalizeUrl(src.url);
  if (!url) {
    errors.url = 'Error: use a link starting with http:// or https://.';
  } else if ((existing || []).some((t) => normalizeUrl(t.url) === url)) {
    errors.url = 'Error: this thread is already logged. Links match after removing tracking tags, #fragments and a trailing slash.';
  }

  const date = typeof src.date === 'string' ? src.date.trim() : '';
  if (!isIsoDate(date)) {
    errors.date = 'Error: enter the date as YYYY-MM-DD.';
  } else if (date > today) {
    errors.date = 'Error: this date is in the future.';
  } else if (date < oldestAllowed(today)) {
    errors.date = 'Error: this thread is older than 12 months (limit: ' + oldestAllowed(today) + ').';
  }

  const workflow = typeof src.workflow === 'string' ? src.workflow.trim() : '';
  if (!workflow) errors.workflow = 'Error: name the workflow the thread describes.';

  let price = null;
  if (src.price !== undefined && src.price !== null && String(src.price).trim() !== '') {
    price = Number(src.price);
    if (!isFinite(price) || price < 0) errors.price = 'Error: price must be a number, 0 or more.';
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    errors: {},
    thread: {
      url: String(src.url).trim(),
      date,
      workflow,
      tools: parseTools(src.tools),
      freeToolFailed: src.freeToolFailed === true,
      price,
    },
  };
}

// Validates and saves a thread through a store (see js/store.js). Returns the validation result,
// plus the saved record and the new gate state when ok.
function addThread(store, input, today) {
  const res = validateThread(input, store.list(COLLECTION), today);
  if (!res.ok) return res;
  res.thread = store.add(COLLECTION, res.thread);
  res.gate = evaluateGate(store.list(COLLECTION));
  return res;
}

// Applies the gate: 15 threads, 5 of them where free tools did not solve it.
// missing is '' when passing, else a plain sentence naming what is short.
function evaluateGate(threads) {
  const list = threads || [];
  const total = list.length;
  const freeFailed = list.filter((t) => t.freeToolFailed === true).length;
  const needT = Math.max(0, NEED_THREADS - total);
  const needF = Math.max(0, NEED_FREE_FAILED - freeFailed);
  const parts = [];
  if (needT) parts.push(needT + ' more thread' + (needT === 1 ? '' : 's'));
  if (needF) parts.push(needF + ' more thread' + (needF === 1 ? '' : 's') + " where free tools didn't solve it");
  return {
    total,
    freeFailed,
    pass: needT === 0 && needF === 0,
    missing: parts.length ? 'Needs ' + parts.join(' and ') + '.' : '',
    missingThreads: needT,
    missingFreeFailed: needF,
  };
}

// One CSV field: quoted when it holds a comma, quote or newline; quotes are doubled.
function csvField(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// CSV text with a header row. Tools are joined with '; '.
function toCsv(threads) {
  const rows = [['date', 'url', 'workflow', 'tools', 'free_tool_failed', 'price']];
  (threads || []).forEach((t) => {
    rows.push([t.date, t.url, t.workflow, (t.tools || []).join('; '), t.freeToolFailed ? 'Yes' : 'No', t.price]);
  });
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

const api = {
  COLLECTION, NEED_THREADS, NEED_FREE_FAILED,
  normalizeUrl, isIsoDate, oldestAllowed, parseTools,
  validateThread, addThread, evaluateGate, toCsv,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.FerrywiseEvidence = api;
})();
