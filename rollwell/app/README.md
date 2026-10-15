# Rollwell validation page

A static landing page to test demand for Rollwell, a planned tool to deploy and
roll back static sites on Netlify, Vercel and GitHub Pages. **The tool is not
built yet.** This site says so and collects waitlist interest only. The deploy
and rollback engine is out of scope for this version.

## Files

- `index.html`: landing page (two headline variants, waitlist form, "I'd pay" tier buttons, FAQ)
- `rollback-github-pages.html`: SEO how-to page with a waitlist link
- `stats.html` + `stats-page.js`: owner-only stats view (this browser only) and CSV export
- `src/`: pure logic modules (variant, waitlist, events, stats); `app.js` is the browser glue
- `config.js`: owner settings; `sitemap.xml`, `robots.txt`: SEO files

## Run

Open `index.html` in a browser. No build step, no server, no network needed.
Open `stats.html` directly by URL in the same browser to see its data.

## Test

    node --test

Uses only Node's built-in test runner. Tests live in `test/`.

## Configure

1. Edit `config.js`: set `waitlistEmail` to your own address (this is where the
   prefilled sign-up emails go), set `siteBaseUrl` to your public URL with no
   trailing slash, and keep or change `storageKeyPrefix`.
2. In `sitemap.xml` and `robots.txt`, replace `SITE_URL` with the same public URL.

## Deploy

Copy the folder to any static host (GitHub Pages, Netlify, Vercel). Do the
configure steps first. `stats.html` is disallowed in `robots.txt` and not linked
from any page, but it is not secret; it only shows data from the browser that
opens it.

## Limitation: localStorage and mailto

Events and sign-ups are stored in each visitor's own browser. Sign-ups are **not
collected centrally**: there is no server. A visitor's answer only reaches you if
they click "Open email to send" and send the prefilled email. Many will not, so
treat real sign-up counts as a lower bound. `stats.html` shows only the browser
that opens it, so it is a check of your own testing, not of all visitors. To
judge the test, count the emails you receive.
