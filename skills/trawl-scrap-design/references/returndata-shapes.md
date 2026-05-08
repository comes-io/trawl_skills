# returnData Shapes — Trawl Scrap Scripts

Rules for the JSON objects you pass to `returnData([...])`.

---

### Flat-as-possible

Return a flat object per item. Nest only when the source data is genuinely nested — and justify each nesting level with a comment.

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

Always return `null` for optional fields that are absent. Never omit the key. Consumers and Trawl's Data Quality view distinguish "field was present but empty" from "key never sent" — the latter breaks schema validation silently.

```js
// Good
{ title: 'Widget Pro', discount_pct: null, badge: null }

// Bad — key omitted, breaks checkSchema expectations
{ title: 'Widget Pro' }
```

---

### Dates as ISO-8601 UTC

Convert all dates to ISO-8601 UTC strings using `new Date(...).toISOString()`. Never pass locale-formatted strings (`"15 mars 2024"`, `"3/15/24"`) to downstream pipelines — they are timezone-ambiguous and locale-dependent.

```js
const rawDate = await page.$eval('[data-testid="publish-date"]', (el) => el.getAttribute('datetime'));
const published_at = rawDate ? new Date(rawDate).toISOString() : null;
// e.g. "2024-03-15T00:00:00.000Z"
```

---

### Numbers as numbers

Parse numeric values before returning. Return the currency as a separate string field, not embedded in the number.

```js
const rawPrice = await page.$eval(PRICE_SEL, (el) => el.textContent.trim());
// rawPrice = "€29,99"

const price = parseFloat(rawPrice.replace(/[^0-9.]/g, '').replace(',', '.')) || null;
const currency = rawPrice.match(/[A-Z]{3}|[€$£¥]/)?.[0] ?? null;

// Return:
{ price: 29.99, currency: '€' }
// Not: { price: "€29,99" }
```

---

### Pagination accumulates within one run

When a scrap paginates, accumulate all pages into a single array and call `returnData` once at the end. Calling `returnData` once per page — or once per item — produces one history entry per call and breaks aggregation.

```js
const allItems = [];

// ... pagination loop adds to allItems ...

returnData(allItems); // single call with all pages merged
```

---

### Compatibility with checkSchema

Trawl's Data Quality feature validates `returnData` output against the schema defined on the scrap. Key points:

- `validation_failed` is a distinct history status from `error` (script threw) and `0 items` (returnData called with empty array). Check all three when debugging data gaps.
- Missing required keys surface as `validation_failed`, not `error` — they won't cause a retry.
- See *Trawl Data Quality docs* (in-app help center) for schema definition syntax and enforcement behaviour.
