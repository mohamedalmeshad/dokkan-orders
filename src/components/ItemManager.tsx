'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, type Item, type Category } from '@/lib/supabase';
import { UNIT_OPTIONS } from '@/lib/constants';
import { uploadProductImage, compressProductImage } from '@/lib/productImageStorage';
import { useToast } from './Toast';
import CategoryManager from './CategoryManager';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Package,
  X,
  Check,
  Loader2,
  Layers,
  Camera,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';

export default function ItemManager() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState<string>(UNIT_OPTIONS[0]);
  const [formCategoryId, setFormCategoryId] = useState<string>('');
  const [formCostPrice, setFormCostPrice] = useState<string>('');
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [compressingImage, setCompressingImage] = useState(false);
  const [compressedSizeInfo, setCompressedSizeInfo] = useState<string>('');
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load items and categories
  useEffect(() => {
    loadItems();
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const { data } = await supabase.from('categories').select('*').order('name', { ascending: true });
      setCategories(data || []);
    } catch {
      // silent
    }
  };

  const loadItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*, categories(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = (data || []).map((row: any) => ({
        ...row,
        category_name: row.categories?.name ?? null,
      }));
      setItems(mapped);
    } catch {
      showToast('خطأ في تحميل المنتجات', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.trim().toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.default_unit.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  // Handle client-side image selection & compression
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompressingImage(true);
    try {
      const origKb = Math.round(file.size / 1024);
      // High-efficiency client-side WebP compression (max 400x400 @ 75% quality)
      const compressed = await compressProductImage(file);
      const compKb = Math.round(compressed.size / 1024);

      setSelectedImageFile(compressed);
      setImagePreviewUrl(URL.createObjectURL(compressed));
      setCompressedSizeInfo(`تم الضغط: ${compKb} ك.ب (توفير ${Math.max(0, origKb - compKb)} ك.ب) ✨`);
    } catch (err) {
      console.warn('Image compression failed:', err);
      showToast('تعذر ضغط الصورة، سيتم استخدامها كما هي', 'info');
      setSelectedImageFile(file);
      setImagePreviewUrl(URL.createObjectURL(file));
    } finally {
      setCompressingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImageFile(null);
    setImagePreviewUrl(null);
    setFormImageUrl(null);
    setCompressedSizeInfo('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Open modal for add/edit
  const openAddModal = () => {
    setEditingItem(null);
    setFormName('');
    setFormUnit(UNIT_OPTIONS[0]);
    setFormCategoryId('');
    setFormCostPrice('');
    setFormImageUrl(null);
    setSelectedImageFile(null);
    setImagePreviewUrl(null);
    setCompressedSizeInfo('');
    setIsCustomUnit(false);
    setShowModal(true);
  };

  const openEditModal = (item: Item) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormUnit(item.default_unit);
    setFormCategoryId(item.category_id || '');
    setFormCostPrice(item.cost_price != null ? String(item.cost_price) : '');
    setFormImageUrl(item.image_url || null);
    setSelectedImageFile(null);
    setImagePreviewUrl(item.image_url || null);
    setCompressedSizeInfo(item.image_url ? 'صورة المنتج الحالية' : '');
    const isStandard = (UNIT_OPTIONS as readonly string[]).includes(item.default_unit);
    setIsCustomUnit(!isStandard);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setFormName('');
    setFormUnit(UNIT_OPTIONS[0]);
    setFormCategoryId('');
    setFormCostPrice('');
    setFormImageUrl(null);
    setSelectedImageFile(null);
    setImagePreviewUrl(null);
    setCompressedSizeInfo('');
    setIsCustomUnit(false);
  };

  // Save item (add or update)
  const handleSave = async () => {
    if (!formName.trim()) {
      showToast('يرجى إدخال اسم المنتج', 'error');
      return;
    }

    const finalUnit = formUnit.trim() || 'قطعة';
    const categoryId = formCategoryId || null;
    const parsedCostPrice = formCostPrice.trim() !== '' ? parseFloat(formCostPrice.trim()) : null;

    setSaving(true);
    try {
      // 1. Upload compressed image if user selected a new file
      let finalImageUrl = formImageUrl;
      if (selectedImageFile) {
        showToast('جاري رفع صورة المنتج المضغوطة...', 'info');
        finalImageUrl = await uploadProductImage(selectedImageFile, editingItem?.id);
      }

      if (editingItem) {
        const { error } = await supabase
          .from('items')
          .update({
            name: formName.trim(),
            default_unit: finalUnit,
            category_id: categoryId,
            cost_price: parsedCostPrice,
            image_url: finalImageUrl,
          })
          .eq('id', editingItem.id);
        if (error) throw error;
        showToast('تم تحديث المنتج بنجاح');
      } else {
        const { error } = await supabase
          .from('items')
          .insert({
            name: formName.trim(),
            default_unit: finalUnit,
            category_id: categoryId,
            cost_price: parsedCostPrice,
            image_url: finalImageUrl,
          });
        if (error) throw error;
        showToast('تم إضافة المنتج بنجاح');
      }
      await loadItems();
      closeModal();
    } catch {
      showToast('حدث خطأ أثناء الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete item
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from('items').delete().eq('id', id);
      if (error) throw error;
      showToast('تم حذف المنتج');
      await loadItems();
    } catch {
      showToast('خطأ في حذف المنتج', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {/* Category Manager Modal */}
      {showCategoryManager && (
        <CategoryManager
          onClose={() => setShowCategoryManager(false)}
          onCategoriesChange={() => { loadCategories(); loadItems(); }}
        />
      )}

      {/* Header */}
      <div className="card-header">
        <div className="card-title">
          <div className="card-title-icon">
            <Package size={18} />
          </div>
          إدارة المنتجات
          <span className="badge badge-primary">{items.length}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCategoryManager(true)}>
            <Layers size={15} />
            الأقسام
          </button>
          <button className="btn btn-primary btn-sm" onClick={openAddModal}>
            <Plus size={16} />
            إضافة منتج
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="search-container" style={{ marginBottom: '1rem' }}>
        <Search size={18} className="search-icon" />
        <input
          className="search-input"
          type="text"
          placeholder="ابحث عن منتج..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Items list */}
      {loading ? (
        <div className="empty-state">
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
            جاري التحميل...
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">
            {searchQuery ? 'لا توجد نتائج' : 'لا توجد منتجات'}
          </div>
          <div className="empty-state-text">
            {searchQuery
              ? 'جرّب البحث بكلمات مختلفة'
              : 'أضف أول منتج للبدء في إدارة المخزون'}
          </div>
        </div>
      ) : (
        <div className="item-grid">
          {filteredItems.map((item) => (
            <div key={item.id} className="item-row">
              {/* Product Thumbnail (Crisp Rounded) */}
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  flexShrink: 0,
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-medium)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                  />
                ) : (
                  <Package size={22} style={{ color: 'var(--text-muted)', opacity: 0.7 }} />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, minWidth: 0 }}>
                <span className="item-name">{item.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {item.category_name && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', fontWeight: 500 }}>
                      🗂️ {item.category_name}
                    </span>
                  )}
                  {item.cost_price != null && (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        background: 'rgba(52, 211, 153, 0.12)',
                        color: '#34d399',
                        padding: '0.1rem 0.45rem',
                        borderRadius: 'var(--radius-full)',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.2rem',
                      }}
                      title="سعر الشراء للمتجر (خاص بك فقط)"
                    >
                      💰 {item.cost_price} ج.م
                    </span>
                  )}
                </div>
              </div>
              <span className="item-unit-badge">{item.default_unit}</span>
              <div className="item-actions">
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => openEditModal(item)}
                  title="تعديل"
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  title="حذف"
                  style={{ color: 'var(--accent-danger)' }}
                >
                  {deletingId === item.id ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {editingItem ? (
                <>
                  <Pencil size={20} style={{ color: 'var(--accent-primary)' }} />
                  تعديل المنتج
                </>
              ) : (
                <>
                  <Plus size={20} style={{ color: 'var(--accent-success)' }} />
                  إضافة منتج جديد
                </>
              )}
              <button
                className="btn btn-ghost btn-icon"
                onClick={closeModal}
                style={{ marginRight: 'auto', marginLeft: 0 }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Camera size={15} style={{ color: 'var(--accent-primary)' }} />
                  <span>صورة المنتج (ضغط تلقائي خفيف جداً WebP ⚡)</span>
                </span>
                <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>
                  أقل من 40 ك.ب لتوفير المساحة
                </span>
              </label>

              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageSelect}
              />

              {imagePreviewUrl ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    padding: '0.65rem 0.85rem',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: '1.5px solid var(--accent-primary)',
                      position: 'relative',
                      background: 'var(--bg-card)',
                    }}
                  >
                    <img
                      src={imagePreviewUrl}
                      alt="معاينة المنتج"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {compressingImage && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Loader2 size={18} className="animate-spin" style={{ color: '#fff' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1, minWidth: 0 }}>
                    {compressedSizeInfo && (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: '#34d399',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        <Sparkles size={12} /> {compressedSizeInfo}
                      </span>
                    )}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={compressingImage}
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.65rem' }}
                      >
                        تغيير الصورة
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={handleRemoveImage}
                        disabled={compressingImage}
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.65rem', color: 'var(--accent-danger)' }}
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '1.5px dashed var(--border-medium)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.9rem 1rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: 'rgba(99, 102, 241, 0.03)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  {compressingImage ? (
                    <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)' }}>
                      <Camera size={18} />
                      <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                        اضغط لالتقاط أو اختيار صورة للمنتج
                      </span>
                    </div>
                  )}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    يتم تحويلها لـ WebP مضغوطة أوتوماتيكياً (400×400 بكسل) لتوفير الباقة المجانية
                  </span>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">اسم المنتج</label>
              <input
                className="form-input"
                type="text"
                placeholder="مثال: سكر ناعم ١ كيلو"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>

            {/* Category selector */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>القسم</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', color: 'var(--accent-primary)' }}
                  onClick={() => setShowCategoryManager(true)}
                >
                  <Layers size={12} /> إدارة الأقسام
                </button>
              </label>
              <select
                className="form-select"
                value={formCategoryId}
                onChange={(e) => setFormCategoryId(e.target.value)}
              >
                <option value="">— بدون قسم —</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Cost price input */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>سعر الشراء / التكلفة للوحدة (اختياري - خاص بالمتجر 🔒)</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>لن يظهر في ملف PDF للمورد</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00 (مثال: 45.5)"
                  value={formCostPrice}
                  onChange={(e) => setFormCostPrice(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  ج.م
                </span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">الوحدة الافتراضية</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    className="form-select"
                    style={{ flex: 1 }}
                    value={isCustomUnit ? '__custom__' : formUnit}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomUnit(true);
                      } else {
                        setIsCustomUnit(false);
                        setFormUnit(e.target.value);
                      }
                    }}
                  >
                    {UNIT_OPTIONS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                    <option value="__custom__">✏️ وحدة أخرى (كتابة يدوية مخصصة)...</option>
                  </select>
                </div>

                {/* Custom Unit Text Input */}
                {isCustomUnit && (
                  <div>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="اكتب اسم الوحدة المخصصة (مثال: برميل، صندوق، دستة)..."
                      value={formUnit}
                      onChange={(e) => setFormUnit(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    />
                  </div>
                )}

                {/* Quick Unit Suggestion Pills */}
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                    وحدات سريعة:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {UNIT_OPTIONS.map((unit, idx) => (
                      <button
                        key={`pill-${idx}`}
                        type="button"
                        onClick={() => {
                          setFormUnit(unit);
                          setIsCustomUnit(false);
                        }}
                        style={{
                          background: formUnit === unit && !isCustomUnit ? 'var(--accent-primary)' : 'var(--bg-input)',
                          color: formUnit === unit && !isCustomUnit ? '#ffffff' : 'var(--text-secondary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-full)',
                          padding: '0.2rem 0.65rem',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-arabic)',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {unit}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomUnit(true);
                        setFormUnit('');
                      }}
                      style={{
                        background: isCustomUnit ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                        color: isCustomUnit ? 'var(--accent-primary)' : 'var(--text-accent)',
                        border: '1px dashed var(--border-medium)',
                        borderRadius: 'var(--radius-full)',
                        padding: '0.2rem 0.65rem',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-arabic)',
                      }}
                    >
                      + كتابة وحدة مخصصة
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                {editingItem ? 'حفظ التعديلات' : 'إضافة المنتج'}
              </button>
              <button className="btn btn-secondary" onClick={closeModal}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
