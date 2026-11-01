-- ========================================================
-- Dokkan Orders - Migration: Internal Wholesale Cost Price
-- Run this script in the Supabase SQL Editor
-- ========================================================

-- 1. Add cost_price to items table (Optional internal wholesale purchase price)
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS cost_price NUMERIC;

-- 2. Add cost_price to active_cart_items table for cart total calculations
ALTER TABLE active_cart_items 
ADD COLUMN IF NOT EXISTS cost_price NUMERIC;

-- 3. Add comment to clarify privacy
COMMENT ON COLUMN items.cost_price IS 'Internal wholesale cost price for store owner view only. Never sent to suppliers.';

