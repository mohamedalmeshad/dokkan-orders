import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Category = {
  id: string;
  name: string;
  created_at: string;
};

export type Item = {
  id: string;
  name: string;
  default_unit: string;
  category_id: string | null;
  category_name?: string | null;
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

export type OrderStatus = 'تم الإرسال' | 'تم الاستلام' | 'ملغاة';

export type OrderRecord = {
  id: string;
  order_number: number;
  merchant_name: string | null;
  status: OrderStatus;
  items: {
    item_id: string;
    item_name: string;
    quantity: number;
    unit: string;
  }[];
  total_items: number;
  total_quantity: number;
  invoice_url?: string | null;
  invoice_urls?: string[] | null;
  created_at: string;
  updated_at: string;
};

/**
 * Returns an array of invoice photo URLs for an order, supporting both
 * the new invoice_urls array and the legacy invoice_url string gracefully.
 */
export const getOrderInvoiceUrls = (order?: Partial<OrderRecord> | null): string[] => {
  if (!order) return [];
  if (Array.isArray(order.invoice_urls) && order.invoice_urls.length > 0) {
    return order.invoice_urls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
  }
  if (order.invoice_url && typeof order.invoice_url === 'string' && order.invoice_url.trim().length > 0) {
    return [order.invoice_url];
  }
  return [];
};


