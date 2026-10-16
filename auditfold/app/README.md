# Auditfold (example build)

A single-page SEO audit that runs locally. Paste a page's HTML source and get a
plain-language fix list ranked by importance, plus a client-ready report.
No network calls, no crawling, no backlinks. The browser extension is coming and is **not built**.

## Run
Open `index.html` in a browser. Nothing is uploaded.

## Test
`node --test` (Node 18+, standard library only).

## Layout
- `index.html`, `styles.css`, `app.js` – UI and browser glue
- `src/parse.js` – HTML extractor; never throws. Returns
  `{title, metaDescription, h, images, links, canonical, robots, viewport, lang, og, wordCount}`.
  Absent single values are `null`; image `alt` is `null` when missing and `''` when empty;
  `og` keys omit the `og:` prefix (`og.title`).
- `src/checks.js` – the 13 on-page checks; each returns `{id, name, passed, severity, weight, message, fix}`.
- `src/audit.js` – runs parse and checks, ranks the fixes and computes the 0-100 score.
- `src/report.js` – renders an audit as HTML, Markdown or plain text.
- `src/history.js` – last 50 audits, newest first, via an injected storage object
  (`save`, `list`, `get`, `remove`, `clear`); corrupt or unreadable data gives an empty list.
  `save` reports `dropped: true` when the oldest entry was removed.
- `audit.auditChecked(html)` returns `{ok:false, error}` for empty or non-HTML input instead of throwing.
- `test/` – `node --test` suites

## Manual browser check
1. Open `index.html` (double-click; no server needed).
2. Open the console, paste any page's View Source into "Page HTML", press Run audit (or Ctrl+Enter).
3. Free: a score, a ranked fix list with High/Medium/Low badges, and Copy as text. No console errors.
4. Pro (needs `VSLicense`): report export, print/PDF and saved history. Without it these
   stay disabled and show "Unlock with Pro"; the print area stays empty.
   (Clipboard may be blocked on `file://`; a fallback text box then appears.)

## Notes
- `app.js` is browser glue only. Modules load via script tags and also export via `require` in Node.
- History stores the audit result, not the pasted HTML, so reopening leaves the HTML box blank.
- Not checked: speed, backlinks, the rest of the site. The extension is not built.

## Status
v2: free audit plus Pro-gated reports and history, all implemented and tested.
