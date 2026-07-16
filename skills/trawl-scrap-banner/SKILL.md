---
name: trawl-scrap-banner
description: Generate + upload a brand-aware banner (1200x630 PNG) for a Trawl scrap. Triggers on "make banner for my scrap", "generate scrap banner", "upload banner for {site}", or after a scrap ships to prod. Does NOT cover scrap script generation (see trawl-scrap-design) or CLI account management (see trawl-cli).
---

# Trawl Scrap Banner

Generate + upload a brand-aware 1200x630 banner for a Trawl scrap. See the Examples table for validated brands (eBay, Reddit, GitHub).

## When to use

After a scrap ships to prod (post-cron-activation, pre-Done). Default step in the seed roadmap workflow — banners are part of "Done" by convention.

Skip for internal/non-discoverable scraps (no UI surface).

## Inputs

- `scrapId` — Trawl scrap ID (24-hex), required
- `siteName` — brand name in URL form (`ebay`, `yahoo-finance`, `github`…), required
- `tagline` — short text under the logo, e.g. `"Comp pricing · Item watchlist"`, optional

## Pipeline

### 1. Fetch logo

Search Wikimedia Commons for the official brand SVG. Sanitize `siteName` first — no `/` or special chars (alphanumeric + hyphens only).

```bash
# Canonical Commons API (not Wikipedia) — broadest logo coverage
SITE_TITLE="$(printf '%s' "$siteName" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')_logo.svg"   # capitalize first letter: ebay → Ebay_logo.svg (portable — ${siteName^} is Bash-4-only and errors with "bad substitution" (exit 1) on macOS's Bash 3.2)
curl -s "https://commons.wikimedia.org/w/api.php?action=query&titles=File:${SITE_TITLE}&prop=imageinfo&iiprop=url&format=json" \
  -H "User-Agent: Mozilla/5.0" | jq -r '.query.pages | to_entries[0].value.imageinfo[0].url // empty' \
  > /tmp/${siteName}-logo-url.txt
```

The capitalize-first-letter heuristic (`Ebay_logo.svg`) fails for compound brands. Use the table below first:

| siteName | Wikimedia file |
|---|---|
| ebay | `EBay_logo.svg` |
| github | `GitHub_logo_2013.svg` (icon-only: `GitHub_Invertocat_Logo.svg`) |
| reddit | `Reddit_logo_new.svg` |
| youtube | `YouTube_Logo_2017.svg` |
| linkedin | `LinkedIn_logo_initials.png` (PNG — save as `-logo.png`, adjust `{{LOGO_PATH}}` in template) |
| twitter | `Logo_of_Twitter.svg` (X rebrand: `X_logo_2023.svg`) |
| yahoo-finance | `Yahoo!_Finance_logo_2021.svg` |
| amazon | `Amazon_logo.svg` |
| tripadvisor | `Tripadvisor_logoCMYK.svg` |
| google | `Google_2015_logo.svg` |
| tiktok | `TikTok_logo.svg` |
| booking | `Booking.com_logo.svg` |

If the brand is not in the table, try the capitalize-first-letter heuristic above, then PNG fallback via thumb endpoint: `https://upload.wikimedia.org/wikipedia/commons/thumb/.../1200px-....png`

```bash
# Download
curl -sL -H "User-Agent: Mozilla/5.0" "$(cat /tmp/${siteName}-logo-url.txt)" -o /tmp/${siteName}-logo.svg
```

**Always use `User-Agent: Mozilla/5.0`** — Wikimedia rejects empty UAs.

#### Fallback sources when Wikimedia misses

1. **simpleicons.org CDN** — `https://cdn.simpleicons.org/{slug}` — mono-color SVG with brand color baked in. Works for LinkedIn, GitHub, Twitter. Unsuitable for multi-color logos (eBay, Google).
2. **Brand press kit** — last resort: search `{brand}.com/press` or `{brand}.com/about/brand` for official SVG/PNG downloads.

### 2. Pick background gradient

| Logo colors | Background |
|---|---|
| 3+ brand colors (eBay, Google) | `linear-gradient(135deg, pastel-c1, pastel-c2, …)` |
| 1–2 brand colors (Reddit, GitHub) | flat pastel or 2-stop gradient |

Pastel = target brand color at 10–15% saturation. Example: eBay red `#e53238` → pastel `#ffeaec`.

### 3. Compose HTML

Copy `references/banner-template.html` to `/tmp/${siteName}-banner.html`. Make three substitutions (all at once — no nested placeholders remain after this step):
- `{{LOGO_PATH}}` → `file:///tmp/${siteName}-logo.svg`
- `{{BG_GRADIENT}}` → the gradient string from step 2 (e.g. `linear-gradient(135deg, #ffeaec 0%, #e0efff 100%)`)
- `{{TAGLINE_BLOCK}}` → `<div class="tagline">Comp pricing · Item watchlist</div>` — substitute the literal tagline text directly. When no tagline: replace with `""` (empty string — leave the placeholder line blank, the surrounding HTML renders cleanly)

### 4. Render via Chrome headless

macOS:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1200,630 \
  --screenshot=/tmp/${siteName}-banner.png \
  file:///tmp/${siteName}-banner.html
```

Linux / CI: replace with `google-chrome` or `chromium-browser` (same flags). On K8s workers, `chromium --headless=new ...` works if `chromium` is in PATH.

### 5. Upload

Requires an authenticated CLI session first — `trawl login` (or `TRAWL_TOKEN` env / `trawl login --token <jwt>`). Not logged in at all → exit `3` (kind `auth`, since CLI 1.18.2 — was exit `1`); an expired/invalid token → also exit `3` (server 401).

```bash
trawl scraps banner ${scrapId} -f /tmp/${siteName}-banner.png
```

`-f/--file` also accepts `.jpg` and `.webp`, not just `.png` — webp gives smaller uploads for the same visual quality if size matters. Since CLI 1.18.4, any other extension is rejected with a usage error (exit 2) rather than uploaded mislabeled — png/jpg/webp only.

CLI confirms upload. Banner is immediately visible on trawl.me.

**Failure detection:** `banner` has **no `--json` mode** — the exit code is the only machine-readable signal. `0` = uploaded; non-zero = failed: `1` other/unmapped error, `2` malformed `scrapId` (not a 24-char hex ObjectId — usage error), `3` not logged in / expired-or-invalid token (401), `4` wrong `scrapId` (404), `5` network. Check `$?`, don't parse stdout for success/failure.

## Conventions

- Logo width **360px** on 1200x630 canvas (~30%). Larger overwhelms; smaller loses recognition.
- **Fetch the real SVG** — never recreate the wordmark in HTML/CSS. Brand fonts aren't reliably reproducible.
- Tagline: uppercase, `letter-spacing: 2.4px`, `color: #5a5a5a`, 22px, one line, `·` separator.
- Saturated gradients (not pastel) only for monochrome logos (LinkedIn blue, GitHub black).

## Examples

| Site | Gradient | Tagline |
|---|---|---|
| eBay | `135deg, #ffeaec, #fff7e0, #e0efff, #e8f5d9` | `Comp pricing · Item watchlist` |
| Reddit | `135deg, #fff1ec, #fff8f5` | `Subreddit pulse · Post discussions` |
| GitHub | `135deg, #f5f5f5, #e8e8e8` | `Repo stats · Trending discovery` |

## What this skill does NOT cover

- Scrap script → `trawl-scrap-design`
- CLI account management → `trawl-cli`
