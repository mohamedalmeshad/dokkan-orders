'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  Lock,
  Store,
  Calendar,
  FileText,
  Loader2,
  RefreshCw,
  PackageCheck,
} from 'lucide-react';
import { supabase, type SupplierCheckStatus } from '@/lib/supabase';
import {
  formatArabicQuantity,
  getChecklistItemKey,
  isFractionalQty,
  type PublicChecklistOrder,
} from '@/lib/checklist';
import { formatArabicDate } from '@/lib/constants';

type FilterTab = 'all' | 'pending' | 'packed' | 'unavailable';

export default function ChecklistClient() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [order, setOrder] = useState<PublicChecklistOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [refreshing, setRefreshing] = useState(false);

  const loadOrder = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);

      try {
        const res = await fetch(`/api/checklist/${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok || !json.order) {
          setErrorMsg(json.error || 'تعذر العثور على قائمة الطلبية');
          setOrder(null);
        } else {
          setOrder(json.order);
          setErrorMsg(null);
        }
      } catch {
        if (!order) {
          setErrorMsg('تعذر الاتصال بالخادم، تأكد من اتصالك بالإنترنت');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token]
  );

  useEffect(() => {
    loadOrder(false);
  }, [loadOrder]);

  // Realtime updates when owner edits items or status from mobile app
  useEffect(() => {
    if (!order?.id) return;

    const channel = supabase
      .channel(`supplier_checklist_${order.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${order.id}`,
        },
        () => {
          loadOrder(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [order?.id, loadOrder]);

  const isLocked =
    order?.status === 'تم الاستلام' || order?.status === 'ملغاة';

  const stats = useMemo(() => {
    if (!order) {
      return { total: 0, packed: 0, unavailable: 0, pending: 0, pct: 0 };
    }
    let packed = 0;
    let unavailable = 0;
    const total = order.items.length;

    order.items.forEach((it, idx) => {
      const key = getChecklistItemKey(it, idx);
      const st = order.supplier_checks?.[key] || 'pending';
      if (st === 'packed') packed++;
      else if (st === 'unavailable') unavailable++;
    });

    const pending = Math.max(0, total - packed - unavailable);
    const pct = total > 0 ? Math.round(((packed + unavailable) / total) * 100) : 0;
    return { total, packed, unavailable, pending, pct };
  }, [order]);

  const visibleItems = useMemo(() => {
    if (!order) return [];
    return order.items
      .map((item, idx) => {
        const key = getChecklistItemKey(item, idx);
        const status: SupplierCheckStatus =
          order.supplier_checks?.[key] || 'pending';
        return { item, idx, key, status };
      })
      .filter((entry) => {
        if (filter === 'all') return true;
        return entry.status === filter;
      });
  }, [order, filter]);

  const handleToggleItem = async (
    itemKey: string,
    targetStatus: 'packed' | 'unavailable'
  ) => {
    if (!order || isLocked) return;

    const prevChecks = { ...(order.supplier_checks || {}) };
    const current = prevChecks[itemKey] || 'pending';
    const nextStatus: SupplierCheckStatus =
      current === targetStatus ? 'pending' : targetStatus;

    const optimisticChecks = { ...prevChecks };
    if (nextStatus === 'pending') {
      delete optimisticChecks[itemKey];
    } else {
      optimisticChecks[itemKey] = nextStatus;
    }

    setActionError(null);
    setOrder({ ...order, supplier_checks: optimisticChecks });

    try {
      const res = await fetch(`/api/checklist/${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemKey, status: nextStatus }),
      });

      const json = await res.json();
      if (!res.ok) {
        setOrder((curr) =>
          curr ? { ...curr, supplier_checks: prevChecks } : curr
        );
        setActionError(json.error || 'تعذر حفظ الحالة، حاول مرة أخرى');
        if (res.status === 423) {
          loadOrder(true);
        }
      } else if (json.supplier_checks) {
        setOrder((curr) =>
          curr ? { ...curr, supplier_checks: json.supplier_checks } : curr
        );
      }
    } catch {
      setOrder((curr) =>
        curr ? { ...curr, supplier_checks: prevChecks } : curr
      );
      setActionError('فشل الاتصال بالشبكة، لم يتم حفظ التغيير');
    }
  };

  if (loading) {
    return (
      <div
        dir="rtl"
        className="min-h-screen w-full bg-[#F5F7F6] text-[#0F172A] flex flex-col items-center justify-center p-6 gap-3"
      >
        <Loader2 className="w-10 h-10 text-[#0F766E] animate-spin" />
        <p className="text-base font-bold text-[#475569]">
          جاري تحميل قائمة تجهيز الطلبية...
        </p>
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div
        dir="rtl"
        className="min-h-screen w-full bg-[#F5F7F6] text-[#0F172A] flex flex-col items-center justify-center p-6 text-center"
      >
        <div className="max-w-md w-full bg-white border border-[#E2E8E5] rounded-2xl p-6 shadow-sm space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center">
            <XCircle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-extrabold text-[#0F172A]">
            {errorMsg || 'القائمة غير متاحة'}
          </h1>
          <p className="text-sm font-medium text-[#475569]">
            تأكد من فتح الرابط الكامل المرسل عبر واتساب أو اطلب رابطاً محدثاً من التاجر.
          </p>
          <button
            onClick={() => loadOrder(false)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F766E] text-white font-bold text-sm hover:bg-[#115E59] transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const dateText = formatArabicDate(new Date(order.created_at));
  const packedPct =
    stats.total > 0 ? Math.round((stats.packed / stats.total) * 100) : 0;
  const unavailablePct =
    stats.total > 0 ? Math.round((stats.unavailable / stats.total) * 100) : 0;

  return (
    <div dir="rtl" className="min-h-screen w-full bg-[#F5F7F6] text-[#0F172A] pb-10">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#E2E8E5] shadow-xs">
        <div className="max-w-xl mx-auto px-3.5 pt-3 pb-3 space-y-2.5">
          {/* Row 1: Store & Live Badge */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#0F766E] text-white flex items-center justify-center shrink-0">
                <Store className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-extrabold text-[#0F172A] truncate">
                  طلبية: {order.merchant_name}
                </h1>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#475569]">
                  <Calendar className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                  <span className="truncate">{dateText}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#DCFCE7] border border-[#86EFAC] text-[#15803D] text-xs font-extrabold">
                <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
                مباشر
              </span>
              <button
                onClick={() => loadOrder(true)}
                aria-label="تحديث القائمة"
                className="w-9 h-9 rounded-xl bg-[#EEF2F0] border border-[#CBD5D0] text-[#0F766E] flex items-center justify-center active:scale-95 transition cursor-pointer"
              >
                <RefreshCw
                  className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* Notes Banner */}
          {order.notes ? (
            <div className="flex items-start gap-2 rounded-xl bg-[#FEF3C7] border-2 border-[#F59E0B] px-3 py-2 text-[#92400E]">
              <FileText className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-xs sm:text-sm font-bold leading-snug">
                ملاحظات: {order.notes}
              </p>
            </div>
          ) : null}

          {/* Locked Banner */}
          {isLocked ? (
            <div className="flex items-center gap-2 rounded-xl bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[#DC2626]">
              <Lock className="w-4 h-4 shrink-0" />
              <span className="text-xs sm:text-sm font-extrabold">
                تم إغلاق هذه القائمة ({order.status}) — للعرض فقط
              </span>
            </div>
          ) : null}

          {/* Progress Bar */}
          <div className="bg-[#F8FAFC] border border-[#E2E8E5] rounded-xl p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs sm:text-sm font-extrabold">
              <span className="text-[#0F766E]">
                تم تجهيز {stats.packed} من {stats.total} صنف
              </span>
              <div className="flex items-center gap-2">
                {stats.unavailable > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#DC2626] text-xs font-extrabold">
                    ❌ {stats.unavailable} ناقص
                  </span>
                ) : null}
                <span className="text-[#475569]">{stats.pct}%</span>
              </div>
            </div>
            <div className="w-full h-2.5 rounded-full bg-[#E2E8E5] overflow-hidden flex">
              <div
                className="h-full bg-[#16A34A] transition-all duration-300"
                style={{ width: `${packedPct}%` }}
              />
              <div
                className="h-full bg-[#DC2626] transition-all duration-300"
                style={{ width: `${unavailablePct}%` }}
              />
            </div>
          </div>

          {/* Quick Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {(
              [
                { id: 'all', label: `الكل (${stats.total})` },
                { id: 'pending', label: `المتبقي (${stats.pending})` },
                { id: 'packed', label: `تم التجهيز (${stats.packed})` },
                { id: 'unavailable', label: `ناقص (${stats.unavailable})` },
              ] as { id: FilterTab; label: string }[]
            ).map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap border transition cursor-pointer ${
                    active
                      ? 'bg-[#0F766E] text-white border-[#0F766E]'
                      : 'bg-white text-[#475569] border-[#CBD5D0]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {actionError ? (
            <div className="rounded-lg bg-[#FEE2E2] border border-[#FECACA] px-3 py-1.5 text-xs font-bold text-[#DC2626]">
              {actionError}
            </div>
          ) : null}
        </div>
      </header>

      {/* Main Checklist */}
      <main className="max-w-xl mx-auto px-3.5 pt-3.5 space-y-3">
        {stats.total > 0 && stats.pending === 0 ? (
          <div className="rounded-2xl bg-[#ECFDF5] border-2 border-[#10B981] p-4 flex items-center gap-3 text-[#065F46]">
            <PackageCheck className="w-7 h-7 shrink-0 text-[#059669]" />
            <div>
              <div className="font-extrabold text-sm sm:text-base">
                اكتملت مراجعة جميع الأصناف!
              </div>
              <div className="text-xs font-semibold opacity-90">
                تم تجهيز {stats.packed} صنف
                {stats.unavailable > 0 ? ` • ${stats.unavailable} أصناف ناقصة` : ''}
              </div>
            </div>
          </div>
        ) : null}

        {visibleItems.length === 0 ? (
          <div className="bg-white border border-[#E2E8E5] rounded-2xl p-8 text-center text-sm font-bold text-[#64748B]">
            لا توجد أصناف في هذا القسم حالياً
          </div>
        ) : (
          visibleItems.map(({ item, key, status }) => {
            const isPacked = status === 'packed';
            const isUnavailable = status === 'unavailable';
            const isFrac = isFractionalQty(item.quantity);
            const qtyLabel = formatArabicQuantity(item.quantity);

            const cardClass = isPacked
              ? 'bg-[#ECFDF5] border-[#10B981] opacity-80'
              : isUnavailable
              ? 'bg-[#FEF2F2] border-[#EF4444]'
              : 'bg-white border-[#CBD5E1] shadow-xs';

            return (
              <div
                key={key}
                className={`rounded-2xl border-2 p-3.5 transition-all space-y-3 ${cardClass}`}
              >
                {/* Quantity Badge (Right) + Unit & Item Name */}
                <div className="flex items-center gap-3">
                  <div
                    className={`min-w-[82px] px-3 py-2 rounded-xl border-2 text-center shrink-0 ${
                      isFrac
                        ? 'bg-[#FEF3C7] border-[#D97706] text-[#92400E]'
                        : 'bg-[#CCFBF1] border-[#0F766E] text-[#0B4F4A]'
                    }`}
                  >
                    <div className="text-[25px] font-black leading-none">
                      {qtyLabel}
                    </div>
                    {isFrac ? (
                      <div className="text-[12px] font-extrabold mt-1 opacity-90">
                        ({item.quantity})
                      </div>
                    ) : null}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    {item.unit ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#E2E8F0] text-[#1E293B] text-xs font-extrabold">
                        {item.unit}
                      </span>
                    ) : null}
                    <h2
                      className={`text-[18px] font-extrabold leading-snug wrap-break-word ${
                        isPacked
                          ? 'line-through text-[#065F46]'
                          : isUnavailable
                          ? 'text-[#991B1B]'
                          : 'text-[#0F172A]'
                      }`}
                    >
                      {item.item_name}
                    </h2>
                  </div>
                </div>

                {/* Large Thumb-Friendly Action Buttons */}
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => handleToggleItem(key, 'packed')}
                    className={`flex-1 min-h-[48px] rounded-xl border-2 font-extrabold text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] ${
                      isLocked
                        ? 'opacity-50 cursor-not-allowed'
                        : 'cursor-pointer'
                    } ${
                      isPacked
                        ? 'bg-[#16A34A] border-[#15803D] text-white shadow-xs'
                        : 'bg-[#F0FDF4] border-[#86EFAC] text-[#15803D]'
                    }`}
                  >
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>تم التجهيز</span>
                  </button>

                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => handleToggleItem(key, 'unavailable')}
                    className={`flex-1 min-h-[48px] rounded-xl border-2 font-extrabold text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] ${
                      isLocked
                        ? 'opacity-50 cursor-not-allowed'
                        : 'cursor-pointer'
                    } ${
                      isUnavailable
                        ? 'bg-[#DC2626] border-[#B91C1C] text-white shadow-xs'
                        : 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
                    }`}
                  >
                    <XCircle className="w-5 h-5 shrink-0" />
                    <span>ناقص</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
