(function () { // IIFE: keeps names out of the shared browser global scope
'use strict';
// Schedule logic (CommonJS). Times use the local clock of the Date passed in.
// A schedule looks like:
//   { frequency: 'daily'|'weekly'|'monthly', time: 'HH:MM', weekday: 0-6 (Sun=0), day: 1-31 }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Returns a list of error strings (empty when the schedule is valid). */
function validateSchedule(s) {
  const errors = [];
  if (!s || typeof s !== 'object') return ['Schedule is missing.'];
  if (!['daily', 'weekly', 'monthly'].includes(s.frequency)) {
    errors.push('Frequency must be daily, weekly or monthly.');
  }
  if (typeof s.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) {
    errors.push('Time must look like 08:00.');
  }
  if (s.frequency === 'weekly' && !(Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6)) {
    errors.push('Weekday must be a whole number from 0 to 6.');
  }
  if (s.frequency === 'monthly' && !(Number.isInteger(s.day) && s.day >= 1 && s.day <= 31)) {
    errors.push('Day of month must be a whole number from 1 to 31.');
  }
  return errors;
}

function assertValid(s) {
  const errors = validateSchedule(s);
  if (errors.length) throw new Error('Invalid schedule: ' + errors.join(' '));
}

function toDate(d) {
  const date = d instanceof Date ? new Date(d.getTime()) : new Date(d);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date.');
  return date;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/** First scheduled time strictly after fromDate. */
function nextDue(schedule, fromDate) {
  assertValid(schedule);
  const from = toDate(fromDate);
  const [h, m] = schedule.time.split(':').map(Number);
  const y = from.getFullYear();
  const mo = from.getMonth();
  const d = from.getDate();

  if (schedule.frequency === 'daily') {
    const c = new Date(y, mo, d, h, m);
    return c > from ? c : new Date(y, mo, d + 1, h, m);
  }
  if (schedule.frequency === 'weekly') {
    const ahead = (schedule.weekday - from.getDay() + 7) % 7;
    const c = new Date(y, mo, d + ahead, h, m);
    return c > from ? c : new Date(y, mo, d + ahead + 7, h, m);
  }
  // monthly: clamp the day to the length of the month (31 -> 28/29/30).
  const at = (yy, mm) => {
    const dim = daysInMonth(yy, mm);
    return new Date(yy, mm, Math.min(schedule.day, dim), h, m);
  };
  const c = at(y, mo);
  // new Date(y, mo + 1, 1) normalises December -> January of next year.
  if (c > from) return c;
  const n = new Date(y, mo + 1, 1);
  return at(n.getFullYear(), n.getMonth());
}

/** Time the next run is owed: the first slot after the last run (or creation). */
function owedAt(schedule, lastRun, createdAt) {
  const ref = lastRun || createdAt;
  return ref ? nextDue(schedule, ref) : null;
}

/** True once the owed time has arrived (<= now). Never-run jobs need createdAt. */
function isDue(schedule, lastRun, now, createdAt) {
  const t = owedAt(schedule, lastRun, createdAt);
  return t !== null && t <= toDate(now);
}

/** True when an owed time has passed (strictly) with no run after it. */
function isOverdue(schedule, lastRun, now, createdAt) {
  const t = owedAt(schedule, lastRun, createdAt);
  return t !== null && t < toDate(now);
}

/** Human description, e.g. 'Every Monday at 08:00'. */
function describeSchedule(s) {
  assertValid(s);
  if (s.frequency === 'daily') return `Every day at ${s.time}`;
  if (s.frequency === 'weekly') return `Every ${DAYS[s.weekday]} at ${s.time}`;
  const n = s.day;
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  const tail = n > 28 ? ' (or the last day of shorter months)' : '';
  return `On the ${n}${suffix} of every month at ${s.time}${tail}`;
}

module.exports = { validateSchedule, nextDue, isDue, isOverdue, describeSchedule, DAYS };
})();
