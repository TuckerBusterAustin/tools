(function () { // IIFE: keeps names out of the shared browser global scope
'use strict';
// Job rules (CommonJS): validation, column select/reorder, row filters, CSV output, limits.
// A job: { id, name, columns: [string], filters: [{column, op, value}],
//          schedule, recipients: [email], format: 'csv'|'xlsx' }
// A table: { headers: [string], rows: [[string]] }

// Namespaced (not destructured) so classic <script> loading has no global name clashes.
const csvLib = require('./csv');
const scheduleLib = require('./schedule');

const FREE_LIMIT = 3;
const PRO_LIMIT = 15;
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** Build a table from parseCsv output (first row = headers). */
function tableFromRows(rows) {
  if (!rows || !rows.length) return { headers: [], rows: [] };
  // Blank lines (parsed as ['']) are dropped so they don't count as data rows.
  const data = rows.slice(1).filter(function (r) { return !(r.length === 1 && r[0] === ''); });
  return { headers: rows[0].slice(), rows: data };
}

/** Max saved exports for the plan. */
function jobLimit(pro) {
  return pro ? PRO_LIMIT : FREE_LIMIT;
}

/** Locked error text when xlsx is chosen without Pro, else null. */
function formatLockedError(format, pro) {
  return format === 'xlsx' && !pro ? 'Excel (.xlsx) output is a Pro feature. Choose CSV or upgrade.' : null;
}

/** Returns a list of error strings (empty when valid). Format lock is checked separately. */
function validateJob(job) {
  const errors = [];
  if (!job || typeof job !== 'object') return ['Export is missing.'];
  if (typeof job.name !== 'string' || job.name.trim() === '') errors.push('Name is required.');
  if (!Array.isArray(job.columns) || job.columns.length === 0) errors.push('Pick at least one column.');
  const recipients = Array.isArray(job.recipients) ? job.recipients : [];
  recipients.forEach(function (r) {
    if (typeof r !== 'string' || !EMAIL_RE.test(r.trim())) errors.push('"' + r + '" is not a valid email address.');
  });
  if (job.format !== undefined && job.format !== 'csv' && job.format !== 'xlsx') {
    errors.push('File type must be csv or xlsx.');
  }
  scheduleLib.validateSchedule(job.schedule).forEach(function (e) { errors.push(e); });
  (job.filters || []).forEach(function (f) {
    if (!f || !f.column || !['equals', 'contains'].includes(f.op)) errors.push('A filter is incomplete.');
  });
  return errors;
}

/** Keep only the requested columns, in the requested order; unknown names are ignored. */
function selectColumns(table, names) {
  const idx = [];
  const headers = [];
  (names || []).forEach(function (n) {
    const i = table.headers.indexOf(n);
    if (i >= 0) { idx.push(i); headers.push(n); }
  });
  return { headers: headers, rows: table.rows.map(function (r) { return idx.map(function (i) { return r[i] == null ? '' : r[i]; }); }) };
}

/** Keep rows matching ALL filters. equals = whole value, contains = substring; both case-insensitive. */
function filterRows(table, filters) {
  // Column index is worked out once per filter, not once per cell.
  const active = (filters || []).map(function (f) {
    return { op: f.op, value: f.value, i: table.headers.indexOf(f.column) };
  }).filter(function (f) { return f.i >= 0; });
  if (!active.length) return { headers: table.headers.slice(), rows: table.rows.slice() };
  const rows = table.rows.filter(function (r) {
    return active.every(function (f) {
      const cell = String(r[f.i] == null ? '' : r[f.i]).toLowerCase();
      const want = String(f.value == null ? '' : f.value).toLowerCase();
      return f.op === 'equals' ? cell.trim() === want.trim() : cell.indexOf(want) >= 0;
    });
  });
  return { headers: table.headers.slice(), rows: rows };
}

/** Apply filters, then columns, and return the resulting table. */
function buildTable(job, table) {
  return selectColumns(filterRows(table, job.filters), job.columns);
}

/** Build the CSV text for a job. Filters run before column selection so hidden columns can filter. */
function buildOutput(job, table, options) {
  const t = buildTable(job, table);
  return csvLib.toCsv([t.headers].concat(t.rows), { bom: !!(options && options.bom) });
}

/**
 * Add a job to a list without mutating it.
 * Returns { ok: true, jobs } or { ok: false, error, code } (code: 'invalid' | 'limit' | 'locked').
 */
function addJob(jobs, job, pro) {
  const errors = validateJob(job);
  if (errors.length) return { ok: false, code: 'invalid', error: errors.join(' ') };
  const locked = formatLockedError(job.format, pro);
  if (locked) return { ok: false, code: 'locked', error: locked };
  if (jobs.length >= jobLimit(pro)) {
    return {
      ok: false, code: 'limit',
      error: pro
        ? 'You are using ' + jobs.length + ' of ' + PRO_LIMIT + ' exports. Pause or delete one first.'
        : 'You are using ' + jobs.length + ' of ' + FREE_LIMIT + ' exports. Pause one, or move to Pro for up to ' + PRO_LIMIT + '.'
    };
  }
  return { ok: true, jobs: jobs.concat([job]) };
}

module.exports = {
  FREE_LIMIT, PRO_LIMIT, tableFromRows, jobLimit, formatLockedError, validateJob,
  selectColumns, filterRows, buildTable, buildOutput, addJob, EMAIL_RE
};
})();
