-- ==============================================================================
-- GadgetVerse Phase 1: Hardened Database Schema, RLS, & Auth Lifecycle
-- ==============================================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- Table Definitions
-- ==============================================================================

-- 1. Profiles Table (1-to-1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc'::text, pg_catalog.now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc'::text, pg_catalog.now())
);

-- 2. User Wishlists Table
-- user_id defaults automatically to auth.uid() so client inserts do not need to supply it
CREATE TABLE IF NOT EXISTS public.user_wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc'::text, pg_catalog.now()),
  CONSTRAINT unique_user_product_wishlist UNIQUE (user_id, product_id)
);

-- 3. Tracked Products Table (Price Tracker & Alerts)
CREATE TABLE IF NOT EXISTS public.tracked_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  target_price NUMERIC(10, 2) NOT NULL CHECK (target_price > 0),
  current_price NUMERIC(10, 2) CHECK (current_price > 0),
  alert_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc'::text, pg_catalog.now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc'::text, pg_catalog.now()),
  CONSTRAINT unique_user_tracked_product UNIQUE (user_id, product_id)
);

-- ==============================================================================
-- Performance & Foreign Key Indexes
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_user_wishlists_user_id ON public.user_wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wishlists_product_id ON public.user_wishlists(product_id);

CREATE INDEX IF NOT EXISTS idx_tracked_products_user_id ON public.tracked_products(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_products_product_id ON public.tracked_products(product_id);

-- ==============================================================================
-- Row Level Security (RLS) Enablement
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_products ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- RLS Policies: Profiles (Owner-Only Access)
-- ==============================================================================
DROP POLICY IF EXISTS "Profiles: Owner select" ON public.profiles;
CREATE POLICY "Profiles: Owner select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: Owner update" ON public.profiles;
CREATE POLICY "Profiles: Owner update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ==============================================================================
-- RLS Policies: User Wishlists (Owner-Only Access)
-- ==============================================================================
DROP POLICY IF EXISTS "Wishlists: Owner select" ON public.user_wishlists;
CREATE POLICY "Wishlists: Owner select"
  ON public.user_wishlists FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Wishlists: Owner insert" ON public.user_wishlists;
CREATE POLICY "Wishlists: Owner insert"
  ON public.user_wishlists FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Wishlists: Owner delete" ON public.user_wishlists;
CREATE POLICY "Wishlists: Owner delete"
  ON public.user_wishlists FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ==============================================================================
-- RLS Policies: Tracked Products (Owner-Only Access)
-- ==============================================================================
DROP POLICY IF EXISTS "Tracked: Owner select" ON public.tracked_products;
CREATE POLICY "Tracked: Owner select"
  ON public.tracked_products FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Tracked: Owner insert" ON public.tracked_products;
CREATE POLICY "Tracked: Owner insert"
  ON public.tracked_products FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Tracked: Owner update" ON public.tracked_products;
CREATE POLICY "Tracked: Owner update"
  ON public.tracked_products FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Tracked: Owner delete" ON public.tracked_products;
CREATE POLICY "Tracked: Owner delete"
  ON public.tracked_products FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ==============================================================================
-- Hardened Automated Profile Creation Trigger
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  extracted_name TEXT;
BEGIN
  -- Safe extraction using qualified built-ins
  extracted_name := pg_catalog.nullif(
    pg_catalog.trim(
      pg_catalog.coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        ''
      )
    ),
    ''
  );

  -- Idempotent profile creation without overwriting existing data
  INSERT INTO public.profiles (id, full_name, created_at, updated_at)
  VALUES (
    new.id,
    extracted_name,
    pg_catalog.timezone('utc'::text, pg_catalog.now()),
    pg_catalog.timezone('utc'::text, pg_catalog.now())
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- Revoke direct RPC execution from public/anon/authenticated roles
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- Idempotently attach the trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 4. Gadgets Catalog Table (Live Product Data)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.gadgets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL,
  image_url TEXT,
  review TEXT,
  rating NUMERIC(3, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc'::text, pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_gadgets_category ON public.gadgets(category);
CREATE INDEX IF NOT EXISTS idx_gadgets_brand ON public.gadgets(brand);

ALTER TABLE public.gadgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gadgets: Public select" ON public.gadgets;
CREATE POLICY "Gadgets: Public select"
  ON public.gadgets FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Gadgets: Service role write" ON public.gadgets;
CREATE POLICY "Gadgets: Service role write"
  ON public.gadgets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  email TEXT NOT NULL,
  target_price NUMERIC(10, 2) NOT NULL CHECK (target_price > 0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  notification_status TEXT,
  notification_id TEXT,
  notification_note TEXT,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_price_alerts_unique_target
  ON public.price_alerts(product_id, email, target_price);
CREATE INDEX IF NOT EXISTS idx_price_alerts_product_enabled
  ON public.price_alerts(product_id, enabled);

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Price alerts: Service role write" ON public.price_alerts;
CREATE POLICY "Price alerts: Service role write"
  ON public.price_alerts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
