'use strict';
// Breakage tracker: 3 hand-built workflows x 7 days. Pure logic plus store helpers.
// A workflow is identified by its number 1..3 (names are editable labels kept in settings).
// Rule: the week passes when at most 1 workflow needed more than 1 fix in total.

(function () {
const COLLECTION = 'breakage';
const NAMES_KEY = 'breakageNames';
const WORKFLOWS = 3;
const DAYS = 7;
const FIX_LIMIT = 1; // a workflow "breaks the rule" when its weekly fixes exceed this
const MAX_BAD_WORKFLOWS = 1;

const FIXES_ERROR = 'Error: fixes must be a whole number, 0 or more.';
const MINUTES_ERROR = 'Error: fix minutes must be a whole number, 0 or more.';

// Whole number inside [min, max] from a number or digit string; otherwise null.
function toInt(v, min, max) {
  const n = typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min) return null;
  return max !== undefined && n > max ? null : n;
}

// Validates one entry. Returns { ok, errors:{field:msg}, entry }.
// Blank fixes count as 0; blank minutes mean "not recorded" (null).
function validateEntry(input) {
  const i = input || {};
  const errors = {};
  const workflow = toInt(i.workflow, 1, WORKFLOWS);
  const day = toInt(i.day, 1, DAYS);
  if (workflow === null) errors.workflow = 'Error: pick workflow 1, 2 or 3.';
  if (day === null) errors.day = 'Error: pick a day from 1 to ' + DAYS + '.';
  const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  const fixes = blank(i.fixes) ? 0 : toInt(i.fixes, 0);
  if (fixes === null) errors.fixes = FIXES_ERROR;
  const minutes = blank(i.minutes) ? null : toInt(i.minutes, 0);
  if (minutes === null && !blank(i.minutes)) errors.minutes = MINUTES_ERROR;
  if (Object.keys(errors).length) return { ok: false, errors, entry: null };
  return { ok: true, errors: {}, entry: { workflow, day, broke: !!i.broke, fixes, minutes } };
}

// Keeps one entry per workflow+day; a later entry in the list replaces an earlier one.
function latestEntries(entries) {
  const byKey = new Map();
  (entries || []).forEach((e) => { byKey.set(e.workflow + ':' + e.day, e); });
  return Array.from(byKey.values());
}

// Applies the 7-day rule.
// daysLogged counts days on which every workflow has an entry; the week is complete at 7.
// pass is true when at most 1 workflow has more than 1 fix in total.
// status: 'fail' once the rule is broken, 'not-enough-data' for a passing partial week, else 'pass'.
function evaluateBreakage(entries) {
  const list = latestEntries(entries);
  const fixes = [];
  for (let w = 1; w <= WORKFLOWS; w += 1) fixes.push(0);
  const perDay = {};
  list.forEach((e) => {
    fixes[e.workflow - 1] += e.fixes;
    perDay[e.day] = (perDay[e.day] || 0) + 1;
  });
  const daysLogged = Object.keys(perDay).filter((d) => perDay[d] >= WORKFLOWS).length;
  const workflowsOverLimit = fixes.filter((n) => n > FIX_LIMIT).length;
  const pass = workflowsOverLimit <= MAX_BAD_WORKFLOWS;
  const complete = daysLogged >= DAYS;
  return {
    pass, complete, daysLogged, daysNeeded: DAYS, workflowsOverLimit,
    fixesPerWorkflow: fixes, limit: FIX_LIMIT,
    status: !pass ? 'fail' : complete ? 'pass' : 'not-enough-data',
  };
}

// Stored records carry an id (workflow-day) so import/merge treats them as one slot.
function recordEntry(store, input) {
  const v = validateEntry(input);
  if (!v.ok) return { ok: false, errors: v.errors, replaced: false };
  const id = 'b-' + v.entry.workflow + '-' + v.entry.day;
  const all = store.list(COLLECTION);
  const replaced = all.some((r) => r.id === id);
  const rest = all.filter((r) => r.id !== id);
  rest.push(Object.assign({ id }, v.entry));
  store.replaceAll(COLLECTION, rest);
  return { ok: true, errors: {}, replaced, entry: v.entry };
}

function defaultNames() {
  return ['Workflow 1', 'Workflow 2', 'Workflow 3'];
}

function getNames(store) {
  const saved = store.get(NAMES_KEY, null);
  const names = defaultNames();
  if (Array.isArray(saved)) saved.slice(0, WORKFLOWS).forEach((n, i) => {
    if (typeof n === 'string' && n.trim()) names[i] = n.trim();
  });
  return names;
}

// Saves the three names; a blank name falls back to its default.
function setNames(store, names) {
  const d = defaultNames();
  const clean = d.map((def, i) => (typeof names[i] === 'string' && names[i].trim() ? names[i].trim() : def));
  store.set(NAMES_KEY, clean);
  return clean;
}

const api = {
  COLLECTION, WORKFLOWS, DAYS, FIX_LIMIT, validateEntry, latestEntries,
  evaluateBreakage, recordEntry, getNames, setNames,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.FerrywiseBreakage = api;
})();
