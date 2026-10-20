# GadgetVerse — Backend Architecture & Price Comparison Platform

GadgetVerse is a product-comparison platform featuring live store price intelligence across Amazon India, Flipkart, and Croma, Supabase database catalog storage, and independent editorial scoring.

## Architecture

- Frontend: Plain HTML5, CSS3, and ES modules. No frontend build step required.
- Typography: Self-hosted local WOFF2 fonts (Inter, Space Grotesk, JetBrains Mono) with zero external font dependencies.
- Backend & Serverless: Netlify Functions (`netlify/functions/gadgets.mjs`, `netlify/functions/compare.mjs`).
- Database: Supabase (`gadgets`, `profiles`, `user_wishlists`, `tracked_products`).
- Testing: Native Node test runner (`node --test`).

---

## 1. Database Setup & Supabase Migration

### Executing Schema SQL
1. Open your project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to the **SQL Editor**.
3. Open [`supabase/schema.sql`](file:///D:/collage%20project/Collageinternshipproject25ESKIT126/supabase/schema.sql) and paste the entire SQL script into the editor.
4. Click **Run** to execute. This creates:
   - `public.profiles` with automated trigger on `auth.users`.
   - `public.user_wishlists` with user-isolated Row Level Security.
   - `public.tracked_products` with target price validations.
   - `public.gadgets` catalog table with public read policy and service-role write policy.

### Historical Price Tracking Table (`public.price_observations`)
To enable persistent price tracking over time:
1. Open the [Supabase Dashboard SQL Editor](https://supabase.com/dashboard).
2. Execute [`supabase/migrations/20261020_price_observations.sql`](file:///D:/collage%20project/Collageinternshipproject25ESKIT126/supabase/migrations/20261020_price_observations.sql).
3. This creates `public.price_observations` with RLS (public read, service-role write) and compound indexes for fast timeline retrieval.

### Removing the 19 Seeded Products (Transition to Search-First Comparison)
To remove the initial 19 demo seed rows (`p1..p3`, `l1..l6`, `w1..w3`, `e1..e3`, `t1..t4`) safely without dropping the schema, tables, or user-tracked products:

**Option A: Supabase Dashboard SQL Editor (Recommended)**
1. Open the [Supabase Dashboard SQL Editor](https://supabase.com/dashboard).
2. Copy and execute [`supabase/migrations/20261020_remove_seeded_catalog.sql`](file:///D:/collage%20project/Collageinternshipproject25ESKIT126/supabase/migrations/20261020_remove_seeded_catalog.sql).
3. Confirm the row count returned is 0 remaining seed items.

**Option B: Terminal with Service Role Key**
```bash
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
node supabase/seed.js --delete-seeded
```

> **Automatic Seeding Disabled**: The seeder now runs strictly on-demand. Catalog seeding only executes when explicitly invoked with `--force-seed`. No pricing fields are ever stored in the catalog database; all store prices are retrieved dynamically.

---

## 2. Environment Variables & Store Credentials

Configure the following environment variables in Netlify (`Site configuration > Environment variables`) or your local environment:

| Variable | Scope | Description |
|---|---|---|
| `SUPABASE_URL` | Server & Client | Your Supabase project base URL (e.g. `https://xyz.supabase.co`). |
| `SUPABASE_ANON_KEY` | Server & Client | Your Supabase public anonymous/publishable key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server Only | Supabase admin key used exclusively for catalog migrations. Never expose on the frontend. |
| `AMAZON_ACCESS_KEY` | Server Only | Amazon Product Advertising API (PA-API v5) access key. |
| `AMAZON_SECRET_KEY` | Server Only | Amazon PA-API secret key. |
| `AMAZON_PARTNER_TAG` | Server Only | Amazon Associate store tag. |
| `FLIPKART_AFFILIATE_ID` | Server Only | Flipkart Affiliate Program Tracking ID. |
| `FLIPKART_AFFILIATE_TOKEN` | Server Only | Flipkart Affiliate API access token. |
| `CROMA_API_KEY` | Server Only | Croma Enterprise Partner API key. |

---

## 3. Search-First Serverless API Endpoints

### `GET /api/gadgets`
Retrieves products from the Supabase `gadgets` table.
- **Query Parameters**:
  - `category` *(optional)*: Filter by `phone`, `laptop`, `watch`, `earbuds`, `tv`, or `all`.
  - `q` *(optional)*: Search term across name, brand, and review (max 80 chars, PostgREST-sanitized).
  - `limit` *(optional)*: Page size (1–100, default 50).
  - `offset` *(optional)*: Page offset (default 0).
- **Responses**:
  - `200 OK`: `{ success: true, count: N, data: [...] }`
  - `400 Bad Request`: Invalid category or query parameter too long.
  - `500 Server Error`: Missing database environment variables.
  - `502 Bad Gateway`: Database connection or schema table error (strictly no silent fallback).

### `GET /api/compare?q=...`
Searches stores directly for the user's query using modular store adapters (`StoreRegistry`), normalizes prices into INR, and performs variant-aware comparability checks.
- **Query Parameters**:
  - `q` *(required)*: Product name or search term (2–100 chars).
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "query": "iPhone 16",
      "cheapest": { "store": "amazon", "price": 76999, "url": "..." },
      "offers": [ ... ],
      "fetchedAt": "2026-10-20T12:00:00.000Z"
    }
    ```
  - `400 Bad Request`: Missing, too short (< 2 chars), or too long (> 100 chars) query.
  - `405 Method Not Allowed`: Non-GET HTTP method.

### `GET /api/price-history`
Retrieves historical price observations recorded for a product.
- **Query Parameters**:
  - `productId` *(required)*: Product identifier (1–100 chars).
  - `days` *(optional)*: Timeframe in days (1–365, default 30).
  - `limit` *(optional)*: Observation count (1–100, default 50).
- **Responses**:
  - `200 OK`: `{ success: true, productId: "...", days: 30, history: [...], stats: { minPrice, maxPrice, avgPrice, latestPrice, count } }`
  - When observations are insufficient, cleanly reports empty state without fabricating fake prices.

### `POST /api/scan-url`
Scans a pasted retailer URL (Amazon, Flipkart, Croma), extracts product identity, and compares prices.
- **Security & SSRF Guard**:
  - Strictly requires `https:`.
  - Rejects private IPs, localhost, AWS metadata (`169.254.169.254`), non-standard ports, and URL credentials.
  - Domain allowlist: `amazon.in`, `flipkart.com`, `croma.com`.
- **Responses**:
  - `200 OK`: `{ success: true, identifiedProduct: "...", originStore: "...", cheapest: {...}, offers: [...] }`
  - `400 Bad Request`: SSRF violation or invalid URL.
  - `422 Unprocessable Entity`: Unidentifiable product slug.

### `POST /api/assistant` or `GET /api/assistant?q=...`
AI Shopping Assistant that parses natural-language requirements (budget, category, priority features, preferred brands) and scores candidate products with pros, cons, and direct retailer links.
- Uses server-side API key safety if `GEMINI_API_KEY` is present.
- Built-in deterministic rule engine handles all queries hermetically when no external AI key is set.

---

## 4. Shopping Intelligence Features

1. **AI Deal Score (0–100)**:
   - Transparent, deterministic evaluation based on:
     - Proximity to recorded historical low (up to 40 pts)
     - Competitor market spread (up to 25 pts)
     - Data freshness (up to 10 pts)
     - Variant match confidence (up to 10 pts)
   - Labeled as `Great Deal` ($\ge 80$), `Fair Price` (60–79), `Average` (40–59), or `Insufficient data`.
2. **Buy Now or Wait Guidance**:
   - Analyzes verified price trends over time. Only offers advice when $\ge 2$ observations exist; includes explicit data limitations and never promises future discounts.
3. **Offer Reality Checker**:
   - Detects inflated MRP discount claims by verifying against true historical average selling prices.
4. **Seller, Warranty & Trust Normalizer**:
   - Normalizes seller names, ratings, warranty terms, and return policies. Marks unverified details as `"Not verified"` instead of fabricating terms.
5. **Smart Wishlist & Budget Optimizer**:
   - Calculates total wishlist target budget, total current best price across stores, net potential savings, and deduplicated price drop alerts.

---

## 5. Local Testing & Verification

### Run Automated Unit & Mocked Integration Tests
All 75 unit and integration tests run hermetically without external network dependencies:
```bash
node --test tests/*.test.js
```

### Run Local Netlify Dev Server
To start Netlify Functions locally:
```bash
npx netlify dev
# or
npx netlify functions:serve --port 9999
```
