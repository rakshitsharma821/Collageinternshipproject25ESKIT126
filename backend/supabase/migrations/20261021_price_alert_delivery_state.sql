ALTER TABLE public.price_alerts
  ADD COLUMN IF NOT EXISTS notification_status TEXT,
  ADD COLUMN IF NOT EXISTS notification_id TEXT,
  ADD COLUMN IF NOT EXISTS notification_note TEXT,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now();

CREATE INDEX IF NOT EXISTS idx_price_alerts_pending_delivery
  ON public.price_alerts(enabled, notification_status, updated_at)
  WHERE notified_at IS NULL;
