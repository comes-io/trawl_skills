---
name: trawl-scrap-local-test
description: Use when testing a Trawl scrap locally before publishing — runs the Puppeteer script on the user's IP with headed Chrome and devtools, mimicking the worker entry contract (TRAWL.* params, account.* auth, returnData/saveSession stubs). Triggers on "test my scrap locally", "debug before push", "run scrap on my machine", "preview returnData output".
---

# Trawl Scrap Local Test

Validate selectors, login flow, and returnData shape locally before spending proxy budget on the worker. The harness (`scripts/run-local.mjs`) injects the same globals as the worker — `browser`, `TRAWL`, `account`, `returnData`, `saveSession` — so your script runs unchanged on your machine.

## The worker boundary

> **Don't add stealth in your script.** Trawl's worker handles fingerprinting, proxy rotation, and bot-detection countermeasures centrally. Adding stealth plugins, UA spoofing, viewport randomisation, or aggressive jitter in your script duplicates worker policy and causes drift. The worker's policy evolves; your script's hardcoded tricks won't.

Local testing intentionally uses vanilla `puppeteer-core` — no fingerprint policy, no proxy. You're testing your script's logic, not the worker's network surface.

## Quick-start

```bash
# Install puppeteer-core once (it's a peer dependency, not bundled with the skill).
npm install -g puppeteer-core

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
- `account` — object with `username` and `password` (from `--account-username` / `--account-password`), plus optional `session.cookies` loaded from a JSON array file via `--account-cookies`.
- `returnData(arr)` — stub that prints the array as JSON to stdout.
- `saveSession(cookies)` — stub that prints the cookie array to stdout (does not persist).

No changes to the script body are needed to run it locally.

## CLI flags

- `--url=<url>` — sets `TRAWL.url` (use a real value if your script navigates to it).
- `--params=k=v[,k=v]*` — sets `TRAWL.<custom>` keys (comma-separated `key=value` pairs).
- `--account-username=<u>` — sets `account.username`.
- `--account-password=<p>` — sets `account.password`.
- `--account-cookies=<path>` — loads `account.session.cookies` from a JSON array file.
- `--remote` — connects to an existing Chrome at `http://127.0.0.1:9222` (instead of launching a fresh one). Useful for MFA flows — see `references/headed-debug.md`.
- `--headless` — launches Chrome headlessly (no window). Default is headed (`headless: false`) for interactive debugging.
- `--chrome=<path>` — path to a Chrome executable. Auto-detected on macOS and Linux when omitted; pass explicitly if Chrome lives in a non-standard location or you want to use Chromium.
- `--help` — prints usage.

## Recommended workflow

1. Iterate locally with `run-local.mjs` until selectors and `returnData` are clean.
2. `trawl scraps update <id> -r "$(cat scrap.js)"` (see the `trawl-cli` skill for full CLI usage).
3. `trawl scraps run <id> --watch` to confirm the worker behaves the same.

## Limitations (intentional)

- Local runs use the user's IP — no proxy tier.
- Local runs use vanilla `puppeteer-core` — no fingerprint policy.
- Local pass does not guarantee worker pass; the script logic is what's being tested locally, not the network surface.

## What this skill does NOT cover

- Does not write the script body — see the `trawl-scrap-design` skill.
- Does not manage scraps via CLI — see the `trawl-cli` skill.
- Does not handle authentication flows — see the `trawl-scrap-account` skill.
- For advanced debugging options (DevTools pause, network capture, attaching to an existing Chrome), see `references/headed-debug.md`.
