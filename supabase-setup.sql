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
CREATE POLICY "Allow all operations on active_cart_items" ON active_cart_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable Realtime publication for active_cart_items
ALTER PUBLICATION supabase_realtime ADD TABLE active_cart_items;

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
