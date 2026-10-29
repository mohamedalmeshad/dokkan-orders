'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase, type Item } from '@/lib/supabase';
import { UNIT_OPTIONS } from '@/lib/constants';
import { useToast } from './Toast';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Package,
  X,
  Check,
  Loader2,
} from 'lucide-react';

export default function ItemManager() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState<string>(UNIT_OPTIONS[0]);
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load items
  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
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

  // Open modal for add/edit
  const openAddModal = () => {
    setEditingItem(null);
    setFormName('');
    setFormUnit(UNIT_OPTIONS[0]);
    setIsCustomUnit(false);
    setShowModal(true);
  };

  const openEditModal = (item: Item) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormUnit(item.default_unit);
    const isStandard = (UNIT_OPTIONS as readonly string[]).includes(item.default_unit);
    setIsCustomUnit(!isStandard);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setFormName('');
    setFormUnit(UNIT_OPTIONS[0]);
    setIsCustomUnit(false);
  };

  // Save item (add or update)
  const handleSave = async () => {
    if (!formName.trim()) {
      showToast('يرجى إدخال اسم المنتج', 'error');
      return;
    }

    const finalUnit = formUnit.trim() || 'قطعة';

    setSaving(true);
    try {
      if (editingItem) {
        const { error } = await supabase
          .from('items')
          .update({ name: formName.trim(), default_unit: finalUnit })
          .eq('id', editingItem.id);
        if (error) throw error;
        showToast('تم تحديث المنتج بنجاح');
      } else {
        const { error } = await supabase
          .from('items')
          .insert({ name: formName.trim(), default_unit: finalUnit });
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
      {/* Header */}
      <div className="card-header">
        <div className="card-title">
          <div className="card-title-icon">
            <Package size={18} />
          </div>
          إدارة المنتجات
          <span className="badge badge-primary">{items.length}</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAddModal}>
          <Plus size={16} />
          إضافة منتج
        </button>
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
              <span className="item-name">{item.name}</span>
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
                    {['شيكارة', 'كرتونة', 'باكتة', 'علبة', 'كيلو', 'لفة', 'صفيحة', 'قالب', 'كيس', 'قطعة'].map((unit) => (
                      <button
                        key={unit}
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
