'use strict';
// Browser glue only: reads the form, calls the core modules, renders output.
// No signing logic lives here.
(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('request-form');
  let last = { canonicalRequest: '', url: '', method: 'GET', headers: {}, body: '' };

  /** Read the form into a plain object. */
  function read() {
    const o = {};
    for (const [k, v] of new FormData(form).entries()) o[k] = v;
    for (const n of ['method', 'host', 'path', 'query', 'region', 'service', 'amzDate', 'expires',
      'accessKeyId', 'secretAccessKey', 'sessionToken', 'headers', 'body']) o[n] = String(o[n] ?? '');
    o.unsignedPayload = !!(form.elements.unsignedPayload && form.elements.unsignedPayload.checked);
    return o;
  }

  /** Parse "Name: value" lines into a headers object. */
  function parseHeaders(text) {
    const h = {};
    for (const line of String(text || '').split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return h;
  }

  /** Current time as YYYYMMDDTHHMMSSZ. */
  const amzNow = () => new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  const dateOf = (f) => String(f.amzDate || '').trim() || amzNow();

  function setText(id, text) { $(id).textContent = text || ''; }
  function clearOutputs() {
    ['out-canonical', 'out-sts', 'out-signature', 'out-auth', 'out-url', 'out-curl'].forEach((id) => setText(id, ''));
    setText('error', '');
  }

  /** Show lint warnings inline. */
  function showLint() {
    const f = read();
    const warnings = PresignLint.lint({
      host: f.host, region: f.region, expires: f.expires, amzDate: String(f.amzDate || '').trim(),
    });
    const ul = $('lint');
    ul.textContent = '';
    for (const w of warnings) {
      const li = document.createElement('li');
      li.textContent = w.message;
      ul.appendChild(li);
    }
  }

  async function doSign() {
    clearOutputs();
    const f = read();
    const headers = parseHeaders(f.headers);
    // Drop any user-typed host header so it cannot merge with the Host field.
    for (const k of Object.keys(headers)) if (k.toLowerCase() === 'host') delete headers[k];
    headers.Host = f.host;
    try {
      const r = await PresignSigV4.sign(PresignCrypto, {
        method: f.method, path: f.path, query: f.query, headers, body: f.body,
        unsignedPayload: f.unsignedPayload, amzDate: dateOf(f), region: f.region,
        service: f.service, accessKeyId: f.accessKeyId, secretAccessKey: f.secretAccessKey,
        sessionToken: f.sessionToken || undefined,
      });
      setText('out-canonical', r.canonicalRequest);
      setText('out-sts', r.stringToSign);
      setText('out-signature', r.signature);
      setText('out-auth', r.authorization);
      // The URL must carry the same encoding the signer used, or the server's canonical
      // request will differ. On the wire the path is encoded once, for every service.
      const rawPath = f.path || '/';
      const path = PresignSigV4.uriEncode(rawPath[0] === '/' ? rawPath : '/' + rawPath, false);
      const cq = PresignSigV4.canonicalQuery(f.query);
      last = { canonicalRequest: r.canonicalRequest, stringToSign: r.stringToSign, method: f.method, headers: r.headers,
        signature: r.signature, accessKeyId: f.accessKeyId,
        body: f.body, url: 'https://' + f.host + path + (cq ? '?' + cq : '') };
    } catch (e) { setText('error', e.message); }
  }

  async function doPresign() {
    clearOutputs();
    const f = read();
    try {
      const r = await PresignPresign.presign(PresignCrypto, {
        host: f.host, path: f.path, method: f.method, query: f.query, region: f.region,
        accessKeyId: f.accessKeyId, secretAccessKey: f.secretAccessKey,
        sessionToken: f.sessionToken || undefined, amzDate: dateOf(f), expires: f.expires,
      });
      setText('out-canonical', r.canonicalRequest);
      setText('out-sts', r.stringToSign);
      setText('out-signature', r.signature);
      setText('out-url', r.url);
      last = { canonicalRequest: r.canonicalRequest, stringToSign: r.stringToSign, method: f.method,
        signature: r.signature, accessKeyId: f.accessKeyId, headers: {}, body: '', url: r.url };
    } catch (e) { setText('error', e.message); }
  }

  /** Send the last signed request. Browsers forbid setting Host; it is dropped. */
  async function doSend() {
    if (!last.url) { setText('error', 'Sign or presign first.'); return; }
    setText('error', '');
    const headers = {};
    for (const k of Object.keys(last.headers)) if (k.toLowerCase() !== 'host') headers[k] = last.headers[k];
    const init = { method: last.method, headers };
    if (last.body && !/^(GET|HEAD)$/i.test(last.method)) init.body = last.body;
    try {
      const res = await fetch(last.url, init);
      $('response').value = await res.text();
      explainNow();
    } catch (e) {
      setText('error', 'Request failed before a response arrived (' + e.message +
        '). This is usually CORS: the server must allow this origin. Try curl and paste the response below.');
    }
  }

  /** Render the explanation of the pasted response. */
  function explainNow() {
    const e = PresignExplain.diagnose($('response').value, {
      canonicalRequest: last.canonicalRequest, stringToSign: last.stringToSign,
      signature: last.signature, accessKeyId: last.accessKeyId,
    });
    const box = $('explanation');
    box.textContent = '';
    const add = (tag, text, cls, parent) => {
      const el = document.createElement(tag);
      el.textContent = text;
      if (cls) el.className = cls;
      (parent || box).appendChild(el);
      return el;
    };
    if (!e.ok) { add('p', e.error, 'error'); return; }
    add('p', e.code, 'code');
    add('p', e.summary);
    if (e.message) add('p', 'Server message: ' + e.message);
    const ul = add('ul', '');
    e.likelyCauses.forEach((c) => add('li', c, '', ul));
    add('p', e.hint);
    e.differences.forEach((d) => add('p', (d.name ? d.field + ' ' + d.name : d.field) + ': server "' +
      d.server + '" vs yours "' + d.local + '". ' + d.hint, 'diff'));
    // Line-by-line views; differing lines are highlighted.
    const view = (title, server, localText) => {
      if (server === undefined || !localText) return;
      add('h4', title);
      const wrap = add('div', '', 'diffview');
      PresignExplain.diffLines(server, localText).forEach((r) => {
        const row = add('div', '', r.same ? 'line' : 'line bad', wrap);
        add('code', r.line + '  server: ' + (r.server === undefined ? '(missing)' : r.server), '', row);
        if (!r.same) add('code', '   yours: ' + (r.local === undefined ? '(missing)' : r.local), '', row);
      });
    };
    view('Canonical request', e.canonicalRequest, last.canonicalRequest);
    view('String to sign', e.stringToSign, last.stringToSign);
  }

  // ---- Inspect an existing presigned URL ----
  async function inspectNow() {
    const secret = $('inspect-secret').value;
    const r = await PresignInspect.inspect($('inspect-url').value, {
      now: Date.now(), secret: secret || undefined, crypto: PresignCrypto,
    });
    const box = $('inspect-result');
    box.textContent = '';
    const add = (tag, text, cls, parent) => {
      const el = document.createElement(tag);
      el.textContent = text;
      if (cls) el.className = cls;
      (parent || box).appendChild(el);
      return el;
    };
    if (r.error) { add('p', r.error, 'error'); return; }
    const dl = add('dl', '');
    [['Host', r.host], ['Path', r.path], ['Access key ID', r.accessKeyId], ['Signed at', r.amzDate],
      ['Expires in (s)', r.expires], ['Expires at', r.expiresAt],
      ['Status', r.expired === null ? 'unknown' : r.expired ? 'EXPIRED' : r.secondsLeft + ' s left'],
      ['Signed headers', r.signedHeaders.join(';')]].forEach(([k, v]) => {
      add('dt', k, '', dl);
      add('dd', v == null ? '-' : String(v), '', dl);
    });
    const ws = add('ul', '', 'lint');
    r.warnings.forEach((w) => add('li', w, '', ws));
    if (r.verification) {
      const v = r.verification;
      add('p', v.status === 'match' ? 'Signature verified: matches the secret you entered.'
        : v.status === 'mismatch' ? 'Signature does NOT match the secret you entered.'
          : 'Signature check skipped: ' + v.reason, v.status === 'mismatch' ? 'diff' : '');
    }
  }

  // ---- Copy as curl ----
  function copyCurl() {
    if (!last.url) { setText('error', 'Sign or presign first.'); return; }
    const cmd = PresignExport.toCurl({ method: last.method, url: last.url, headers: last.headers, body: last.body });
    setText('out-curl', cmd);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cmd);
  }

  // ---- Profiles (secrets never stored; see profiles.js) ----
  // Secrets are only kept when the explicit, default-off checkbox is ticked.
  const secretsOn = () => $('save-secrets').checked;
  // Every storage operation goes through PresignProfiles, which owns the key and strips secrets.

  /** Remove everything this page saved. */
  function clearSaved() {
    localStorage.removeItem(PresignProfiles.STORAGE_KEY);
    $('save-secrets').checked = false;
    refreshProfiles();
  }

  function refreshProfiles() {
    const sel = $('profile-select');
    sel.textContent = '';
    sel.appendChild(new Option('(none)', ''));
    PresignProfiles.list(localStorage).forEach((p) => sel.appendChild(new Option(p.name, p.name)));
  }

  function saveProfile() {
    const name = $('profile-name').value.trim();
    const f = read();
    try {
      PresignProfiles.save(localStorage, Object.assign({}, f, { name }),
        { persistSecret: secretsOn(), overwrite: true });
      refreshProfiles();
      $('profile-select').value = name;
    } catch (e) { setText('error', e.message); }
  }

  function applyProfile() {
    const p = PresignProfiles.get(localStorage, $('profile-select').value);
    if (!p) return;
    $('profile-name').value = p.name;
    for (const k of Object.keys(p)) {
      const el = form.elements[k];
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!p[k]; else el.value = p[k];
    }
    showLint();
  }

  function deleteProfile() {
    PresignProfiles.remove(localStorage, $('profile-select').value);
    refreshProfiles();
  }

  /** Copy buttons: data-copy names the element whose text is copied. */
  function copy(btn) {
    const text = $(btn.getAttribute('data-copy')).textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
  }

  form.addEventListener('submit', (ev) => ev.preventDefault());
  form.addEventListener('input', showLint);
  $('btn-sign').addEventListener('click', doSign);
  $('btn-presign').addEventListener('click', doPresign);
  $('btn-send').addEventListener('click', doSend);
  $('btn-explain').addEventListener('click', explainNow);
  $('btn-inspect').addEventListener('click', inspectNow);
  $('btn-copy-curl').addEventListener('click', copyCurl);
  $('btn-profile-save').addEventListener('click', saveProfile);
  $('btn-profile-delete').addEventListener('click', deleteProfile);
  $('btn-clear-data').addEventListener('click', clearSaved);
  $('profile-select').addEventListener('change', applyProfile);
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(b)));
  try { refreshProfiles(); } catch (e) { /* localStorage may be blocked on file:// */ }
  showLint();
})();
