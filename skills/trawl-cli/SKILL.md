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

CI-relevant env vars. The first three are per-invocation session overrides — they take precedence over stored config without writing to disk (for normal commands; note `trawl login` itself still persists a token even when `TRAWL_TOKEN` is set):
- `TRAWL_TOKEN` — session JWT, takes precedence over `trawl login`'s stored token
- `TRAWL_API_URL` — API base URL, takes precedence over `trawl login --url`
- `TRAWL_TIMEOUT` — per-request fetch timeout in ms (default 30000)

`TRAWL_CONFIG_DIR` is different — it **redirects where the CLI reads and writes** its config file (so `trawl login` persists there). Point it at an ephemeral dir for hermetic runs, e.g. `TRAWL_CONFIG_DIR=$(mktemp -d)`.

## Core commands

All commands accept `--json` (where listed) for machine-readable or pipeable output.

### List scraps

```bash
trawl scraps list                          # human-readable table
trawl scraps list --json                   # JSON array
trawl scraps list --status failure         # filter by last-run status
trawl scraps list --status success
trawl scraps list --status never           # never run
trawl scraps list --limit 10               # cap output client-side
trawl scraps list --page 2                 # single-page mode (one 50-row page)
```

> **Pagination:** `list` fetches **all** scraps by default (it auto-paginates internally at 200/page until a short page). `--page N` switches to single-page mode — one 50-row page, no auto-pagination. `--limit N` caps the output client-side. `--limit` and `--page` are mutually exclusive (usage error, exit 2). Because the default fetches everything, a `jq`-by-title lookup over `list --json` sees every scrap — no page-1 blind spot.

### Inspect a single scrap

```bash
trawl scraps get <id>                      # human-readable
trawl scraps get <id> --json               # full scrap object
trawl scraps data <id> --json              # last run output (the scraped data)
```

`data <id>` defaults to reading the **last persisted run** — read-only, no quota cost. Flags:
- `--fresh` — launches a **new** run instead (consumes execute quota, same cost as `scraps run`). Only reach for this when the caller explicitly needs current data.
- `--errors` — show failure diagnostics inline when the last run failed.
- `--json` — machine-readable output.

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
- `--tier tier0..tier4` — request a starting proxy tier (see Proxy tiers below)

For the script body, see the `trawl-scrap-design` skill.

### Update a scrap

```bash
trawl scraps update <id> -t "New title" --cron "0 9 * * *"
trawl scraps update <id> -d "Updated description"           # update what it does
trawl scraps update <id> --no-cron               # disable schedule
trawl scraps update <id> --alert ops@example.com # email on failure
trawl scraps update <id> --no-alert              # disable alerts
trawl scraps update <id> --autofix               # enable AI Fix (auto-repair on failure) — @trawlme/cli@1.11.0+
trawl scraps update <id> --no-autofix            # disable AI Fix
trawl scraps update <id> -p '[{"TRAWL.page":"2"}]'          # runtime params: JSON array of {"TRAWL.<name>":"<value>"} objects
trawl scraps update <id> --params-file ./params.json        # bulk params from file (same array shape)
trawl scraps update <id> --tier tier2                       # request a proxy tier
trawl scraps update <id> --force-tier tier4                 # raise the tier CEILING past the auto-cap
```

> **GTM seed scraps:** always run `trawl scraps update <id> --autofix --cron '0 0 * * 0'` post-create (weekly schedule + AI Fix enabled).

### Proxy tiers

- `--tier tier0..tier4` (create + update) — requests a starting proxy tier. It's **clamped to tier3** if the target domain isn't allow-listed for tier4, even though the flag accepts `tier4` without error. On `update`, the CLI **echoes** the clamp (`⚠ proxyTier requested tier4 → applied tier3`); on `create` (and older servers) the clamp is silent — so don't rely on seeing a warning.
- `--force-tier tier0..tier4` (update only) — raises the tier **ceiling** past that auto-cap. History-gated: the server may refuse it (the CLI prints `✗ tier ceiling override refused` and exits `1`) or it may cost more, depending on the scrap's run history.
- Either way, verify what tier a run actually used with `trawl scraps history <id>` / `trawl scraps run-info <hid>` (the `history` list may show these columns blank — drill into `run-info` for the confirmed value) — don't assume the requested tier was honored.

### Run / trigger / watch

- `trawl scraps run <id>` — synchronous run via the load endpoint, blocks until done
- `trawl scraps run <id> --watch` — same but streams activity logs
- `trawl scraps trigger <id>` — **async by default**: queues the worker run and returns immediately (no waiting on the 30-250s run)
- `trawl scraps trigger <id> --wait` — synchronous: block until the run completes (legacy behaviour)
- `trawl scraps trigger <id> --watch` — queue, then stream the activity log
- `trawl scraps watch <id>` — attach to an in-progress run's activity stream

### Inspect past runs

```bash
trawl scraps history <id>                   # table of recent runs (status, time, tier, failureKind)
trawl scraps history <id> --json            # JSON array, newest first
trawl scraps history <id> --limit 50        # cap rows (default 20)
trawl scraps run-info <hid>                 # one run's detail by its history id (status, tier, failureKind, error + selector)
trawl scraps run-info <hid> --json
```

`doctor`/`autofix` (below) inspect the **last** run; `history` + `run-info` reach **any** run: list with `history`, then pass a run's `hid` to `run-info` for the full diagnosis. `run-info` hits `/api/historys/:hid`, which returns the proxy tier + `failureKind` to the scrap owner. (In `history`'s embedded list those columns may be blank — drill into `run-info <hid>` for them.)

### Delete

```bash
trawl scraps rm <id>                       # prompts for confirmation
trawl scraps rm <id> --force               # no prompt, useful in scripts
trawl scraps delete <id>                   # `delete` is an alias for `rm`, same flags
```

## Scrap accounts

For per-scrap authentication, see the `trawl-scrap-account` skill. CLI commands: `trawl scraps account set/status/clear-session/delete`.

## MCP bridge

`trawl token` prints the stored session JWT to **stdout** (any advisory text, e.g. expiry, goes to stderr — safe to capture stdout alone).

The session JWT authenticates two different ways depending on the endpoint:

```bash
# MCP endpoint — accepts the session JWT as a Bearer token:
curl -H "Authorization: Bearer $(trawl token)" https://api.trawl.me/api/mcp

# Raw REST (/api/scraps, etc.) — the JWT strategy is COOKIE-ONLY (reads the TOKEN cookie).
# Bearer is NOT accepted here; pass the JWT as the TOKEN cookie instead:
curl -H "Cookie: TOKEN=$(trawl token)" https://api.trawl.me/api/scraps
```

## Common patterns

**"Run my X scrap and show me the result"**
```bash
ID=$(trawl scraps list --json | jq -r '.[] | select(.title=="X") | ._id')
trawl scraps run "$ID" --watch
trawl scraps data "$ID" --json
```
> `list --json` auto-paginates, so this lookup searches all scraps — no page-1 blind spot.

**"Why did this scrap fail?"**
```bash
trawl scraps doctor <id>                          # last-run diagnosis: status/statusDetail, error message, failed selector, block status, empty-context, proxy Tier (0-4), regression, autofix summary
trawl scraps doctor <id> --autofix                # same + full autofix diff/dry-run/knowledge inline
trawl scraps doctor <id> --json                   # raw run + autofix JSON
trawl scraps autofix <id>                         # full last auto-fix attempt: decision, unified fix diff, dry-run X/Y, knowledge fingerprint + confidence%
trawl scraps autofix <id> --json                  # raw autofix JSON
trawl scraps data <id> --errors                   # failure diagnostics inline with the data command
trawl scraps snapshot <id> --error -o /tmp/error.html   # download the error-path HTML
trawl scraps snapshot <id> -o /tmp/page.html      # download the captured page HTML
```
Note: the CLI surfaces the abstract proxy Tier (0–4) + diagnostics + autofix, but **not** cost or proxy nature/IP/vendor — those are admin-only by design.

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

## Other commands

- `trawl logout` — clear stored credentials
- `trawl skills list/install/uninstall/update` — manage the bundled Claude Code skills (this package)
- `trawl telemetry` — inspect/toggle usage telemetry (`TRAWL_TELEMETRY=0` / `DO_NOT_TRACK=1` env overrides also work)

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
  "params": [{"TRAWL.paramName": "value"}],
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

### Exit codes

Every command uses these exit codes — check `$?` instead of parsing stderr text:

| Code | Meaning |
|---|---|
| `0` | success |
| `1` | API error (non-401/404) / unknown error — also **"Not logged in"** (no stored token at all) and commander parse errors (see below) |
| `2` | usage error — invalid flag **value** / malformed input (bad ObjectId, invalid `--tier` value, malformed `-p` JSON, missing file, `--limit`+`--page` conflict) |
| `3` | auth error (server **401** — token present but expired/invalid) |
| `4` | not found (404 — wrong ID) |
| `5` | network error (unreachable API, timeout) |

Two edges to know:
- **No stored token at all** exits `1` with "Not logged in. Run: trawl login" (not `3`). Exit `3` is specifically a server 401 for a token that *was* sent. `trawl token` with no/expired token also exits `1`.
- **Unknown flags / missing required args** are caught by commander *before* the command runs, so they exit `1` (not `2`) — only bad flag *values* reach the usage-error path (`2`).

### `--json` failure envelope

When a command fails **after argument parsing** with `--json` set, the error goes to **stdout** (not stderr) as the JSON payload itself, so you don't need to branch on stream:

```json
{"error":{"message":"Session expired or invalid. Run: trawl login","kind":"auth","status":401}}
```

`kind` is one of `auth` / `not_found` / `api` / `network` / `usage` / `unknown`. `status` is only present for HTTP-backed errors.

> Caveat: commander-level parse errors (unknown flag, missing required arg) bypass this envelope entirely — even with `--json` you get empty stdout, a plain-text error on stderr, and exit `1`.

## What this skill does NOT do

- Script body → `trawl-scrap-design`
- Authentication / session injection → `trawl-scrap-account`
- Local debugging runs → `trawl-scrap-local-test`
