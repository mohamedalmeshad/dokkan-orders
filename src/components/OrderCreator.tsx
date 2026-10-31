'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, type Item, type OrderItem, type CartItem, type Category } from '@/lib/supabase';
import { UNIT_OPTIONS, formatArabicDate } from '@/lib/constants';
import { generateDokkanPDF } from '@/lib/pdfGenerator';
import { useToast } from './Toast';
import {
  Search,
  Plus,
  Minus,
  ShoppingCart,
  Trash2,
  FileText,
  Loader2,
  Package,
  X,
  BookmarkCheck,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

export default function OrderCreator() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [merchantName, setMerchantName] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  // Load shared real-time cart from Supabase
  const loadCart = useCallback(async (currentItems: Item[] = items) => {
    try {
      const { data, error } = await supabase
        .from('active_cart_items')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) { console.warn('Realtime cart not ready:', error.message); return; }

      if (data) {
        const mapped: OrderItem[] = data.map((row: CartItem) => {
          const matchedItem = currentItems.find((i) => i.id === row.item_id);
          return {
            id: row.id,
            item: matchedItem || { id: row.item_id, name: row.item_name, default_unit: row.unit, category_id: null, created_at: row.created_at || '' },
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

  const loadItems = async () => {
    setLoading(true);
    try {
      const [itemsRes, catRes] = await Promise.all([
        supabase.from('items').select('*, categories(name)').order('name', { ascending: true }),
        supabase.from('categories').select('*').order('name', { ascending: true }),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = (itemsRes.data || []).map((row: any) => ({
        ...row,
        category_name: row.categories?.name ?? null,
      }));
      setItems(mapped);
      setCategories(catRes.data || []);
      await loadCart(mapped);
    } catch {
      showToast('خطأ في تحميل المنتجات', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    const channel = supabase
      .channel('cart_realtime_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_cart_items' }, () => { loadCart(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredItems = useMemo(() => {
    let result = items;
    if (activeCategoryId) result = result.filter((item) => item.category_id === activeCategoryId);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((item) => item.name.toLowerCase().includes(q));
    }
    return result;
  }, [items, activeCategoryId, searchQuery]);

  const getOrderItem = useCallback(
    (itemId: string) => orderItems.find((oi) => oi.item.id === itemId),
    [orderItems]
  );

  const addToOrder = async (item: Item) => {
    const existing = orderItems.find((oi) => oi.item.id === item.id);
    const newQty = existing ? existing.quantity + 1 : 1;
    setOrderItems((prev) => {
      if (existing) return prev.map((oi) => oi.item.id === item.id ? { ...oi, quantity: newQty } : oi);
      return [...prev, { item, quantity: 1, unit: item.default_unit }];
    });
    try {
      if (existing) {
        await supabase.from('active_cart_items').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('item_id', item.id);
      } else {
        await supabase.from('active_cart_items').insert({ item_id: item.id, item_name: item.name, quantity: 1, unit: item.default_unit });
      }
    } catch (err) { console.warn('Realtime sync insert failed:', err); }
  };

  const removeFromOrder = async (itemId: string) => {
    setOrderItems((prev) => prev.filter((oi) => oi.item.id !== itemId));
    try { await supabase.from('active_cart_items').delete().eq('item_id', itemId); }
    catch (err) { console.warn('Realtime sync delete failed:', err); }
  };

  const updateQuantity = async (itemId: string, qty: number) => {
    if (qty <= 0) { await removeFromOrder(itemId); return; }
    setOrderItems((prev) => prev.map((oi) => oi.item.id === itemId ? { ...oi, quantity: qty } : oi));
    try { await supabase.from('active_cart_items').update({ quantity: qty, updated_at: new Date().toISOString() }).eq('item_id', itemId); }
    catch (err) { console.warn('Realtime sync update quantity failed:', err); }
  };

  const clearOrder = async (showNotification = true) => {
    setOrderItems([]);
    try {
      await supabase.from('active_cart_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (showNotification) showToast('تم تفريغ السلة المشتركة بنجاح');
    } catch (err) {
      console.warn('Clear cart failed:', err);
      if (showNotification) showToast('تم تفريغ السلة محلياً');
    }
  };

  const saveOrderToHistory = async (showSuccessToast = true, autoClearCart = true): Promise<boolean> => {
    if (orderItems.length === 0) { showToast('أضف منتجات للطلب أولاً', 'error'); return false; }
    setSavingOrder(true);
    try {
      const itemsPayload = orderItems.map((oi) => ({ item_id: oi.item.id, item_name: oi.item.name, quantity: oi.quantity, unit: oi.unit }));
      const { data, error } = await supabase.from('orders').insert({
        merchant_name: merchantName.trim() || 'محمد حمادة',
        status: 'تم الإرسال',
        items: itemsPayload,
        total_items: orderItems.length,
        total_quantity: orderItems.reduce((acc, curr) => acc + curr.quantity, 0),
        invoice_url: null,
        invoice_urls: [],
      }).select().single();
      if (error) { showToast('خطأ في حفظ الطلبية في السجل', 'error'); return false; }
      if (autoClearCart) await clearOrder(false);
      if (showSuccessToast) {
        const orderNum = data?.order_number ? `#${data.order_number}` : '';
        showToast(`تم حفظ الطلبية ${orderNum} وحذفها من السلة بنجاح ✓`, 'success');
      }
      setCartOpen(false);
      return true;
    } catch (err) {
      console.warn('Error saving order to history:', err);
      showToast('خطأ في حفظ الطلبية', 'error');
      return false;
    } finally {
      setSavingOrder(false);
    }
  };

  const generatePDF = async () => {
    if (orderItems.length === 0) { showToast('أضف منتجات للطلب أولاً', 'error'); return; }
    await saveOrderToHistory(false, false);
    setGeneratingPdf(true);
    try {
      await generateDokkanPDF({
        merchantName: merchantName.trim() || 'محمد حمادة',
        createdAt: new Date(),
        items: orderItems.map((oi) => ({ item_name: oi.item.name, quantity: oi.quantity, unit: oi.unit })),
      });
      await clearOrder(false);
      showToast('تم تحميل الطلب وحفظه في السجل وتفريغ السلة بنجاح ✓', 'success');
      setCartOpen(false);
    } catch (err) {
      console.error('PDF generation error:', err);
      showToast('خطأ في إنشاء ملف PDF', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const totalQty = orderItems.reduce((s, oi) => s + oi.quantity, 0);

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {/* ── MAIN CONTENT ───────────────────────────────── */}
      <div style={{ paddingBottom: cartOpen ? '420px' : '90px', transition: 'padding-bottom 0.3s ease' }}>

        {/* Merchant name strip */}
        <div style={{ padding: '0.75rem 1rem 0' }}>
          <input
            className="form-input"
            type="text"
            placeholder="🏪 اسم المتجر (اختياري)..."
            value={merchantName}
            onChange={(e) => setMerchantName(e.target.value)}
            style={{ borderRadius: 'var(--radius-full)', fontSize: '0.85rem' }}
          />
        </div>

        {/* Search bar */}
        <div className="search-container" style={{ margin: '0.75rem 1rem 0' }}>
          <Search size={18} className="search-icon" />
          <input
            className="search-input"
            type="text"
            placeholder="ابحث عن منتج..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              onClick={() => setSearchQuery('')}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        {categories.length > 0 && (
          <div style={{ overflowX: 'auto', padding: '0.75rem 1rem 0', display: 'flex', gap: '0.5rem', scrollbarWidth: 'none' }}>
            <button
              onClick={() => setActiveCategoryId(null)}
              style={{
                flexShrink: 0,
                padding: '0.35rem 1rem',
                borderRadius: 'var(--radius-full)',
                border: '1.5px solid',
                borderColor: activeCategoryId === null ? 'var(--accent-primary)' : 'var(--border-subtle)',
                background: activeCategoryId === null ? 'var(--accent-primary)' : 'var(--bg-input)',
                color: activeCategoryId === null ? '#fff' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-arabic)',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                whiteSpace: 'nowrap',
              }}
            >
              الكل ({items.length})
            </button>
            {categories.map((cat) => {
              const count = items.filter((i) => i.category_id === cat.id).length;
              const active = activeCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategoryId(active ? null : cat.id)}
                  style={{
                    flexShrink: 0,
                    padding: '0.35rem 1rem',
                    borderRadius: 'var(--radius-full)',
                    border: '1.5px solid',
                    borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    background: active ? 'var(--accent-primary)' : 'var(--bg-input)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    fontSize: '0.78rem',
                    fontFamily: 'var(--font-arabic)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Product grid */}
        <div style={{ padding: '0.75rem 1rem 0' }}>
          {loading ? (
            <div className="empty-state">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
              <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.85rem' }}>جاري التحميل...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <div className="empty-state-title">{searchQuery || activeCategoryId ? 'لا توجد نتائج' : 'لا توجد منتجات'}</div>
              <div className="empty-state-text">
                {searchQuery ? 'جرّب البحث بكلمات مختلفة' : activeCategoryId ? 'لا توجد منتجات في هذا القسم' : 'أضف منتجات من صفحة إدارة المنتجات أولاً'}
              </div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
              gap: '0.65rem',
            }}>
              {filteredItems.map((item) => {
                const oi = getOrderItem(item.id);
                return (
                  <div
                    key={item.id}
                    style={{
                      background: oi ? 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(99,102,241,0.05) 100%)' : 'var(--bg-card)',
                      border: `1.5px solid ${oi ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-lg)',
                      padding: '0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      transition: 'all 0.2s ease',
                      cursor: oi ? 'default' : 'pointer',
                      boxShadow: oi ? '0 0 0 1px rgba(99,102,241,0.2)' : 'none',
                    }}
                    onClick={() => !oi && addToOrder(item)}
                  >
                    {/* Item name & category */}
                    <div>
                      <div style={{
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        lineHeight: 1.3,
                        marginBottom: '0.2rem',
                      }}>
                        {item.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{
                          fontSize: '0.65rem',
                          background: 'var(--bg-input)',
                          color: 'var(--text-muted)',
                          padding: '0.1rem 0.4rem',
                          borderRadius: 'var(--radius-full)',
                          border: '1px solid var(--border-subtle)',
                        }}>
                          {item.default_unit}
                        </span>
                        {item.category_name && (
                          <span style={{ fontSize: '0.62rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                            {item.category_name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action: add button or qty stepper */}
                    {oi ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem', marginTop: 'auto' }}>
                        <button
                          style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1.5px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: 'var(--accent-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                          onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, oi.quantity - 1); }}
                        >
                          <Minus size={13} />
                        </button>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-primary)', minWidth: '24px', textAlign: 'center' }}>
                          {oi.quantity}
                        </span>
                        <button
                          style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1.5px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.08)', color: 'var(--accent-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                          onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, oi.quantity + 1); }}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        style={{ marginTop: 'auto', width: '100%', padding: '0.35rem', borderRadius: 'var(--radius-md)', border: '1.5px dashed var(--border-medium)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', transition: 'all 0.18s ease' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-primary)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-primary)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.06)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-medium)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                        onClick={(e) => { e.stopPropagation(); addToOrder(item); }}
                      >
                        <Plus size={13} /> إضافة
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── FLOATING CART DRAWER ───────────────────────── */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'var(--bg-card)',
        borderTop: '2px solid var(--border-medium)',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.3)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Cart toggle header */}
        <button
          onClick={() => setCartOpen((o) => !o)}
          style={{
            width: '100%',
            padding: '0.8rem 1rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            fontFamily: 'var(--font-arabic)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ShoppingCart size={20} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              السلة المشتركة
            </span>
            {orderItems.length > 0 && (
              <span style={{
                background: 'var(--accent-primary)',
                color: '#fff',
                borderRadius: 'var(--radius-full)',
                padding: '0.15rem 0.55rem',
                fontSize: '0.72rem',
                fontWeight: 700,
              }}>
                {orderItems.length} صنف • {totalQty} قطعة
              </span>
            )}
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 8px rgba(16,185,129,0.6)' }} />
          </div>
          {cartOpen ? <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} /> : <ChevronUp size={18} style={{ color: 'var(--text-muted)' }} />}
        </button>

        {/* Cart body – expanded */}
        {cartOpen && (
          <div style={{ padding: '0 1rem 1rem', maxHeight: '360px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {orderItems.length === 0 ? (
              <div className="empty-state" style={{ padding: '1.5rem' }}>
                <div className="empty-state-icon" style={{ width: '40px', height: '40px', fontSize: '1rem' }}>🛒</div>
                <div className="empty-state-title" style={{ fontSize: '0.85rem' }}>السلة فارغة</div>
                <div className="empty-state-text">اضغط على منتج لإضافته</div>
              </div>
            ) : (
              <>
                {/* Items list */}
                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '180px' }}>
                  {orderItems.map((oi) => (
                    <div key={oi.item.id} className="order-item-row">
                      <div className="order-item-qty">
                        <button className="btn btn-ghost btn-icon" style={{ width: '28px', height: '28px', color: 'var(--accent-danger)' }} onClick={() => updateQuantity(oi.item.id, oi.quantity - 1)}>
                          <Minus size={13} />
                        </button>
                        <input
                          className="qty-input"
                          type="number"
                          min="1"
                          value={oi.quantity}
                          onChange={(e) => updateQuantity(oi.item.id, parseInt(e.target.value) || 1)}
                        />
                        <button className="btn btn-ghost btn-icon" style={{ width: '28px', height: '28px', color: 'var(--accent-success)' }} onClick={() => updateQuantity(oi.item.id, oi.quantity + 1)}>
                          <Plus size={13} />
                        </button>
                      </div>
                      <span className="order-item-name">{oi.item.name}</span>
                      <select
                        className="order-unit-select"
                        value={oi.unit}
                        onChange={(e) => {
                          setOrderItems((prev) => prev.map((o) => o.item.id === oi.item.id ? { ...o, unit: e.target.value } : o));
                          supabase.from('active_cart_items').update({ unit: e.target.value }).eq('item_id', oi.item.id).then(() => {});
                        }}
                      >
                        {Array.from(new Set([oi.unit, ...UNIT_OPTIONS])).map((unit) => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                      <button className="btn btn-ghost btn-icon" style={{ width: '28px', height: '28px', color: 'var(--accent-danger)' }} onClick={() => removeFromOrder(oi.item.id)}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <button
                    className="btn btn-primary btn-block btn-lg"
                    onClick={() => saveOrderToHistory(true)}
                    disabled={savingOrder || generatingPdf}
                    style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderColor: '#059669', boxShadow: '0 4px 14px rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  >
                    {savingOrder ? <Loader2 size={18} className="animate-spin" /> : <BookmarkCheck size={20} />}
                    حفظ الطلبية في السجل
                  </button>
                  <button
                    className="btn btn-primary btn-block btn-lg"
                    onClick={generatePDF}
                    disabled={generatingPdf || savingOrder}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  >
                    {generatingPdf ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                    تحميل الطلبية PDF
                  </button>
                  <button
                    className="btn btn-secondary btn-block btn-sm"
                    onClick={() => clearOrder()}
                    style={{ color: 'var(--accent-danger)', borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                  >
                    <Trash2 size={14} /> تفريغ السلة
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
