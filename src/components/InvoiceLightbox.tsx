'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Trash2,
  RefreshCw,
  FileText,
  Loader2,
  Maximize2,
} from 'lucide-react';
import { toArabicNumeral } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { uploadInvoiceImage } from '@/lib/invoiceStorage';

interface InvoiceLightboxProps {
  urls: string[];
  initialIndex?: number;
  orderId: string;
  orderNumber?: number | string;
  merchantName?: string | null;
  onClose: () => void;
  onUpdateUrls: (newUrls: string[]) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function InvoiceLightbox({
  urls,
  initialIndex = 0,
  orderId,
  orderNumber,
  merchantName,
  onClose,
  onUpdateUrls,
  showToast,
}: InvoiceLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, urls.length - 1))
  );
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [replacing, setReplacing] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Swipe detection for touch devices
  const touchStartXRef = useRef<number | null>(null);

  // Reset zoom & pan when flipping page
  const handlePageChange = useCallback((newIdx: number) => {
    if (newIdx >= 0 && newIdx < urls.length) {
      setCurrentIndex(newIdx);
      setZoomLevel(1);
      setPanOffset({ x: 0, y: 0 });
    }
  }, [urls.length]);

  // Keyboard navigation & zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        // Next page in RTL
        handlePageChange(currentIndex + 1);
      } else if (e.key === 'ArrowRight') {
        // Prev page in RTL
        handlePageChange(currentIndex - 1);
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleResetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, handlePageChange, onClose]);

  // Zoom controls
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(3, Math.round((prev + 0.5) * 10) / 10));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const next = Math.max(1, Math.round((prev - 0.5) * 10) / 10);
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Double click to toggle zoom (1x <-> 2x)
  const handleDoubleClick = () => {
    if (zoomLevel > 1) {
      handleResetZoom();
    } else {
      setZoomLevel(2);
    }
  };

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomLevel <= 1) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch pan & swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
      if (zoomLevel > 1) {
        setIsDragging(true);
        setDragStart({
          x: e.touches[0].clientX - panOffset.x,
          y: e.touches[0].clientY - panOffset.y,
        });
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && zoomLevel > 1 && e.touches.length === 1) {
      setPanOffset({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsDragging(false);
    if (zoomLevel === 1 && touchStartXRef.current !== null && e.changedTouches.length === 1) {
      const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
      // In RTL: swipe left goes to next page, swipe right goes to prev page
      if (deltaX < -50) {
        handlePageChange(currentIndex + 1);
      } else if (deltaX > 50) {
        handlePageChange(currentIndex - 1);
      }
    }
    touchStartXRef.current = null;
  };

  // Delete current page
  const handleDeleteCurrentPage = async () => {
    const pageNumArabic = toArabicNumeral(currentIndex + 1);
    if (!confirm(`هل أنت متأكد من حذف ورقة ${pageNumArabic} من هذه الفاتورة؟`)) {
      return;
    }

    const updated = urls.filter((_, idx) => idx !== currentIndex);

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          invoice_urls: updated,
          invoice_url: updated[0] || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (error) throw error;

      onUpdateUrls(updated);
      showToast(`تم حذف ورقة ${pageNumArabic} بنجاح`, 'info');

      if (updated.length === 0) {
        onClose();
      } else {
        const nextIdx = Math.min(currentIndex, updated.length - 1);
        handlePageChange(nextIdx);
      }
    } catch (err) {
      console.error('Delete invoice page error:', err);
      showToast('خطأ أثناء حذف ورقة الفاتورة', 'error');
    }
  };

  // Replace current page file change
  const handleReplaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReplacing(true);
    showToast(`جاري استبدال ورقة ${toArabicNumeral(currentIndex + 1)}...`, 'info');

    try {
      const newUrl = await uploadInvoiceImage(file, orderId, currentIndex);
      const updated = [...urls];
      updated[currentIndex] = newUrl;

      const { error } = await supabase
        .from('orders')
        .update({
          invoice_urls: updated,
          invoice_url: updated[0] || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (error) throw error;

      onUpdateUrls(updated);
      showToast(`تم استبدال ورقة ${toArabicNumeral(currentIndex + 1)} بنجاح ✓`, 'success');
      handleResetZoom();
    } catch (err) {
      console.error('Replace invoice page error:', err);
      showToast('خطأ أثناء استبدال ورقة الفاتورة', 'error');
    } finally {
      setReplacing(false);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const currentUrl = urls[currentIndex];
  const hasMultiple = urls.length > 1;

  return (
    <div
      className="invoice-lightbox-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(7, 9, 15, 0.94)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn 0.2s ease',
        direction: 'rtl',
      }}
    >
      {/* Hidden file input for replacing current page */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleReplaceFileChange}
      />

      {/* Top Header Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem 1.25rem',
          background: 'rgba(20, 24, 38, 0.85)',
          borderBottom: '1px solid var(--border-medium)',
          color: 'var(--text-primary)',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        {/* Order Title & Page Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              background: 'rgba(99, 102, 241, 0.2)',
              color: 'var(--accent-primary)',
              padding: '0.4rem',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FileText size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
              فاتورة طلب #{orderNumber || orderId.slice(0, 5)}
              {merchantName && (
                <span style={{ fontWeight: 500, color: 'var(--text-secondary)', marginRight: '0.5rem' }}>
                  ({merchantName})
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--accent-secondary)' }}>
              صفحة {toArabicNumeral(currentIndex + 1)} من إجمالي {toArabicNumeral(urls.length)} صفحات
            </div>
          </div>
        </div>

        {/* Zoom Controls & Page Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {/* Zoom controls */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              padding: '0.15rem',
            }}
          >
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 3}
              title="تكبير (+)"
              style={{ padding: '0.35rem 0.5rem', height: '30px' }}
            >
              <ZoomIn size={15} />
            </button>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0 0.4rem',
                color: zoomLevel > 1 ? 'var(--accent-primary)' : 'var(--text-muted)',
                minWidth: '42px',
                textAlign: 'center',
              }}
            >
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1}
              title="تصغير (-)"
              style={{ padding: '0.35rem 0.5rem', height: '30px' }}
            >
              <ZoomOut size={15} />
            </button>
            {zoomLevel > 1 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleResetZoom}
                title="إعادة ضبط (0)"
                style={{ padding: '0.35rem 0.5rem', height: '30px', color: 'var(--accent-secondary)' }}
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>

          {/* Download button */}
          <a
            href={currentUrl}
            download={`invoice-${orderNumber || 'order'}-p${currentIndex + 1}.jpg`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
            title="تحميل هذه الصفحة"
          >
            <Download size={14} />
            <span className="hidden sm:inline">تنزيل</span>
          </a>

          {/* Replace button */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => replaceInputRef.current?.click()}
            disabled={replacing}
            style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
            title="استبدال صورة هذه الصفحة"
          >
            {replacing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            <span className="hidden sm:inline">استبدال</span>
          </button>

          {/* Delete button */}
          <button
            className="btn btn-danger btn-sm"
            onClick={handleDeleteCurrentPage}
            style={{ fontSize: '0.78rem', padding: '0.4rem 0.65rem' }}
            title="حذف هذه الورقة"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">حذف</span>
          </button>

          {/* Close button */}
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            title="إغلاق (Esc)"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: 'var(--radius-full)',
              color: 'var(--text-primary)',
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Image Stage (Supports Zoom, Drag-Pan, Double-click) */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Previous Page Navigation Button (In RTL, prev is to the right) */}
        {hasMultiple && (
          <button
            className="lightbox-nav-btn"
            onClick={(e) => {
              e.stopPropagation();
              handlePageChange(currentIndex - 1);
            }}
            disabled={currentIndex === 0}
            title="الورقة السابقة"
            style={{
              position: 'absolute',
              right: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
              background: 'rgba(20, 24, 38, 0.75)',
              border: '1px solid var(--border-medium)',
              color: currentIndex === 0 ? 'var(--text-muted)' : '#ffffff',
              borderRadius: '50%',
              width: '46px',
              height: '46px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
              opacity: currentIndex === 0 ? 0.35 : 0.9,
              backdropFilter: 'blur(8px)',
              transition: 'all 0.2s ease',
            }}
          >
            <ChevronRight size={28} />
          </button>
        )}

        {/* Current Image */}
        {currentUrl ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
            }}
          >
            <img
              src={currentUrl}
              alt={`ورقة ${currentIndex + 1}`}
              onDoubleClick={handleDoubleClick}
              style={{
                maxWidth: '92%',
                maxHeight: '82vh',
                objectFit: 'contain',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
                transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                pointerEvents: 'auto',
              }}
              draggable={false}
            />
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>لا توجد صورة للعرض</div>
        )}

        {/* Next Page Navigation Button (In RTL, next is to the left) */}
        {hasMultiple && (
          <button
            className="lightbox-nav-btn"
            onClick={(e) => {
              e.stopPropagation();
              handlePageChange(currentIndex + 1);
            }}
            disabled={currentIndex === urls.length - 1}
            title="الورقة التالية"
            style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
              background: 'rgba(20, 24, 38, 0.75)',
              border: '1px solid var(--border-medium)',
              color: currentIndex === urls.length - 1 ? 'var(--text-muted)' : '#ffffff',
              borderRadius: '50%',
              width: '46px',
              height: '46px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: currentIndex === urls.length - 1 ? 'not-allowed' : 'pointer',
              opacity: currentIndex === urls.length - 1 ? 0.35 : 0.9,
              backdropFilter: 'blur(8px)',
              transition: 'all 0.2s ease',
            }}
          >
            <ChevronLeft size={28} />
          </button>
        )}

        {/* Double-tap / Zoom Hint */}
        {zoomLevel === 1 && (
          <div
            style={{
              position: 'absolute',
              bottom: '12px',
              background: 'rgba(12, 14, 20, 0.75)',
              padding: '0.3rem 0.8rem',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
              backdropFilter: 'blur(6px)',
              pointerEvents: 'none',
              border: '1px solid var(--border-subtle)',
            }}
          >
            💡 اضغط مرتين للتكبير • اسحب للتنقل بين الصفحات
          </div>
        )}
      </div>

      {/* Bottom Thumbnail Strip (if more than 1 image) */}
      {hasMultiple && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'rgba(20, 24, 38, 0.92)',
            borderTop: '1px solid var(--border-medium)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.65rem',
            overflowX: 'auto',
          }}
        >
          {urls.map((url, idx) => {
            const isActive = idx === currentIndex;
            return (
              <button
                key={idx}
                onClick={() => handlePageChange(idx)}
                style={{
                  position: 'relative',
                  width: '56px',
                  height: '56px',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                  border: isActive
                    ? '2.5px solid var(--accent-primary)'
                    : '1.5px solid var(--border-medium)',
                  background: '#000000',
                  padding: 0,
                  cursor: 'pointer',
                  opacity: isActive ? 1 : 0.6,
                  transform: isActive ? 'scale(1.08)' : 'scale(1)',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                  boxShadow: isActive ? '0 0 12px rgba(99, 102, 241, 0.5)' : 'none',
                }}
              >
                <img
                  src={url}
                  alt={`ورقة ${idx + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <span
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    insetInline: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    fontSize: '0.62rem',
                    color: '#ffffff',
                    fontWeight: 700,
                    textAlign: 'center',
                    padding: '1px 0',
                  }}
                >
                  ورقة {toArabicNumeral(idx + 1)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

