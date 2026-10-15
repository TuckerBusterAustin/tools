/* Browser glue for stats.html. Reads localStorage, renders src/stats.js
 * results, and offers the sign-ups as a CSV download (Blob). No network. */
(function () {
  'use strict';

  var config = window.ROLLWELL_CONFIG;
  var Stats = window.RollwellStats;
  var Events = window.RollwellEvents;
  var prefix = config.storageKeyPrefix;

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Read a JSON list from localStorage; [] when missing, corrupt or blocked. */
  function readList(key) {
    try {
      var list = JSON.parse(window.localStorage.getItem(key) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function pct(r) { return r === null ? null : (Math.round(r * 1000) / 10) + '%'; }

  /* A rate with no data shows an em dash plus hidden text 'no data'. */
  function rateNode(r) {
    var span = el('span');
    if (r === null) {
      span.appendChild(document.createTextNode('—'));
      span.appendChild(el('span', 'visually-hidden', 'no data'));
    } else span.textContent = pct(r);
    return span;
  }

  /* Badge: symbol and word always together. */
  var BADGES = {
    pass: ['✓ Pass', 'badge-pass'], fail: ['✕ Fail', 'badge-fail'],
    'not-enough-data': ['… Not enough data', 'badge-muted'],
    triggered: ['✕ Triggered', 'badge-fail'], clear: ['✓ Clear', 'badge-pass'],
    real: ['✓ Real difference', 'badge-text'], none: ['No clear difference', 'badge-text']
  };
  function badge(status) {
    var b = BADGES[status];
    return el('span', 'badge ' + b[1], b[0]);
  }

  function renderCards(s) {
    var box = $('stat-cards');
    box.textContent = '';
    [['Visitors', s.visitors], ['Sign-ups', s.signups], ['Tier clicks', s.tierClicks], ['Tier emails', s.tierEmails]]
      .forEach(function (c) {
        var card = el('div', 'card stat-card');
        card.appendChild(el('p', 'small muted', c[0]));
        card.appendChild(el('p', 'stat-value', String(c[1])));
        box.appendChild(card);
      });
  }

  function renderVariants(s, headline) {
    var body = $('variant-rows');
    body.textContent = '';
    ['A', 'B'].forEach(function (name) {
      var v = s.variants[name];
      var tr = el('tr');
      var th = el('th', '', 'Variant ' + name);
      th.scope = 'row';
      tr.appendChild(th);
      [[ 'Visitors', document.createTextNode(String(v.visitors)) ],
       [ 'Sign-ups', document.createTextNode(String(v.signups)) ],
       [ 'Conversion', rateNode(v.conversion) ]].forEach(function (cell) {
        var td = el('td');
        td.setAttribute('data-label', cell[0]);
        td.appendChild(cell[1]);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    var p = $('headline-status');
    p.textContent = '';
    if (headline.status === 'not-enough-data') {
      p.appendChild(badge('not-enough-data'));
      p.appendChild(document.createTextNode(' Not enough data: each variant needs ' + headline.visitorsNeeded +
        ' visitors (A: ' + headline.a + ', B: ' + headline.b + ')'));
    } else {
      p.appendChild(badge(headline.status));
      p.appendChild(document.createTextNode(headline.status === 'real'
        ? ' Variant ' + headline.winner + ' converts at 1.5x or more of the other.'
        : ' Neither variant converts at 1.5x or more of the other.'));
    }
  }

  /* One list row: text label, detail in plain words, badge. */
  function row(list, label, detail, status) {
    var li = el('li');
    var text = el('span', 'check-text');
    text.appendChild(el('strong', '', label));
    text.appendChild(document.createElement('br'));
    text.appendChild(document.createTextNode(detail));
    li.appendChild(text);
    li.appendChild(badge(status));
    list.appendChild(li);
  }

  function renderChecks(s, ev) {
    var c = ev.criteria, k = ev.kill;
    var list = $('criteria-list');
    list.textContent = '';
    row(list, 'Sign-ups',
      c.signups.value + ' of ' + c.signups.needed + ' needed: 15 sign-ups from 300 visitors (5%). Visitors so far: ' + s.visitors,
      c.signups.status);
    row(list, 'Tier clicks',
      (pct(c.tier.rate) || '—') + ' click rate (3% needed) and ' + c.tier.emails + ' of ' + c.tier.emailsNeeded +
      ' emails needed. Counts after 300 visitors',
      c.tier.status);
    row(list, 'Price answers',
      c.pay.answers + ' of ' + c.pay.answersNeeded + ' answers needed; ' + (pct(c.pay.share) || '—') +
      ' are $5 or more (half needed)',
      c.pay.status);
    row(list, 'Headline test',
      'A: ' + c.headline.a + ' visitors, B: ' + c.headline.b + ' visitors. Each needs 150, then one converts at 1.5x the other',
      c.headline.status === 'real' || c.headline.status === 'none' ? 'pass' : 'not-enough-data');

    var kl = $('kill-list');
    kl.textContent = '';
    row(kl, 'Too few sign-ups',
      k.signups.value + ' sign-ups. Triggers below 5 once there are 200 visitors (now ' + s.visitors + ')',
      k.signups.status);
    row(kl, 'Too few tier clicks',
      (pct(k.tierClicks.rate) || '—') + ' tier click rate. Triggers below 1% once there are 200 visitors',
      k.tierClicks.status);
  }

  function download(csv) {
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'rollwell-signups.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  var events = [];
  try {
    events = Events.createEvents({ storage: window.localStorage, prefix: prefix }).readEvents();
  } catch (e) { events = []; }
  var signups = readList(prefix + 'signups');

  var summary = Stats.summarize(events, signups);
  var evaluation = Stats.evaluate(summary);
  renderCards(summary);
  renderVariants(summary, evaluation.criteria.headline);
  renderChecks(summary, evaluation);

  $('empty-note').hidden = events.length > 0;

  var btn = $('csv-btn');
  var help = $('csv-help');
  if (signups.length === 0) {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    help.textContent = 'No sign-ups to export yet.';
  } else {
    help.textContent = signups.length + (signups.length === 1 ? ' sign-up' : ' sign-ups') + ' in this browser.';
    btn.addEventListener('click', function () {
      download(Stats.toCsv(signups));
      $('live').textContent = 'CSV downloaded.';
    });
  }
})();
