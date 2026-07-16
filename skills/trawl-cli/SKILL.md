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

And be authenticated. Auth paths:

1. **Interactive** — `trawl login` (prompts email/password, stores JWT via `conf`; on macOS that's `~/Library/Preferences/trawl-cli-nodejs/`, **not** `~/.config/trawl-cli/` — Conf's `env-paths` dependency hardcodes `Library/Preferences` and ignores XDG. Override the location with `TRAWL_CONFIG_DIR`.)
2. **Env var** — `export TRAWL_TOKEN=<jwt>` (overrides stored token, ideal for CI; `trawl token` also resolves it — see MCP bridge below)
3. **Token flag** — `trawl login --token <jwt>`
4. **Email/password flags** — `trawl login -e <email> -p <password>` (non-interactive; `-p` on the command line is visible in process list/shell history — CI only, prefer the interactive password prompt otherwise)

Custom API base: `trawl login --url https://self-hosted.example.com`. Default is `https://api.trawl.me`.

If the user gets `Session expired or invalid. Run: trawl login`, their stored JWT is dead — re-run `trawl login`.

CI-relevant env vars. The first three are per-invocation session overrides — they take precedence over stored config without writing to disk (for normal commands; note `trawl login` itself still persists a token even when `TRAWL_TOKEN` is set):
- `TRAWL_TOKEN` — session JWT, takes precedence over `trawl login`'s stored token
- `TRAWL_API_URL` — API base URL, takes precedence over `trawl login --url`
- `TRAWL_TIMEOUT` — per-request fetch timeout in ms (default 30000; 300000 for `scraps run`, `data --fresh`, and `trigger --wait` since CLI 1.18.4 — these hit the same server-side scrap-execute path, which legitimately runs 30-250s; this env var still overrides that longer default too, higher or lower)
- `DEBUG` — any truthy value prints the full error stack trace to stderr, same effect as the global `--debug` flag

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
trawl scraps list --status running         # run currently executing (status: null)
trawl scraps list --status regression      # last run succeeded but item count regressed vs baseline
trawl scraps list --limit 10               # cap output client-side
trawl scraps list --page 2                 # single-page mode (one 50-row page)
```

> **Pagination:** `list` fetches **all** scraps by default (it auto-paginates internally at 200/page until a short page). `--page N` switches to single-page mode — one 50-row page, no auto-pagination. `--limit N` caps the output client-side. `--limit` and `--page` are mutually exclusive (usage error, exit 2). **Since CLI 1.18.3**, a non-numeric `--limit`/`--page` value (e.g. `abc`) is also a usage error, exit `2` — before 1.18.3 it silently became `NaN`, which truncated results to 0 rows or sent a bare `?page=NaN` to the server with no warning. Because the default fetches everything, a `jq`-by-title lookup over `list --json` sees every scrap — no page-1 blind spot.

**Since CLI 1.18.3**, a scrap whose last run is still executing (`status: null` server-side) renders as `running` — a cyan `↻` in the table, matched by `--status running`. Previously an in-flight run had no distinct state anywhere in `list`. **Since CLI 1.18.4**, a run whose item count regressed vs baseline (`statusDetail: 'regression'`) renders as `regression` — an amber `▼`, matched by `--status regression` — distinct from the red `✗` a genuine failure gets (the write actually succeeded; only the count dropped). `doctor` shows the same distinction as its own amber `● regression` badge instead of bucketing it under `● failed`.

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

**Honest data states (since CLI 1.18.2, extended 1.18.3):** `[]` is reserved for a genuine zero-item run. Every other outcome is a distinct error envelope instead of a silent empty array — except a regression, which is a degraded *success*, not an error:

| State | Result |
|---|---|
| Genuine zero-item run (incl. a run with `statusDetail: 'empty'`) | `[]`, exit `0` |
| Run in progress (`status: null` — the run is still executing, node persists `{status:null, statusDetail:null, inFlight:true}` the instant a run starts) | error, exit `1`, kind `in_progress` — "Run in progress — retry shortly"; never suggests `--fresh` (the run already holds the server-side lock, so `--fresh` would just 429 against it) — **since CLI 1.18.3** |
| Item count regressed vs baseline (`statusDetail: 'regression'`) | the **real, non-empty items** on stdout, exit `0` — plus a stderr warning pointing at `trawl scraps doctor <id>` for diagnosis. The write persisted before the regression was flagged, so treating it as a failure would hide genuine data behind a false negative — **since CLI 1.18.3** |
| Scrap has never run | error, exit `4`, kind `not_found` — "Run it first... or pass --fresh" |
| Last run failed (`status: false`, not `empty`, not `regression`) | error, exit `1`, kind `run_failed` — points to `--errors` |
| Payload aged out of retention (server keeps only the newest row per scrap+status bucket) — **including an aged-out regression row**, which gets this same envelope instead of fabricated items | error, exit `4`, kind `not_found` |

Before 1.18.2 the zero-item/never-run/failed/aged-out states collapsed into the same `[]` / "No data yet." Before 1.18.3, a run still in progress fell through to the misleading "aged out of retention" message (status `null` isn't `false`, so it skipped the failure check, then found no persisted payload yet), and a regression row was misclassified as `run_failed` — hiding real, already-persisted items behind an error. Never assume "no data" from an empty result without checking the exit code and `kind`.

**`--fresh` regression warning (since CLI 1.18.5):** the table above (regression row) already applied to the default persisted-data path; `data --fresh` now gets the same treatment — after the live run finishes, the CLI does a follow-up `GET /api/scraps/:id` and prints a stderr warning pointing at `scraps doctor <id>` if the finalized run regressed vs baseline. It still prints the real items on stdout either way (exit `0`) — the check is best-effort and never gates the actual output. Before 1.18.5, `--fresh` rendered items with no regression check at all, because the `load()` response's own embedded `scrap.history[0]` can't be trusted for this (node pushes the just-finished run onto the *end* of the array, and the regression flip itself lands via a raw DB patch issued after that response was already built, so it's never reflected in what `load()` echoes back).

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
- `--json` — output the full scrap object as JSON; a refused tier returns the standard error envelope + exit `1` instead (see Proxy tiers below)

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
trawl scraps update <id> --tier tier2 --json                # full scrap JSON, or error envelope + exit 1 on refusal
```

> **GTM seed scraps:** always run `trawl scraps update <id> --autofix --cron '0 0 * * 0'` post-create (weekly schedule + AI Fix enabled).

### Proxy tiers

- `--tier tier0..tier4` (create + update) — requests a starting proxy tier. It's **clamped to tier3** if the target domain isn't allow-listed for tier4, even though the flag accepts `tier4` without error.
- Since CLI 1.18.2, **both `create` and `update`** read `_tierOverride` back from the server and render the same honest truth (previously only `update` echoed the clamp; `create` was silent): a clamp (`⚠ proxyTier requested tier4 → applied tier3`), an allowed ceiling raise (+ spend warning if any), or a refusal.
- **Old-server fallback (since CLI 1.18.2):** if a tier was requested but the response carries no `_tierOverride` at all, the CLI no longer echoes the requested value as if it were applied — it prints `⚠ Server did not confirm the tier change (older server) — verify with: trawl scraps get <id>` instead. Never assume the requested tier was honored on an unconfirmed response. **Since CLI 1.18.3**, `--json` carries the same signal in machine-readable form: the emitted scrap object gets `"_tierUnconfirmed": true` under exactly this condition (tier requested, no `_tierOverride` in the response) — the counterpart to the stderr warning, since a `--json` caller has no reliable reason to read stderr. Never present when `_tierOverride` came back, never fabricated otherwise.
- `--force-tier tier0..tier4` (update only) — raises the tier **ceiling** past that auto-cap. History-gated: the server may refuse it (the CLI prints `✗ tier ceiling override refused: <reason>` and exits `1`) or it may cost more, depending on the scrap's run history.
- `--json` (create + update, since CLI 1.18.2): success returns the full scrap object; when a tier was requested it carries **either** `_tierOverride` (the server confirmed — inspect it for the applied/clamped/refused truth) **or** `_tierUnconfirmed: true` (old server, unconfirmed — see the fallback bullet above), never both, and neither when no tier was requested. A refused tier returns the standard error envelope on stdout and exits `1` — same outcome as human mode, just machine-readable.
- Either way, verify what tier a run actually used with `trawl scraps history <id>` / `trawl scraps run-info <hid>` (on servers released before mid-July 2026 the `history` list shows these columns blank — `run-info` always has them) — don't assume the requested tier was honored.

### Run / trigger / watch

- `trawl scraps run <id>` — synchronous run via the load endpoint, blocks until done. Arms a 300s timeout (since CLI 1.18.4 — see `TRAWL_TIMEOUT` above) instead of the generic 30s default, because this endpoint legitimately runs 30-250s server-side.
- `trawl scraps run <id> --watch` — same, then polls for progress (since CLI 1.18.4 — see below; it does **not** stream)
- `trawl scraps trigger <id>` — **async by default**: queues the worker run and returns immediately (no waiting on the 30-250s run)
- `trawl scraps trigger <id> --wait` — synchronous: block until the run completes (legacy behaviour). Same 300s timeout as `run`, since CLI 1.18.4.
- `trawl scraps trigger <id> --watch` — queue, then poll for progress (since CLI 1.18.4 — see below; it does **not** stream)
- `trawl scraps watch <id>` — the standalone command: attach to an in-progress run's activity stream over SSE. **Unchanged** by any of the above — this is the one that actually streams.

**`--watch` is poll-based, not a live stream (since CLI 1.18.4):** `scraps run --watch` and `scraps trigger --watch` used to open the activities SSE stream after launching the run — but that showed nothing either way: the activities SSE endpoint has no backlog, so by the time a *synchronous* run had already finished there was nothing left to emit, and for the default *async* `trigger` the run executes in a separate cron-consumer pod whose events never reach the API pod holding the SSE connection at all. Both flags now instead poll two Mongo-backed REST reads every 2s, up to 300s: `GET /api/scraps/:id` for terminal status, and the activities list endpoint for new lines — printing each new activity line as it appears, then the terminal status. Before doing so they print this notice:
> Live activity streaming has no signal for this run (async/cross-pod) — polling for progress instead…

A run that never reaches a terminal status within the 300s poll window prints an honest timeout notice pointing at `scraps doctor <id>`, instead of hanging silently or lying about completion. **Since CLI 1.18.5**, this poll also correctly tracks a `trigger --watch` call that deduped onto an already-in-flight worker job (i.e. the scrap was triggered again while a run was still executing) — before 1.18.5 that case could falsely time out waiting for a history id that would never change, because the dedup reuses the existing row instead of creating a new one. `--watch` is now safe to use on retry or concurrent `trigger` calls.

`scraps watch <id>` (the standalone command above) is a separate code path and is unaffected by any of this — it still opens the live SSE stream directly.

### Inspect past runs

```bash
trawl scraps history <id>                   # table of recent runs (status, time, tier, failureKind)
trawl scraps history <id> --json            # JSON array, newest first
trawl scraps history <id> --limit 50        # cap rows (default 20)
trawl scraps run-info <hid>                 # one run's detail by its history id (status, tier, failureKind, error + selector)
trawl scraps run-info <hid> --json
```

`doctor`/`autofix` (below) inspect the **last** run; `history` + `run-info` reach **any** run: list with `history`, then pass a run's `hid` to `run-info` for the full diagnosis. `run-info` hits `/api/historys/:hid`, which returns the proxy tier + `failureKind` to the scrap owner, plus the error snapshot (`errorMessage`/selector context) that `history`'s embedded list never carries. (On servers released before mid-July 2026, `history` also shows the tier/failureKind columns blank — `run-info` always has them.)

### Delete

```bash
trawl scraps delete <id>                   # prompts for confirmation
trawl scraps delete <id> --force           # no prompt, useful in scripts
trawl scraps rm <id>                       # `rm` is an alias for `delete`, same flags
```

## Scrap accounts

For per-scrap authentication, see the `trawl-scrap-account` skill. CLI commands: `trawl scraps account set/status/clear-session/delete`, plus `trawl scraps account session set <id>` (upload BYO-cookies).

## MCP bridge

`trawl token` prints the stored session JWT to **stdout** (any advisory text, e.g. expiry, goes to stderr — safe to capture stdout alone). Since CLI 1.18.2 it resolves `TRAWL_TOKEN` before the stored config token (same precedence every other token consumer uses), so it works headless in CI/agents without a prior `trawl login`: `TRAWL_TOKEN=<jwt> trawl token` prints straight through. A missing or expired token now exits `3` with kind `auth` (previously exit `1`, kind `unknown` — indistinguishable from an arbitrary bug).

The session JWT authenticates two different ways depending on the endpoint:

```bash
TOKEN=$(trawl token)

# MCP endpoint — accepts the session JWT as a Bearer token. This is a real,
# runnable JSON-RPC 2.0 call (tools/list) against the Streamable HTTP
# transport — verified against trawl_node's mcp.controller.js:
curl --fail-with-body -X POST https://api.trawl.me/api/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Raw REST (/api/scraps, etc.) — the JWT strategy is COOKIE-ONLY (reads the TOKEN cookie).
# Bearer is NOT accepted here; pass the JWT as the TOKEN cookie instead:
curl --fail-with-body -H "Cookie: TOKEN=$TOKEN" https://api.trawl.me/api/scraps
```

Capture `$(trawl token)` into `TOKEN` once and reuse it — inlining the substitution separately into each curl call can leave a call running with a silently empty token if the substitution fails. `--fail-with-body` makes curl exit non-zero on an HTTP error response (e.g. an empty/expired token → 401) while still printing the response body, instead of a `curl` that "succeeds" (exit 0) against an error page.

`/api/mcp` only accepts `POST`. `GET` (and `DELETE`) return a JSON-RPC-shaped `405` — this server runs the stateless Streamable HTTP transport, which has no use for the SSE-resume/session-close semantics those methods exist for elsewhere in the spec. Always POST a JSON-RPC envelope. The `Accept` header must list **both** `application/json` and `text/event-stream` — the SDK transport rejects a POST with either one missing as `406 Not Acceptable` (`Client must accept both application/json and text/event-stream`), regardless of auth.

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
trawl scraps snapshot <id> --json                 # {"status":"no_runs"} exit 0 if never run — since CLI 1.18.4
```
Note: the CLI surfaces the abstract proxy Tier (0–4) + diagnostics + autofix, but **not** cost or proxy nature/IP/vendor — those are admin-only by design.

**No-runs shape, unified across commands:** `doctor --json`, `autofix --json`, `data --errors --json` (**since CLI 1.18.3**), and `snapshot --json` (**since CLI 1.18.4**) all return `{"status":"no_runs"}` (exit `0`) for a scrap that has **never run** — `doctor` had this shape since CLI 1.18.0; `autofix`/`data --errors` joined it in 1.18.3 (both used to return a bare `null`, indistinguishable from any other absent-payload state); `snapshot` joined it in 1.18.4 (it had no `--json` mode at all before then — a never-run scrap without `-o` just printed "No runs yet." to stdout and exited `0`, no machine-readable signal). Don't confuse it with `autofix --json`'s bare `null`, which means a run *did* happen but had no auto-fix attempt on it — genuinely "no data", a different state from "never ran at all". A run still **in progress** shows a `running` badge on `doctor`/`data --errors` (human mode) — never `failed` (**since CLI 1.18.3**).

**`snapshot -o <file>` on a never-run scrap (since CLI 1.18.4):** without `--json`, this now exits `4` (`not_found`) instead of silently exiting `0` with nothing written — before 1.18.4 a script checking only the exit code couldn't tell "no file was produced" from success. `--json` takes priority when both flags are passed together.

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

- `trawl scraps banner <id> -f <path>` — upload a banner image (png/jpg/jpeg/webp) for a scrap; see the `trawl-scrap-banner` skill for the full generate + upload pipeline. **Since CLI 1.18.4**, any other extension is a usage error, exit `2` (e.g. `Unsupported image type ".gif" — use png, jpg, or webp.`) — before 1.18.4 an unrecognized extension silently uploaded under a fabricated `image/png` Content-Type instead of being refused.
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
  "cron": "0 9 * * *",
  "autoFix": false,
  "params": [{"TRAWL.paramName": "value"}],
  "history": [
    {
      "_id": "...",
      "status": true,
      "statusDetail": "success",
      "time": 4200,
      "proxyTier": "tier1",
      "failureKind": null,
      "blockType": null,
      "createdAt": "..."
    }
  ],
  "createdAt": "...",
  "updatedAt": "...",
  "_tierOverride": { "requestedMaxTier": "tier4", "effectiveMaxTier": "tier3", "refused": false, "reason": "...", "provider": "...", "warning": null }
}
```

There is **no `lastRun` field** — that never existed. Last-run status/timing/error all derive from `history[0]` (newest first). The embedded row shape differs by command:
- `trawl scraps get <id>` — up to 100 rows, each with `status`, `statusDetail`, `time`, `proxyTier`, `failureKind`, `blockType`, `createdAt`
- `trawl scraps list` — only the single newest row per scrap, with just `status` / `statusDetail` / `createdAt` (no `time`/`proxyTier`/`failureKind`/`blockType` — those come back `undefined`, not `null`); fetch `get <id>` if you need the triage fields
- `status` — tri-state: `true` (success) / `false` (failure) / `null` (in-flight, no result yet)
- `statusDetail` — `'success' | 'error' | 'empty' | 'regression' | null` — the fine-grained outcome (`empty` = ran clean but returned 0 items; `regression` = item count dropped sharply vs. history)
- `proxyTier` / `failureKind` / `blockType` — owner-safe triage fields (not stripped like the admin-only proxy vendor/cost internals), present on `get`'s rows (and therefore on `history`, which reads the same endpoint); never on `list`'s rows. Servers released before mid-July 2026 leave them blank — `run-info <hid>` is always authoritative
- Full error detail (`errorSnapshot`: `errorMessage`, `selector`, `emptyContext`) is **not** embedded on either — fetch it via `trawl scraps run-info <hid>` or `trawl scraps doctor <id>`

`_tierOverride` is present only on `create`/`update` responses when a tier was requested (see Proxy tiers above) — absent otherwise.

`trawl scraps data <id> --json` returns the array passed to `returnData(...)` — see the honest data states above for what a non-array outcome means.

## Errors to recognize

- `Session expired or invalid. Run: trawl login` → token dead, re-auth
- `Invalid credentials` → wrong email/password on `trawl login`
- HTTP 403 → user doesn't own the scrap
- HTTP 404 → wrong scrap ID
- HTTP 422 on create/update → missing required field or invalid cron expression
- HTTP 402 → quota/billing limit hit; message may carry `— upgrade: <url>` when the server provides one (since CLI 1.18.0)
- HTTP 429 → rate-limited; message may carry `(retry after <N>s)` when the server sends a `Retry-After` header (since CLI 1.18.0)

### Exit codes

Every command uses these exit codes — check `$?` instead of parsing stderr text:

| Code | Meaning |
|---|---|
| `0` | success |
| `1` | unmapped API error (HTTP status other than 401/404) or an unhandled bug — also `scraps data`'s "last run failed" (kind `run_failed`) and "run in progress" (kind `in_progress`, **since CLI 1.18.3**) states, and a refused tier override (kind `unknown`) |
| `2` | usage error — invalid flag/value or malformed input (bad ObjectId, invalid `--tier` value, malformed `-p` JSON, missing file, `--limit`+`--page` conflict, **since CLI 1.18.3 a non-numeric `--limit`/`--page` value**, **since CLI 1.18.4 an unsupported `banner -f` file extension**) **and, since CLI 1.18.2, commander parse errors** (unknown option/command, missing required arg — previously exit `1`) |
| `3` | auth error — server **401** (token expired/invalid) **or no stored token at all** (since CLI 1.18.2 — previously exit `1`, kind `unknown`) |
| `4` | not found — 404, or (for `scraps data`) never-ran / retention-aged-out, or (for `scraps snapshot -o <file>` without `--json`, since CLI 1.18.4) never-ran |
| `5` | network error (unreachable API, timeout) |

Edges to know:
- **No stored token at all** now exits `3` with kind `auth` (`Not logged in. Run: trawl login`) — the same path a real 401 takes. Before CLI 1.18.2 this was a generic exit `1`, kind `unknown`, indistinguishable from an arbitrary bug. `trawl token` follows the same rule.
- **Unknown flags / missing required args** now exit `2` (usage), same bucket as bad flag *values* — before CLI 1.18.2 commander caught these before the command ran and they fell through to exit `1`.
- **Local auth failures never carry `status:401` (since CLI 1.18.3):** "no stored token" and `trawl token`'s own "locally-decoded expired token" check both fail entirely client-side — no HTTP call was made, so the `--json` envelope is `{"error":{"message":"...","kind":"auth"}}` with **no `status` field**. Only a real server-issued 401 response carries `status:401`. Exit code and `kind` are unchanged (still `3` / `auth`) — only the envelope shape differs. Before 1.18.3 the local case fabricated `status:401` as if the server had said so.

### `--json` failure envelope

When a command fails **after argument parsing** with `--json` set, the error goes to **stdout** (not stderr) as the JSON payload itself, so you don't need to branch on stream:

```json
{"error":{"message":"Session expired or invalid. Run: trawl login","kind":"auth","status":401}}
```

A local auth failure (no token / expired-token check with no HTTP round trip — see the edge above) omits `status` entirely:

```json
{"error":{"message":"Not logged in. Run: trawl login","kind":"auth"}}
```

`kind` is one of `auth` / `not_found` / `api` / `network` / `usage` / `unknown`, plus `run_failed` and `in_progress` (both `scraps data`-specific, not part of the shared classifier). `status` is only present for real HTTP-backed errors.

Since CLI 1.18.2, commander-level parse errors (unknown flag, missing required arg) **also** emit the envelope — `{"error":{"message":"...","kind":"usage"}}` (no `status` field) — whenever `--json` appears anywhere on the command line (scanned from raw argv, since parsing fails before any command's own `--json` flag can be read). Exit code `2`. Before 1.18.2 these always bypassed the envelope: empty stdout, a plain-text error on stderr, exit `1`. **Since CLI 1.18.3**, that argv scan stops at the first bare `--` (end-of-options): `scraps list -- --json` no longer triggers the envelope, because everything after a literal `--` is a positional argument to commander, not a flag — even one that reads `--json`. Before 1.18.3 an unscoped `argv.includes('--json')` still matched it and wrongly emitted a JSON envelope for a plain usage error that never actually requested `--json`.

## What this skill does NOT do

- Script body → `trawl-scrap-design`
- Authentication / session injection → `trawl-scrap-account`
- Local debugging runs → `trawl-scrap-local-test`
- Banner image generation + composition pipeline → `trawl-scrap-banner` (this skill only lists the raw `trawl scraps banner` upload command)
