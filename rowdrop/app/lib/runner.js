(function () { // IIFE: keeps names out of the shared browser global scope
'use strict';
// Run logic (CommonJS), no DOM: due status, building the output file, file names, mailto drafts.
// app.js does the downloading and the screen updates; everything testable lives here.

const jobsLib = require('./jobs');
const scheduleLib = require('./schedule');
const xlsxLib = require('./xlsx');

function pad(n) { return (n < 10 ? '0' : '') + n; }

/** Local date as 2026-10-19. */
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

/**
 * Where a job stands at `now`.
 * state: 'paused' | 'scheduled' | 'due' (owed today) | 'overdue' (owed on an earlier day).
 * next: the next owed/scheduled Date (the first slot after the last run, or after creation).
 */
function dueStatus(job, now) {
  const last = job.lastRunAt ? new Date(job.lastRunAt) : null;
  const created = job.createdAt ? new Date(job.createdAt) : now;
  const next = scheduleLib.nextDue(job.schedule, last || created);
  if (job.paused) return { state: 'paused', next: next };
  if (!scheduleLib.isDue(job.schedule, last, now, created)) return { state: 'scheduled', next: next };
  return { state: next < startOfDay(now) ? 'overdue' : 'due', next: next };
}

/** Jobs that are overdue (used for the Pro missed-run banner). */
function overdueJobs(jobs, now) {
  return jobs.filter(function (j) { return dueStatus(j, now).state === 'overdue'; });
}

/** Safe file name: "Monday deals" -> "Monday deals-2026-10-19.csv". {date} in the name is honoured. */
function fileName(job, date) {
  let base = String(job.name || 'export').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'export';
  const stamp = ymd(date);
  base = base.indexOf('{date}') >= 0 ? base.replace(/\{date\}/g, stamp) : base + '-' + stamp;
  return base + (job.format === 'xlsx' ? '.xlsx' : '.csv');
}

/**
 * Build the file for a job from its source ({headers, rows}).
 * Returns { ok:true, filename, mime, data, rows, bytes } or { ok:false, reason }.
 */
function runJob(job, source, pro, now) {
  if (!source) return { ok: false, reason: 'The imported file for this export is gone. Import the CSV again, then edit this export.' };
  const locked = jobsLib.formatLockedError(job.format, pro);
  if (locked) return { ok: false, reason: locked };
  const table = { headers: source.headers || [], rows: source.rows || [] };
  const t = jobsLib.buildTable(job, table);
  if (!t.headers.length) return { ok: false, reason: 'None of the picked columns are in the imported file. Edit this export and pick columns again.' };
  const filename = fileName(job, now);
  if (job.format === 'xlsx') {
    const data = xlsxLib.buildXlsx([t.headers].concat(t.rows), { sheetName: job.name });
    return { ok: true, filename: filename, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: data, rows: t.rows.length, bytes: data.length };
  }
  const text = jobsLib.buildOutput(job, table, { bom: true });
  return { ok: true, filename: filename, mime: 'text/csv;charset=utf-8', data: text, rows: t.rows.length, bytes: new TextEncoder().encode(text).length };
}

/** A mailto: link addressed to the recipients. Browsers cannot attach files, so the body says so. */
function mailtoDraft(job, filename) {
  const to = (job.recipients || []).map(function (r) { return encodeURIComponent(r).replace(/%40/g, '@'); }).join(',');
  const body = 'Hi,\n\nHere is "' + job.name + '". I will attach the file ' + filename + ' before sending.\n';
  return 'mailto:' + to + '?subject=' + encodeURIComponent(job.subject || job.name) + '&body=' + encodeURIComponent(body);
}

/** 1536 -> "1.5 KB". */
function formatSize(bytes) {
  if (!(bytes >= 0)) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1).replace(/\.0$/, '') + ' KB';
  return (bytes / 1048576).toFixed(1).replace(/\.0$/, '') + ' MB';
}

/** Unambiguous date, e.g. "Mon 19 Oct 2026". */
function formatDate(d) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + d.getDate() + ' ' +
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getFullYear();
}

module.exports = { ymd, dueStatus, overdueJobs, fileName, runJob, mailtoDraft, formatSize, formatDate };
})();
