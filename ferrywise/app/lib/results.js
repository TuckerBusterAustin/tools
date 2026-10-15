'use strict';
// Pure logic: per-variant sign-ups and tier clicks from the v1 localStorage records
// ('events' with type view/tier_click, and 'signups'), plus a CSV with a deposit line.

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const csvLib = isNode ? require('../src/csv') : root.FerrywiseCsv;

  const VARIANTS = ['A', 'B'];
  const COLUMNS = ['variant', 'views', 'signups', 'signup_rate', 'solo_clicks', 'annual_clicks', 'team_clicks', 'paid_click_share'];
  const TIER_FIELD = { solo: 'solo', solo_annual: 'annual', team: 'team' };

  const ratio = (n, d) => (d > 0 ? n / d : 0);

  // events/signups: arrays of v1 records. Returns one row per variant.
  // signupRate = signups / views; paidClickShare = all tier clicks / views.
  function aggregate(events, signups) {
    const rows = {};
    VARIANTS.forEach((v) => { rows[v] = { variant: v, views: 0, signups: 0, solo: 0, annual: 0, team: 0 }; });
    (events || []).forEach((e) => {
      const r = e && rows[e.variant];
      if (!r) return;
      if (e.type === 'view') r.views += 1;
      else if (e.type === 'tier_click' && TIER_FIELD[e.tier]) r[TIER_FIELD[e.tier]] += 1;
    });
    (signups || []).forEach((s) => { if (s && rows[s.variant]) rows[s.variant].signups += 1; });
    return VARIANTS.map((v) => {
      const r = rows[v];
      const clicks = r.solo + r.annual + r.team;
      return Object.assign(r, {
        clicks,
        signupRate: ratio(r.signups, r.views),
        paidClickShare: ratio(clicks, r.views),
      });
    });
  }

  const pct = (x) => (Math.round(x * 1000) / 10).toFixed(1) + '%';

  // True when there is nothing to report (no views, sign-ups or clicks).
  function isEmpty(rows) {
    return rows.every((r) => r.views === 0 && r.signups === 0 && r.clicks === 0);
  }

  // CSV: header, one row per variant, then the fixed 'Deposit: deferred' line.
  function toCsv(rows) {
    const body = rows.map((r) => ({
      variant: r.variant, views: r.views, signups: r.signups, signup_rate: pct(r.signupRate),
      solo_clicks: r.solo, annual_clicks: r.annual, team_clicks: r.team, paid_click_share: pct(r.paidClickShare),
    }));
    return csvLib.toCsv(body, COLUMNS) + '\r\n' + csvLib.escapeField('Deposit: deferred');
  }

  const api = { aggregate, toCsv, isEmpty, pct, COLUMNS };
  if (isNode) module.exports = api;
  else root.FerrywiseResults = api;
})(typeof window !== 'undefined' ? window : globalThis);
