import type { OrderStatus, SupplierCheckStatus, SupplierChecksMap } from './supabase';

export type PublicChecklistItem = {
  item_id: string;
  item_name: string;
  quantity: number;
  unit: string;
};

export type PublicChecklistOrder = {
  id: string;
  share_token: string;
  merchant_name: string;
  status: OrderStatus;
  notes: string | null;
  items: PublicChecklistItem[];
  supplier_checks: SupplierChecksMap;
  created_at: string;
  updated_at: string;
};

export function roundQty(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function isFractionalQty(qty: number): boolean {
  const clean = roundQty(qty);
  return Math.abs(clean - Math.round(clean)) > 0.001;
}

/**
 * Formats quantities identically to mobile-app so warehouse workers never misread 0.5 as 5:
 * 0.5 -> "نص", 0.25 -> "ربع", 0.75 -> "تلات أرباع", 1.5 -> "1 ونص"
 */
export function formatArabicQuantity(qty: number): string {
  const clean = roundQty(qty);
  if (clean <= 0) return '0';

  const whole = Math.floor(clean);
  const frac = Math.round((clean - whole) * 100);

  if (frac === 0) return String(whole);
  if (frac === 50) return whole === 0 ? 'نص' : `${whole} ونص`;
  if (frac === 25) return whole === 0 ? 'ربع' : `${whole} وربع`;
  if (frac === 75) return whole === 0 ? 'تلات أرباع' : `${whole} و¾`;
  return String(clean);
}

export function getChecklistItemKey(
  item: { item_id?: string | null },
  index: number
): string {
  return item.item_id && item.item_id.trim() ? item.item_id.trim() : `idx-${index}`;
}

/**
 * Strictly sanitizes an order row for public supplier access.
 * NEVER exposes cost_price, image_url, invoice_url, invoice_urls, or internal totals.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeOrderForSupplier(row: any): PublicChecklistOrder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawItems: any[] = Array.isArray(row?.items) ? row.items : [];
  const items: PublicChecklistItem[] = rawItems.map((it) => ({
    item_id: typeof it?.item_id === 'string' ? it.item_id : '',
    item_name: typeof it?.item_name === 'string' ? it.item_name : '',
    quantity: roundQty(Number(it?.quantity) || 0),
    unit: typeof it?.unit === 'string' ? it.unit : '',
  }));

  const rawChecks =
    row?.supplier_checks && typeof row.supplier_checks === 'object'
      ? row.supplier_checks
      : {};
  const supplier_checks: SupplierChecksMap = {};
  for (const [k, v] of Object.entries(rawChecks)) {
    if (v === 'packed' || v === 'unavailable' || v === 'pending') {
      supplier_checks[k] = v as SupplierCheckStatus;
    }
  }

  return {
    id: String(row?.id || ''),
    share_token: String(row?.share_token || ''),
    merchant_name:
      typeof row?.merchant_name === 'string' && row.merchant_name.trim()
        ? row.merchant_name.trim()
        : 'محمد حمادة',
    status: (row?.status as OrderStatus) || 'تم الإرسال',
    notes: typeof row?.notes === 'string' && row.notes.trim() ? row.notes.trim() : null,
    items,
    supplier_checks,
    created_at: String(row?.created_at || new Date().toISOString()),
    updated_at: String(row?.updated_at || row?.created_at || new Date().toISOString()),
  };
}
