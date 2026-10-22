# GadgetVerse

GadgetVerse is an independent price-tracking web application for electronic gadgets in India. Its backend persists catalog metadata, verified price observations, price history, and price targets in Supabase. Amazon India has an official Creators API connector, which returns offers only when valid marketplace access is configured. User-submitted retailer product pages can be checked only when the operator has separately confirmed automated access is permitted and enabled the corresponding backend flag; this does not enable retailer search-page crawling.

The platform is architected for deployment across three decoupled services:
- **Frontend**: Deployed to **Vercel** (Static HTML, CSS, JavaScript ES Modules)
- **Backend**: Deployed to **Render** (Node.js HTTP service with CORS security)
- **Database**: Hosted on **Supabase** (PostgreSQL with Row Level Security)

---

## Repository Structure

```text
Collageinternshipproject25ESKIT126/
├── frontend/                       # Client-side static application (Vercel)
│   ├── css/
│   │   └── style.css               # Complete stylesheet with light/dark theme tokens
│   ├── fonts/                      # Self-hosted WOFF2 fonts (Inter, Space Grotesk, JetBrains Mono)
│   │   ├── Inter.woff2
│   │   ├── JetBrainsMono.woff2
│   │   └── SpaceGrotesk.woff2
│   ├── js/
│   │   └── tracker.js              # Client-side state, Deal Radar gauge, SVG charts, and API client
│   ├── index.html                  # Homepage with search, 3D cards, feature discovery, and footer
│   ├── products.html               # Product catalog browser and price comparison view
│   ├── about.html                  # Editorial principles and methodology disclosures
│   ├── contact.html                # Consumer disclosures and discrepancy inquiry procedures
│   ├── vercel.json                 # Vercel configuration (clean URLs, security headers)
│   └── package.json                # Frontend package descriptor for scripts
├── backend/                        # API Web Service (Render)
│   ├── api/                        # HTTP API endpoint handlers
│   │   ├── assistant.js            # POST/GET /api/assistant (Intent parser & recommendations)
│   │   ├── compare.js              # GET /api/compare (authorized retailer checks and persisted history)
│   │   ├── gadgets.js              # GET /api/gadgets (Catalog metadata query)
│   │   ├── price-history.js        # GET /api/price-history (Logged observations timeline)
│   │   ├── scan-url.js             # POST/GET /api/scan-url (SSRF validator)
│   │   └── track.js                # POST /api/track (Target price drop alerts)
│   ├── data/
│   │   └── gadgets.json            # Sanitized catalog schema definition (no static prices)
│   ├── lib/                        # Business logic, scrapers, and retailer adapters
│   │   ├── adapters/               # Amazon Creators API plus unavailable retailer adapters
│   │   ├── assistant.js            # Natural language shopping intent extractor
│   │   ├── budget.js               # Basket calculator and price drop alert evaluator
│   │   ├── cache.js                # In-memory and storage observation cache
│   │   ├── compare.js              # Multi-retailer comparison coordinator
│   │   ├── history.js              # Price history aggregator and Deal Radar verdict engine
│   │   ├── identity.js             # Variant and product normalization engine
│   │   ├── match.js                # Title similarity, shipping/coupon calculation, and rankings
│   │   ├── scanner.js              # URL redirect resolver and SSRF validator
│   │   ├── retailer-registry.js    # Retailer access, category, and connector status inventory
│   │   └── stores.js               # Retailer registry and search URL builder
│   ├── supabase/                   # Database schema, seed utilities, and migrations
│   │   ├── migrations/             # SQL migrations (price observations, catalog isolation)
│   │   ├── schema.sql              # Master table definitions and RLS policies
│   │   └── seed.js                 # Catalog metadata seeder (strictly price-free)
│   ├── tests/                      # Automated backend unit and integration tests
│   ├── .env.example                # Backend environment template
│   ├── package.json                # Backend dependency and script configuration
│   └── server.js                   # Node.js HTTP server binding to process.env.PORT
├── screenshots/                    # Verification screenshots across desktop and mobile viewports
├── .env.example                    # Root master environment variable reference
├── .gitignore                      # Git exclusion rules
├── package.json                    # Root coordinator package descriptor
└── README.md                       # Master platform documentation
```

---

## 1. Supabase Database Setup

1. **Create a Supabase Project**:
   - Go to [database.new](https://database.new) and create a new project.
   - Note your **Project URL** and server-side secret key from **Project Settings → API**. The backend accepts `SUPABASE_SERVICE_KEY` (preferred) or `SUPABASE_SECRET_KEY`.

2. **Execute Database Schemas & Migrations**:
   - In Supabase SQL Editor, run these files in order:
     1. [`backend/supabase/schema.sql`](./backend/supabase/schema.sql)
     2. [`backend/supabase/migrations/20261020_price_observations.sql`](./backend/supabase/migrations/20261020_price_observations.sql)
     3. [`backend/supabase/migrations/20261021_price_alert_delivery_state.sql`](./backend/supabase/migrations/20261021_price_alert_delivery_state.sql)
   - The non-destructive setup order is:
     1. `backend/supabase/schema.sql` — creates profiles, wishlists, tracked products, gadgets, and price alerts with RLS policies.
     2. `backend/supabase/migrations/20261020_price_observations.sql` — creates the verified price-observation table, indexes, and RLS policies.
     3. `backend/supabase/migrations/20261021_price_alert_delivery_state.sql` — adds alert delivery-state columns and its pending-delivery index.
   - These SQL files are also applicable with PostgreSQL `psql` from the repository root, after setting `SUPABASE_DB_URL` to the project's database connection string:
     ```powershell
     psql $env:SUPABASE_DB_URL -v ON_ERROR_STOP=1 -f .\backend\supabase\schema.sql
     psql $env:SUPABASE_DB_URL -v ON_ERROR_STOP=1 -f .\backend\supabase\migrations\20261020_price_observations.sql
     psql $env:SUPABASE_DB_URL -v ON_ERROR_STOP=1 -f .\backend\supabase\migrations\20261021_price_alert_delivery_state.sql
     ```
   - Do **not** run `20261020_remove_seeded_catalog.sql` unless you explicitly intend to delete its listed legacy catalog rows. It is not required for setup.

   The backend needs these tables:

   | Table | Used for | Important columns and constraints |
   | :--- | :--- | :--- |
   | `public.gadgets` | Static catalog metadata | `id TEXT PRIMARY KEY`; required `name`, `brand`, `category`; nullable `image_url`, `review`, `rating NUMERIC(3,2)`; `created_at TIMESTAMPTZ`. No prices are stored here. |
   | `public.price_observations` | Verified current and historical prices | `id UUID PRIMARY KEY`; required `product_id TEXT`, `store_id TEXT`, positive `price NUMERIC(10,2)`; `currency TEXT NOT NULL DEFAULT 'INR'`; nullable `product_url`; `availability TEXT NOT NULL DEFAULT 'in_stock'`; `source_status TEXT NOT NULL DEFAULT 'unverified'`; `metadata JSONB`; `observed_at` and `created_at TIMESTAMPTZ`. Indexed by `(product_id, observed_at DESC)` and `store_id`. Public reads require verified INR comparable observations; service role writes. |
   | `public.price_alerts` | Track-price requests and alert state | `id UUID PRIMARY KEY`; required `product_id`, `product_name`, `email`; positive `target_price NUMERIC(10,2)`; `enabled BOOLEAN NOT NULL DEFAULT true`; nullable notification fields and timestamps. Unique index on `(product_id, email, target_price)` and pending-delivery index. Service-role access only. |

   `profiles`, `user_wishlists`, and `tracked_products` are also created by the master schema, but the current Track Price API persists through `price_alerts`, not `tracked_products`. RLS permits public catalog reads, restricts catalog and observation writes to `service_role`, and restricts price-alert access to the server role. Never put the service-role key in frontend configuration.

3. **Seed Catalog Metadata (Optional)**:
   - To populate initial gadget editorial records (without prices), run from the `backend/` directory:
     ```bash
     cd backend
     SUPABASE_URL="https://your-project.supabase.co" SUPABASE_SERVICE_KEY="your-service-role-key" node supabase/seed.js --force-seed
     ```
   - If the configured secret is named `SUPABASE_SECRET_KEY`, use that instead. `SUPABASE_SERVICE_KEY` takes precedence when both are set. These variables must be set only in the backend/server environment; never in frontend configuration.

4. **Run a non-destructive live database smoke test**:
   - For local development, create `D:\collage project\Collageinternshipproject25ESKIT126\.env` by copying the root `.env.example` (`Copy-Item .env.example .env` from the project root), then replace only the Supabase placeholders in that `.env` with your project values. The backend loads the project-root `.env` regardless of the command's working directory. If that file does not exist, it checks `backend\.env` as a fallback. Both paths are Git-ignored.
   - Required names are `SUPABASE_URL` and either `SUPABASE_SERVICE_KEY` or `SUPABASE_SECRET_KEY`. The service key takes precedence when both names are present. Keep these values in `.env` or the backend host's secret settings, never in either `.env.example` or frontend files.
   - After applying the schema and migrations, execute from the repository root:
     ```powershell
     npm --prefix backend run smoke:supabase
     ```
   - The script performs read-only table checks for `gadgets`, `price_observations`, and `price_alerts`. It then writes uniquely identified, disabled/non-comparable test rows, reads them back, and deletes only those exact IDs. The observation uses `source_status='integration_test'` and `metadata.comparable=false`; production history queries require `source_status='verified'` and `metadata.comparable=true`, so these probes cannot be used as chart data. It prints status only and never prints secret values.
   - Run this only against a project where you are authorized to create and delete those two isolated test rows. If the process is interrupted, first identify only the test rows by their exact marker, then delete only the confirmed IDs:
     ```sql
     SELECT id, product_id, source_status, metadata
     FROM public.price_observations
     WHERE source_status = 'integration_test'
       AND metadata->>'integrationTest' = 'true'
       AND product_id LIKE 'gadgetverse-smoke-%';

     SELECT id, product_id, product_name, email, notification_status
     FROM public.price_alerts
     WHERE notification_status = 'integration_test'
       AND product_name = 'GadgetVerse isolated database smoke test'
       AND email LIKE 'gadgetverse-smoke-%@example.invalid';
     ```
     Then substitute each individually verified UUID in `DELETE FROM public.<table> WHERE id = '<verified-id>';`.

---

## 2. Render Backend Deployment

1. **Create a New Web Service on Render**:
   - Log in to [dashboard.render.com](https://dashboard.render.com) and click **New + → Web Service**.
   - Connect this GitHub repository.

2. **Configure Service Settings**:
   - **Name**: `gadgetverse-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start` (or `node server.js`)
   - **Plan**: Free or Starter

3. **Set Environment Variables on Render**:
   In the Render service settings under **Environment**, configure:

   | Variable | Value / Description | Required? |
   | :--- | :--- | :--- |
   | `PORT` | Set automatically by Render (defaults to `3000` locally) | Render auto |
   | `NODE_ENV` | `production` | Yes |
   | `CORS_ORIGIN` | `https://your-gadgetverse.vercel.app` (your Vercel frontend URL) | Yes |
   | `SUPABASE_URL` | `https://your-project.supabase.co` | Yes |
   | `SUPABASE_SERVICE_KEY` | Supabase service-role secret; server only, never expose to browser | Required for catalog, history, and tracking |
   | `AMAZON_CREATORS_CLIENT_ID` | Credential ID from the Amazon Creators API application | Required for Amazon offer checks |
   | `AMAZON_CREATORS_CLIENT_SECRET` | Credential secret from that application | Required for Amazon offer checks |
   | `AMAZON_CREATORS_CREDENTIAL_VERSION` | Credential version; for the India marketplace set `3.2` | Required for Amazon offer checks |
   | `AMAZON_PARTNER_TAG` | Valid Amazon Associates tracking ID for the India marketplace | Required for Amazon offer checks |
   | `AMAZON_PRODUCT_PAGE_ACCESS_AUTHORIZED` | Operator confirmation that direct Amazon product-page checks are permitted | Optional; default `false` |
   | `FLIPKART_PRODUCT_PAGE_ACCESS_AUTHORIZED` | Operator confirmation that direct Flipkart product-page checks are permitted | Optional; default `false` |
   | `CROMA_PRODUCT_PAGE_ACCESS_AUTHORIZED` | Operator confirmation that direct Croma product-page checks are permitted | Optional; default `false` |
   | `RELIANCE_DIGITAL_PRODUCT_PAGE_ACCESS_AUTHORIZED` | Operator confirmation that direct Reliance Digital product-page checks are permitted | Optional; default `false` |
   | `RESEND_API_KEY` | Optional email provider key for scheduled alerts | Optional |
   | `ALERT_FROM_EMAIL` | Verified sender address for alerts | Optional |

   **Amazon access is gated by Amazon, not by setting environment variables.** Enroll in Amazon Associates for India, create a Creators API application as the primary account owner, obtain approved Creators API access for India, and maintain at least 10 qualifying sales in the preceding 30 days. Copy the generated Credential ID, Secret, and Version into the server variables above; use the India Associates tracking ID as `AMAZON_PARTNER_TAG`. The implementation uses the current Creators API OAuth flow and `SearchItems` endpoint. Legacy PA-API environment variables do not activate it. Official references: [Creators API onboarding](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/onboarding/register-for-creators-api), [cURL authentication and endpoint guide](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/get-started/using-curl), [SearchItems](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/search-items), [India locale](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/locale-reference/india), and [PA-API 5 deprecation notice](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation).

   **Retailer connector discovery and status**:

   | Retailer | Categories | Access source | Implemented / configured / live-tested | Remaining requirement |
   | :--- | :--- | :--- | :--- | :--- |
   | Amazon India | Electronics, marketplace, fashion, home, appliances | [Creators API onboarding](https://affiliate-program.amazon.in/creatorsapi/docs/en-us/onboarding/register-for-creators-api) | Yes / No / No | Approved India account and the documented credentials listed above. Rate limits and access depend on account terms. |
   | Flipkart | Electronics, marketplace, fashion, home, appliances | [Official Affiliate API documentation](https://affiliate.flipkart.com/api-docs/index.html) | No / No / No | Active affiliate account and current API credentials; verify eligibility and quota in the affiliate portal before implementing. |
   | Croma | Electronics, appliances | No first-party authorized product API/feed verified | No / No / No | Obtain retailer-approved API/feed access. |
   | Reliance Digital | Electronics, appliances | No first-party authorized product API/feed verified | No / No / No | Obtain retailer-approved API/feed access. |
   | Myntra, AJIO, Nykaa, Meesho, Tata CLiQ, Pepperfry | Fashion, lifestyle, beauty, marketplace, and home as applicable | No first-party authorized product API/feed verified in this audit | No / No / No | Seek retailer-approved feeds/APIs and confirm their terms, credentials, and quotas. |

   The machine-readable inventory is `backend/lib/retailer-registry.js`. Credentials alone never mark a connector live. No scraper should be enabled without explicit authorization; retailers without a verified authorized data source remain unavailable.

   Direct product-page checks use only a link submitted by the user, follow redirects only within the supported retailer/short-link allowlist, and accept structured Product/Offer data only when the canonical product URL, exact product identity, positive INR price, new condition, in-stock state, and freshness checks pass. They do not crawl retailer search results or bypass access controls. The four `*_PRODUCT_PAGE_ACCESS_AUTHORIZED` variables default to `false`; set one to `true` only after you have independently confirmed that the retailer's current terms, robots directives, and any account or access requirements permit your intended automated request. The flag is an operator assertion, not a grant of permission or proof of compliance. HTTP access denials are not retried or bypassed. Page data that does not meet all checks produces no offer.

4. **Verify Backend Health**:
   - Once deployed, test the health check endpoint:
     ```bash
     curl https://your-backend.onrender.com/health
     # Expected response: {"status":"ok","service":"gadgetverse-backend",...}
     ```

### Live integration smoke test

Run these checks against a non-production deployment first, then repeat against production only after deployment approval. Set `BACKEND` to the deployed backend URL; never place service-role credentials in a curl command or browser request.

1. Confirm the configured Supabase catalog is returned:
   ```text
   GET $BACKEND/api/gadgets?limit=3
   ```
   Expect `success: true` and rows from `public.gadgets`; an empty catalog is valid if it has not been seeded.
2. With approved Amazon Creators API access, compare the exact `LORENZ MK-4087R Date Dial with Magnetic Lock Strap Analog Watch - For Men` name:
   ```text
   GET $BACKEND/api/compare?q=LORENZ%20MK-4087R%20Date%20Dial%20with%20Magnetic%20Lock%20Strap%20Analog%20Watch%20-%20For%20Men
   ```
   Confirm any Amazon offer has `status: verified`, an exact model match, an INR amount, known availability, a `/dp/` product URL, and an observation timestamp. Repeat with `MK-4087X` in the query and verify the `MK-4087R` product is not returned as a match. Without API approval/credentials, expect `not_configured` or a retailer API error and no offer.
3. Refresh the comparison and load:
   ```text
   GET $BACKEND/api/price-history?productId=<productId-from-compare>
   ```
   Confirm the actual observation appears in `history` and in Supabase SQL Editor:
   ```sql
   SELECT id, product_id, store_id, price, currency, product_url, availability, source_status, observed_at
   FROM public.price_observations
   WHERE product_id = '<productId-from-compare>'
   ORDER BY observed_at DESC
   LIMIT 10;
   ```
   The comparison endpoint writes only fresh, exact, verified retailer responses and reads the timeline back from the database. Never insert test prices to make Deal Radar pass its minimum-data threshold.
4. Submit Track Price using a real returned `productId`, the same product name, a valid target, and a dedicated test mailbox:
   ```text
   POST $BACKEND/api/track
   Content-Type: application/json

   {"productId":"<productId>","productName":"<exact product name>","targetPrice":2500,"email":"<your-test-mailbox>"}
   ```
   Expect success only after an eligible fresh in-stock observation exists and Supabase confirms the alert row. Verify persistence in SQL Editor:
   ```sql
   SELECT id, product_id, product_name, target_price, enabled, created_at
   FROM public.price_alerts
   WHERE email = '<your-test-mailbox>'
   ORDER BY created_at DESC
   LIMIT 10;
   ```
5. Check unsupported retailer links return HTTP 400 and that no service-role key, retailer secret, or OAuth token appears in any browser/API response.

The HTTP checks above are a procedure, not a claim of live-service verification. The database script verifies only a real Supabase project connection and isolated read/write/read-back/cleanup when run with credentials; retailer HTTP checks require approved Amazon Creators API access. Do not describe services as live-verified until the applicable request has actually succeeded.

---


5. **Scheduled Price Drop Alert Job**:
   - To trigger price drop checks against active target alerts, run the scheduled worker:
     ```bash
     cd backend
     SUPABASE_URL="https://your-project.supabase.co" SUPABASE_SERVICE_KEY="your-service-role-key" RESEND_API_KEY="re_..." node lib/alert-checker.js
     ```
   - This command is a worker entry point, not an automatically scheduled job. Configure a Render Cron Job explicitly (e.g. every 6 or 12 hours) with command `node lib/alert-checker.js` and root directory `backend`; verify its logs and email provider before claiming alerts run continuously.

---

## 3. Vercel Frontend Deployment

1. **Import Project to Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new) and select this repository.

2. **Configure Project Settings**:
   - **Framework Preset**: `Other`
   - **Root Directory**: Click *Edit* and select **`frontend`**
   - **Build Command**: Leave empty / toggle off
   - **Output Directory**: Leave empty / toggle off
   - **Install Command**: Leave empty / toggle off

3. **Configure API Connection**:
   Choose one of two simple approaches:

   - **Approach A (Direct CORS, Recommended)**:
     Set the Render backend URL in the frontend HTML files:
     ```html
     <meta name="api-base" content="https://your-backend.onrender.com">
     ```
     Or inject `window.GADGETVERSE_API_URL = "https://your-backend.onrender.com";`. Ensure `CORS_ORIGIN` on Render matches your Vercel domain.

   - **Approach B (Vercel Rewrite Proxy)**:
     Add a rewrite rule in `frontend/vercel.json`:
     ```json
     {
       "cleanUrls": true,
       "rewrites": [
         {
           "source": "/api/:match*",
           "destination": "https://your-backend.onrender.com/api/:match*"
         }
       ]
     }
     ```

4. **Deploy**:
   - Click **Deploy**. Vercel will serve your static frontend across its global edge network.

---

## 4. Local Development & Testing

### Running Tests
Run the automated backend unit and integration tests from the root or backend directory:
```bash
# From root directory:
npm test

# Or from backend directory:
cd backend
npm test
```

### Running Backend Locally
```bash
cd backend
npm install
node server.js
# Backend will start on http://127.0.0.1:3000
```

### Running Frontend Locally
```bash
cd frontend
# Using Python, Node serve, or any static file server:
npx serve .
# Frontend will be accessible at http://localhost:3000
```

---

## Retailer, history, and alert integration status

- Direct retailer page access is disabled by default and requires an operator-controlled per-retailer authorization flag. No live product-page response has been validated by the fixture tests; fixtures are test-only and do not establish retailer access or live connector status.
- Comparison offers are returned only when an adapter provides an exact identity match, a current positive INR price, verified availability, a retailer-specific product detail URL, a source, and a verification timestamp.
- The comparison and frontend display only verified, current, in-stock offers. Search-result pages, out-of-stock offers, and generic retailer search links are not returned as available prices; if none qualify, the page shows an empty state.
- Verified price history is read from `price_observations`; only observations with exact-identity evidence, INR currency, a supported product URL, and a verified source are considered.
- Deal Radar requires at least three distinct daily observations spanning seven days and a current verified price no older than 24 hours. Insufficient history returns “Not enough data.”
- A price target can be saved before the first observation only when the submitted ID matches an exact catalog product or a stable model-derived identity. The checker waits for a fresh, in-stock, verified exact-product observation before evaluating it.
- Price-alert checks claim each alert before sending. A real email delivery and scheduled worker still require deployment configuration and smoke testing.

## 5. Security & Data Integrity Guarantees

1. **Privileged Credentials**: The Supabase service role secret key and retailer partner keys reside exclusively on the Render backend environment. They are never transmitted to browser code or committed to Git.
2. **Zero Price Fabrication**: When authorized retailer APIs are unavailable or Supabase credentials are missing, GadgetVerse displays an explicit empty/unavailable state rather than inventing prices, discounts, or synthetic price histories.
3. **SSRF Protection**: All product links submitted to `/api/compare` and `/api/scan-url` undergo strict hostname allowlisting and private IP subnet checks before any HTTP connection is attempted.
