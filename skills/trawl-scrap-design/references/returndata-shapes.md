# returnData Shapes — Trawl Scrap Scripts

Rules for the JSON objects you pass to `returnData([...])`.

---

## Flat-as-possible

Return a flat object per item. Nest only when source data is genuinely nested — justify with a comment.

```js
// Good: flat
{ title: 'Widget Pro', category: 'Tools', vendor: 'Acme', price: 29.99 }

// Acceptable: nested because the source API returns a nested address object
{
  name: 'Acme HQ',
  address: { street: '1 Main St', city: 'Paris', country: 'FR' }, // nested: source is nested
}

// Bad: nested for no reason
{
  product: { title: 'Widget Pro', category: 'Tools' }, // no reason to nest
}
```

---

## null vs omission

Return `null` for absent optional fields. Never omit the key — downstream consumers (the frontend table, exports, any consumer script) expect every item to carry the same key set; omitting a key produces ragged objects that silently break column-based rendering.

```js
// Good
{ title: 'Widget Pro', discount_pct: null, badge: null }

// Bad — key omitted, produces a ragged object across the returned array
{ title: 'Widget Pro' }
```

---

## Dates as ISO-8601 UTC

Convert dates with `new Date(...).toISOString()`. Never pass locale-formatted strings — they're timezone-ambiguous and locale-dependent.

```js
const rawDate = await page.$eval('[data-testid="publish-date"]', (el) => el.getAttribute('datetime'));
const published_at = rawDate ? new Date(rawDate).toISOString() : null;
// e.g. "2024-03-15T00:00:00.000Z"
```

---

## Numbers as numbers

Parse before returning. Return currency as a separate string field, not embedded in the number.

```js
const rawPrice = await page.$eval(PRICE_SEL, (el) => el.textContent.trim());
// rawPrice = "€29,99"

const price = parseFloat(rawPrice.replace(',', '.').replace(/[^0-9.]/g, '')) || null;
const currency = rawPrice.match(/[A-Z]{3}|[€$£¥]/)?.[0] ?? null;

// Return:
{ price: 29.99, currency: '€' }
// Not: { price: "€29,99" }
```

---

## Pagination accumulates within one run

Accumulate all pages into one array and call `returnData` once at the end. Calling it per-page or per-item produces one history entry per call and breaks aggregation.

```js
const allItems = [];

// ... pagination loop adds to allItems ...

returnData(allItems); // single call with all pages merged
```

---

## How returnData shape affects the run outcome

Each run gets one `history` row with `status` (tri-state `true`/`false`/`null`) and a finer `statusDetail` enum: `success` / `error` / `empty` / `regression`. There is no schema-validation status — the platform does not enforce a JSON Schema against your items, so a "wrong shape" (missing key, wrong type) never fails the run on its own. What actually flips `statusDetail`:

- **`success`** — `returnData(arr)` called with at least one item.
- **`empty`** — an explicit `returnData([])` — ran clean but returned zero items. Usually means a selector broke; see `references/anti-patterns.md`. Never calling `returnData` at all is NOT `empty`: the run persists as `success` with a `null` payload, which `trawl scraps data` later reports as a `not_found` error (it looks like the payload aged out of retention). Always call `returnData`, even with `[]`.
- **`error`** — the script threw. Throw only for structural failures (see the Resilience section in `SKILL.md`) — a per-field `try/catch` that degrades a field to `null` does NOT produce `error`, it stays `success` with that field `null`.
- **`regression`** — item count dropped sharply vs. recent history, computed server-side after a successful run. This is a degraded *success*, not a failure: the items DID persist. `trawl scraps data <id>` (CLI 1.18.3+) returns those real items on stdout, exit `0`, with a stderr warning pointing at `trawl scraps doctor <id>` for diagnosis — it never collapses a regression row into the failure path. Use `doctor <id>` to see the baseline count vs. the actual count and decide whether the drop is a real site change or a broken selector.

Ragged objects (an omitted key on some items) don't get their own status — they just make the returned array inconsistent for whatever consumes it downstream. Keep every item's key set identical (`null` for absent values) so `success` runs are actually usable.
