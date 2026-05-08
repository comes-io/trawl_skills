---
name: trawl-scrap-account
description: Use when scraping a site that requires authentication. Covers Trawl-managed credentials (account.username/password + saveSession()), BYO-cookies injection (when you don't want to give credentials to Trawl), and the trade-offs between embedded vs persisted cookies. Triggers on "scrape an authenticated site", "behind login", "I don't want to give my credentials to Trawl", "inject cookies", "session", "MFA". Does NOT cover CLI account management (see trawl-cli), general script structure (see trawl-scrap-design), or local test runs (see trawl-scrap-local-test).
---

# Trawl Scrap Account

Use when the target site requires authentication. This skill covers three authentication flows: Trawl-managed credentials (the legacy flow), BYO-cookies embedded in the script (flavour A), and BYO-cookies persisted via the Trawl API (flavour B).

## The worker boundary

> **Don't add stealth in your script.** Trawl's worker handles fingerprinting, proxy rotation, and bot-detection countermeasures centrally. Adding stealth plugins, UA spoofing, viewport randomisation, or aggressive jitter in your script duplicates worker policy and causes drift. The worker's policy evolves; your script's hardcoded tricks won't.

This applies even when authenticated. Injecting cookies does not change the worker's fingerprint policy.

## Decision tree

1. **Plain username/password login, no MFA** → use **Trawl-managed credentials** (section below). Trawl stores credentials encrypted; the script reads `account.username` / `account.password` at runtime and calls `saveSession()` after a successful login to reuse the session on subsequent runs.

2. **One-shot test or short-lived experiment, or you want to verify your cookies work before setting up persistence** → use **Flavour A — Embedded BYO-cookies**. Hard-code the cookie array directly in the script body. Accepts the trade-off that cookies are in plain text in the script source.

3. **MFA, SSO, OAuth, or you don't want to hand credentials to Trawl** → use **Flavour B — Persisted BYO-cookies**. Export cookies from a logged-in browser session, push them into `account.session.cookies` via the Trawl API persistence endpoint, and the script reads them back before navigation. Cookies are encrypted at rest.

## Trawl-managed credentials (legacy flow)

The script receives two VM globals injected by the worker:

- `account.username` — the username stored for this scrap account.
- `account.password` — the password stored for this scrap account.

After a successful login, call `saveSession(await page.cookies())` immediately. The worker persists the cookie array encrypted at rest and exposes it as `account.session.cookies` on the next run.

```js
const page = await browser.newPage();

if (account.session?.cookies) {
  // Saved session exists — restore cookies and skip the login flow.
  await page.setCookie(...account.session.cookies);
  await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
} else {
  // First run (or cleared session) — perform full login.
  await page.goto('https://example.com/login', { waitUntil: 'domcontentloaded' });
  await page.type('#username', account.username);
  await page.type('#password', account.password);
  await Promise.all([
    page.click('button[type=submit]'),
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
  ]);
  // Persist cookies for the next run.
  await saveSession(await page.cookies());
}
```

See `references/session-flow.md` for the expanded pattern with comments and error handling.

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

**Trade-off:** Cookies are stored in plain text in the script source. Use only for short-lived experiments or to verify that a given cookie set grants access before setting up flavour B. Export cookies from a logged-in Chrome session — see `references/cookie-injection.md` for the walkthrough.

## Flavour B — Persisted BYO-cookies

Export cookies from a logged-in browser session and push them into `account.session.cookies` via the Trawl API persistence endpoint. The worker encrypts them at rest and exposes them to the script as `account.session.cookies`.

The script reads the same global as the Trawl-managed flow:

```js
if (!account.session?.cookies) {
  throw new Error('Flavour B requires account.session.cookies — push them via the persistence endpoint first.');
}

const page = await browser.newPage();
await page.setCookie(...account.session.cookies);
await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
```

**Note:** this requires the persistence endpoint to be live — check the Trawl API reference. If unavailable, use flavour A or the Trawl-managed flow instead.

See `references/cookie-injection.md` for domain matching rules, HttpOnly cookie export, localStorage considerations, and cookie expiry handling.

## Anti-patterns to avoid

Being authenticated does not change the worker boundary rules. See the `trawl-scrap-design` skill for the full anti-patterns list (no in-script stealth, no UA spoofing, no fixed delays, etc.). The same rules apply when authenticating — credentials don't justify in-script stealth. In particular:

- No stealth plugins even when cookies are set.
- No `waitForTimeout` — use state-based waits.
- No deep CSS chains for the post-login selectors.

## What this skill does NOT cover

- Does not cover writing the broader Puppeteer scraping logic — see the `trawl-scrap-design` skill.
- Does not manage scraps or scrap accounts via the CLI — see the `trawl-cli` skill (`trawl scraps account set/status/clear-session/delete`).
- Does not run scraps locally for debugging — see the `trawl-scrap-local-test` skill.
