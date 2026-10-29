'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Category } from '@/lib/supabase';
import { useToast } from './Toast';
import { Layers, Plus, Pencil, Trash2, X, Check, Loader2 } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCategoriesChange?: () => void;
}

export default function CategoryManager({ onClose, onCategoriesChange }: Props) {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { loadCategories(); }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('categories').select('*').order('name', { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch { showToast('خطأ في تحميل الأقسام', 'error'); }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('categories').insert({ name });
      if (error) throw error;
      showToast('تم إضافة القسم بنجاح');
      setNewName(''); await loadCategories(); onCategoriesChange?.();
    } catch { showToast('خطأ في إضافة القسم', 'error'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('categories').update({ name }).eq('id', id);
      if (error) throw error;
      showToast('تم تحديث القسم');
      setEditingId(null); await loadCategories(); onCategoriesChange?.();
    } catch { showToast('خطأ في تحديث القسم', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
      showToast('تم حذف القسم');
      await loadCategories(); onCategoriesChange?.();
    } catch { showToast('خطأ في حذف القسم', 'error'); }
    finally { setDeletingId(null); }
  };

  const PRESET_CATEGORIES = [
    'أجبان ومأكولات', 'منظفات', 'مياه ومشروبات', 'مجمدات',
    'مسليات وبسكويت', 'زيوت وسمن', 'معلبات', 'حبوب وأرز', 'منتجات العناية',
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '480px', width: '95%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-title">
          <Layers size={20} style={{ color: 'var(--accent-primary)' }} />
          إدارة الأقسام
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ marginRight: 'auto', marginLeft: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: '1.2rem' }}>
          <div className="form-group" style={{ marginBottom: '0.5rem' }}>
            <label className="form-label">اسم القسم الجديد</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                className="form-input"
                style={{ flex: 1 }}
                type="text"
                placeholder="مثال: منظفات، أجبان..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleAdd}
                disabled={saving || !newName.trim()}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                إضافة
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {PRESET_CATEGORIES
              .filter((p) => !categories.some((c) => c.name === p))
              .map((preset, idx) => (
                <button
                  key={`preset-${idx}`}
                  type="button"
                  onClick={() => setNewName(preset)}
                  style={{
                    background: newName === preset ? 'var(--accent-primary)' : 'var(--bg-input)',
                    color: newName === preset ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-full)',
                    padding: '0.18rem 0.6rem',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-arabic)',
                    transition: 'all 0.18s ease',
                  }}
                >
                  {preset}
                </button>
              ))}
          </div>
        </div>

        <div style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {loading ? (
            <div className="empty-state">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            </div>
          ) : categories.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🗂️</div>
              <div className="empty-state-text">لا توجد أقسام بعد، أضف أول قسم</div>
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat.id} className="item-row" style={{ gap: '0.5rem' }}>
                {editingId === cat.id ? (
                  <>
                    <input
                      className="form-input"
                      style={{ flex: 1, padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdate(cat.id)}
                      autoFocus
                    />
                    <button className="btn btn-ghost btn-icon" style={{ color: 'var(--accent-success)' }} onClick={() => handleUpdate(cat.id)} disabled={saving}>
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    </button>
                    <button className="btn btn-ghost btn-icon" onClick={() => setEditingId(null)}>
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="item-name" style={{ flex: 1 }}>{cat.name}</span>
                    <div className="item-actions">
                      <button className="btn btn-ghost btn-icon" onClick={() => { setEditingId(cat.id); setEditingName(cat.name); }} title="تعديل">
                        <Pencil size={14} />
                      </button>
                      <button className="btn btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }} onClick={() => handleDelete(cat.id)} disabled={deletingId === cat.id} title="حذف">
                        {deletingId === cat.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}
