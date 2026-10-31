-- ============================================
-- Dokkan Orders - Supabase Database Setup
-- Run this SQL in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Items table
CREATE TABLE IF NOT EXISTS items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  default_unit TEXT NOT NULL DEFAULT 'كرتونة',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anonymous users (for simplicity)
-- In production, you'd want proper auth policies
DROP POLICY IF EXISTS "Allow all operations on items" ON items;
CREATE POLICY "Allow all operations on items" ON items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create index for faster search
CREATE INDEX IF NOT EXISTS idx_items_name ON items (name);

-- ============================================
-- Shared Active Cart Table (Real-time Sync)
-- ============================================

CREATE TABLE IF NOT EXISTS active_cart_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  item_id UUID NOT NULL UNIQUE,
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1 NOT NULL,
  unit TEXT NOT NULL DEFAULT 'كرتونة',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE active_cart_items ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anonymous users (shared cart across devices)
DROP POLICY IF EXISTS "Allow all operations on active_cart_items" ON active_cart_items;
CREATE POLICY "Allow all operations on active_cart_items" ON active_cart_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable Realtime publication for active_cart_items safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'active_cart_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE active_cart_items;
  END IF;
END $$;

-- ============================================
-- Orders History & Tracking Table
-- ============================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_number SERIAL,
  merchant_name TEXT,
  status TEXT DEFAULT 'تم الإرسال' NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_items INTEGER DEFAULT 0 NOT NULL,
  total_quantity INTEGER DEFAULT 0 NOT NULL,
  invoice_url TEXT,
  invoice_urls TEXT[] DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anonymous users (shared order tracking)
DROP POLICY IF EXISTS "Allow all operations on orders" ON orders;
CREATE POLICY "Allow all operations on orders" ON orders
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable Realtime publication for orders safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);

-- ============================================
-- Supabase Storage: 'invoice-photos' & 'invoices' Buckets Setup
-- ============================================

-- Create 'invoice-photos' and 'invoices' buckets if they don't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-photos', 'invoice-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies to allow public reads and uploads for invoice photos safely
DO $$
BEGIN
  -- Policies for invoice-photos
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Public Access to Invoice Photos' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Public Access to Invoice Photos" ON storage.objects
      FOR SELECT USING (bucket_id = 'invoice-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow Uploads to Invoice Photos' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow Uploads to Invoice Photos" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'invoice-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow Updates to Invoice Photos' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow Updates to Invoice Photos" ON storage.objects
      FOR UPDATE USING (bucket_id = 'invoice-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow Deletes from Invoice Photos' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow Deletes from Invoice Photos" ON storage.objects
      FOR DELETE USING (bucket_id = 'invoice-photos');
  END IF;

  -- Policies for legacy invoices
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Public Access to Invoices' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Public Access to Invoices" ON storage.objects
      FOR SELECT USING (bucket_id = 'invoices');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow Uploads to Invoices' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow Uploads to Invoices" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'invoices');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow Updates to Invoices' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow Updates to Invoices" ON storage.objects
      FOR UPDATE USING (bucket_id = 'invoices');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow Deletes from Invoices' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow Deletes from Invoices" ON storage.objects
      FOR DELETE USING (bucket_id = 'invoices');
  END IF;
END $$;


-- ============================================
-- Sample Data (Optional - Arabic mini-market items)
-- ============================================

INSERT INTO items (name, default_unit) VALUES
  ('سكر ناعم ١ كيلو', 'شيكارة'),
  ('أرز مصري ١ كيلو', 'شيكارة'),
  ('زيت عباد الشمس ١ لتر', 'كرتونة'),
  ('شاي ليبتون ٢٥٠ جرام', 'كرتونة'),
  ('مكرونة المنصورة ٤٠٠ جرام', 'كرتونة'),
  ('صلصة طماطم ٣٥٠ جرام', 'كرتونة'),
  ('جبنة مثلثات ١٦ قطعة', 'كرتونة'),
  ('لبن جهينة ١ لتر', 'باكتة'),
  ('عصير فرشلي ١ لتر', 'كرتونة'),
  ('بسكويت لواكر ١٧٥ جرام', 'كرتونة'),
  ('صابون لوكس ١٧٠ جرام', 'كرتونة'),
  ('عليقة هيرمان سوبر خشنة', 'شيكارة'),
  ('فول مدمس حدائق كاليفورنيا', 'كرتونة'),
  ('تونة جيشا ١٧٠ جرام', 'كرتونة'),
  ('نسكافيه كلاسيك ٥٠ جرام', 'كرتونة'),
  ('دقيق فاخر ١ كيلو', 'شيكارة'),
  ('سمن صناعي ١ كيلو', 'صفيحة'),
  ('شيبسي ليز كبير', 'كرتونة'),
  ('بيبسي ١ لتر', 'باكتة'),
  ('مناديل فاين ٢٠٠ ورقة', 'باكتة')
ON CONFLICT DO NOTHING;
