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

### Idempotent Catalog Seeding
To populate the 19 tested gadgets from `data/gadgets.json`:

```bash
# In your terminal (set your Supabase service role key):
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
node supabase/seed.js
```

> **Note on Data Integrity**: The seeder strictly validates and sanitizes all records against schema columns (`id`, `name`, `brand`, `category`, `image_url`, `review`, `rating`). No pricing fields are ever stored in the catalog database; all store prices are retrieved dynamically.

---

## 2. Environment Variables

Configure the following environment variables in Netlify (`Site configuration > Environment variables`) or your local environment:

| Variable | Scope | Description |
|---|---|---|
| `SUPABASE_URL` | Server & Client | Your Supabase project base URL (e.g. `https://xyz.supabase.co`). |
| `SUPABASE_ANON_KEY` | Server & Client | Your Supabase public anonymous/publishable key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server Only | Supabase admin key used exclusively for catalog seeding. Never expose on the frontend. |

---

## 3. Serverless API Endpoints

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

### `GET /api/compare`
Queries supported e-commerce retailers in parallel for real-time prices.
- **Query Parameters**:
  - `q` *(required)*: Product name or search term (2–100 chars).
- **Responses**:
  - `200 OK`: `{ success: true, query: "...", cheapest: {...}, offers: [...], fetchedAt: "..." }`
  - `400 Bad Request`: Missing, too short (< 2 chars), or too long (> 100 chars) query.
  - `405 Method Not Allowed`: Non-GET HTTP method.

---

## 4. Known Store Integration Limitations

1. **Amazon India (`amazon`)**:
   - Parses server-rendered HTML search listings (`a-price-whole`, `a-offscreen`).
   - If Amazon detects high-frequency automated traffic from datacenter IPs, it serves an anti-bot verification challenge ("Robot Check"). The scraper detects this and returns an informative challenge status alongside the direct search URL.
2. **Flipkart (`flipkart`)**:
   - Parses server-rendered product cards (`data-id`, `₹` price containers).
   - Flipkart regularly updates obfuscated CSS class names; the parser employs resilient regular expressions matching structured INR price tokens inside product listings.
3. **Croma (`croma`)**:
   - Croma's storefront operates as a client-side Single Page Application (SPA).
   - In a pure HTTP serverless backend request, Croma returns the initial unhydrated HTML application shell where products have not yet rendered. The scraper transparently reports that JavaScript rendering is required and provides the direct Croma search link without fabricating fake prices.

---

## 5. Local Testing & Verification

### Run Automated Unit & Mocked Integration Tests
All 37 unit and integration tests run hermetically without external network dependencies:
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
