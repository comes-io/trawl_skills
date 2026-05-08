# returnData Shapes — Trawl Scrap Scripts

Rules for the JSON objects you pass to `returnData([...])`.

---

### Flat-as-possible

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

### null vs omission

Return `null` for absent optional fields. Never omit the key — schema validation distinguishes "null" from "key never sent", and omission breaks it silently.

```js
// Good
{ title: 'Widget Pro', discount_pct: null, badge: null }

// Bad — key omitted, breaks checkSchema expectations
{ title: 'Widget Pro' }
```

---

### Dates as ISO-8601 UTC

Convert dates with `new Date(...).toISOString()`. Never pass locale-formatted strings — they're timezone-ambiguous and locale-dependent.

```js
const rawDate = await page.$eval('[data-testid="publish-date"]', (el) => el.getAttribute('datetime'));
const published_at = rawDate ? new Date(rawDate).toISOString() : null;
// e.g. "2024-03-15T00:00:00.000Z"
```

---

### Numbers as numbers

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

### Pagination accumulates within one run

Accumulate all pages into one array and call `returnData` once at the end. Calling it per-page or per-item produces one history entry per call and breaks aggregation.

```js
const allItems = [];

// ... pagination loop adds to allItems ...

returnData(allItems); // single call with all pages merged
```

---

### Compatibility with checkSchema

- `validation_failed` is distinct from `error` (script threw) and `0 items` (empty array). Check all three when debugging data gaps.
- Missing required keys → `validation_failed`, not `error` — no retry triggered.
- See *Trawl Data Quality docs* for schema syntax and enforcement.
