'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, type Item, type OrderItem, type CartItem, type Category } from '@/lib/supabase';
import { UNIT_OPTIONS, formatArabicDate, toArabicNumeral } from '@/lib/constants';
import { generateDokkanPDF } from '@/lib/pdfGenerator';
import { useToast } from './Toast';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  FileText,
  Send,
  Loader2,
  BookmarkCheck,
  ArrowRight,
  ShieldCheck,
  Store,
  Layers,
  Phone,
  CheckCircle2,
} from 'lucide-react';

interface CartManagerProps {
  onNavigateToOrders?: () => void;
}

export default function CartManager({ onNavigateToOrders }: CartManagerProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [merchantName, setMerchantName] = useState('محمد حمادة');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  // Load items from Supabase to match categories & wholesale cost prices
  const loadItems = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*, categories(name)')
        .order('name', { ascending: true });

      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: Item[] = (data || []).map((row: any) => ({
        ...row,
        category_name: row.categories?.name ?? null,
      }));
      setItems(mapped);
      return mapped;
    } catch (err) {
      console.warn('Error loading items in CartManager:', err);
      return [];
    }
  };

  // Load active shared real-time cart
  const loadCart = useCallback(async (currentItems: Item[] = items) => {
    try {
      const { data, error } = await supabase
        .from('active_cart_items')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('Active cart items error:', error.message);
        return;
      }

      if (data) {
        const mapped: OrderItem[] = data.map((row: CartItem) => {
          const matchedItem = currentItems.find((i) => i.id === row.item_id);
          const cost = matchedItem?.cost_price ?? row.cost_price ?? null;
          return {
            id: row.id,
            item: matchedItem || {
              id: row.item_id,
              name: row.item_name,
              default_unit: row.unit,
              category_id: null,
              cost_price: cost,
              created_at: row.created_at || '',
            },
            quantity: Number(row.quantity),
            unit: row.unit,
            cost_price: cost,
          };
        });
        setOrderItems(mapped);
      }
    } catch (err) {
      console.warn('Failed to load cart:', err);
    } finally {
      setLoading(false);
    }
  }, [items]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const loaded = await loadItems();
      if (isMounted) {
        await loadCart(loaded);
      }
    })();

    // Supabase Real-time Cart Subscription
    const channel = supabase
      .channel('cart_page_realtime_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_cart_items' },
        () => {
          loadCart();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Update item quantity
  const updateQuantity = async (itemId: string, qty: number) => {
    if (qty <= 0) {
      await removeItem(itemId);
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
      console.warn('Error updating quantity:', err);
    }
  };

  // Update item unit
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
      console.warn('Error updating unit:', err);
    }
  };

  // Remove single item from cart
  const removeItem = async (itemId: string) => {
    setOrderItems((prev) => prev.filter((oi) => oi.item.id !== itemId));
    try {
      await supabase.from('active_cart_items').delete().eq('item_id', itemId);
      showToast('تم حذف الصنف من السلة', 'info');
    } catch (err) {
      console.warn('Error deleting item:', err);
    }
  };

  // Clear all items in cart
  const clearAllCart = async () => {
    if (orderItems.length === 0) return;
    if (!confirm('هل أنت متأكد من رغبتك في تفريغ سلة المشتريات بالكامل؟')) return;

    setOrderItems([]);
    try {
      await supabase
        .from('active_cart_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      showToast('تم تفريغ السلة بنجاح');
    } catch (err) {
      console.warn('Clear cart error:', err);
      showToast('تم تفريغ السلة محلياً');
    }
  };

  // Calculations: Total quantities and total internal cost
  const { totalQuantity, totalCost, itemsWithPricesCount } = useMemo(() => {
    let tQty = 0;
    let tCost = 0;
    let pricedCount = 0;

    for (const oi of orderItems) {
      const q = oi.quantity || 0;
      tQty += q;
      const price = oi.cost_price ?? oi.item.cost_price;
      if (price != null && !isNaN(Number(price))) {
        tCost += q * Number(price);
        pricedCount++;
      }
    }

    return {
      totalQuantity: tQty,
      totalCost: tCost,
      itemsWithPricesCount: pricedCount,
    };
  }, [orderItems]);

  // Save order to history
  const saveOrderToHistory = async (autoClearCart = true): Promise<string | null> => {
    if (orderItems.length === 0) {
      showToast('السلة فارغة، أضف منتجات أولاً', 'error');
      return null;
    }

    setSavingOrder(true);
    try {
      const itemsPayload = orderItems.map((oi) => ({
        item_id: oi.item.id,
        item_name: oi.item.name,
        quantity: oi.quantity,
        unit: oi.unit,
        cost_price: oi.cost_price ?? oi.item.cost_price ?? null,
      }));

      const { data, error } = await supabase
        .from('orders')
        .insert({
          merchant_name: merchantName.trim() || 'محمد حمادة',
          status: 'تم الإرسال',
          items: itemsPayload,
          total_items: orderItems.length,
          total_quantity: totalQuantity,
          invoice_url: null,
          invoice_urls: [],
        })
        .select()
        .single();

      if (error) throw error;

      if (autoClearCart) {
        setOrderItems([]);
        await supabase
          .from('active_cart_items')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
      }

      return data?.order_number ? `#${data.order_number}` : '';
    } catch (err) {
      console.error('Error saving order:', err);
      showToast('حدث خطأ أثناء حفظ الطلبية في السجل', 'error');
      return null;
    } finally {
      setSavingOrder(false);
    }
  };

  // Generate WhatsApp order message (NO PRICES EVER INCLUDED!)
  const handleGenerateWhatsApp = async () => {
    if (orderItems.length === 0) {
      showToast('أضف منتجات للسلة أولاً', 'error');
      return;
    }

    setSendingWhatsApp(true);
    try {
      const orderNum = await saveOrderToHistory(true);
      const dateStr = formatArabicDate(new Date());
      const store = merchantName.trim() || 'محمد حمادة';

      // Build clean WhatsApp message for supplier (Strictly Item Name, Unit, and Quantity)
      let message = `*السلام عليكم ورحمة الله وبركاته*\n`;
      message += `*طلبية بضاعة جملة جديدة* 📦\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `🏪 *المتجر:* ${store}\n`;
      message += `📅 *التاريخ:* ${dateStr}\n`;
      if (orderNum) {
        message += `🔢 *رقم الطلب:* ${orderNum}\n`;
      }
      message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      message += `*الأصناف والكميات المطلوبة:*\n`;

      orderItems.forEach((oi, idx) => {
        const unitStr = oi.unit ? `[ ${oi.unit} ] ` : '';
        message += `${idx + 1}. *${oi.item.name}* ${unitStr}← *(${oi.quantity})*\n`;
      });

      message += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `📦 *إجمالي الأصناف:* ${orderItems.length} صنف\n`;
      message += `🔢 *إجمالي الكميات:* ${totalQuantity} وحدة\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `برجاء تأكيد استلام الطلبية وموعد التوريد. شكراً جزيلاً!`;

      // Clean supplier phone number if provided
      let cleanPhone = supplierPhone.trim().replace(/\D/g, '');
      if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
        cleanPhone = '2' + cleanPhone; // Egypt country code
      }

      const encodedText = encodeURIComponent(message);
      const whatsappUrl = cleanPhone
        ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
        : `https://api.whatsapp.com/send?text=${encodedText}`;

      // Open WhatsApp in new tab / window
      window.open(whatsappUrl, '_blank');
      showToast('تم تجهيز رسالة WhatsApp وحفظ الطلبية في السجل ✓', 'success');
    } catch (err) {
      console.error('WhatsApp dispatch error:', err);
      showToast('خطأ أثناء تجهيز رسالة WhatsApp', 'error');
    } finally {
      setSendingWhatsApp(false);
    }
  };

  // Download Native Vector PDF (< 200 KB, NO PRICES INCLUDED!)
  const handleDownloadPDF = async () => {
    if (orderItems.length === 0) {
      showToast('أضف منتجات للسلة أولاً', 'error');
      return;
    }

    setGeneratingPdf(true);
    showToast('جاري إنشاء ملف PDF الخفيف والسريع...', 'info');

    try {
      const orderNum = await saveOrderToHistory(false);

      await generateDokkanPDF({
        orderNumber: orderNum ? orderNum.replace('#', '') : undefined,
        merchantName: merchantName.trim() || 'محمد حمادة',
        createdAt: new Date(),
        items: orderItems.map((oi) => ({
          item_name: oi.item.name,
          quantity: oi.quantity,
          unit: oi.unit,
        })),
      });

      // Clear cart after successful download
      setOrderItems([]);
      await supabase
        .from('active_cart_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      showToast(`تم تحميل ملف PDF (${orderNum || ''}) وتفريغ السلة بنجاح ✓`, 'success');
    } catch (err) {
      console.error('PDF error:', err);
      showToast('حدث خطأ أثناء إنشاء ملف PDF', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="app-container" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-primary)', margin: '0 auto' }} />
        <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          جاري تحميل سلة المشتريات المشتركة...
        </p>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ padding: '1.25rem 1rem 3rem' }}>
      {/* Page Header */}
      <div
        className="card-header"
        style={{
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="card-title" style={{ fontSize: '1.25rem' }}>
          <div className="card-title-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-primary)' }}>
            <ShoppingCart size={20} />
          </div>
          سلة المشتريات والطلبية
          {orderItems.length > 0 && (
            <span className="badge badge-primary">
              {toArabicNumeral(orderItems.length)} أصناف
            </span>
          )}
        </div>

        {/* Clear All Cart & Back to Catalog Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {onNavigateToOrders && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onNavigateToOrders}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <ArrowRight size={15} />
              <span>إضافة منتجات أخرى</span>
            </button>
          )}

          {orderItems.length > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={clearAllCart}
              style={{
                fontSize: '0.8rem',
                padding: '0.4rem 0.75rem',
                color: 'var(--accent-danger)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
              title="تفريغ السلة بالكامل"
            >
              <Trash2 size={15} />
              <span>تفريغ السلة</span>
            </button>
          )}
        </div>
      </div>

      {orderItems.length === 0 ? (
        /* Empty Cart State */
        <div className="empty-state card" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <div className="empty-state-icon" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
            🛒
          </div>
          <div className="empty-state-title" style={{ fontSize: '1.15rem', fontWeight: 800 }}>
            سلة المشتريات فارغة حالياً
          </div>
          <div className="empty-state-text" style={{ fontSize: '0.85rem', maxWidth: '360px', margin: '0.4rem auto 1.5rem' }}>
            لم تقم بإضافة أي منتجات للسلة بعد. تصفح قائمة المنتجات واضغط على الأصناف والكميات المطلوبة لإضافتها هنا.
          </div>
          {onNavigateToOrders && (
            <button
              className="btn btn-primary"
              onClick={onNavigateToOrders}
              style={{
                fontSize: '0.88rem',
                padding: '0.6rem 1.5rem',
                margin: '0 auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <ArrowRight size={16} />
              <span>الذهاب لكتالوج المنتجات</span>
            </button>
          )}
        </div>
      ) : (
        /* Active Cart Screen */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Top Config Card: Merchant Name & Supplier Phone */}
          <div className="card" style={{ padding: '1rem' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '0.85rem',
              }}
            >
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                  <Store size={14} style={{ color: 'var(--accent-primary)' }} />
                  <span>اسم المتجر / التاجر</span>
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="محمد حمادة"
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  style={{ fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                  <Phone size={14} style={{ color: '#25D366' }} />
                  <span>رقم WhatsApp المورد (اختياري)</span>
                </label>
                <input
                  className="form-input"
                  type="tel"
                  placeholder="مثال: 01012345678 (أو اتركه لاختيار جهة الاتصال)"
                  value={supplierPhone}
                  onChange={(e) => setSupplierPhone(e.target.value)}
                  style={{ fontSize: '0.88rem', direction: 'ltr', textAlign: 'right' }}
                />
              </div>
            </div>
          </div>

          {/* Cart Items Table / Cards */}
          <div className="card" style={{ padding: '1rem', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                الأصناف المختارة ({toArabicNumeral(orderItems.length)})
              </div>
              <div style={{ fontSize: '0.78rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                مزامنة فورية مشتركة
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {orderItems.map((oi, index) => {
                const cost = oi.cost_price ?? oi.item.cost_price;
                const itemSubtotal = cost != null ? (oi.quantity * Number(cost)) : null;

                return (
                  <div
                    key={oi.item.id}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {/* Index & Product Info */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flex: '1 1 240px', minWidth: 0 }}>
                      <span
                        style={{
                          background: 'rgba(99, 102, 241, 0.15)',
                          color: 'var(--accent-primary)',
                          width: '26px',
                          height: '26px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          flexShrink: 0,
                          marginTop: '2px',
                        }}
                      >
                        {toArabicNumeral(index + 1)}
                      </span>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                        <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                          {oi.item.name}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {oi.item.category_name && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                              <Layers size={11} /> {oi.item.category_name}
                            </span>
                          )}

                          {/* Internal Cost Price Tag (Store View Only) */}
                          {cost != null && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                color: '#34d399',
                                background: 'rgba(52, 211, 153, 0.1)',
                                padding: '0.1rem 0.45rem',
                                borderRadius: 'var(--radius-sm)',
                                fontWeight: 700,
                              }}
                              title="سعر التكلفة الداخلي للوحدة (خاص بك فقط)"
                            >
                              سعر الوحدة: {cost} ج.م
                            </span>
                          )}

                          {itemSubtotal != null && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                color: 'var(--text-accent)',
                                background: 'rgba(99, 102, 241, 0.1)',
                                padding: '0.1rem 0.45rem',
                                borderRadius: 'var(--radius-sm)',
                                fontWeight: 700,
                              }}
                              title="إجمالي تكلفة هذا الصنف"
                            >
                              إجمالي: {itemSubtotal.toLocaleString('ar-EG')} ج.م
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Unit Selector & Quantity Controls & Delete */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
                      {/* Unit Dropdown */}
                      <select
                        value={oi.unit}
                        onChange={(e) => updateUnit(oi.item.id, e.target.value)}
                        className="order-unit-select"
                        style={{
                          height: '34px',
                          fontSize: '0.8rem',
                          padding: '0.2rem 0.6rem',
                          background: 'var(--bg-input)',
                          borderColor: 'var(--border-medium)',
                        }}
                      >
                        {Array.from(new Set([oi.unit, ...UNIT_OPTIONS])).map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>

                      {/* Quantity Controller (+ / Input / -) */}
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-medium)',
                          borderRadius: 'var(--radius-md)',
                          padding: '0.1rem',
                        }}
                      >
                        <button
                          className="btn btn-ghost btn-icon"
                          style={{ width: '30px', height: '30px', color: 'var(--accent-danger)' }}
                          onClick={() => updateQuantity(oi.item.id, oi.quantity - 1)}
                          title="إنقاص"
                        >
                          <Minus size={14} />
                        </button>

                        <input
                          type="number"
                          min="1"
                          value={oi.quantity}
                          onChange={(e) => updateQuantity(oi.item.id, parseInt(e.target.value) || 1)}
                          style={{
                            width: '46px',
                            textAlign: 'center',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-primary)',
                            fontWeight: 800,
                            fontSize: '0.9rem',
                            outline: 'none',
                          }}
                        />

                        <button
                          className="btn btn-ghost btn-icon"
                          style={{ width: '30px', height: '30px', color: 'var(--accent-success)' }}
                          onClick={() => updateQuantity(oi.item.id, oi.quantity + 1)}
                          title="زيادة"
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      {/* Delete Item Button */}
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={() => removeItem(oi.item.id)}
                        style={{ width: '32px', height: '32px', color: 'var(--text-muted)' }}
                        title="حذف هذا الصنف من السلة"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary & Calculations Card */}
          <div
            className="card"
            style={{
              padding: '1.25rem',
              background: 'linear-gradient(145deg, rgba(26, 30, 46, 0.95), rgba(20, 24, 38, 0.9))',
              border: '1px solid var(--border-medium)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block' }}>
                  عدد الأصناف في السلة
                </span>
                <span style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                  {toArabicNumeral(orderItems.length)} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>أصناف</span>
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block' }}>
                  إجمالي الكميات المطلوبة
                </span>
                <span style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--accent-primary)' }}>
                  {toArabicNumeral(totalQuantity)} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>وحدة</span>
                </span>
              </div>

              {/* Total Cost Display (Store Owner View Only) */}
              <div>
                <span style={{ fontSize: '0.78rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <ShieldCheck size={14} /> إجمالي التكلفة التقديرية (خاص بالمتجر 🔒)
                </span>
                <span style={{ fontSize: '1.3rem', fontWeight: 900, color: '#34d399' }}>
                  {totalCost > 0 ? `${totalCost.toLocaleString('ar-EG')} ج.م` : 'غير محدد'}
                </span>
                {itemsWithPricesCount < orderItems.length && totalCost > 0 && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>
                    (تم حساب {toArabicNumeral(itemsWithPricesCount)} من {toArabicNumeral(orderItems.length)} صنف مسجل له سعر)
                  </span>
                )}
              </div>
            </div>

            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px dashed rgba(99, 102, 241, 0.25)',
                padding: '0.6rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>🔒</span>
              <span>
                <strong>تنبيه الخصوصية:</strong> جميع تفاصيل الأسعار والتكلفة تظهر لك أنت فقط في هذه الشاشة، ويتم حجبها واستبعادها تماماً من ملف الـ PDF ورسالة الـ WhatsApp المرسلة للمورد.
              </span>
            </div>
          </div>

          {/* Action Buttons: WhatsApp, PDF, Save */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {/* 1. WhatsApp Button */}
            <button
              className="btn btn-primary btn-lg"
              onClick={handleGenerateWhatsApp}
              disabled={sendingWhatsApp || generatingPdf || savingOrder}
              style={{
                background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                borderColor: '#128C7E',
                boxShadow: '0 4px 16px rgba(37, 211, 102, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '0.92rem',
                fontWeight: 800,
                padding: '0.8rem 1.25rem',
              }}
            >
              {sendingWhatsApp ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
              <span>توليد الطلبية وإرسال WhatsApp</span>
            </button>

            {/* 2. Download Native PDF Button (< 200 KB) */}
            <button
              className="btn btn-primary btn-lg"
              onClick={handleDownloadPDF}
              disabled={generatingPdf || sendingWhatsApp || savingOrder}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '0.92rem',
                fontWeight: 800,
                padding: '0.8rem 1.25rem',
              }}
            >
              {generatingPdf ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <FileText size={18} />
              )}
              <span>تحميل الطلبية PDF (خفيف وسريع)</span>
            </button>

            {/* 3. Save to History Only */}
            <button
              className="btn btn-secondary btn-lg"
              onClick={async () => {
                const res = await saveOrderToHistory(true);
                if (res) showToast(`تم حفظ الطلبية ${res} في السجل بنجاح ✓`, 'success');
              }}
              disabled={savingOrder || generatingPdf || sendingWhatsApp}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '0.9rem',
                fontWeight: 700,
              }}
            >
              {savingOrder ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <BookmarkCheck size={18} style={{ color: '#10b981' }} />
              )}
              <span>حفظ في السجل فقط</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

