---
title: Cookie Injection
---

> **Fallback reference.** `trawl scraps account session capture <id>` (see `SKILL.md`) is the primary way to get a session now — it drives a real Chrome over CDP, sees HttpOnly cookies, and captures localStorage automatically, no manual steps. Everything below is for when capture can't run, or for understanding the shape the server stores. Manual steps here are things to tell the **user** to do in their own browser — never actions for your own browser tool to perform.

### setCookie before goto

Call `page.setCookie(...cookies)` before `page.goto`. Cookies set after `goto` are ignored — request headers are already sent.

```js
const page = await browser.newPage();
await page.setCookie(...cookies);  // must come before goto
await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
```

### HttpOnly cookies are invisible from JS — and from your own browser tooling

`document.cookie` and `page.evaluate(() => document.cookie)` silently skip HttpOnly cookies — the partial set won't authenticate the session. This is the most common silent failure in a hand-written script, and it's structural: no browser-JS API returns an HttpOnly cookie, by design.

**The same restriction applies to Claude's own browser tooling** — it evaluates JS in page context, the same `document.cookie` ceiling. Instagram, X, and Reddit all mark their session cookie HttpOnly, so an agent trying to read the cookie itself via its own browser tool produces a confident-looking but silently wrong result on exactly the cookie that matters. **Never do this — detect the wall, then tell the user to run `session capture` (see `SKILL.md`), which reads the full jar over CDP instead of JS.**

A human, using the browser's own DevTools UI (not JS) or a privileged extension, can still see and copy an HttpOnly cookie's value manually — that's the fallback below, unaffected by the JS restriction above. It's just slower and more error-prone than one CLI command, and it's a step for the user to take in their own browser, never you.

Manual capture, when still needed:
- **DevTools** → Application → Cookies → select the domain → copy to JSON manually.
- **A WebExtensions-based Chrome extension** from https://chromewebstore.google.com/search/cookie%20exporter

### Domain matching gotchas

Three distinct forms:

- `.example.com` (leading dot) — matches apex + all subdomains. Most session cookies use this.
- `example.com` (no dot) — apex only.
- `www.example.com` — that subdomain only.

When cookies don't apply, check `domain` first. Export the exact value from DevTools.

```json
[
  {
    "name": "session_id",
    "value": "abc123",
    "domain": ".example.com",
    "path": "/",
    "httpOnly": true,
    "secure": true
  }
]
```

### Session shape the server accepts

`PUT /api/scraps/:scrapId/account/session` — what `session set` and `session capture` both call — validates and normalizes what's uploaded, whether that's a bare cookie array or `{ cookies, origins? }`:

**Cookie** — `{ name, value, domain, path?, httpOnly?, secure?, expires?, sameSite? }`:
- `name` / `value` — required strings.
- `domain` — **required**. A domain-less cookie used to silently no-op at replay time; the server now rejects it outright instead of letting a run fail silently later.
- `expires` — unix **seconds** (not milliseconds) — same unit as Puppeteer's `CookieData.expires` / DevTools' `expirationDate`. `-1` (some export tools' "session cookie" marker) is accepted but dropped, not stored literally.
- `sameSite` — `Strict` | `Lax` | `None` (`chrome.cookies.Cookie`'s lowercase `strict`/`lax`/`no_restriction` are recased automatically; `unspecified` is dropped). **`sameSite: 'None'` requires `secure: true`** — the browser silently drops a `None` cookie missing `secure` at the CDP layer, so the server rejects that combination up front rather than letting the cookie vanish invisibly at replay time.

**`origins[]`** (optional, storageState-shaped — what `session capture` uploads for localStorage): `[{ origin: "https://example.com", localStorage: [{ name, value }] }]`. `origin` must be a bare `scheme://host[:port]` — no path or query.

**`session set -c <file>` only checks that each cookie has a string `name`/`value` before sending it** — everything else above (domain, sameSite legality, the `None`+`secure` pairing) is enforced server-side, at upload time, as a `422` naming the bad field. A hand-edited or hand-copied DevTools export that skips `domain`, or carries a `sameSite` the server doesn't recognize, fails loudly right there on `session set` — not silently, deep inside a later scheduled run.

### localStorage / sessionStorage parallel save

Some sites store JWTs in `localStorage`, not cookies. Detection signal: navigation succeeds but immediately redirects to a login route despite valid cookies (see `references/session-flow.md` for the exact-route matcher — never a `.includes('/login')` substring check). `session capture` reads this automatically, scoped per-origin to the target domain, and uploads it as `origins[]` alongside the cookies — no separate step needed.

Manual fallback, when capture can't run — tell the user to do this in their own browser, never something to run via your own browser tool:

```js
// In DevTools console on the logged-in page:
JSON.stringify(localStorage)
```

Replay after `goto` via `page.evaluate`:

```js
await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
await page.evaluate((data) => {
  for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
}, capturedLocalStorage);
await page.reload({ waitUntil: 'domcontentloaded' });
```

### Cookies don't persist across worker runs except via Trawl session

The worker starts a fresh browser context on each run. Persistence requires:

- `saveSession(await page.cookies())` — stores encrypted, exposed as `TRAWL.account.session.cookies` next run (alias: `account.session.cookies`).
- Flavour B persistence endpoint — cookies pushed externally.

Flavour A re-injects cookies from the script source on every run.

### Exporting cookies from Chrome — manual fallback walkthrough

**Prefer `trawl scraps account session capture <id>` (see `SKILL.md`)** — it does this over CDP in one step: cookies, HttpOnly included, plus localStorage, no manual copying. Use the walkthrough below only when capture genuinely can't run in the environment (no local interactive terminal/display). These are steps for the user to run themselves in their own Chrome — never something to execute via your own browser tooling.

1. Log in to the target site in Chrome.
2. Open DevTools → Application → Storage → Cookies → select the domain.
3. Copy values to a JSON array matching `CookieParam` shape (`name`, `value`, `domain`, `path`, `httpOnly`, `secure`) — see "Session shape the server accepts" above for the full field list the server validates.

Or a cookie-export extension: https://chromewebstore.google.com/search/cookie%20exporter

### Storage state expiry

Signs of expired cookies:
- Navigation lands on a login route (see `references/session-flow.md`) or an identity-provider redirect.
- First protected request returns 401 or 403.
- Page loads but user-specific data is absent (silent guest view).

Refresh:
1. `trawl scraps account session capture <id>` — fastest path, re-does the login and re-uploads in one step (see `SKILL.md`). Remember cookies alone aren't always sufficient — see the "Necessary, not sufficient" caveats there.
2. Manual fallback: log in locally in a fresh Chrome session, export new cookies (walkthrough above), re-upload via `session set -c <file>` (flavour B) or update the embedded array (flavour A).
3. Trawl-managed flow: `trawl scraps account clear-session <id>` to force re-login on next run.
