# Ferrywise demand test

A small static site that tests demand for Ferrywise. **Ferrywise is coming, not built**: this site is not the extension.

## Run the tests

    npm test
    node --test

No dependencies; Node standard library only. Tests live in `test/`, `tests/` and `qa_tests/`.

## Workbench (owner only)

Open `workbench.html` in the same browser that visits `index.html`. Tabs: Evidence, Sign-ups & clicks, Breakage, Results, Data. Everything runs in the browser; nothing is sent anywhere.

- `js/results.js` applies the plan's thresholds (sign-up rate 5% and 10 sign-ups; under 3% after both headlines is a kill signal; 60% of sign-ups naming a workflow; paid-tier clicks 3% and 6 of 200) plus the evidence gate and the 7-day breakage rule. Deposits always show Deferred and never count as passed. With no visitors typed in, rates show "Not enough data" (never NaN).
- Visitor counts per headline and optional Search Console impressions are typed into the Results tab by hand.

### Manual evidence routine

1. Find a public thread from the last 12 months where someone describes retyping client details between sites.
2. Open it and check it loads. Note whether free tools were named and whether they solved it.
3. Add it in the Evidence tab. Aim for 15 threads, 5 where free tools did not solve it.
4. Each day for a week, re-run the three hand-built workflows and log the result in the Breakage tab.
5. After each session, export JSON from the Data tab.

### Local-only data caveat

Data lives in this one browser's `localStorage` until you export it. Clearing site data, switching browser or device, or private windows will lose it. Sign-ups from other people's browsers are not collected; import their exported JSON if you have it.

## Layout

- `src/store.js` – record store over a storage object (`getItem`/`setItem`), JSON export/import merged by id.
- `src/variant.js` – stable headline variant (A/B) per visitor.
- `src/csv.js` – CSV serialisation with correct escaping.
- `test/` – tests run by `node --test` (including `extension-glue.test.js`: no network/eval scan, lib-name check, content script behaviour).

- `index.html` – landing page; `guide.html` – SEO how-to guide; `admin.html` – owner-only local page.
- `sitemap.xml`, `robots.txt` – crawl files (admin.html is disallowed).

## Open it

Open `index.html` in a browser (double-click, or serve the folder with any static server). Open `admin.html` locally in the same browser to see results.

Before publishing, replace the placeholder domain `example.com` in `sitemap.xml`, `robots.txt` and the canonical link in `guide.html`.

## Extension prototype (load unpacked)

`extension/` is an unreleased Manifest V3 prototype. It makes no network calls and asks only for `activeTab`, `scripting` and `storage`. Logic lives in `extension/lib/*.js` (tested); `popup.js` and `content.js` are thin glue.

### Load it

1. Open `chrome://extensions` in Chrome (or `edge://extensions` in Edge).
2. Switch on **Developer mode** (top right in Chrome, left menu in Edge).
3. Click **Load unpacked** and choose the `extension` folder (the one holding `manifest.json`).
4. Click the puzzle-piece menu and pin **Ferrywise (prototype)**.
5. After editing any file, click the reload arrow on the extension card and reopen the popup.

### Manual checklist

- [ ] Popup opens at 380px wide with the PROTOTYPE badge and 5 tabs; arrow keys, Home and End move between tabs.
- [ ] On `chrome://extensions` every action button is disabled and the "can't read this page" text shows.
- [ ] Capture on a page with labelled filled fields lists them with ticked boxes; unticking one and saving shows "Done: Saved N details to ...".
- [ ] Preview fill lists one row per field with a status word; **Fill** stays disabled until a preview exists.
- [ ] Fill writes only the "Will fill" and "Rule" rows, and the target page's form reacts as if typed (validation runs).
- [ ] Reload the target page after previewing, then Fill: an "Error: The page changed..." message shows and nothing is written.
- [ ] Links tab: Extract, filter, "Copy as text" and "Copy as CSV" paste correctly; duplicates count is shown.
- [ ] Rules tab: add a rule, preview shows "◆ Rule" for that field; Remove deletes it.
- [ ] Backup tab: export a JSON file, delete a profile, import the file, and the profile is back. A non-backup file gives the "isn't a Ferrywise backup" error.
- [ ] Password, card and one-time-code fields are never listed or filled.
- [ ] Capture shows every captured detail with a tick box; nothing is saved to a profile until you press Save details.
- [ ] Links: `#fragment` variants of one URL are merged on purpose and counted as duplicates; `javascript:`, `data:` and `vbscript:` links are dropped.
- [ ] Evidence threads are added only on `evidence.html`; `admin.html` reads the same list (`ferrywise:evidence`) for its gate.
- [ ] DevTools Network tab shows no requests from the popup.

### Three hand-test workflows (breakage check)

Run each with one profile and note what breaks (wrong field, skipped field, page ignoring the value).

1. **Contact details between two sites.** Capture name, email, phone and company from a CRM or invoice page. Preview and fill a different site's contact or sign-up form. Record how many fields filled correctly and how many were skipped.
2. **Two similar fields.** Use a form with two email-like fields (for example "Billing email" and "Contact email"). Confirm the preview says "Skipped: two possible matches", add a rule for one, preview again, and confirm it shows "Rule".
3. **Framework form.** Fill a form built with a JavaScript framework (React or similar: a checkout or newsletter form). Confirm the values stay after clicking away and the form's own validation accepts them. Then extract links from a long page and copy as CSV.

## Limitation

Data lives in the browser's `localStorage`. It is per browser and per device, can be cleared by the user, and is not shared with other visitors. Sign-ups from other visitors' browsers are therefore not collected without a backend, which is out of scope. Use the export/import feature to move or back up records.

## Search Console tracking note

After publishing, add the site to Google Search Console, submit `sitemap.xml`, and record impressions and clicks for `guide.html` by hand in the admin evidence log. Note that `robots.txt` only asks crawlers to skip `admin.html`; it is not access control.
