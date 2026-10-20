# GadgetVerse — Product Comparison Platform

GadgetVerse is a calm, light, spacious product-comparison platform featuring live store price intelligence across Amazon India, Flipkart, and Croma, interactive 3D depth, and independent editorial scoring.

## Architecture

- Frontend: Plain HTML5, CSS3, and ES modules. No heavyweight frontend build step required.
- Typography: Self-hosted local WOFF2 fonts (Inter, Space Grotesk, JetBrains Mono) with zero external font dependencies.
- Backend & Serverless: Netlify Functions (`/api/gadgets`, `/api/compare`).
- Database & Auth: Supabase (`gadgets`, `profiles`, `user_wishlists`, `tracked_products`).
- Testing: Native Node test runner (`node --test`).

## Core Features

1. Live Store Price Comparison: Scrapes and ranks offers across Amazon, Flipkart, and Croma with real price parsing, cheapest-store badges, and savings calculations.
2. Dynamic Catalog: Loads verified products from Supabase with resilient static fallback and 10-minute client session caching.
3. 3D Interaction:
   - Hero 3D layered perspective planes with pointer parallax.
   - Interactive card 3D tilt (<= 6 degrees) with cursor-tracking highlight and contact shadows.
   - Smooth FLIP grid transitions on category changes.
   - Rolling price odometer animations.
4. Reduced Motion: Fully respects `prefers-reduced-motion` and provides a manual motion toggle pill persisted in `localStorage`.
5. Calm Light Aesthetics: Clean palette (`#f7f6f2` background, `#ffffff` surface, `#17181c` primary text, `#0f766e` accent, `#15803d` best-price accent).

## Local Development & Testing

### Running Tests
Execute the test suite using Node's native test runner:
```bash
node --test tests/*.test.js
```

### Seeding Catalog to Supabase
To seed the catalog products from `data/gadgets.json`:
```bash
SUPABASE_URL="https://your-project.supabase.co" SUPABASE_SERVICE_ROLE_KEY="your-key" node supabase/seed.js
```

### Starting the Site
Serve the static files using any local server:
```bash
npx serve .
# or
netlify dev
```
