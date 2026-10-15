'use strict';
// Pure logic for the hand-entered evidence-gate log: validate, dedupe, count, CSV.
// Works in Node (require) and as a classic <script> (window.FerrywiseEvidence).

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const csvLib = isNode ? require('../src/csv') : root.FerrywiseCsv;

  const NEED_THREADS = 15;
  const NEED_NOT_SOLVED = 5;
  const SOLVED = ['yes', 'no', 'unknown'];
  const COLUMNS = ['url', 'date', 'workflow', 'tools', 'solved', 'price', 'counted'];

  // Key used to compare URLs: lower-case host (URL does this), no hash, no trailing slash.
  function urlKey(url) {
    const u = new URL(String(url).trim());
    u.hash = '';
    return u.toString().replace(/\/+$/, '');
  }

  // Strict YYYY-MM-DD real calendar date, as a UTC Date; otherwise null.
  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const ok = d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
    return ok ? d : null;
  }

  // True if the date is more than 12 months before `now`.
  function isOlderThan12Months(date, now) {
    const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
    return date.getTime() < cutoff.getTime();
  }

  // Returns { ok, errors[], entry } for a form input. `existing` is the logged entries.
  function validateEntry(input, existing, now) {
    const clock = now instanceof Date ? now : new Date();
    const i = input || {};
    const errors = [];
    let url = String(i.url || '').trim();
    let key = null;
    try {
      if (new URL(url).protocol !== 'https:' || !/^https:\/\//i.test(url)) throw new Error('scheme');
      key = urlKey(url);
    } catch (e) {
      errors.push('Error: Enter a full URL starting with https://.');
    }
    if (key && (existing || []).some((e) => { try { return urlKey(e.url) === key; } catch (x) { return false; } })) {
      errors.push('Error: This thread is already logged (same URL).');
    }
    const date = parseDate(i.date);
    if (!date) errors.push('Error: Enter the date as YYYY-MM-DD.');
    else {
      const today = Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate());
      if (date.getTime() > today) errors.push("Error: The date can't be in the future.");
    }
    const workflow = String(i.workflow || '').trim();
    if (!workflow) errors.push('Error: Name the workflow people were trying to do.');
    const solved = SOLVED.includes(i.solved) ? i.solved : 'unknown';
    if (errors.length) return { ok: false, errors };
    const tools = Array.isArray(i.tools) ? i.tools : String(i.tools || '').split(',');
    return {
      ok: true,
      errors: [],
      entry: {
        url, date: String(i.date).trim(), workflow,
        tools: tools.map((t) => String(t).trim()).filter(Boolean),
        solved, price: String(i.price || '').trim(),
      },
    };
  }

  // Gate counters. Entries older than 12 months and repeat URLs are not counted.
  function gate(entries, now) {
    const clock = now instanceof Date ? now : new Date();
    const seen = new Set();
    let threads = 0, notSolved = 0, older = 0;
    (entries || []).forEach((e) => {
      let key; const d = parseDate(e && e.date);
      try { key = urlKey(e.url); } catch (x) { return; }
      if (!d || seen.has(key)) return;
      seen.add(key);
      if (isOlderThan12Months(d, clock)) { older += 1; return; }
      threads += 1;
      if (e.solved === 'no') notSolved += 1;
    });
    return {
      threads, notSolved, older,
      needThreads: NEED_THREADS, needNotSolved: NEED_NOT_SOLVED,
      threadsPassed: threads >= NEED_THREADS,
      notSolvedPassed: notSolved >= NEED_NOT_SOLVED,
      passed: threads >= NEED_THREADS && notSolved >= NEED_NOT_SOLVED,
    };
  }

  // CSV of all logged entries (newest first), with a counted yes/no column.
  function toCsv(entries, now) {
    const clock = now instanceof Date ? now : new Date();
    const rows = sortNewestFirst(entries).map((e) => {
      const d = parseDate(e.date);
      return Object.assign({}, e, {
        // tools may be an array (from the form) or a plain string (hand-edited data).
        tools: Array.isArray(e.tools) ? e.tools.join('; ') : String(e.tools || ''),
        counted: d && !isOlderThan12Months(d, clock) ? 'yes' : 'no',
      });
    });
    return csvLib.toCsv(rows, COLUMNS);
  }

  function sortNewestFirst(entries) {
    return (entries || []).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  const api = {
    NEED_THREADS, NEED_NOT_SOLVED, urlKey, parseDate, isOlderThan12Months,
    validateEntry, gate, toCsv, sortNewestFirst,
  };
  if (isNode) module.exports = api;
  else root.FerrywiseEvidence = api;
})(typeof window !== 'undefined' ? window : globalThis);
