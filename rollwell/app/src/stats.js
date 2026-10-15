/* Pure logic: summaries, threshold checks, kill signals and CSV output.
 * Works as a <script> (global RollwellStats) and under Node (require).
 * Every rate is null when there is no data, never NaN or Infinity. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RollwellStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Thresholds from the validation plan. */
  var T = {
    minVisitors: 300,        // visitors needed before the signup/tier checks count
    signups: 15,             // 15 signups from 300 visitors (5%)
    tierRate: 0.03,          // 3% tier click rate...
    tierEmails: 5,           // ...and at least 5 emails
    payMinAnswers: 10,       // at least 10 pay answers...
    payShare: 0.5,           // ...at least half of them...
    payAmount: 5,            // ...at $5 or more
    headlineMinVisitors: 150, // per variant
    headlineRatio: 1.5,      // one conversion rate is 1.5x the other
    killMinVisitors: 200,
    killSignups: 5,          // fewer than 5 signups from 200+ visitors
    killTierRate: 0.01       // fewer than 1% tier clicks
  };

  /* a / b, or null when b is 0. */
  function rate(a, b) { return b > 0 ? a / b : null; }

  function emptyVariant() { return { visitors: 0, signups: 0, conversion: null }; }

  /* events: list from src/events.js; signups: list of signup records.
   * Total signups is the signup list length (or the number of signup events
   * if that is larger); per-variant signups come from signup events. */
  function summarize(events, signups) {
    var evs = Array.isArray(events) ? events.filter(function (e) { return e && typeof e === 'object'; }) : [];
    var sus = Array.isArray(signups) ? signups.filter(function (s) { return s && typeof s === 'object'; }) : [];

    var variants = { A: emptyVariant(), B: emptyVariant() };
    var visitors = 0, signupEvents = 0, tierClicks = 0, tierEmails = 0;
    var tiers = {}; // tier -> { clicks, emails }

    function tierOf(e) {
      var name = e.payload && e.payload.tier ? String(e.payload.tier) : 'unknown';
      if (!tiers[name]) tiers[name] = { clicks: 0, emails: 0 };
      return tiers[name];
    }

    evs.forEach(function (e) {
      var v = typeof e.variant === 'string' ? e.variant.toUpperCase() : null;
      var slot = v && variants[v] ? variants[v] : null;
      if (e.type === 'view') { visitors++; if (slot) slot.visitors++; }
      else if (e.type === 'signup') { signupEvents++; if (slot) slot.signups++; }
      else if (e.type === 'tier_click') { tierClicks++; tierOf(e).clicks++; }
      else if (e.type === 'tier_click_email') { tierEmails++; tierOf(e).emails++; }
    });
    variants.A.conversion = rate(variants.A.signups, variants.A.visitors);
    variants.B.conversion = rate(variants.B.signups, variants.B.visitors);

    // "What would you pay" answers: numbers only.
    var prices = sus.map(function (s) { return s.price; })
      .filter(function (p) { return typeof p === 'number' && isFinite(p); });
    var payHigh = prices.filter(function (p) { return p >= T.payAmount; }).length;

    var useToday = { 'github-actions': 0, cli: 0, manual: 0, other: 0 };
    sus.forEach(function (s) {
      if (Object.prototype.hasOwnProperty.call(useToday, s.useToday)) useToday[s.useToday]++;
    });

    var totalSignups = Math.max(sus.length, signupEvents);
    return {
      totalEvents: evs.length,
      visitors: visitors,
      signups: totalSignups,
      conversion: rate(totalSignups, visitors),
      variants: variants,
      tierClicks: tierClicks,
      tierClickRate: rate(tierClicks, visitors),
      tierEmails: tierEmails,
      tiers: tiers,
      payAnswers: prices.length,
      payHigh: payHigh,
      payShare: rate(payHigh, prices.length),
      useToday: useToday
    };
  }

  var NED = 'not-enough-data';

  /* Returns plan criteria and kill signals for a summary.
   * criteria.*.status: 'pass' | 'fail' | 'not-enough-data'
   * criteria.headline.status: 'real' | 'none' | 'not-enough-data' (+ winner 'A'|'B'|null)
   * kill.*.status: 'triggered' | 'clear' | 'not-enough-data' */
  function evaluate(summary) {
    var s = summary;
    var enough = s.visitors >= T.minVisitors;

    var signupsOk = s.signups >= T.signups;
    var signupsC = { status: !enough ? NED : signupsOk ? 'pass' : 'fail',
      value: s.signups, needed: T.signups, visitors: s.visitors, visitorsNeeded: T.minVisitors };

    var tierOk = s.tierClickRate !== null && s.tierClickRate >= T.tierRate && s.tierEmails >= T.tierEmails;
    var tierC = { status: !enough ? NED : tierOk ? 'pass' : 'fail',
      rate: s.tierClickRate, emails: s.tierEmails, emailsNeeded: T.tierEmails, visitorsNeeded: T.minVisitors };

    var payC = { answers: s.payAnswers, answersNeeded: T.payMinAnswers, share: s.payShare };
    payC.status = s.payAnswers < T.payMinAnswers ? NED : s.payShare >= T.payShare ? 'pass' : 'fail';

    var a = s.variants.A, b = s.variants.B;
    var headC = { status: NED, winner: null, a: a.visitors, b: b.visitors, visitorsNeeded: T.headlineMinVisitors };
    if (a.visitors >= T.headlineMinVisitors && b.visitors >= T.headlineMinVisitors) {
      var ca = a.conversion || 0, cb = b.conversion || 0;
      // Cross-multiplied so a conversion of 0 never divides by zero.
      if (cb > 0 && cb >= T.headlineRatio * ca) { headC.status = 'real'; headC.winner = 'B'; }
      else if (ca > 0 && ca >= T.headlineRatio * cb) { headC.status = 'real'; headC.winner = 'A'; }
      else headC.status = 'none';
    }

    var killMore = s.visitors >= T.killMinVisitors;
    var kill = {
      signups: { status: !killMore ? NED : s.signups < T.killSignups ? 'triggered' : 'clear',
        value: s.signups, limit: T.killSignups, visitorsNeeded: T.killMinVisitors },
      tierClicks: { status: !killMore ? NED : s.tierClickRate < T.killTierRate ? 'triggered' : 'clear',
        rate: s.tierClickRate, limit: T.killTierRate, visitorsNeeded: T.killMinVisitors }
    };

    return { criteria: { signups: signupsC, tier: tierC, pay: payC, headline: headC }, kill: kill };
  }

  /* Quote a CSV field when it holds a comma, quote or line break.
   * Text starting with = + - @ gets a leading apostrophe so spreadsheets
   * don't run it as a formula. */
  function csvField(value) {
    var text = value == null ? '' : String(value);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  var CSV_COLUMNS = ['email', 'useToday', 'price', 'host', 'createdAt'];

  /* Header row plus one row per signup, CRLF separated. */
  function toCsv(signups) {
    var list = Array.isArray(signups) ? signups : [];
    var rows = [CSV_COLUMNS.join(',')];
    list.forEach(function (s) {
      var rec = s || {};
      rows.push(CSV_COLUMNS.map(function (c) { return csvField(rec[c]); }).join(','));
    });
    return rows.join('\r\n') + '\r\n';
  }

  return { THRESHOLDS: T, CSV_COLUMNS: CSV_COLUMNS, summarize: summarize, evaluate: evaluate, toCsv: toCsv };
});
