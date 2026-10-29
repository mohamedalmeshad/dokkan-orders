'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase, type Item, type OrderItem, type CartItem } from '@/lib/supabase';
import { UNIT_OPTIONS, formatArabicDate } from '@/lib/constants';
import { useToast } from './Toast';
import {
  Search,
  Plus,
  Minus,
  ShoppingCart,
  Trash2,
  FileText,
  Send,
  Loader2,
  Package,
  X,
  Wifi,
} from 'lucide-react';

// WhatsApp SVG icon
function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export default function OrderCreator() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [merchantName, setMerchantName] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  // Load shared real-time cart from Supabase
  const loadCart = useCallback(async (currentItems: Item[] = items) => {
    try {
      const { data, error } = await supabase
        .from('active_cart_items')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('Realtime cart not ready:', error.message);
        return;
      }

      if (data) {
        const mapped: OrderItem[] = data.map((row: CartItem) => {
          const matchedItem = currentItems.find((i) => i.id === row.item_id);
          return {
            id: row.id,
            item: matchedItem || {
              id: row.item_id,
              name: row.item_name,
              default_unit: row.unit,
              created_at: row.created_at || '',
            },
            quantity: Number(row.quantity),
            unit: row.unit,
          };
        });
        setOrderItems(mapped);
      }
    } catch (err) {
      console.warn('Failed to load cart from Supabase:', err);
    }
  }, [items]);

  // Load items from database
  const loadItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      const loadedItems = data || [];
      setItems(loadedItems);
      await loadCart(loadedItems);
    } catch {
      showToast('خطأ في تحميل المنتجات', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Realtime subscription on active_cart_items table
  useEffect(() => {
    loadItems();

    const channel = supabase
      .channel('cart_realtime_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_cart_items' },
        () => {
          loadCart();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeActive(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter items
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.trim().toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.default_unit.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  // Check if item is in order
  const isInOrder = useCallback(
    (itemId: string) => orderItems.some((oi) => oi.item.id === itemId),
    [orderItems]
  );

  // Add item to shared order cart
  const addToOrder = async (item: Item) => {
    const existing = orderItems.find((oi) => oi.item.id === item.id);
    const newQty = existing ? existing.quantity + 1 : 1;

    // Optimistic UI update
    setOrderItems((prev) => {
      if (existing) {
        return prev.map((oi) =>
          oi.item.id === item.id ? { ...oi, quantity: newQty } : oi
        );
      }
      return [...prev, { item, quantity: 1, unit: item.default_unit }];
    });

    try {
      if (existing) {
        await supabase
          .from('active_cart_items')
          .update({ quantity: newQty, updated_at: new Date().toISOString() })
          .eq('item_id', item.id);
      } else {
        await supabase
          .from('active_cart_items')
          .insert({
            item_id: item.id,
            item_name: item.name,
            quantity: 1,
            unit: item.default_unit,
          });
      }
    } catch (err) {
      console.warn('Realtime sync insert failed:', err);
    }
  };

  // Remove item from shared order cart
  const removeFromOrder = async (itemId: string) => {
    setOrderItems((prev) => prev.filter((oi) => oi.item.id !== itemId));
    try {
      await supabase.from('active_cart_items').delete().eq('item_id', itemId);
    } catch (err) {
      console.warn('Realtime sync delete failed:', err);
    }
  };

  // Update quantity in shared order cart
  const updateQuantity = async (itemId: string, qty: number) => {
    if (qty <= 0) {
      await removeFromOrder(itemId);
      return;
    }
    setOrderItems((prev) =>
      prev.map((oi) => (oi.item.id === itemId ? { ...oi, quantity: qty } : oi))
    );
    try {
      await supabase
        .from('active_cart_items')
        .update({ quantity: qty, updated_at: new Date().toISOString() })
        .eq('item_id', itemId);
    } catch (err) {
      console.warn('Realtime sync update quantity failed:', err);
    }
  };

  // Update unit in shared order cart
  const updateUnit = async (itemId: string, unit: string) => {
    setOrderItems((prev) =>
      prev.map((oi) => (oi.item.id === itemId ? { ...oi, unit } : oi))
    );
    try {
      await supabase
        .from('active_cart_items')
        .update({ unit, updated_at: new Date().toISOString() })
        .eq('item_id', itemId);
    } catch (err) {
      console.warn('Realtime sync update unit failed:', err);
    }
  };

  // Clear shared order cart
  const clearOrder = async () => {
    setOrderItems([]);
    try {
      await supabase
        .from('active_cart_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      showToast('تم تفريغ السلة المشتركة بنجاح');
    } catch (err) {
      console.warn('Clear cart failed:', err);
      showToast('تم تفريغ السلة محلياً');
    }
  };

  // Generate PDF
  const generatePDF = async (): Promise<void> => {
    if (orderItems.length === 0) {
      showToast('أضف منتجات للطلب أولاً', 'error');
      return;
    }

    setGeneratingPdf(true);

    try {
      // Dynamic import of jspdf and html2canvas
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default;

      const html2canvasModule = await import('html2canvas');
      const html2canvas = html2canvasModule.default;

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const now = new Date();
      const dateStr = formatArabicDate(now);
      const storeName = merchantName.trim();

      // Ensure fonts are ready
      if (typeof document !== 'undefined' && document.fonts) {
        await document.fonts.ready;
      }

      // Create a temporary element for capturing the PDF
      const container = document.createElement('div');
      container.style.cssText = `
        position: fixed;
        left: 0;
        top: 0;
        width: 794px;
        background: #ffffff;
        direction: rtl;
        font-family: 'Cairo', Arial, sans-serif;
        padding: 40px;
        color: #0f172a;
        z-index: -9999;
        visibility: visible;
        opacity: 1;
        pointer-events: none;
      `;



      container.innerHTML = `
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap">

        <style>
          * {
            font-family: 'Cairo', Arial, sans-serif !important;
            letter-spacing: normal !important;
            word-spacing: normal !important;
            box-sizing: border-box;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
            direction: rtl;
            table-layout: fixed;
          }

          th, td {
            vertical-align: middle;
          }

          .cell-flex {
            display: flex;
            align-items: center;
            min-height: 44px;
            width: 100%;
            line-height: normal;
          }

          .cell-center {
            justify-content: center;
            text-align: center;
          }

          .cell-right {
            justify-content: flex-start;
            text-align: right;
          }

          .order-row {
            height: 72px;
          }

          .order-row td {
            padding: 0 14px;
            vertical-align: middle;
          }

          .item-name {
            width: 100%;
            font-size: 15px;
            font-weight: 700;
            line-height: 1.5;
            color: #0f172a;
            overflow-wrap: anywhere;
            text-align: right;
          }
        </style>

        <!-- Header -->
        <div style="
          text-align: center;
          margin-bottom: 28px;
          direction: rtl;
        ">

          <!-- Order Title -->
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            background: #4f46e5;
            color: #ffffff;
            width: 205px;
            height: 82px;
            margin: 0 auto;
            border-radius: 15px;
            font-size: 26px;
            font-weight: 800;
            padding: 0;
            line-height: normal;
          ">
            <span style="
              display: block;
              line-height: 1;
              padding: 0;
              margin: 0;
              transform: translateY(-9px);
            ">قائمة المشتريات</span>
          </div>

          <!-- Order Information -->
          <div style="
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            align-items: center;
            gap: 12px 32px;
            margin-top: 14px;
            font-size: 14px;
            color: #475569;
            font-weight: 600;
            direction: rtl;
            text-align: center;
          ">

            <div>
              👤 التاجر:
              <strong style="color: #0f172a;">محمد حمادة</strong>
            </div>

            <div>
              📅 التاريخ:
              <strong style="color: #0f172a;">${dateStr}</strong>
            </div>

            <div>
              📦 عدد الأصناف:
              <strong style="color: #4f46e5;">${orderItems.length} صنف</strong>
            </div>

            ${storeName
          ? `<div>
                    🏪 المتجر:
                    <strong style="color: #0f172a;">${storeName}</strong>
                  </div>`
          : ''
        }

          </div>
        </div>

        <!-- Order Table -->
        <table>
          <colgroup>
            <col style="width: 70px;">
            <col>
            <col style="width: 150px;">
          </colgroup>

          <thead>
            <tr style="
              background: #4f46e5;
              color: #ffffff;
            ">

              <!-- Number Header -->
              <th style="
                padding: 10px 14px;
                text-align: center;
                vertical-align: middle;
                font-size: 14px;
                font-weight: 700;
                border-radius: 8px 0 0 0;
              ">
                <div class="cell-flex cell-center">
                  #
                </div>
              </th>

              <!-- Product Name Header -->
              <th style="
                padding: 10px 18px;
                text-align: right;
                vertical-align: middle;
                font-size: 15px;
                font-weight: 700;
              ">
                <div class="cell-flex cell-right">
                  اسم الصنف
                </div>
              </th>

              <!-- Quantity Header -->
              <th style="
                padding: 10px 12px;
                text-align: center;
                vertical-align: middle;
                font-size: 15px;
                font-weight: 700;
                border-radius: 0 8px 0 0;
              ">
                <div class="cell-flex cell-center">
                  الكمية المطلوبة
                </div>
              </th>

            </tr>
          </thead>

          <tbody>
            ${orderItems
          .map((oi, index) => {
            const unitPrefix = oi.unit ? `${oi.unit} ` : '';
            const itemFullName = `${unitPrefix}${oi.item.name}`;

            return `
                  <tr
                    class="order-row"
                    style="
                      background: ${index % 2 === 0 ? '#f8fafc' : '#ffffff'};
                      border-bottom: 1px solid #e2e8f0;
                    "
                  >

                    <!-- Item Number -->
                    <td>
                      <div class="cell-flex cell-center" style="
                        font-size: 14px;
                        font-weight: 700;
                        color: #6366f1;
                      ">
                        ${index + 1}
                      </div>
                    </td>

                    <!-- Item Name -->
                    <td style="
                      padding-right: 18px;
                      padding-left: 18px;
                    ">
                      <div class="cell-flex cell-right">
                        <div class="item-name">
                          ${itemFullName}
                        </div>
                      </div>
                    </td>

                    <!-- Quantity -->
                    <td>
                      <div class="cell-flex cell-center">

                        <span style="
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          background: #eef2ff;
                          color: #4338ca;
                          font-weight: 800;
                          font-size: 16px;
                          padding: 7px 14px;
                          line-height: 1.5;
                          border-radius: 8px;
                          border: 1px solid #c7d2fe;
                          min-width: 44px;
                          min-height: 40px;
                          text-align: center;
                          box-sizing: border-box;
                        ">
                        <span style="
                          display: block;
                          line-height: 1;
                          transform: translateY(-3px);
                        ">${oi.quantity}</span>
                      </span>

                      </div>
                    </td>

                  </tr>
                `;
          })
          .join('')}
          </tbody>
        </table>

        <!-- Footer Separator -->
        <div style="
          margin-top: 28px;
          padding-top: 16px;
          border-top: 2px dashed #cbd5e1;
          width: 100%;
        ">
        </div>
      `;

      document.body.appendChild(container);

      // Brief delay for styles and fonts to render
      await new Promise((resolve) => setTimeout(resolve, 150));

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: 794,
        windowWidth: 794,
      });

      document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Handle multi-page if content is tall
      const pageHeight = doc.internal.pageSize.getHeight();
      let heightLeft = imgHeight;
      let position = 0;

      doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        doc.addPage();
        doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Save the PDF
      const fileName = `طلب-جملة-${now.toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);

      showToast('تم تحميل الطلب بنجاح ✓');
      return;
    } catch (err) {
      console.error('PDF generation error:', err);
      showToast('خطأ في إنشاء ملف PDF', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Send via WhatsApp
  const sendWhatsApp = async () => {
    if (orderItems.length === 0) {
      showToast('أضف منتجات للطلب أولاً', 'error');
      return;
    }

    // First generate and download the PDF
    await generatePDF();

    // Build WhatsApp message
    const now = new Date();
    const dateStr = formatArabicDate(now);
    const store = merchantName.trim();

    let message = `🛒 *طلب شراء بالجملة*\n`;
    message += `📅 التاريخ: ${dateStr}\n`;
    if (store) {
      message += `🏪 المتجر: ${store}\n`;
    }
    message += `━━━━━━━━━━━━━━━\n\n`;

    orderItems.forEach((oi, index) => {
      const unitPrefix = oi.unit ? `${oi.unit} ` : '';
      message += `${index + 1}. ${oi.quantity} × ${unitPrefix}${oi.item.name}\n`;
    });

    const totalQty = orderItems.reduce((sum, item) => sum + item.quantity, 0);

    message += `\n━━━━━━━━━━━━━━━\n`;
    message += `📦 إجمالي الأصناف: ${orderItems.length}\n`;
    message += `🔢 إجمالي الكميات: ${totalQty}\n`;
    message += `\n💡 _مرفق ملف PDF الرسمي بتفاصيل الطلب_`;

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  return (
    <div className="main-grid app-container">
      {/* Left Panel - Item Selection */}
      <div>
        <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon">
                <Package size={18} />
              </div>
              اختر المنتجات
              <span className="badge badge-primary">{items.length}</span>
            </div>
          </div>

          {/* Search */}
          <div className="search-container" style={{ marginBottom: '1rem' }}>
            <Search size={18} className="search-icon" />
            <input
              className="search-input"
              type="text"
              placeholder="ابحث عن منتج لإضافته للطلب..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Item list */}
          <div
            className="item-grid"
            style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' }}
          >
            {loading ? (
              <div className="empty-state">
                <Loader2
                  size={32}
                  className="animate-spin"
                  style={{ color: 'var(--accent-primary)' }}
                />
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                  جاري التحميل...
                </p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div className="empty-state-title">
                  {searchQuery ? 'لا توجد نتائج' : 'لا توجد منتجات'}
                </div>
                <div className="empty-state-text">
                  {searchQuery
                    ? 'جرّب البحث بكلمات مختلفة'
                    : 'أضف منتجات من صفحة إدارة المنتجات أولاً'}
                </div>
              </div>
            ) : (
              filteredItems.map((item) => {
                const inOrder = isInOrder(item.id);
                return (
                  <div
                    key={item.id}
                    className={`item-row ${inOrder ? 'selected' : ''}`}
                    onClick={() => addToOrder(item)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="item-name">{item.name}</span>
                    <span className="item-unit-badge">{item.default_unit}</span>
                    {inOrder ? (
                      <span
                        className="badge badge-success"
                        style={{ fontSize: '0.7rem' }}
                      >
                        ✓ في الطلب
                      </span>
                    ) : (
                      <button
                        className="btn btn-ghost btn-icon"
                        style={{ color: 'var(--accent-primary)' }}
                        title="إضافة للطلب"
                      >
                        <Plus size={18} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Order Summary */}
      <div>
        {/* Merchant Name */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">🏪 اسم المتجر (اختياري)</label>
            <input
              className="form-input"
              type="text"
              placeholder="أدخل اسم المتجر (اختياري)..."
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
            />
          </div>
        </div>

        {/* Order Summary */}
        <div className="order-summary">
          <div className="order-summary-header">
            <div>
              <div className="card-title" style={{ marginBottom: '0.2rem' }}>
                <ShoppingCart size={18} style={{ color: 'var(--accent-primary)' }} />
                السلة المشتركة
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10b981',
                  display: 'inline-block',
                  boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)'
                }} />
                مزامنة حية بين الأجهزة
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="order-count-badge">{orderItems.length}</span>
              {orderItems.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={clearOrder}
                  style={{ color: 'var(--accent-danger)', fontSize: '0.75rem' }}
                  title="تفريغ السلة وحذف الأصناف"
                >
                  <Trash2 size={14} />
                  تفريغ السلة
                </button>
              )}
            </div>
          </div>

          <div className="order-summary-body">
            {orderItems.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <div className="empty-state-icon" style={{ width: '48px', height: '48px', fontSize: '1.2rem' }}>
                  🛒
                </div>
                <div className="empty-state-title" style={{ fontSize: '0.9rem' }}>
                  السلة فارغة
                </div>
                <div className="empty-state-text">
                  اختر من قائمة الأصناف لإضافتها، وستظهر فوراً على جميع الأجهزة المتصلة
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {orderItems.map((oi) => (
                  <div key={oi.item.id} className="order-item-row">
                    <div className="order-item-qty">
                      <button
                        className="btn btn-ghost btn-icon"
                        style={{ width: '28px', height: '28px', color: 'var(--accent-danger)' }}
                        onClick={() => updateQuantity(oi.item.id, oi.quantity - 1)}
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        className="qty-input"
                        type="number"
                        min="1"
                        value={oi.quantity}
                        onChange={(e) =>
                          updateQuantity(oi.item.id, parseInt(e.target.value) || 1)
                        }
                      />
                      <button
                        className="btn btn-ghost btn-icon"
                        style={{ width: '28px', height: '28px', color: 'var(--accent-success)' }}
                        onClick={() => updateQuantity(oi.item.id, oi.quantity + 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <span className="order-item-name">{oi.item.name}</span>

                    <select
                      className="order-unit-select"
                      value={oi.unit}
                      onChange={(e) => updateUnit(oi.item.id, e.target.value)}
                    >
                      {Array.from(new Set([oi.unit, ...UNIT_OPTIONS])).map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>

                    <button
                      className="btn btn-ghost btn-icon"
                      style={{ width: '28px', height: '28px', color: 'var(--accent-danger)' }}
                      onClick={() => removeFromOrder(oi.item.id)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {orderItems.length > 0 && (
            <div className="order-summary-footer">
              <button
                className="btn btn-primary btn-block btn-lg"
                onClick={generatePDF}
                disabled={generatingPdf}
              >
                {generatingPdf ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <FileText size={18} />
                )}
                تحميل PDF
              </button>
              <button
                className="btn btn-whatsapp btn-block btn-lg"
                onClick={sendWhatsApp}
                disabled={generatingPdf}
              >
                {generatingPdf ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <WhatsAppIcon size={20} />
                )}
                إرسال عبر واتساب
              </button>
              <button
                className="btn btn-secondary btn-block btn-sm"
                onClick={clearOrder}
                style={{
                  marginTop: '0.25rem',
                  color: 'var(--accent-danger)',
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                  background: 'rgba(239, 68, 68, 0.05)',
                }}
              >
                <Trash2 size={14} />
                تفريغ السلة (بدء طلب جديد)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
