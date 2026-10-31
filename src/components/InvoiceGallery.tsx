'use client';

import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  Plus,
  Eye,
  Trash2,
  RefreshCw,
  Loader2,
  FileCheck2,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
} from 'lucide-react';
import { supabase, type OrderRecord, getOrderInvoiceUrls } from '@/lib/supabase';
import { uploadInvoiceImage } from '@/lib/invoiceStorage';
import { toArabicNumeral } from '@/lib/constants';
import InvoiceLightbox from './InvoiceLightbox';

interface InvoiceGalleryProps {
  order: OrderRecord;
  onUpdateOrder: (updatedOrder: OrderRecord) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function InvoiceGallery({
  order,
  onUpdateOrder,
  showToast,
}: InvoiceGalleryProps) {
  const urls = getOrderInvoiceUrls(order);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string>('');

  // Refs for file inputs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const targetReplaceIndexRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sync updated URLs to Supabase & local state
  const syncUrlsToDatabase = async (newUrls: string[]) => {
    const updatedOrder: OrderRecord = {
      ...order,
      invoice_urls: newUrls,
      invoice_url: newUrls[0] || null,
      updated_at: new Date().toISOString(),
    };

    onUpdateOrder(updatedOrder);

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          invoice_urls: newUrls,
          invoice_url: newUrls[0] || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (error) {
        console.error('Failed to sync invoice URLs:', error);
        showToast('خطأ أثناء حفظ روابط الفواتير', 'error');
      }
    } catch (err) {
      console.error('Sync error:', err);
      showToast('خطأ في الاتصال بقاعدة البيانات', 'error');
    }
  };

  // Upload multiple files (from camera or gallery)
  const handleUploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) {
      showToast('يرجى اختيار ملفات صور صالحة', 'error');
      return;
    }

    setUploading(true);
    const startIndex = urls.length;
    const uploadedUrls: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const pageNum = startIndex + i + 1;
        setProgressMsg(
          files.length > 1
            ? `جاري رفع ورقة ${toArabicNumeral(pageNum)} (${toArabicNumeral(i + 1)} من ${toArabicNumeral(files.length)})...`
            : `جاري رفع ورقة ${toArabicNumeral(pageNum)}...`
        );

        const uploadedUrl = await uploadInvoiceImage(file, order.id, startIndex + i);
        uploadedUrls.push(uploadedUrl);
      }

      const combinedUrls = [...urls, ...uploadedUrls];
      await syncUrlsToDatabase(combinedUrls);

      showToast(
        files.length > 1
          ? `تم رفع ${toArabicNumeral(files.length)} صفحات بنجاح ✓`
          : `تم حفظ ورقة ${toArabicNumeral(startIndex + 1)} بنجاح ✓`,
        'success'
      );

      // Scroll to the end of thumbnails
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({
            left: -scrollContainerRef.current.scrollWidth,
            behavior: 'smooth',
          });
        }
      }, 100);
    } catch (err) {
      console.error('Invoice upload failed:', err);
      showToast('حدث خطأ أثناء رفع صورة الفاتورة', 'error');
    } finally {
      setUploading(false);
      setProgressMsg('');
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (multiFileInputRef.current) multiFileInputRef.current.value = '';
    }
  };

  // Replace a specific page
  const handleReplacePage = (index: number) => {
    targetReplaceIndexRef.current = index;
    if (replaceInputRef.current) {
      replaceInputRef.current.value = '';
      replaceInputRef.current.click();
    }
  };

  const handleReplaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const index = targetReplaceIndexRef.current;
    if (!file || index === null || index < 0 || index >= urls.length) return;

    setUploading(true);
    setProgressMsg(`جاري استبدال ورقة ${toArabicNumeral(index + 1)}...`);

    try {
      const newUrl = await uploadInvoiceImage(file, order.id, index);
      const updatedUrls = [...urls];
      updatedUrls[index] = newUrl;

      await syncUrlsToDatabase(updatedUrls);
      showToast(`تم استبدال ورقة ${toArabicNumeral(index + 1)} بنجاح ✓`, 'success');
    } catch (err) {
      console.error('Replace error:', err);
      showToast('خطأ أثناء استبدال الصورة', 'error');
    } finally {
      setUploading(false);
      setProgressMsg('');
      targetReplaceIndexRef.current = null;
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  // Delete an individual page
  const handleDeletePage = async (index: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const pageNumArabic = toArabicNumeral(index + 1);
    if (!confirm(`هل أنت متأكد من حذف ورقة ${pageNumArabic} من فاتورة هذه الطلبية؟`)) {
      return;
    }

    const updatedUrls = urls.filter((_, idx) => idx !== index);
    await syncUrlsToDatabase(updatedUrls);
    showToast(`تم حذف ورقة ${pageNumArabic}`, 'info');

    if (lightboxIndex !== null) {
      if (updatedUrls.length === 0) {
        setLightboxIndex(null);
      } else if (lightboxIndex >= updatedUrls.length) {
        setLightboxIndex(updatedUrls.length - 1);
      }
    }
  };

  // Drag and drop handlers
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      className="invoice-gallery-container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        marginTop: '0.85rem',
        padding: '0.75rem',
        borderRadius: 'var(--radius-lg)',
        background: isDragOver
          ? 'rgba(99, 102, 241, 0.08)'
          : 'var(--bg-secondary)',
        border: isDragOver
          ? '1.5px dashed var(--accent-primary)'
          : '1px solid var(--border-medium)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Hidden File Inputs */}
      {/* 1. Camera Input (Single or consecutive snaps) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
      />

      {/* 2. Multiple File Uploader (Gallery / Multi-files) */}
      <input
        ref={multiFileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
      />

      {/* 3. Single Replace Input */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleReplaceFileChange}
      />

      {/* Uploading Spinner Overlay */}
      {uploading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            padding: '0.85rem',
            background: 'rgba(99, 102, 241, 0.12)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            marginBottom: '0.75rem',
            color: 'var(--text-accent)',
            fontSize: '0.82rem',
            fontWeight: 700,
          }}
        >
          <Loader2 size={18} className="animate-spin" />
          <span>{progressMsg || 'جاري معالجة ورفع صورة الفاتورة...'}</span>
        </div>
      )}

      {/* Case A: No Invoice Pages Uploaded Yet */}
      {urls.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem 0.75rem',
            textAlign: 'center',
            border: '1.5px dashed rgba(52, 211, 153, 0.35)',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(52, 211, 153, 0.04)',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'rgba(52, 211, 153, 0.12)',
              color: '#34d399',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '0.5rem',
            }}
          >
            <Camera size={22} />
          </div>

          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
            توثيق فواتير الاستلام الورقية
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '380px', marginBottom: '0.85rem' }}>
            يمكنك التقاط وتثبيت أكثر من ورقة للفاتورة الواحدة لتوثيق أسعار البضاعة المستلمة
          </p>

          {/* Action Buttons for Mobile & Desktop */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              style={{
                fontSize: '0.8rem',
                padding: '0.45rem 0.9rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              }}
            >
              <Camera size={15} />
              <span>التقاط بالكاميرا</span>
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => multiFileInputRef.current?.click()}
              disabled={uploading}
              style={{
                fontSize: '0.8rem',
                padding: '0.45rem 0.9rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Upload size={15} />
              <span>اختيار صور متعددة</span>
            </button>
          </div>
        </div>
      ) : (
        /* Case B: Gallery with Uploaded Invoice Pages */
        <div>
          {/* Header Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.65rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <FileCheck2 size={16} style={{ color: '#34d399' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                أوراق الفاتورة المستلمة
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(52, 211, 153, 0.15)',
                  color: '#34d399',
                  fontWeight: 700,
                }}
              >
                {toArabicNumeral(urls.length)} {urls.length === 1 ? 'ورقة' : 'صفحات'}
              </span>
            </div>

            {/* Quick Add Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                title="التقاط ورقة جديدة بالكاميرا"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.3rem 0.6rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                <Camera size={13} style={{ color: '#34d399' }} />
                <span>تصوير ورقة</span>
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => multiFileInputRef.current?.click()}
                disabled={uploading}
                title="إضافة صور من الاستوديو"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.3rem 0.6rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                <Plus size={13} />
                <span>إضافة من المعرض</span>
              </button>
            </div>
          </div>

          {/* Horizontal Scrollable Thumbnails Ribbon */}
          <div
            ref={scrollContainerRef}
            className="invoice-gallery-scroll"
            style={{
              display: 'flex',
              gap: '0.65rem',
              overflowX: 'auto',
              paddingBottom: '0.4rem',
              alignItems: 'stretch',
              scrollbarWidth: 'thin',
              scrollSnapType: 'x mandatory',
            }}
          >
            {urls.map((url, index) => {
              const pageNumArabic = toArabicNumeral(index + 1);
              return (
                <div
                  key={index}
                  className="invoice-thumb-card"
                  onClick={() => setLightboxIndex(index)}
                  style={{
                    flex: '0 0 110px',
                    width: '110px',
                    height: '135px',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    position: 'relative',
                    border: '1px solid var(--border-medium)',
                    background: '#090b10',
                    cursor: 'pointer',
                    scrollSnapAlign: 'start',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Thumbnail Image */}
                  <img
                    src={url}
                    alt={`ورقة ${index + 1}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />

                  {/* Page Badge (Top-Right) */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: 'rgba(12, 14, 20, 0.85)',
                      backdropFilter: 'blur(4px)',
                      color: '#ffffff',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.45rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                    }}
                  >
                    ورقة {pageNumArabic}
                  </div>

                  {/* Actions Overlay (Bottom) */}
                  <div
                    className="thumb-actions-bar"
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      insetInline: 0,
                      background: 'linear-gradient(to top, rgba(9, 11, 16, 0.95) 0%, rgba(9, 11, 16, 0.6) 80%, transparent 100%)',
                      padding: '0.35rem 0.3rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-around',
                      gap: '0.2rem',
                    }}
                  >
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxIndex(index);
                      }}
                      title="تكبير ومعاينة"
                      style={{
                        width: '26px',
                        height: '26px',
                        color: 'var(--accent-secondary)',
                        padding: 0,
                      }}
                    >
                      <Eye size={13} />
                    </button>

                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReplacePage(index);
                      }}
                      title="استبدال هذه الورقة"
                      style={{
                        width: '26px',
                        height: '26px',
                        color: 'var(--text-muted)',
                        padding: 0,
                      }}
                    >
                      <RefreshCw size={12} />
                    </button>

                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={(e) => handleDeletePage(index, e)}
                      title="حذف هذه الورقة"
                      style={{
                        width: '26px',
                        height: '26px',
                        color: 'var(--accent-danger)',
                        padding: 0,
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* "+ إضافة ورقة" Tile at End of List */}
            <div
              onClick={() => cameraInputRef.current?.click()}
              style={{
                flex: '0 0 95px',
                width: '95px',
                height: '135px',
                borderRadius: 'var(--radius-md)',
                border: '1.5px dashed rgba(99, 102, 241, 0.4)',
                background: 'rgba(99, 102, 241, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                cursor: 'pointer',
                color: 'var(--text-accent)',
                transition: 'all 0.2s ease',
                scrollSnapAlign: 'start',
              }}
              title="التقاط أو إضافة ورقة جديدة"
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Plus size={18} />
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                إضافة ورقة
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal with Zoom & Arrow Flip Navigation */}
      {lightboxIndex !== null && (
        <InvoiceLightbox
          urls={urls}
          initialIndex={lightboxIndex}
          orderId={order.id}
          orderNumber={order.order_number}
          merchantName={order.merchant_name}
          onClose={() => setLightboxIndex(null)}
          onUpdateUrls={(newUrls) => syncUrlsToDatabase(newUrls)}
          showToast={showToast}
        />
      )}
    </div>
  );
}

