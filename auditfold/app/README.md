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
- `src/checks.js` – the 12 on-page checks; each returns `{id, name, passed, severity, weight, message, fix}`.
- `src/audit.js` – runs parse and checks, ranks the fixes and computes the 0-100 score.
- `src/report.js` – renders an audit as HTML, Markdown or plain text.
- `src/history.js` – last 20 audits, newest first, via an injected storage object
  (`list`, `add`, `clear`); corrupt or unreadable data gives an empty list.
- `test/` – `node --test` suites

## Manual browser check
1. Open `index.html` (double-click; no server needed).
2. Open the console, paste any page's View Source into "Page HTML", press Run audit (or Ctrl+Enter).
3. Expect: a score, a ranked fix list with High/Medium/Low badges, enabled report buttons,
   a new row under "Recent audits", and no console errors.
4. Try Copy as Markdown, Download report (HTML), Print or save as PDF, and reopening a history row.
   (Clipboard may be blocked on `file://`; a fallback text box then appears.)

## Notes
- `app.js` is browser glue only. Modules load via script tags and also export via `require` in Node.
- History stores the audit result, not the pasted HTML, so reopening leaves the HTML box blank.
- Not checked: speed, backlinks, the rest of the site. The extension is not built.

## Status
Tasks 1-5 done: parser, checks, audit, report, history and UI wiring.
