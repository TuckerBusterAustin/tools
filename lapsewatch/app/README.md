# Lapsewatch v1

Static, browser-only. No server, no network requests, no install step.
Lapsewatch only reminds; it never renews certificates. A browser cannot read
certificates, so you enter each expiry date yourself. v1 does not check
certificates itself and sends no emails or Slack messages.

## Open it

Double-click `index.html` (or open it from the File menu). Pages:

- `index.html`: landing page, waitlist, and the same enter-your-dates checker
- `ssl-expiry-checker.html`: free checker, paste `domain, date` lines
- `app-domains.html`: saved list (5 free, 100 Pro), stored in localStorage
- `app-alerts.html`: threshold view, Slack/email text and .ics (Pro). No email or Slack delivery.

Pro features need `window.VSLicense`. Without it the pages still work and Pro
controls stay locked with an "Unlock with Pro" note.

## Run tests

```
node --test
```

Uses only Node's built-in test runner. `test/glue.test.js` loads `app.js` in a
`vm` context with stub DOM and strict lib wrappers, so a call to a missing lib
function fails the test.

## No network requests

`tests/glue.test.js` (`test/glue.test.js`) fails if `app.js` or `lib/*.js`
contain `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket` or `EventSource`.
Manual check, which should print nothing:

```
grep -n "fetch\|XMLHttpRequest\|sendBeacon\|WebSocket" app.js lib/*.js
```

(I could not run commands in this environment; the automated test above is the
enforced check.)

## Manual check list

- [ ] All four pages open from the file system (`file://`).
- [ ] Links between them work (header, app tabs, footer, in-text links).
- [ ] The free checker works with no license object (try `clientsite.com, 2026-12-01`).
- [ ] Console shows no errors with `window.VSLicense` undefined.
- [ ] On Domains and Alerts, Pro buttons are disabled and show "Unlock with Pro".
- [ ] Free list stops at 5 domains with a message about Pro.
- [ ] Network tab shows no requests beyond the local files.
