'use strict';
// Applies the plan's success criteria and kill signals to stored data plus
// typed-in visitor counts. Pure functions: no storage, no DOM, no network.
// Status codes: 'pass' | 'fail' | 'iterate' | 'not-enough-data' | 'deferred'.

(function (root) {
  const T = {
    SIGNUP_RATE: 5,        // percent
    SIGNUP_MIN: 10,        // sign-ups
    KILL_RATE: 3,          // percent: under this after two headlines is a kill signal
    WORKFLOW_SHARE: 60,    // percent of sign-ups naming a workflow
    CLICK_RATE: 3,         // percent of visitors
    CLICK_MIN: 6,          // paid-tier clicks
    CLICK_SAMPLE: 200      // visitors needed before a miss counts as a fail
  };

  const NO_VISITORS = 'Not enough data: type in visitors for each headline.';

  const CANNOT_CHECK = [
    'Replies saying free tools already do this (read the threads by hand).',
    'Stated willingness to pay below $5 (ask people; this page cannot see it).',
    'Deposits: there is no deposit mechanism in this build.'
  ];

  // Whole number >= 0, or null when blank or invalid.
  function parseCount(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  function pct(n, d) { return (Math.round((n / d) * 1000) / 10).toFixed(1) + '%'; }

  function nodata(id, metric, target, sentence) {
    return { id, metric, status: 'not-enough-data', value: '–', target, sentence };
  }

  // input: { summary (tracking summarize shape), gate (evaluateGate), breakage (evaluateBreakage),
  //          visitors: { A, B }, impressions }
  function evaluateResults(input) {
    const inp = input || {};
    const summary = inp.summary || {};
    const A = summary.A || { signups: 0, signupsWithWorkflow: 0, clicks: {} };
    const B = summary.B || { signups: 0, signupsWithWorkflow: 0, clicks: {} };
    const vis = inp.visitors || {};
    const vA = parseCount(vis.A) || 0;
    const vB = parseCount(vis.B) || 0;
    const visitors = vA + vB;
    const signups = A.signups + B.signups;
    const named = A.signupsWithWorkflow + B.signupsWithWorkflow;
    const sumClicks = (v) => Object.keys(v.clicks || {}).reduce((s, k) => s + v.clicks[k], 0);
    const clicks = sumClicks(A) + sumClicks(B);
    const bothVisited = vA > 0 && vB > 0;
    const criteria = [];
    const kills = [];

    // 1. Sign-up rate: target 5% and 10 sign-ups.
    const tSign = '5% and at least 10 sign-ups';
    if (visitors === 0) {
      criteria.push(nodata('signup-rate', 'Sign-up rate', tSign, NO_VISITORS));
    } else {
      const val = pct(signups, visitors) + ' (' + signups + ' of ' + visitors + ')';
      const rateLabel = pct(signups, visitors);
      const atTarget = signups * 100 >= T.SIGNUP_RATE * visitors;
      const underKill = signups * 100 < T.KILL_RATE * visitors;
      let status; let sentence;
      if (atTarget && signups >= T.SIGNUP_MIN) {
        status = 'pass';
        sentence = 'Sign-ups are ' + val + '. That meets the 5% target and the 10 sign-up minimum.';
      } else if (atTarget) {
        status = 'iterate';
        sentence = 'Sign-ups are ' + val + '. The rate is at 5% or more, but the target also needs 10 sign-ups.';
      } else if (!underKill) {
        status = 'iterate';
        sentence = 'Between 3% and 5%: run one more headline for a week, then decide on tier clicks alone.';
      } else if (bothVisited) {
        status = 'fail';
        sentence = 'Sign-ups are ' + val + '. That is under the 3% kill line after two headlines.';
        kills.push('Fail: sign-ups are ' + rateLabel + ' after two headlines (kill line is 3%).');
      } else {
        status = 'not-enough-data';
        sentence = 'The kill signal needs both headlines tested.';
      }
      criteria.push({ id: 'signup-rate', metric: 'Sign-up rate', status, value: val, target: tSign, sentence });
    }

    // 2. Share of sign-ups naming a workflow: 60%.
    const tShare = '60% of sign-ups';
    if (signups === 0) {
      criteria.push(nodata('workflow-share', 'Sign-ups naming a workflow', tShare, 'Not enough data: no sign-ups recorded yet.'));
    } else {
      const ok = named * 100 >= T.WORKFLOW_SHARE * signups;
      const val = pct(named, signups) + ' (' + named + ' of ' + signups + ')';
      criteria.push({
        id: 'workflow-share', metric: 'Sign-ups naming a workflow', status: ok ? 'pass' : 'fail', value: val, target: tShare,
        sentence: 'Workflow named by ' + val + '. The target is 60%, so this ' + (ok ? 'meets' : 'misses') + ' it.'
      });
    }

    // 3. Paid-tier clicks: 3% and 6 clicks.
    const tClick = '3% and at least 6 clicks per 200 visitors';
    if (visitors === 0) {
      criteria.push(nodata('tier-clicks', 'Paid-tier click rate', tClick, NO_VISITORS));
    } else {
      const val = pct(clicks, visitors) + ' (' + clicks + ' of ' + visitors + ')';
      const ok = clicks * 100 >= T.CLICK_RATE * visitors && clicks >= T.CLICK_MIN;
      let status = 'pass'; let sentence = 'Tier clicks are ' + val + '. That meets the 3% target and the 6 click minimum.';
      if (!ok && visitors >= T.CLICK_SAMPLE) {
        status = 'fail';
        sentence = 'Tier clicks are ' + val + '. That is under the 3% target, with at least 200 visitors counted.';
      } else if (!ok) {
        status = 'not-enough-data';
        sentence = 'Tier clicks are ' + val + '. Fewer than 200 visitors so far, so it is too early to judge.';
      }
      criteria.push({ id: 'tier-clicks', metric: 'Paid-tier click rate', status, value: val, target: tClick, sentence });
    }

    // 4. Evidence gate.
    const g = inp.gate;
    const tGate = '15 threads, 5 where free tools failed';
    if (!g || g.total === 0) {
      criteria.push(nodata('gate', 'Evidence gate', tGate, 'Not enough data: no threads logged yet.'));
    } else {
      const val = g.total + ' threads, ' + g.freeFailed + " where free tools didn't solve it";
      criteria.push({
        id: 'gate', metric: 'Evidence gate', status: g.pass ? 'pass' : 'fail', value: val, target: tGate,
        sentence: g.pass ? 'Gate passed: ' + val + '.' : g.missing
      });
    }

    // 5. Breakage rule.
    const b = inp.breakage;
    const tBreak = 'At most 1 workflow with more than 1 fix over 7 days';
    if (!b || b.daysLogged === 0) {
      criteria.push(nodata('breakage', 'Breakage', tBreak, 'Not enough data: no breakage days logged yet.'));
    } else {
      const val = b.workflowsOverLimit + ' of 3 workflows over the limit · ' + b.daysLogged + ' of ' + b.daysNeeded + ' days';
      const status = b.status === 'fail' ? 'fail' : b.status === 'pass' ? 'pass' : 'not-enough-data';
      criteria.push({
        id: 'breakage', metric: 'Breakage', status, value: val, target: tBreak,
        sentence: status === 'fail' ? 'More than one workflow needed over 1 fix, so the rule is broken.'
          : status === 'pass' ? 'The full week is logged and the rule holds.'
            : 'The rule holds so far, but the week is incomplete.'
      });
    }

    // 6. Deposit: never counted as passed.
    criteria.push({
      id: 'deposit', metric: 'Deposits', status: 'deferred', value: '–', target: 'Not applicable in this build',
      sentence: 'No deposit mechanism in this build. This is not counted as passed.'
    });

    const imp = parseCount(inp.impressions);
    return { criteria, killSignals: kills, cannotCheck: CANNOT_CHECK.slice(), impressions: imp, visitors, signups, clicks };
  }

  const api = { evaluateResults, parseCount, THRESHOLDS: T, CANNOT_CHECK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FerrywiseResults = api;
})(typeof window !== 'undefined' ? window : globalThis);
