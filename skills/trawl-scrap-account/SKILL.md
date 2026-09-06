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

3. **MFA, SSO, OAuth, or you don't want to hand credentials to Trawl** → use **Flavour B — Persisted BYO-cookies**. Run `trawl scraps account session capture <scrap-id>` locally: it opens a real Chrome, you log in exactly as you normally would (2FA included), and the CLI reads the resulting session over CDP and uploads it — no manual export. Manual upload (`session set -c <file>`) still exists as a fallback. Cookies (and localStorage) are encrypted at rest.

## Trawl-managed credentials (server-stored, still supported)

The worker injects the account credentials under `TRAWL.account`:

- `TRAWL.account.username` — the username stored for this scrap account (alias: `account.username`).
- `TRAWL.account.password` — the password stored for this scrap account (alias: `account.password`).

The worker replays a stored session automatically, before your script's first navigation — your script never restores cookies itself (don't call `page.setCookie(...TRAWL.account.session.cookies)`; the worker already applied them via `browserContext.setCookie()`, and per-page `setCookie` is deprecated Puppeteer surface besides). Its job is to **detect whether the page is already logged in**, and only run the credential login flow when it isn't. After a successful login, call `saveSession(await page.cookies())` — the worker persists the cookie array encrypted at rest and replays it on the next run. This is a **cookies-only** refresh: it never touches or clears an `origins` (localStorage) block already saved via `session capture` or the web UI.

> Legacy bare `account.*` (e.g. `account.username`) still works as an alias.

```js
const page = await browser.newPage();

// The worker has already replayed any stored session onto this page.
// Check for a marker that only appears when logged in, rather than
// assuming a saved session means you're logged in.
// `domcontentloaded` fires before an SPA hydrates, so an immediate DOM query
// can read "not logged in" on a perfectly valid session — wait for the marker instead.
await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
const loggedIn = await page.waitForSelector('.account-menu', { timeout: 10_000 }).then(() => true, () => false);

if (!loggedIn) {
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

### The command: `session capture` (primary path)

```bash
trawl scraps account session capture <scrap-id>
```

Opens a real, headed Chrome at the scrap's target URL. The user logs in there exactly as they normally would — password, MFA, SSO, whatever the site needs. **Enter back in the terminal is the reliable way to complete capture.** Closing the Chrome window also works, but only if Chrome's process survives that close (it captures cookies only then — never localStorage); if that window was the only one open and closing it quits Chrome entirely — the common case, especially on Linux — nothing is captured or uploaded at all. Tell the user to press Enter, not to close the window, when they actually want the localStorage half. The CLI then reads the session over CDP (cookies **and** per-origin localStorage) and uploads it via the same endpoint Flavour B always used (`PUT /api/scraps/:scrapId/account/session`). `--json` prints counts only, nested under `capture` (`capture.cookiesCaptured`, `capture.originsCaptured`), next to `account` and `targetDomain` — the session itself is never printed, in any mode.

> You stay authenticated as yourself throughout — Trawl never sees your credentials, only the resulting session. Responsibility for lawful use of that session stays with you; this isn't legal advice.

Flags:
- `--chrome <path>` — a specific Chrome/Chromium executable. Auto-detected otherwise; `TRAWL_CHROME_PATH` (or `PUPPETEER_EXECUTABLE_PATH`/`CHROME_PATH`) names one explicitly, checked before the well-known per-OS install paths.
- `--json` — machine-readable summary, never the secret.

The scrap needs a target URL configured first (`trawl scraps update <id> -u <url>` if it doesn't have one — there's nothing to open a browser to otherwise). If login didn't actually complete on that domain before Enter/close, nothing uploads — the CLI says plainly that 0 cookies were in scope, rather than silently saving an unauthenticated session.

**🔴 Your role here is detect, orient, explain — never extract.** Tell the user this command exists and what it does; do not open a browser yourself and copy cookies out of it. Browser JavaScript cannot see an HttpOnly cookie — which is why Claude's own browser tooling (`document.cookie`, `page.evaluate`) can't capture it, and Instagram, X, and Reddit all mark their session cookie HttpOnly. The CLI uses CDP for automated capture; the DevTools export documented in `references/cookie-injection.md` remains the manual fallback. A skill that tells you to read cookies yourself produces a silent, confident-looking failure on the one cookie the site actually checks.

### Prerequisites — this needs a human, on their own machine, right now

`session capture` requires a **local, interactive terminal with a display**, because a human has to actually see the Chrome window and log in. It does **not** work headless, in CI, over a plain SSH session (no display on Linux), or from an agent driving a remote/cloud browser. If that's the actual environment, say so plainly and point at the fallback below — don't imply a session is always recoverable from wherever you happen to be running.

### Fallback — manual upload (`session set`)

```bash
trawl scraps account session set <scrap-id> -c <file>
```

Accepts either a bare Puppeteer cookie JSON array, or a `{ cookies, origins }` storageState-shaped file — the same shape `session capture` uploads, so a file saved from one capture can be replayed with `set` later, or handed to someone else. Reach for this only when capture genuinely can't run in the current environment. UI (scrap settings → Account → Upload session cookies) and API (`PUT /api/scraps/:scrapId/account/session`) reach the same endpoint.

The worker encrypts the stored session at rest and replays it automatically before your script's first navigation — Flavour B has no credentials to fall back on, so the script's only job is to confirm the replayed session is actually logged in, and throw (pointing back at capture) if it isn't:

```js
const page = await browser.newPage();

// The worker has already replayed the stored session onto this page.
// `domcontentloaded` fires before an SPA hydrates, so an immediate DOM query
// can read "not logged in" on a perfectly valid session — wait for the marker instead.
await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
const loggedIn = await page.waitForSelector('.account-menu', { timeout: 10_000 }).then(() => true, () => false);

if (!loggedIn) {
  throw new Error('Session missing or expired — re-run `session capture` (or `session set`) to refresh it.');
}
```

See `references/cookie-injection.md` for the session/cookie shape the server accepts, domain matching, and localStorage replay (including the manual fallback walkthrough for when capture can't run).

### Necessary, not sufficient — cookies alone don't clear every wall

A valid, freshly-captured session is the right first move, but not a guaranteed fix:

- **Reddit**: a run with valid, unexpired cookies still came back empty — the app hydrates its authenticated view client-side and the worker's snapshot landed without that hydration completing. X and Instagram are the same class of SPA; expect the same failure mode.
- **Amazon** (`/product-reviews/…`): a 403 there is an **IP-level** block, not a login wall — no cookie touches it.
- **Tier-1 social in general**: without a **geo-matched residential proxy**, session injection is close to dead — a valid cookie replayed from a datacenter ASN is itself a signal these sites flag, independent of whether the cookie is genuinely good.

Say this plainly when recommending capture: it's the right lever to pull, not a promised fix.

### Secret hygiene — a session is a bearer secret

- `session capture` scopes what it uploads to the scrap's target domain — cookies and localStorage entries outside that domain are dropped, not uploaded. Never widen this: don't tell a user to export their *whole* cookie jar when only one site's session is needed.
- The temporary Chrome profile `capture` launches into is deleted after the run, success or failure.
- If a manual `cookies.json` (or storageState file) is ever created for the fallback path, delete it after `session set` uploads it — it's a live bearer credential sitting on disk otherwise.
- `--json` never prints the session, and neither should you — only counts and the target domain are safe to relay back to the user.

## Anti-patterns to avoid

Authentication does not change the worker boundary rules (see `trawl-scrap-design`):

- No stealth plugins even when cookies are set.
- No `waitForTimeout` — use state-based waits.
- No deep CSS chains for post-login selectors.
- Never read cookies via your own browser tooling and hand them to the user (or paste them into a scrap) — `document.cookie` silently drops HttpOnly cookies, the ones that matter. Detect the wall, name `session capture`, stop there.

## What this skill does NOT cover

- Scraping logic → `trawl-scrap-design`
- CLI account management → `trawl-cli` (`trawl scraps account set/status/clear-session/delete`)
- Local debugging runs → `trawl-scrap-local-test`
- The CLI's own auth errors (your Trawl login expired) → `trawl-cli` skill, `trawl login` — that `kind:'auth'` is unrelated to a scrap run's `failureKind:'auth'` covered here (which means the *target site* wants a session, not that your Trawl login is stale)
