'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, type OrderRecord, type OrderStatus, getOrderInvoiceUrls } from '@/lib/supabase';
import { formatArabicDate } from '@/lib/constants';
import { generateDokkanPDF } from '@/lib/pdfGenerator';
import { useToast } from './Toast';
import InvoiceGallery from './InvoiceGallery';
import {
  Search,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  Store,
} from 'lucide-react';

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string; bg: string; border: string; icon: any }
> = {
  'تم الإرسال': {
    label: 'تم الإرسال',
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.12)',
    border: 'rgba(251, 191, 36, 0.3)',
    icon: Clock,
  },
  'تم الاستلام': {
    label: 'تم الاستلام',
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.12)',
    border: 'rgba(52, 211, 153, 0.3)',
    icon: CheckCircle2,
  },
  'ملغاة': {
    label: 'ملغاة',
    color: '#f87171',
    bg: 'rgba(248, 113, 113, 0.12)',
    border: 'rgba(248, 113, 113, 0.3)',
    icon: XCircle,
  },
};

export default function OrdersHistory() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [downloadingPdfOrderId, setDownloadingPdfOrderId] = useState<string | null>(null);

  // Load orders from Supabase
  const loadOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Orders table not ready:', error.message);
        return;
      }
      setOrders(data || []);
    } catch (err) {
      console.warn('Load orders error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Realtime subscription for orders
  useEffect(() => {
    loadOrders();

    const channel = supabase
      .channel('orders_realtime_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOrders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let result = orders;

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((o) => o.status === statusFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((o) => {
        const matchesMerchant = o.merchant_name?.toLowerCase().includes(q);
        const matchesNumber = o.order_number?.toString().includes(q);
        const matchesItems = o.items?.some((i) =>
          i.item_name?.toLowerCase().includes(q)
        );
        return matchesMerchant || matchesNumber || matchesItems;
      });
    }

    return result;
  }, [orders, statusFilter, searchQuery]);

  // Status counts
  const counts = useMemo(() => {
    return {
      all: orders.length,
      sent: orders.filter((o) => o.status === 'تم الإرسال').length,
      received: orders.filter((o) => o.status === 'تم الاستلام').length,
      cancelled: orders.filter((o) => o.status === 'ملغاة').length,
    };
  }, [orders]);

  // Update order status
  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, status: newStatus, updated_at: new Date().toISOString() }
          : o
      )
    );

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (error) throw error;
      showToast(`تم تغيير حالة الطلبية إلى: ${newStatus}`);

      // If marked as received and no invoice yet, prompt the user
      const targetOrder = orders.find((o) => o.id === orderId);
      const invoiceCount = targetOrder ? getOrderInvoiceUrls(targetOrder).length : 0;
      if (newStatus === 'تم الاستلام' && invoiceCount === 0) {
        showToast('📸 يمكنك الآن التقاط صور فواتير الاستلام وتثبيتها', 'success');
      }
    } catch (err) {
      console.warn('Update status error:', err);
      showToast('خطأ في تحديث حالة الطلبية', 'error');
      loadOrders();
    }
  };

  // Update order state when an invoice is added/deleted/replaced
  const handleUpdateOrder = (updatedOrder: OrderRecord) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
    );
  };

  // Toggle order expansion
  const toggleExpand = (orderId: string) => {
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  // Delete order
  const deleteOrder = async (orderId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الطلبية من السجل؟')) return;

    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    try {
      const { error } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) throw error;
      showToast('تم حذف الطلبية من السجل');
    } catch (err) {
      showToast('خطأ في حذف الطلبية', 'error');
      loadOrders();
    }
  };

  // Download Order PDF directly from Orders History
  const downloadOrderPDF = async (order: OrderRecord) => {
    if (!order.items || order.items.length === 0) {
      showToast('لا توجد أصناف في هذه الطلبية لتحميلها', 'error');
      return;
    }

    setDownloadingPdfOrderId(order.id);
    showToast('جاري إنشاء وتحميل ملف الـ PDF...');
    try {
      await generateDokkanPDF({
        orderNumber: order.order_number,
        merchantName: order.merchant_name,
        createdAt: order.created_at,
        items: order.items.map((i) => ({
          item_name: i.item_name,
          quantity: i.quantity,
          unit: i.unit,
        })),
      });
      showToast(`تم تحميل ملف PDF لطلب #${order.order_number || ''} بنجاح ✓`, 'success');
    } catch (err) {
      console.error('Download order PDF failed:', err);
      showToast('خطأ في تحميل ملف PDF', 'error');
    } finally {
      setDownloadingPdfOrderId(null);
    }
  };

  return (
    <div className="app-container" style={{ padding: '1.5rem 1rem' }}>
      {/* Page Header */}
      <div className="card-header" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="card-title" style={{ fontSize: '1.25rem' }}>
          <div className="card-title-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-primary)' }}>
            <Calendar size={20} />
          </div>
          سجل ومتابعة الطلبيات
          <span className="badge badge-primary">{orders.length} طلبية</span>
        </div>

        {/* Realtime Live Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#10b981',
              display: 'inline-block',
              boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)',
            }}
          />
          تحديث تلقائي ومباشر
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              className={`nav-tab ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem' }}
            >
              الكل ({counts.all})
            </button>
            <button
              className={`nav-tab ${statusFilter === 'تم الإرسال' ? 'active' : ''}`}
              onClick={() => setStatusFilter('تم الإرسال')}
              style={{
                fontSize: '0.8rem',
                padding: '0.4rem 0.9rem',
                color: statusFilter === 'تم الإرسال' ? '#ffffff' : '#fbbf24',
              }}
            >
              🟡 تم الإرسال ({counts.sent})
            </button>
            <button
              className={`nav-tab ${statusFilter === 'تم الاستلام' ? 'active' : ''}`}
              onClick={() => setStatusFilter('تم الاستلام')}
              style={{
                fontSize: '0.8rem',
                padding: '0.4rem 0.9rem',
                color: statusFilter === 'تم الاستلام' ? '#ffffff' : '#34d399',
              }}
            >
              🟢 تم الاستلام ({counts.received})
            </button>
            <button
              className={`nav-tab ${statusFilter === 'ملغاة' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ملغاة')}
              style={{
                fontSize: '0.8rem',
                padding: '0.4rem 0.9rem',
                color: statusFilter === 'ملغاة' ? '#ffffff' : '#f87171',
              }}
            >
              🔴 ملغاة ({counts.cancelled})
            </button>
          </div>

          {/* Search Input */}
          <div className="search-container">
            <Search size={18} className="search-icon" />
            <input
              className="search-input"
              type="text"
              placeholder="ابحث برقم الطلب، اسم الصنف، أو اسم المتجر..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="empty-state">
          <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '0.75rem', fontSize: '0.9rem' }}>
            جاري تحميل سجل الطلبيات...
          </p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="empty-state card" style={{ padding: '3.5rem 1.5rem' }}>
          <div className="empty-state-icon" style={{ fontSize: '2rem' }}>📋</div>
          <div className="empty-state-title" style={{ fontSize: '1.1rem' }}>
            {searchQuery || statusFilter !== 'all' ? 'لا توجد طلبيات مطابقة للبحث' : 'لا توجد طلبيات محفوظة حتى الآن'}
          </div>
          <div className="empty-state-text" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {searchQuery || statusFilter !== 'all'
              ? 'جرّب تغيير حالة الفلتر أو كتابة كلمات بحث أخرى'
              : 'عند إنشاء أي طلبية من صفحة "إنشاء طلب" وتصديرها، سيتم حفظها ومتابعتها تلقائياً هنا'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredOrders.map((order) => {
            const isExpanded = !!expandedOrders[order.id];
            const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG['تم الإرسال'];
            const itemsList = order.items || [];
            const displayItems = isExpanded ? itemsList : itemsList.slice(0, 3);
            const dateStr = formatArabicDate(new Date(order.created_at));
            const timeStr = new Date(order.created_at).toLocaleTimeString('ar-EG', {
              hour: '2-digit',
              minute: '2-digit',
            });
            const invoiceUrls = getOrderInvoiceUrls(order);
            const showInvoiceSection = order.status === 'تم الاستلام' || invoiceUrls.length > 0;

            return (
              <div
                key={order.id}
                className="card"
                style={{
                  borderRight: `4px solid ${cfg.color}`,
                  padding: '1.25rem',
                  transition: 'all 0.25s ease',
                }}
              >
                {/* Order Card Header */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-accent)',
                        padding: '0.3rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        border: '1px solid var(--border-medium)',
                      }}
                    >
                      طلب #{order.order_number || order.id.slice(0, 5)}
                    </span>

                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      📅 {dateStr} • ⏰ {timeStr}
                    </span>

                    {order.merchant_name && (
                      <span
                        style={{
                          fontSize: '0.8rem',
                          background: 'rgba(99, 102, 241, 0.1)',
                          color: 'var(--text-accent)',
                          padding: '0.2rem 0.6rem',
                          borderRadius: 'var(--radius-full)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}
                      >
                        <Store size={13} />
                        {order.merchant_name}
                      </span>
                    )}
                  </div>

                  {/* Actions & Status Dropdown Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {/* Download Order PDF Button */}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => downloadOrderPDF(order)}
                      disabled={downloadingPdfOrderId === order.id}
                      style={{
                        fontSize: '0.8rem',
                        padding: '0.38rem 0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      title="تحميل ملف PDF للطلبية لإرساله للمورد"
                    >
                      {downloadingPdfOrderId === order.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <FileText size={15} style={{ color: 'var(--accent-primary)' }} />
                      )}
                      <span>تحميل PDF</span>
                    </button>

                    <div
                      style={{
                        position: 'relative',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <select
                        value={order.status}
                        onChange={(e) => updateStatus(order.id, e.target.value as OrderStatus)}
                        style={{
                          appearance: 'none',
                          background: cfg.bg,
                          color: cfg.color,
                          border: `1.5px solid ${cfg.border}`,
                          padding: '0.4rem 2rem 0.4rem 0.9rem',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'var(--font-arabic)',
                          outline: 'none',
                        }}
                      >
                        <option value="تم الإرسال">🟡 تم الإرسال</option>
                        <option value="تم الاستلام">🟢 تم الاستلام</option>
                        <option value="ملغاة">🔴 ملغاة</option>
                      </select>
                      <ChevronDown
                        size={14}
                        style={{
                          position: 'absolute',
                          left: '8px',
                          color: cfg.color,
                          pointerEvents: 'none',
                        }}
                      />
                    </div>

                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => deleteOrder(order.id)}
                      title="حذف من السجل"
                      style={{ color: 'var(--text-muted)', width: '32px', height: '32px' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Items Summary */}
                <div style={{ marginBottom: '0.5rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.4rem',
                      marginBottom: '0.65rem',
                    }}
                  >
                    {displayItems.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.8rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <span style={{ fontWeight: 800, color: 'var(--accent-primary)' }}>
                          {item.quantity} ×
                        </span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                          {item.unit} {item.item_name}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Expand/Collapse Button if more than 3 items */}
                  {itemsList.length > 3 && (
                    <button
                      onClick={() => toggleExpand(order.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-accent)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.2rem 0',
                        fontFamily: 'var(--font-arabic)',
                      }}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp size={14} /> إخفاء باقي الأصناف
                        </>
                      ) : (
                        <>
                          <ChevronDown size={14} /> عرض باقي الأصناف ({itemsList.length - 3} أصناف أخرى...)
                        </>
                      )}
                    </button>
                  )}

                  {/* Summary Totals Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      marginTop: '0.6rem',
                      fontSize: '0.78rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span>📦 الأصناف: <strong style={{ color: 'var(--text-primary)' }}>{order.total_items}</strong></span>
                    <span>🔢 إجمالي الكميات: <strong style={{ color: 'var(--text-primary)' }}>{order.total_quantity}</strong></span>
                  </div>
                </div>

                {/* Invoice Gallery (Visible ONLY when Delivered 'تم الاستلام' or has invoices) */}
                {showInvoiceSection && (
                  <InvoiceGallery
                    order={order}
                    onUpdateOrder={handleUpdateOrder}
                    showToast={showToast}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
