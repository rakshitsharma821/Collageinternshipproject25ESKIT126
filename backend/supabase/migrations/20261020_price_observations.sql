-- ==============================================================================
-- GadgetVerse Phase 5: Historical Price Tracking Table & Indexes
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.price_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  product_url TEXT,
  availability TEXT NOT NULL DEFAULT 'in_stock',
  source_status TEXT NOT NULL DEFAULT 'unverified',
  metadata JSONB DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.price_observations
  ALTER COLUMN source_status SET DEFAULT 'unverified',
  ALTER COLUMN observed_at SET DEFAULT pg_catalog.now(),
  ALTER COLUMN created_at SET DEFAULT pg_catalog.now();

-- Compound index for fast timeline queries per product
CREATE INDEX IF NOT EXISTS idx_price_observations_product_time 
  ON public.price_observations(product_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_observations_store 
  ON public.price_observations(store_id);

-- Enable RLS
ALTER TABLE public.price_observations ENABLE ROW LEVEL SECURITY;

-- Read-only access for client applications (anon and authenticated)
DROP POLICY IF EXISTS "Price Observations: Public select" ON public.price_observations;
CREATE POLICY "Price Observations: Public select"
  ON public.price_observations FOR SELECT
  TO anon, authenticated
  USING (
    source_status = 'verified' AND
    currency = 'INR' AND
    metadata->>'comparable' = 'true'
  );

-- Privilege write access restricted exclusively to backend serverless service_role
DROP POLICY IF EXISTS "Price Observations: Service role write" ON public.price_observations;
CREATE POLICY "Price Observations: Service role write"
  ON public.price_observations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
