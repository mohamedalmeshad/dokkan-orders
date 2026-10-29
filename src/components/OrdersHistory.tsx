'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase, type OrderRecord, type OrderStatus } from '@/lib/supabase';
import { formatArabicDate } from '@/lib/constants';
import { generateDokkanPDF } from '@/lib/pdfGenerator';
import { useToast } from './Toast';
import {
  Search,
  Filter,
  Calendar,
  Package,
  Camera,
  Upload,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  Trash2,
  FileText,
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
  Download,
  X,
  ExternalLink,
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
  const [uploadingOrderId, setUploadingOrderId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; orderTitle: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetOrderIdForUpload, setTargetOrderIdForUpload] = useState<string | null>(null);
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
      if (newStatus === 'تم الاستلام' && !targetOrder?.invoice_url) {
        showToast('📸 يمكنك الآن التقاط صورة فاتورة الاستلام وتثبيتها', 'success');
      }
    } catch (err) {
      console.warn('Update status error:', err);
      showToast('خطأ في تحديث حالة الطلبية', 'error');
      loadOrders();
    }
  };

  // Toggle order expansion
  const toggleExpand = (orderId: string) => {
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  // Trigger file upload for an order
  const triggerUpload = (orderId: string) => {
    setTargetOrderIdForUpload(orderId);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Convert File to Base64 (Reliable fallback if bucket is not created)
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Handle invoice image file change
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetOrderIdForUpload) return;

    setUploadingOrderId(targetOrderIdForUpload);
    showToast('جاري رفع صورة الفاتورة...');

    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `order-${targetOrderIdForUpload}-${Date.now()}.${fileExt}`;
      let finalImageUrl: string | null = null;

      // Try Supabase Storage upload
      try {
        const { error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: true,
          });

        if (!uploadError) {
          const { data: publicData } = supabase.storage
            .from('invoices')
            .getPublicUrl(fileName);
          finalImageUrl = publicData?.publicUrl || null;
        }
      } catch (storageErr) {
        console.warn('Storage bucket upload skipped, using base64 fallback:', storageErr);
      }

      // Fallback: If Storage upload failed or bucket doesn't exist, use high-efficiency Data URL
      if (!finalImageUrl) {
        finalImageUrl = await fileToBase64(file);
      }

      // Update order in database
      const { error: dbError } = await supabase
        .from('orders')
        .update({
          invoice_url: finalImageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetOrderIdForUpload);

      if (dbError) throw dbError;

      // Local optimistic update
      setOrders((prev) =>
        prev.map((o) =>
          o.id === targetOrderIdForUpload
            ? { ...o, invoice_url: finalImageUrl }
            : o
        )
      );

      showToast('تم حفظ صورة الفاتورة بنجاح ✓');
    } catch (err) {
      console.error('Invoice upload failed:', err);
      showToast('خطأ في حفظ صورة الفاتورة', 'error');
    } finally {
      setUploadingOrderId(null);
      setTargetOrderIdForUpload(null);
    }
  };

  // Delete invoice image
  const deleteInvoicePhoto = async (orderId: string) => {
    if (!confirm('هل أنت متأكد من حذف صورة الفاتورة لهذه الطلبية؟')) return;

    try {
      await supabase
        .from('orders')
        .update({
          invoice_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, invoice_url: null } : o))
      );
      showToast('تم حذف صورة الفاتورة');
    } catch (err) {
      showToast('خطأ في حذف الصورة', 'error');
    }
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
      {/* Hidden File Input for Mobile Camera / Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

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
            const StatusIcon = cfg.icon;
            const itemsList = order.items || [];
            const displayItems = isExpanded ? itemsList : itemsList.slice(0, 3);
            const dateStr = formatArabicDate(new Date(order.created_at));
            const timeStr = new Date(order.created_at).toLocaleTimeString('ar-EG', {
              hour: '2-digit',
              minute: '2-digit',
            });

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

                {/* Main Content Grid: Items List + Invoice Box */}
                <div
                  className={`order-card-body ${
                    order.invoice_url || order.status === 'تم الاستلام' ? '' : 'single-col'
                  }`}
                >
                  {/* Left: Items Summary */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.4rem',
                        marginBottom: '0.75rem',
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

                    {/* Summary Row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        marginTop: '0.75rem',
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>📦 الأصناف: <strong style={{ color: 'var(--text-primary)' }}>{order.total_items}</strong></span>
                      <span>🔢 إجمالي الكميات: <strong style={{ color: 'var(--text-primary)' }}>{order.total_quantity}</strong></span>
                    </div>
                  </div>

                  {/* Right: Invoice Photo Card (Visible ONLY when Delivered 'تم الاستلام' or photo already exists) */}
                  {(order.status === 'تم الاستلام' || order.invoice_url) && (
                    <div
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px dashed rgba(52, 211, 153, 0.4)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '0.65rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '110px',
                        position: 'relative',
                        animation: 'fadeIn 0.25s ease',
                      }}
                    >
                      {order.invoice_url ? (
                        /* Invoice Thumbnail */
                        <div style={{ position: 'relative', width: '100%', height: '100%', textAlign: 'center' }}>
                          <div
                            onClick={() =>
                              setPreviewImage({
                                url: order.invoice_url!,
                                orderTitle: `فاتورة طلب #${order.order_number || ''}`,
                              })
                            }
                            style={{
                              cursor: 'pointer',
                              borderRadius: 'var(--radius-md)',
                              overflow: 'hidden',
                              maxHeight: '90px',
                              border: '1px solid var(--border-medium)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: '#000000',
                            }}
                          >
                            <img
                              src={order.invoice_url}
                              alt="فاتورة الاستلام"
                              style={{
                                width: '100%',
                                height: '90px',
                                objectFit: 'cover',
                                transition: 'transform 0.2s ease',
                              }}
                            />
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              gap: '0.35rem',
                              marginTop: '0.4rem',
                              justifyContent: 'center',
                            }}
                          >
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{
                                fontSize: '0.72rem',
                                padding: '0.2rem 0.5rem',
                                color: 'var(--accent-secondary)',
                              }}
                              onClick={() =>
                                setPreviewImage({
                                  url: order.invoice_url!,
                                  orderTitle: `فاتورة طلب #${order.order_number || ''}`,
                                })
                              }
                            >
                              <Eye size={12} /> معاينة
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{
                                fontSize: '0.72rem',
                                padding: '0.2rem 0.5rem',
                                color: 'var(--text-muted)',
                              }}
                              onClick={() => triggerUpload(order.id)}
                              title="تغيير الصورة"
                            >
                              <Camera size={12} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Upload Button - Enabled specifically upon Delivery */
                        <div style={{ textAlign: 'center', width: '100%' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => triggerUpload(order.id)}
                            disabled={uploadingOrderId === order.id}
                            style={{
                              flexDirection: 'column',
                              gap: '0.35rem',
                              padding: '0.65rem 0.75rem',
                              borderStyle: 'dashed',
                              borderColor: 'rgba(52, 211, 153, 0.5)',
                              background: 'rgba(52, 211, 153, 0.08)',
                              width: '100%',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            {uploadingOrderId === order.id ? (
                              <Loader2 size={18} className="animate-spin" />
                            ) : (
                              <Camera size={20} style={{ color: '#34d399' }} />
                            )}
                            <span style={{ fontWeight: 700, color: '#34d399' }}>تصوير الفاتورة</span>
                          </button>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              color: 'var(--text-muted)',
                              display: 'block',
                              marginTop: '0.25rem',
                            }}
                          >
                            لتوثيق أسعار الاستلام
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox / Modal for Fullscreen Invoice Photo Preview */}
      {previewImage && (
        <div className="modal-overlay" onClick={() => setPreviewImage(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '850px',
              width: '95%',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '92vh',
            }}
          >
            <div className="modal-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Camera size={20} style={{ color: 'var(--accent-primary)' }} />
                <span>{previewImage.orderTitle}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <a
                  href={previewImage.url}
                  download="invoice-photo.jpg"
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem' }}
                >
                  <Download size={14} /> تنزيل
                </a>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => setPreviewImage(null)}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* High-res Image Container */}
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#090b10',
                borderRadius: 'var(--radius-md)',
                padding: '0.5rem',
                minHeight: '350px',
              }}
            >
              <img
                src={previewImage.url}
                alt="معاينة الفاتورة الكاملة"
                style={{
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  borderRadius: 'var(--radius-sm)',
                }}
              />
            </div>

            <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              اضغط خارج النافذة أو زر الإغلاق للعودة
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
