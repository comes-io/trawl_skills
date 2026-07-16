---
name: trawl-scrap-local-test
description: Use when testing a Trawl scrap locally before publishing. Triggers on "test my scrap locally", "debug before push", "run scrap on my machine", "preview returnData output", or any prompt about iterating on a script before pushing. Does NOT cover writing the script body (see trawl-scrap-design), authentication flows (see trawl-scrap-account), or managing scraps via CLI (see trawl-cli).
---

# Trawl Scrap Local Test

Validate selectors, login flow, and returnData shape locally before spending proxy budget on the worker. The harness (`scripts/run-local.mjs`) injects the same globals as the worker — `browser`, `TRAWL`, `account`, `returnData`, `saveSession` — so your script runs unchanged on your machine.

## The worker boundary

> **Don't add stealth in your script.** Trawl's worker handles fingerprinting, proxy rotation, and bot-detection countermeasures centrally. Adding stealth plugins, UA spoofing, viewport randomisation, or aggressive jitter in your script duplicates worker policy and causes drift. The worker's policy evolves; your script's hardcoded tricks won't.

Local testing intentionally uses vanilla `puppeteer-core` — no fingerprint policy, no proxy. You're testing your script's logic, not the worker's network surface.

## Quick-start

Paths below assume the default install location (`~/.claude/skills/`); adjust if the skill lives elsewhere (project `.claude/skills/`, a plugin cache, etc.).

```bash
# Install puppeteer-core once (it's a peer dependency, not bundled with the skill).
# Must be installed IN the skill directory — the harness does a bare ESM
# `import('puppeteer-core')` which resolves relative to the skill dir, not
# global/CWD/NODE_PATH, so a global install won't satisfy it.
cd ~/.claude/skills/trawl-scrap-local-test && npm install puppeteer-core

# Run a scrap locally:
node ~/.claude/skills/trawl-scrap-local-test/scripts/run-local.mjs path/to/scrap.js \
  --url=https://target \
  --params=key=val,key2=val2
```

```bash
# Headless run (CI / no display):
node ~/.claude/skills/trawl-scrap-local-test/scripts/run-local.mjs path/to/scrap.js \
  --url=https://target \
  --headless
```

## Harness contract

The script body runs in a closure. The harness injects these globals, mirroring the worker:

- `browser` — the Puppeteer browser instance (headed, with DevTools open).
- `TRAWL` — object with `url` (from `--url`) and any `<custom>` keys from `--params`.
- `TRAWL.account` — sub-namespace with `username`, `password`, and optional `session.cookies` (from `--account-username` / `--account-password` / `--account-cookies`). `null` when no credentials are provided (mirrors prod worker).
- `account` — legacy alias for `TRAWL.account` (still works; both are injected).
- `returnData(arr)` — stub that prints the array as JSON to stdout.
- `saveSession(cookies)` — stub that prints the cookie array to stdout (does not persist).

No changes to the script body are needed to run it locally.

## CLI flags

- `--url=<url>` — sets `TRAWL.url` (use a real value if your script navigates to it).
- `--params=k=v[,k=v]*` — sets `TRAWL.<custom>` keys (comma-separated `key=value` pairs).
- `--account-username=<u>` — sets `TRAWL.account.username` (alias: `account.username`).
- `--account-password=<p>` — sets `TRAWL.account.password` (alias: `account.password`).
- `--account-cookies=<path>` — loads `TRAWL.account.session.cookies` from a JSON array file (alias: `account.session.cookies`).
- `--remote` — connects to an existing Chrome at `http://127.0.0.1:9222` (instead of launching a fresh one). Useful for MFA flows — see `references/headed-debug.md`.
- `--headless` — launches Chrome headlessly (no window). Default is headed (`headless: false`) for interactive debugging.
- `--chrome=<path>` — path to a Chrome executable. Auto-detected on macOS and Linux when omitted; pass explicitly if Chrome lives in a non-standard location or you want to use Chromium.
- `--slowMo=<ms>` — delay between Puppeteer actions, in ms. Default is 250 in headed mode, 0 in headless. Lower for speed, higher to watch each action.
- `--help` — prints usage.

## Recommended workflow

1. Iterate locally with `run-local.mjs` until selectors and `returnData` are clean.
2. `trawl scraps update <id> -r "$(cat scrap.js)"` (see the `trawl-cli` skill for full CLI usage).
3. `trawl scraps run <id> --watch` to confirm the worker behaves the same.

## Headless vs headed-remote — which to trust

- `--headless` tests script wiring fast, but its automation fingerprint trips bot-walls that a real browser never sees → **false `len=0`**. Do not conclude "this site is walled" from a headless empty result.
- To validate **selectors + returnData logic** under a real fingerprint, run `--remote` against a manually-launched Chrome (no `--enable-automation` flag): `--remote-debugging-port=9222 --user-data-dir=/tmp/chrome-trawl`, then `run-local.mjs scrap.js --remote`. This is the truth signal for *script logic* (not the worker network surface).

## `len=0` is ambiguous — classify, don't assume "wall"

An empty result has 5 causes: real bot-wall · first-visit interstitial (consent/region) · wrong/stale selector on a page that renders fine (most common) · dead/wrong URL (soft-404 — `curl 200` ≠ content exists) · auth wall. **Capture the page title + a screenshot + visible body text and read it** before deciding — the title usually reveals which. `page.screenshot()` + `document.title` + `body.innerText.slice(0,600)`.

## Limitations (intentional)

- Local runs use the user's IP — no proxy tier, no fingerprint policy.
- Local pass does not guarantee worker pass — script logic is tested, not the network surface.

## Diagnosing prod failures

To diagnose a *prod* failure (vs debugging locally), use the CLI instead of re-running blind:

```bash
trawl scraps doctor <id>                          # last-run error + failed selector + block status + autofix summary
trawl scraps autofix <id>                         # full auto-fix detail: decision, diff, dry-run, knowledge consulted
trawl scraps snapshot <id> --error -o /tmp/err.html  # download the error-path page HTML
```

These commands surface what the worker captured (same info as the web frontend's "Last run" panel) without exposing cost or proxy-vendor internals.

## What this skill does NOT cover

- Script body → `trawl-scrap-design`
- CLI scrap management → `trawl-cli`
- Authentication flows → `trawl-scrap-account`
- Advanced debugging (DevTools pause, network capture, attach to existing Chrome) → `references/headed-debug.md`
