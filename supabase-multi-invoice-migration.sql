-- ========================================================
-- Dokkan Orders - Migration: Multi-Image Invoice Support
-- Run this script in the Supabase SQL Editor
-- ========================================================

-- 1. Add `invoice_urls` (array of text URLs) to the `orders` table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS invoice_urls TEXT[] DEFAULT '{}'::text[];

-- 2. Migrate existing single `invoice_url` records into `invoice_urls` array
--    This ensures zero data loss for previously uploaded invoices
UPDATE orders
SET invoice_urls = ARRAY[invoice_url]
WHERE invoice_url IS NOT NULL 
  AND (invoice_urls IS NULL OR cardinality(invoice_urls) = 0);

-- 3. Create the 'invoice-photos' Supabase Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-photos', 'invoice-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 4. Ensure legacy 'invoices' bucket also exists for backwards compatibility
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 5. Storage RLS Policies for 'invoice-photos' (Public Read & Authenticated/Anon Write)
DO $$
BEGIN
  -- Read Policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Public Access to Invoice Photos' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Public Access to Invoice Photos" ON storage.objects
      FOR SELECT USING (bucket_id = 'invoice-photos');
  END IF;

  -- Upload Policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Allow Uploads to Invoice Photos' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow Uploads to Invoice Photos" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'invoice-photos');
  END IF;

  -- Update Policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Allow Updates to Invoice Photos' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow Updates to Invoice Photos" ON storage.objects
      FOR UPDATE USING (bucket_id = 'invoice-photos');
  END IF;

  -- Delete Policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Allow Deletes from Invoice Photos' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow Deletes from Invoice Photos" ON storage.objects
      FOR DELETE USING (bucket_id = 'invoice-photos');
  END IF;
END $$;

-- 6. Verify column existence
COMMENT ON COLUMN orders.invoice_urls IS 'Array of image URLs representing all pages of physical invoices for this order';

