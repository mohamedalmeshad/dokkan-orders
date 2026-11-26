import { NextResponse } from 'next/server';
import { supabase, type SupplierCheckStatus, type SupplierChecksMap } from '@/lib/supabase';
import { sanitizeOrderForSupplier } from '@/lib/checklist';

const TOKEN_REGEX = /^[a-zA-Z0-9_-]{4,64}$/;

function isMissingColumn(
  error: { code?: string; message?: string } | null,
  colName: string
): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (msg.includes(colName.toLowerCase()) &&
      (msg.includes('column') || msg.includes('schema cache')))
  );
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token || !TOKEN_REGEX.test(token)) {
    return NextResponse.json(
      { error: 'الرابط غير صالح' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let { data, error } = await supabase
    .from('orders')
    .select(
      'id, share_token, merchant_name, status, notes, items, supplier_checks, created_at, updated_at'
    )
    .eq('share_token', token)
    .single();

  if (error && isMissingColumn(error, 'notes')) {
    const retry = await supabase
      .from('orders')
      .select(
        'id, share_token, merchant_name, status, items, supplier_checks, created_at, updated_at'
      )
      .eq('share_token', token)
      .single();
    data = retry.data ? { ...retry.data, notes: null } : null;
    error = retry.error;
  }

  if (error || !data) {
    return NextResponse.json(
      { error: 'الطلب غير موجود أو الرابط غير صحيح' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { order: sanitizeOrderForSupplier(data) },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token || !TOKEN_REGEX.test(token)) {
    return NextResponse.json(
      { error: 'الرابط غير صالح' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let body: { itemKey?: unknown; status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'بيانات الطلب غير صالحة' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const itemKey = typeof body.itemKey === 'string' ? body.itemKey.trim() : '';
  const status = body.status as SupplierCheckStatus;

  if (
    !itemKey ||
    itemKey.length > 120 ||
    (status !== 'pending' && status !== 'packed' && status !== 'unavailable')
  ) {
    return NextResponse.json(
      { error: 'قيمة الحالة أو الصنف غير صالحة' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, status, supplier_checks')
    .eq('share_token', token)
    .single();

  if (fetchError || !order) {
    return NextResponse.json(
      { error: 'الطلب غير موجود أو الرابط غير صحيح' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (order.status === 'تم الاستلام' || order.status === 'ملغاة') {
    return NextResponse.json(
      { error: 'تم إغلاق هذه القائمة ولا يمكن تعديلها' },
      { status: 423, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const currentChecks: SupplierChecksMap =
    order.supplier_checks && typeof order.supplier_checks === 'object'
      ? { ...(order.supplier_checks as SupplierChecksMap) }
      : {};

  if (status === 'pending') {
    delete currentChecks[itemKey];
  } else {
    currentChecks[itemKey] = status;
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('orders')
    .update({ supplier_checks: currentChecks, updated_at: now })
    .eq('id', order.id);

  if (updateError) {
    return NextResponse.json(
      { error: 'تعذر حفظ التحديث، حاول مرة أخرى' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { supplier_checks: currentChecks, updated_at: now },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
