---
name: trawl-cli
description: Use the `trawl` CLI to manage scraps via @trawlme/cli — listing, creating, running, watching, debugging. Triggers when the user mentions trawl, scraps, scheduled scraping jobs they own, or uses the `trawl` command. Does NOT cover writing the Puppeteer script body (see trawl-scrap-design), authentication flows (see trawl-scrap-account), or local test runs (see trawl-scrap-local-test).
---

# Trawl CLI

The `trawl` CLI is the command-line client for [Trawl](https://trawl.me), a hosted scraping platform. Each scrap is a Puppeteer script that runs on a worker and produces structured data, optionally on a cron schedule.

## When to use this skill

Trigger when the user mentions:
- Trawl, scraps, or trawl.me
- Scheduled scraping jobs they own on Trawl
- The `trawl` CLI command (e.g. `trawl scraps list`)
- Wanting to create / run / inspect a scraping job

Do NOT trigger for generic "scrape this URL" requests with no Trawl context.

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

All commands accept `--json` (where listed) for machine-readable or pipeable output.

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
  -d "Tracks product prices on Example.com daily" \
  -r '<puppeteer script>'
```

Flags:
- `-t, --title` (required) — display name
- `-u, --url` — target URL (also exposed as `TRAWL.url` in the script)
- `-d, --description` — what the scrap does (used by wizard few-shot examples + future marketplace listing)
- `-r, --request` — the Puppeteer script body (must call `returnData(arr)`)

For the script body, see the `trawl-scrap-design` skill.

### Update a scrap

```bash
trawl scraps update <id> -t "New title" --cron "0 9 * * *"
trawl scraps update <id> -d "Updated description"           # update what it does
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

## Scrap accounts

For per-scrap authentication, see the `trawl-scrap-account` skill. CLI commands: `trawl scraps account set/status/clear-session/delete`.

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
trawl scraps create -t "Morning crawl" -u "https://..." -d "Daily crawl at 8am" -r '...'
trawl scraps update <new-id> --cron "0 8 * * *"
```

**"Test my changes without scheduling"**
```bash
trawl scraps update <id> -r '<new script>'
trawl scraps run <id> --watch
```

## Output shapes (JSON)

Scrap object shape:

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "title": "...",
  "description": "What this scrap does",
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

`trawl scraps data <id> --json` returns the array passed to `returnData(...)`.

## Errors to recognize

- `Session expired or invalid. Run: trawl login` → token dead, re-auth
- `Invalid credentials` → wrong email/password on `trawl login`
- HTTP 403 → user doesn't own the scrap
- HTTP 404 → wrong scrap ID
- HTTP 422 on create/update → missing required field or invalid cron expression

## What this skill does NOT do

- Script body → `trawl-scrap-design`
- Authentication / session injection → `trawl-scrap-account`
- Local debugging runs → `trawl-scrap-local-test`
