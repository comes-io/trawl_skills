---
name: trawl
description: Use this skill when the user wants to manage Trawl scraps (scraping jobs) — listing, creating, running, watching, or inspecting them — or when working with the `trawl` command-line tool from the `@trawlme/cli` package. Trawl is a hosted scraping platform where each "scrap" is a Puppeteer-based scraping job that can run on a cron schedule and emit data.
---

# Trawl CLI

The `trawl` CLI is the command-line client for [Trawl](https://trawl.me), a hosted scraping platform. Each scrap is a Puppeteer script that runs on a worker and produces structured data, optionally on a cron schedule.

## When to use this skill

Trigger when the user mentions:
- Trawl, scraps, or trawl.me
- Scheduled scraping jobs they own on Trawl
- The `trawl` CLI command (e.g. `trawl scraps list`)
- Wanting to create / run / inspect a scraping job

Do NOT trigger for generic "scrape this URL" requests with no Trawl context — point them at a generic Puppeteer/Playwright approach instead.

## Prerequisites

The user must have `@trawlme/cli` installed:

```bash
npm install -g @trawlme/cli
```

And be authenticated. Three auth paths:

1. **Interactive** — `trawl login` (prompts email/password, stores JWT in `~/.config/trawl-cli/`)
2. **Env var** — `export TRAWL_TOKEN=<jwt>` (overrides stored token, ideal for CI)
3. **Token flag** — `trawl login --token <jwt>`

Custom API base: `trawl login --url https://self-hosted.example.com`. Default is `https://api.trawl.me`.

If the user gets `Session expired or invalid. Run: trawl login`, their stored JWT is dead — re-run `trawl login`.

## Core commands

All commands accept `--json` (where listed) for machine-readable output. Use `--json` whenever you need to pipe into other commands or parse the result.

### List scraps

```bash
trawl scraps list                          # human-readable table
trawl scraps list --json                   # JSON array
trawl scraps list --status failure         # filter by last-run status
trawl scraps list --status success
trawl scraps list --status never           # never run
```

### Inspect a single scrap

```bash
trawl scraps get <id>                      # human-readable
trawl scraps get <id> --json               # full scrap object
trawl scraps data <id> --json              # last run output (the scraped data)
```

### Create a scrap

```bash
trawl scraps create -t "Daily prices" -u "https://example.com/products" \
  -r '<puppeteer script>' -s puppeteer
```

Flags:
- `-t, --title` (required) — display name
- `-u, --url` — target URL (also exposed as `TRAWL.url` in the script)
- `-r, --request` — the Puppeteer script body (must call `returnData(arr)`)
- `-s, --scrapper` — engine, defaults to `puppeteer`

Minimal Puppeteer request body:

```js
var page = await browser.newPage();
await page.goto(TRAWL.url, { waitUntil: 'domcontentloaded' });
var items = await page.$$eval('a', els => els.map(e => ({ title: e.textContent })));
returnData(items);
```

### Update a scrap

```bash
trawl scraps update <id> -t "New title" --cron "0 9 * * *"
trawl scraps update <id> --no-cron               # disable schedule
trawl scraps update <id> --alert ops@example.com # email on failure
trawl scraps update <id> --no-alert              # disable alerts
trawl scraps update <id> -p '{"key":"page","value":"2"}'    # add a param (JSON object)
trawl scraps update <id> --params-file ./params.json        # bulk params from file
```

### Run / trigger / watch

- `trawl scraps run <id>` — synchronous run, blocks until done
- `trawl scraps run <id> --watch` — same but streams activity logs
- `trawl scraps trigger <id>` — fire-and-forget (returns immediately)
- `trawl scraps watch <id>` — attach to an in-progress run's activity stream

### Delete

```bash
trawl scraps rm <id>                       # prompts for confirmation
trawl scraps rm <id> --force               # no prompt, useful in scripts
```

## Scrap accounts (per-scrap auth)

When the target site requires login, attach credentials to a scrap:

```bash
trawl scraps account set <id> -u user@example.com -p '<password>'
trawl scraps account status <id> --json     # check session validity
trawl scraps account clear-session <id>     # force re-login on next run
trawl scraps account delete <id> --force    # remove stored creds
```

## Common patterns

**"Run my X scrap and show me the result"**
```bash
ID=$(trawl scraps list --json | jq -r '.[] | select(.title=="X") | ._id')
trawl scraps run "$ID" --watch
trawl scraps data "$ID" --json
```

**"Why did this scrap fail?"**
```bash
trawl scraps get <id> --json | jq '.lastRun'
trawl scraps watch <id>     # if running, see live errors
```

**"Create a job that runs every morning"**
```bash
trawl scraps create -t "Morning crawl" -u "https://..." -r '...' -s puppeteer
trawl scraps update <new-id> --cron "0 8 * * *"
```

**"Test my changes without scheduling"**
```bash
trawl scraps update <id> -r '<new script>'
trawl scraps run <id> --watch
```

## Output shapes (JSON)

A scrap object has at minimum:

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "title": "...",
  "url": "https://...",
  "request": "var page = ...",
  "scrapper": "puppeteer",
  "cron": "0 9 * * *" ,
  "params": [{"key": "...", "value": "..."}],
  "lastRun": { "status": "success" | "failure", "duration": 1234, "error": "..." },
  "createdAt": "...",
  "updatedAt": "..."
}
```

`trawl scraps data <id> --json` returns whatever array the user's script passed to `returnData(...)`.

## Errors to recognize

- `Session expired or invalid. Run: trawl login` → token dead, re-auth
- `Invalid credentials` → wrong email/password on `trawl login`
- HTTP 403 → user doesn't own the scrap
- HTTP 404 → wrong scrap ID
- HTTP 422 on create/update → missing required field or invalid cron expression

## What this skill does NOT do

- Doesn't write the Puppeteer scraping logic for the user — that's their domain. Suggest patterns but let them iterate.
- Doesn't bypass site anti-bot measures. If a scrap fails because of bot detection, the answer is on Trawl's side (worker fingerprint, sessions), not the CLI.
- Doesn't manage billing, organizations, or workers. Those live on the web app at trawl.me.
