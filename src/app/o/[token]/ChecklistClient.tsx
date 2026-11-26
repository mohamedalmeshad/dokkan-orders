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
import styles from './checklist.module.css';

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
      <div dir="rtl" className={styles.statePage}>
        <Loader2 size={40} className={`${styles.loadingIcon} ${styles.spin}`} />
        <p className={styles.loadingText}>جاري تحميل قائمة تجهيز الطلبية...</p>
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div dir="rtl" className={styles.statePage}>
        <div className={styles.stateCard}>
          <div className={styles.errorIconWrap}>
            <XCircle size={32} />
          </div>
          <h1 className={styles.errorTitle}>
            {errorMsg || 'القائمة غير متاحة'}
          </h1>
          <p className={styles.errorDesc}>
            تأكد من فتح الرابط الكامل المرسل عبر واتساب أو اطلب رابطاً محدثاً من التاجر.
          </p>
          <button
            type="button"
            onClick={() => loadOrder(false)}
            className={styles.retryBtn}
          >
            <RefreshCw size={16} />
            <span>إعادة المحاولة</span>
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
    <div dir="rtl" className={styles.page}>
      {/* Sticky Top Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          {/* Store Row (no "مباشر" badge) */}
          <div className={styles.headerTop}>
            <div className={styles.storeInfo}>
              <div className={styles.storeIcon}>
                <Store size={22} />
              </div>
              <div className={styles.storeMeta}>
                <h1 className={styles.storeTitle}>
                  طلبية: {order.merchant_name}
                </h1>
                <div className={styles.storeDate}>
                  <Calendar size={14} className={styles.dateIcon} />
                  <span>{dateText}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => loadOrder(true)}
              aria-label="تحديث القائمة"
              className={styles.refreshBtn}
            >
              <RefreshCw
                size={18}
                className={refreshing ? styles.spin : undefined}
              />
            </button>
          </div>

          {/* Progress Bar */}
          <div className={styles.progressCard}>
            <div className={styles.progressTop}>
              <span className={styles.progressLabel}>
                تم تجهيز {stats.packed} من {stats.total} صنف
              </span>
              <div className={styles.progressRight}>
                {stats.unavailable > 0 ? (
                  <span className={styles.unavailablePill}>
                    ❌ {stats.unavailable} ناقص
                  </span>
                ) : null}
                <span className={styles.progressPct}>{stats.pct}%</span>
              </div>
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressPacked}
                style={{ width: `${packedPct}%` }}
              />
              <div
                className={styles.progressUnavailable}
                style={{ width: `${unavailablePct}%` }}
              />
            </div>
          </div>

          {/* Quick Filter Pills */}
          <div className={styles.filtersRow}>
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
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`${styles.filterBtn} ${
                    active ? styles.filterBtnActive : ''
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {actionError ? (
            <div className={styles.errorBanner}>{actionError}</div>
          ) : null}
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.main}>
        {/* Notes Banner */}
        {order.notes ? (
          <div className={styles.notesBanner}>
            <FileText size={18} className={styles.notesIcon} />
            <div>
              <div className={styles.notesTitle}>ملاحظات الطلبية</div>
              <p className={styles.notesText}>{order.notes}</p>
            </div>
          </div>
        ) : null}

        {/* Locked Banner */}
        {isLocked ? (
          <div className={styles.lockedBanner}>
            <Lock size={18} />
            <span>تم إغلاق هذه القائمة ({order.status}) — للعرض فقط</span>
          </div>
        ) : null}

        {/* Completion Banner */}
        {stats.total > 0 && stats.pending === 0 ? (
          <div className={styles.doneBanner}>
            <div className={styles.doneIconWrap}>
              <PackageCheck size={24} />
            </div>
            <div>
              <div className={styles.doneTitle}>اكتملت مراجعة جميع الأصناف!</div>
              <div className={styles.doneSub}>
                تم تجهيز {stats.packed} صنف
                {stats.unavailable > 0 ? ` • ${stats.unavailable} أصناف ناقصة` : ''}
              </div>
            </div>
          </div>
        ) : null}

        {visibleItems.length === 0 ? (
          <div className={styles.emptyCard}>لا توجد أصناف في هذا القسم حالياً</div>
        ) : (
          visibleItems.map(({ item, key, status }) => {
            const isPacked = status === 'packed';
            const isUnavailable = status === 'unavailable';
            const isFrac = isFractionalQty(item.quantity);
            const qtyLabel = formatArabicQuantity(item.quantity);

            const cardClass = isPacked
              ? `${styles.itemCard} ${styles.itemCardPacked}`
              : isUnavailable
              ? `${styles.itemCard} ${styles.itemCardUnavailable}`
              : styles.itemCard;

            const qtyClass = isFrac
              ? `${styles.qtyBadge} ${styles.qtyBadgeFrac}`
              : isPacked
              ? `${styles.qtyBadge} ${styles.qtyBadgePacked}`
              : styles.qtyBadge;

            const nameClass = isPacked
              ? `${styles.itemName} ${styles.itemNamePacked}`
              : isUnavailable
              ? `${styles.itemName} ${styles.itemNameUnavailable}`
              : styles.itemName;

            return (
              <div key={key} className={cardClass}>
                {/* Quantity Badge (Right) + Unit & Item Name */}
                <div className={styles.itemTop}>
                  <div className={qtyClass}>
                    <div className={styles.qtyNumber}>{qtyLabel}</div>
                    {isFrac ? (
                      <div className={styles.qtyDecimal}>({item.quantity})</div>
                    ) : null}
                  </div>

                  <div className={styles.itemBody}>
                    {item.unit ? (
                      <div className={styles.itemMetaRow}>
                        <span className={styles.unitPill}>{item.unit}</span>
                      </div>
                    ) : null}
                    <h2 className={nameClass}>{item.item_name}</h2>
                  </div>
                </div>

                {/* Large Thumb-Friendly Action Buttons */}
                <div className={styles.actionsGrid}>
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => handleToggleItem(key, 'packed')}
                    className={`${styles.actionBtn} ${
                      isPacked ? styles.btnPackedActive : styles.btnPackedIdle
                    }`}
                  >
                    <CheckCircle2 size={20} />
                    <span>تم التجهيز</span>
                  </button>

                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => handleToggleItem(key, 'unavailable')}
                    className={`${styles.actionBtn} ${
                      isUnavailable
                        ? styles.btnUnavailActive
                        : styles.btnUnavailIdle
                    }`}
                  >
                    <XCircle size={20} />
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
