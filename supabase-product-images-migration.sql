-- ============================================================
-- Supabase Migration: Product Images & Storage Bucket
-- Run this script in the Supabase SQL Editor
-- ============================================================

-- 1. Add image_url column to the items table
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Add image_url column to the active_cart_items table (for instant sync)
ALTER TABLE active_cart_items 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 3. Create the 'product-images' storage bucket (Public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 4. Enable Public Storage Policies for 'product-images'
DO $$
BEGIN
  -- Allow public viewing of product images
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Public Access to Product Images' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Public Access to Product Images" ON storage.objects
      FOR SELECT USING (bucket_id = 'product-images');
  END IF;

  -- Allow uploading product images
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Allow Uploads to Product Images' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow Uploads to Product Images" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'product-images');
  END IF;

  -- Allow updating product images
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Allow Updates to Product Images' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow Updates to Product Images" ON storage.objects
      FOR UPDATE USING (bucket_id = 'product-images');
  END IF;

  -- Allow deleting product images
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Allow Deletes from Product Images' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow Deletes from Product Images" ON storage.objects
      FOR DELETE USING (bucket_id = 'product-images');
  END IF;
END $$;

