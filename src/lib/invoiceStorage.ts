import { supabase } from './supabase';

/**
 * Compresses an image file before upload (max 1920px width/height, 85% JPEG quality)
 * to keep invoice text sharp and legible while reducing file size from 5-10MB to ~300-500KB.
 */
export async function compressImage(file: File): Promise<File> {
  // If not a standard image or already an SVG/GIF, return as is
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const maxDimension = 1920;
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(file);
          return;
        }

        // Draw image with smoothing enabled
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              // If compression didn't reduce size, keep original
              resolve(file);
            } else {
              const compressedFile = new File(
                [blob],
                file.name.replace(/\.[^/.]+$/, '') + '.jpg',
                {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                }
              );
              resolve(compressedFile);
            }
          },
          'image/jpeg',
          0.85
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };

      img.src = objectUrl;
    } catch {
      resolve(file);
    }
  });
}

/**
 * Converts a File to Base64 data URL (failsafe fallback if Supabase storage is unconfigured)
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Uploads a single invoice image to Supabase Storage ('invoice-photos' with fallback to 'invoices' and Base64)
 */
export async function uploadInvoiceImage(
  file: File,
  orderId: string,
  pageIndex: number
): Promise<string> {
  const compressed = await compressImage(file);
  const fileExt = compressed.name.split('.').pop() || 'jpg';
  const fileName = `order-${orderId}-p${pageIndex + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

  // 1. Try 'invoice-photos' bucket first
  try {
    const { error: primaryError } = await supabase.storage
      .from('invoice-photos')
      .upload(fileName, compressed, {
        cacheControl: '3600',
        upsert: true,
      });

    if (!primaryError) {
      const { data } = supabase.storage.from('invoice-photos').getPublicUrl(fileName);
      if (data?.publicUrl) return data.publicUrl;
    }
  } catch (err) {
    console.warn('Primary bucket invoice-photos upload failed, trying fallback:', err);
  }

  // 2. Try legacy 'invoices' bucket fallback
  try {
    const { error: fallbackError } = await supabase.storage
      .from('invoices')
      .upload(fileName, compressed, {
        cacheControl: '3600',
        upsert: true,
      });

    if (!fallbackError) {
      const { data } = supabase.storage.from('invoices').getPublicUrl(fileName);
      if (data?.publicUrl) return data.publicUrl;
    }
  } catch (err) {
    console.warn('Fallback bucket invoices upload failed:', err);
  }

  // 3. Failsafe: convert to Data URL
  return await fileToBase64(compressed);
}

