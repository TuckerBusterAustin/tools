'use strict';
// Pure functions: rates, thresholds, kill signals and gate checks.

// Wrapped in an IIFE so no names leak into the shared global scope of classic scripts.
(function () {
const metricsIsNode = typeof module !== 'undefined' && module.exports;
// The evidence gate is NOT computed here: lib/evidence.js (FerrywiseEvidence.gate) is the only gate.

const T = {
  workflowNamedPass: 0.5, // share of sign-ups naming a workflow that counts as a pass
  signupPass: 0.05,
  signupIterate: 0.03,
  killMinVisitors: 200,
  paidClickPass: 0.03,
  minDeposits: 3,
};

// Safe division: zero (or invalid) denominator gives 0, never NaN.
function rate(num, den) {
  const n = Number(num), d = Number(den);
  if (!(d > 0) || !isFinite(n)) return 0;
  return n / d;
}

const signupRate = (signups, visitors) => rate(signups, visitors);
const workflowNamedShare = (named, signups) => rate(named, signups);
const tierClickRate = (clicks, visitors) => rate(clicks, visitors);

// stats: { A: {visitors, signups, paidClicks}, B: {...} } -> adds rates per variant.
function variantBreakdown(stats) {
  const out = {};
  Object.keys(stats || {}).forEach((k) => {
    const s = stats[k] || {};
    out[k] = {
      visitors: s.visitors || 0,
      signups: s.signups || 0,
      paidClicks: s.paidClicks || 0,
      signupRate: signupRate(s.signups, s.visitors),
      tierClickRate: tierClickRate(s.paidClicks, s.visitors),
    };
  });
  return out;
}

// log: [{workflow, fixes}]. Pass if at most 1 of 3 workflows needed more than one fix.
function breakageStatus(log) {
  const entries = Array.isArray(log) ? log : [];
  if (entries.length === 0) return { status: 'insufficient data', overFixed: 0 };
  const overFixed = entries.filter((e) => Number(e && e.fixes) > 1).length;
  return { status: overFixed <= 1 ? 'pass' : 'fail', overFixed };
}

// null/undefined means deposits were not tested: 'deferred', never a pass.
function depositStatus(count) {
  if (count === null || count === undefined) return 'deferred';
  return Number(count) >= T.minDeposits ? 'pass' : 'iterate';
}

/**
 * data: { visitors, signups, workflowNamed, paidClicks, variants:{A:{visitors,..},B:{..}},
 *         breakage, deposits }
 * Returns a verdict (pass | kill | iterate | insufficient data | fail | deferred) per criterion.
 */
function evaluate(data) {
  const d = data || {};
  const visitors = d.visitors || 0;
  const bothSeen = !!d.variants && ['A', 'B'].every((k) => d.variants[k] && d.variants[k].visitors > 0);
  const enough = visitors >= T.killMinVisitors && bothSeen;

  const sRate = signupRate(d.signups, visitors);
  let signup;
  if (!enough) signup = 'insufficient data';
  else if (sRate >= T.signupPass) signup = 'pass';
  else if (sRate >= T.signupIterate) signup = 'iterate';
  else signup = 'kill';

  const cRate = tierClickRate(d.paidClicks, visitors);
  let paidClicks;
  if (!enough) paidClicks = 'insufficient data';
  else paidClicks = cRate >= T.paidClickPass ? 'pass' : 'iterate';

  return {
    rates: {
      signup: sRate,
      workflowNamed: workflowNamedShare(d.workflowNamed, d.signups),
      paidClicks: cRate,
    },
    signup,
    paidClicks,
    breakage: breakageStatus(d.breakage).status,
    deposits: depositStatus(d.deposits),
  };
}

const metricsApi = {
  THRESHOLDS: T,
  signupRate, workflowNamedShare, tierClickRate, variantBreakdown,
  breakageStatus, depositStatus, evaluate,
};
if (metricsIsNode) module.exports = metricsApi;
else window.FerrywiseMetrics = metricsApi; // plain <script> use in the browser
})();
