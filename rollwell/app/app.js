/* Browser glue for index.html. Wires the DOM to the src modules.
 * No network requests: everything is kept in localStorage. */
(function () {
  'use strict';

  var config = window.ROLLWELL_CONFIG;
  var Variant = window.RollwellVariant;
  var Waitlist = window.RollwellWaitlist;
  var Events = window.RollwellEvents;
  var prefix = config.storageKeyPrefix;
  var signupsKey = prefix + 'signups';

  function $(id) { return document.getElementById(id); }

  /* Create an element with optional class and text. */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function announce(message) { $('live').textContent = message; }

  /* ---------- storage ---------- */

  /* Use localStorage if it really works; otherwise an in-memory fake. */
  function openStorage() {
    try {
      var probe = prefix + 'probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return { storage: window.localStorage, ok: true };
    } catch (e) {
      var mem = {};
      return {
        ok: false,
        storage: {
          getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
          setItem: function (k, v) { mem[k] = String(v); }
        }
      };
    }
  }

  var opened = openStorage();
  var storage = opened.storage;
  var storageOk = opened.ok;

  function emailLink(label) {
    var a = el('a', 'text-link', label || config.waitlistEmail);
    a.href = 'mailto:' + config.waitlistEmail;
    return a;
  }

  /* Never fail silently: show the danger panel with a mailto link. */
  function showStorageWarning() {
    var box = $('storage-warning');
    box.textContent = '';
    box.appendChild(document.createTextNode(
      "Error: your browser blocked local storage, so this page couldn't save your answers. You can still join by email: "));
    box.appendChild(emailLink());
    box.hidden = false;
  }
  if (!storageOk) showStorageWarning();

  /* ---------- variant and events ---------- */

  var variant = Variant.getVariant(storage, Math.random, window.location.search, prefix);
  var headline = $('headline');
  var text = headline.getAttribute('data-variant-' + variant);
  if (text) headline.firstChild.nodeValue = text; // only the text node changes

  var events = Events.createEvents({ storage: storage, prefix: prefix, getVariant: function () { return variant; } });

  /* Record an event; on failure show the storage warning. Returns true if saved. */
  function record(type, payload) {
    try { events.recordEvent(type, payload); return storageOk; } catch (e) {
      storageOk = false; showStorageWarning(); return false;
    }
  }

  record('view');

  function readSignups() {
    try {
      var list = JSON.parse(storage.getItem(signupsKey) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  /* ---------- waitlist form ---------- */

  var form = $('waitlist-form');
  var submitBtn = $('submit-btn');
  var summary = $('error-summary');
  var FIELDS = ['email', 'price'];
  var LABELS = { email: 'Email', price: 'Price per month' };
  var submitted = false; // after a first submit, errors update live

  function readFields() {
    var checked = form.querySelector('input[name="useToday"]:checked');
    return {
      email: $('email').value,
      useToday: checked ? checked.value : null,
      price: $('price').value,
      host: $('host').value
    };
  }

  /* Show or clear the inline error under each field. */
  function showFieldErrors(errors) {
    FIELDS.forEach(function (name) {
      var input = $(name);
      var p = $(name + '-error');
      if (errors[name]) {
        p.textContent = '✕ ' + errors[name];
        p.hidden = false;
        input.setAttribute('aria-invalid', 'true');
      } else {
        p.textContent = '';
        p.hidden = true;
        input.removeAttribute('aria-invalid');
      }
    });
  }

  /* Rebuild the error summary: a heading and a link to each invalid field. */
  function showSummary(errors) {
    var names = FIELDS.filter(function (n) { return errors[n]; });
    summary.textContent = '';
    if (!names.length) { summary.hidden = true; return; }
    summary.appendChild(el('h3', '', 'Please fix ' + names.length + (names.length === 1 ? ' thing' : ' things')));
    var ul = el('ul');
    names.forEach(function (n) {
      var li = el('li');
      var a = el('a', 'text-link', LABELS[n] + ': ' + errors[n]);
      a.href = '#' + n;
      li.appendChild(a);
      ul.appendChild(li);
    });
    summary.appendChild(ul);
    summary.hidden = false;
  }

  function revalidate() {
    var result = Waitlist.buildSignup(readFields(), readSignups());
    var errors = result.ok ? {} : result.errors;
    showFieldErrors(errors);
    showSummary(errors);
  }

  function showSuccess(signup) {
    var panel = el('div', 'success-panel');
    panel.setAttribute('role', 'status');
    var h = el('h3', '', '✓ Almost done: one more step');
    h.tabIndex = -1;
    panel.appendChild(h);
    panel.appendChild(el('p', '', "Your answers are saved in this browser only. To get on the list, send them to us by email. It's prefilled."));
    var a = el('a', 'btn btn-secondary', 'Open email to send');
    a.href = Waitlist.buildMailto(config.waitlistEmail, signup);
    panel.appendChild(a);
    panel.appendChild(el('p', 'small muted', "We'll email you once when Rollwell launches. Nothing is charged."));
    form.parentNode.replaceChild(panel, form);
    summary.hidden = true;
    announce('Saved. Open email to send your answers.');
    h.focus();
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submitted = true;
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-disabled', 'true');
    submitBtn.textContent = 'Saving…';

    var result = Waitlist.buildSignup(readFields(), readSignups());
    if (!result.ok) {
      showFieldErrors(result.errors);
      showSummary(result.errors);
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-disabled');
      submitBtn.textContent = 'Join the waitlist';
      if (!summary.hidden) summary.focus();
      return;
    }

    try {
      var list = readSignups();
      list.push(result.signup);
      storage.setItem(signupsKey, JSON.stringify(list));
      record('signup');
    } catch (e) {
      storageOk = false;
      showStorageWarning();
    }
    showSuccess(result.signup);
  });

  // Live updates once the visitor has tried to submit.
  ['email', 'price'].forEach(function (id) {
    $(id).addEventListener('input', function () { if (submitted) revalidate(); });
  });

  // Selected radio row gets a class (CSS also uses :has where supported).
  form.addEventListener('change', function (event) {
    if (event.target.name !== 'useToday') return;
    Array.prototype.forEach.call(form.querySelectorAll('.radio-row'), function (row) {
      row.classList.toggle('selected', row.querySelector('input').checked);
    });
  });

  /* ---------- tier buttons ---------- */

  function setupTier(button) {
    var tier = button.getAttribute('data-tier');
    var holder = button.parentNode;

    button.addEventListener('click', function () {
      record('tier_click', { tier: tier });
      openMiniForm();
    });

    function openMiniForm() {
      var mini = el('form', 'mini-form');
      mini.noValidate = true;
      mini.setAttribute('action', 'none');
      var id = 'tier-email-' + tier;
      var label = el('label', '', 'Email for the launch note');
      label.htmlFor = id;
      var input = el('input');
      input.type = 'email';
      input.id = id;
      input.autocomplete = 'email';
      input.setAttribute('inputmode', 'email');
      input.spellcheck = false;
      input.setAttribute('aria-describedby', id + '-error');
      var err = el('p', 'error');
      err.id = id + '-error';
      err.hidden = true;
      var go = el('button', 'btn btn-primary btn-block', 'Notify me at launch');
      go.type = 'submit';
      var note = el('p', 'small muted', 'No card. No trial. Nothing charged.');
      var cancel = el('button', 'text-btn', 'Cancel');
      cancel.type = 'button';
      [label, input, err, go, note, cancel].forEach(function (n) { mini.appendChild(n); });

      function close() {
        holder.textContent = '';
        holder.appendChild(button);
        button.focus();
      }
      cancel.addEventListener('click', close);
      mini.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

      mini.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = input.value.trim().toLowerCase();
        if (!Waitlist.isValidEmail(email)) {
          err.textContent = '✕ ' + (email ? Waitlist.MESSAGES.emailFormat : Waitlist.MESSAGES.emailEmpty);
          err.hidden = false;
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        go.disabled = true;
        go.textContent = 'Saving…';
        var saved = record('tier_click_email', { tier: tier, email: email });
        var done = el('div', 'tier-done');
        done.setAttribute('role', 'status');
        done.appendChild(el('p', '', saved
          ? '✓ Saved in this browser. Send it to us so we can notify you:'
          : 'Error: this browser could not save it. Send it to us by email instead:'));
        var a = el('a', 'btn btn-secondary btn-block', 'Open email to send');
        a.href = 'mailto:' + config.waitlistEmail + '?subject=' +
          encodeURIComponent('Rollwell: notify me at launch (' + tier + ')') + '&body=' +
          encodeURIComponent('Please notify me when Rollwell launches.\r\nEmail: ' + email +
            '\r\nTier I would pay for: ' + tier);
        done.appendChild(a);
        holder.textContent = '';
        holder.appendChild(done);
        announce(saved ? 'Saved in this browser.' : 'Not saved.');
      });

      holder.textContent = '';
      holder.appendChild(mini);
      input.focus();
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('.tier-btn'), setupTier);
})();
