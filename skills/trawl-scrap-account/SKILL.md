---
name: trawl-scrap-account
description: Use when scraping a site that requires authentication. Triggers on "scrape an authenticated site", "behind login", "I don't want to give my credentials to Trawl", "inject cookies", "reuse a session", "MFA", or any prompt about cookies/sessions on Trawl. Does NOT cover CLI account management (see trawl-cli), general script structure (see trawl-scrap-design), or local test runs (see trawl-scrap-local-test).
---

# Trawl Scrap Account

Use when the target site requires authentication. Covers three flows: Trawl-managed credentials (server-stored, still recommended for plain username/password logins), BYO-cookies embedded in the script (flavour A), and BYO-cookies persisted via the Trawl API (flavour B).

## The worker boundary

> **Don't add stealth in your script.** Trawl's worker handles fingerprinting, proxy rotation, and bot-detection countermeasures centrally. Adding stealth plugins, UA spoofing, viewport randomisation, or aggressive jitter in your script duplicates worker policy and causes drift. The worker's policy evolves; your script's hardcoded tricks won't.

Injecting cookies does not change the worker's fingerprint policy.

## Decision tree

1. **Plain username/password login, no MFA** → use **Trawl-managed credentials** (section below). Trawl stores credentials encrypted; the script reads `TRAWL.account.username` / `TRAWL.account.password` at runtime and calls `saveSession()` after a successful login to reuse the session on subsequent runs.

2. **One-shot test or short-lived experiment, or you want to verify your cookies work before setting up persistence** → use **Flavour A — Embedded BYO-cookies**. Hard-code the cookie array directly in the script body. Accepts the trade-off that cookies are in plain text in the script source.

3. **MFA, SSO, OAuth, or you don't want to hand credentials to Trawl** → use **Flavour B — Persisted BYO-cookies**. Export cookies from a logged-in browser session, push them into `TRAWL.account.session.cookies` via UI, CLI, or API, and the script reads them back before navigation. Cookies are encrypted at rest.

## Trawl-managed credentials (server-stored, still supported)

The worker injects the account credentials under `TRAWL.account`:

- `TRAWL.account.username` — the username stored for this scrap account (alias: `account.username`).
- `TRAWL.account.password` — the password stored for this scrap account (alias: `account.password`).

After a successful login, call `saveSession(await page.cookies())` immediately. The worker persists the cookie array encrypted at rest and exposes it as `TRAWL.account.session.cookies` on the next run.

> Legacy bare `account.*` (e.g. `account.username`) still works as an alias.

```js
const page = await browser.newPage();

if (TRAWL.account?.session?.cookies) {
  // Saved session exists — restore cookies and skip the login flow.
  await page.setCookie(...TRAWL.account.session.cookies);
  await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
} else {
  // First run (or cleared session) — perform full login.
  await page.goto('https://example.com/login', { waitUntil: 'domcontentloaded' });
  await page.type('#username', TRAWL.account.username);
  await page.type('#password', TRAWL.account.password);
  await Promise.all([
    page.click('button[type=submit]'),
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
  ]);
  // Persist cookies for the next run.
  await saveSession(await page.cookies());
}
```

See `references/session-flow.md` for the expanded pattern with error handling.

## Flavour A — Embedded BYO-cookies

Hard-code the cookie array directly in the script body. Call `page.setCookie(...cookies)` before any `page.goto` on the target domain.

```js
const cookies = [
  {
    name: 'session_id',
    value: 'abc123',
    domain: '.example.com',
    path: '/',
    httpOnly: true,
    secure: true,
  },
];

const page = await browser.newPage();
await page.setCookie(...cookies);
await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
```

**Trade-off:** Cookies are in plain text in the script source. Use only for short-lived experiments or pre-validation before setting up flavour B. See `references/cookie-injection.md` for the export walkthrough.

## Flavour B — Persisted BYO-cookies

Export cookies from a logged-in browser session. Three write paths exist for `TRAWL.account.session.cookies` (any one is fine; the scrap source reads them back identically):

- **UI** (one-off / interactive): scrap settings drawer → Account section → **Upload session cookies** → paste a Puppeteer cookie JSON array → Save.
- **CLI** (scripted / batch): `trawl scraps account session set <scrap-id> --cookies <file>` (npm `@trawlme/cli` ≥ 1.14.0).
- **API** (custom tooling): `PUT /api/scraps/:scrapId/account/session` with body `{ cookies: [...] }`.

The worker encrypts them at rest; the script reads the same global as the managed flow:

```js
if (!TRAWL.account?.session?.cookies) {
  throw new Error('Flavour B requires TRAWL.account.session.cookies — push them via UI / CLI / API first.');
}

const page = await browser.newPage();
await page.setCookie(...TRAWL.account.session.cookies);
await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
```

See `references/cookie-injection.md` for domain matching, HttpOnly export, localStorage, and expiry handling.

## Anti-patterns to avoid

Authentication does not change the worker boundary rules (see `trawl-scrap-design`):

- No stealth plugins even when cookies are set.
- No `waitForTimeout` — use state-based waits.
- No deep CSS chains for post-login selectors.

## What this skill does NOT cover

- Scraping logic → `trawl-scrap-design`
- CLI account management → `trawl-cli` (`trawl scraps account set/status/clear-session/delete`)
- Local debugging runs → `trawl-scrap-local-test`
