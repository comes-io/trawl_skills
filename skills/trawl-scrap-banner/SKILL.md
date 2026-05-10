---
name: trawl-scrap-banner
description: Generate + upload a brand-aware banner (1200x630 PNG) for a Trawl scrap. Fetches the official brand logo from Wikimedia Commons, composes against a gradient or flat brand-color background, renders via Chrome headless, uploads via `trawl scraps banner`. Triggers on "make banner for my scrap", "generate scrap banner", "upload banner for {site}". Does NOT cover scrap script generation (see trawl-scrap-design) or CLI account management (see trawl-cli).
---

# Trawl Scrap Banner

Generate + upload a brand-aware 1200x630 banner for a Trawl scrap. Prototype validated 2026-05-10 on eBay.

## When to use

After a scrap ships to prod (post-cron-activation, pre-Done). Default step in the seed roadmap workflow — banners are part of "Done" by convention.

Skip for internal/non-discoverable scraps (no UI surface).

## Inputs

- `scrapId` — Trawl scrap ID (24-hex), required
- `siteName` — brand name in URL form (`ebay`, `yahoo-finance`, `github`…), required
- `tagline` — short text under the logo, e.g. `"Comp pricing · Item watchlist"`, optional

## Pipeline

### 1. Fetch logo

Search Wikimedia Commons for the official brand SVG:

```bash
# API search — most reliable
curl -s "https://en.wikipedia.org/w/api.php?action=query&titles=File:${SiteName}_logo.svg&prop=imageinfo&iiprop=url&format=json" \
  -H "User-Agent: Mozilla/5.0" | jq -r '.query.pages[].imageinfo[0].url' \
  > /tmp/${siteName}-logo-url.txt
# Download
curl -sL -H "User-Agent: Mozilla/5.0" "$(cat /tmp/${siteName}-logo-url.txt)" -o /tmp/${siteName}-logo.svg
```

PNG fallback: `https://upload.wikimedia.org/wikipedia/commons/thumb/.../1200px-....png` (thumb endpoint) if SVG unavailable.

**Always use `User-Agent: Mozilla/5.0`** — Wikimedia rejects empty UAs.

### 2. Pick background gradient

| Logo colors | Background |
|---|---|
| 3+ brand colors (eBay, Google) | `linear-gradient(135deg, pastel-c1, pastel-c2, …)` |
| 1–2 brand colors (Reddit, GitHub) | flat pastel or 2-stop gradient |

Pastel = target brand color at 10–15% saturation. Example: eBay red `#e53238` → pastel `#ffeaec`.

### 3. Compose HTML

Copy `references/banner-template.html` to `/tmp/${siteName}-banner.html`. Substitute:
- `{{LOGO_PATH}}` → `file:///tmp/${siteName}-logo.svg`
- `{{BG_GRADIENT}}` → the gradient string (step 2)
- `{{TAGLINE_BLOCK}}` → `<div class="tagline">{{TAGLINE}}</div>` or empty string

### 4. Render via Chrome headless

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1200,630 \
  --screenshot=/tmp/${siteName}-banner.png \
  file:///tmp/${siteName}-banner.html
```

Fallback: `chromium --remote-debugging-port=9223 --headless=new ...` if Chrome.app missing.

### 5. Upload

```bash
trawl scraps banner ${scrapId} -f /tmp/${siteName}-banner.png
```

CLI confirms upload. Banner is immediately visible on trawl.me.

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
