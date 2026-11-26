-- ============================================================
-- Dokkan Orders - Live Interactive Supplier Checklist Migration
-- Run this SQL in your Supabase SQL Editor
-- ============================================================

-- 1. Add unique unguessable share_token to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS share_token TEXT;

-- Backfill existing orders with a random 10-character token
UPDATE orders
SET share_token = substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 10)
WHERE share_token IS NULL OR trim(share_token) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_share_token
  ON orders (share_token)
  WHERE share_token IS NOT NULL;

-- 2. Add supplier_checks JSONB column (map: item_key -> 'pending' | 'packed' | 'unavailable')
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS supplier_checks JSONB DEFAULT '{}'::jsonb NOT NULL;

-- 3. Ensure Supabase Realtime is enabled for orders updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;
