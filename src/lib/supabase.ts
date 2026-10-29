import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Item = {
  id: string;
  name: string;
  default_unit: string;
  created_at: string;
};

export type CartItem = {
  id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit: string;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id?: string;
  item: Item;
  quantity: number;
  unit: string;
};
