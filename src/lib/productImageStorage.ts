import { supabase } from './supabase';

/**
 * Client-side High Compression for Product Images
 * Requirements:
 * 1. Resize to max 400x400 pixels (keeping aspect ratio)
 * 2. Convert to WebP format at 75% quality (typical output size: 10 - 30 KB, well under 50KB)
 * 3. Graceful fallback to JPEG at 75% quality if the browser canvas does not support WebP
 */
export async function compressProductImage(file: File): Promise<File> {
  // If not an image or is SVG, return as is
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return file;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        const maxDimension = 400;
        let { width, height } = img;

        // Downscale while preserving aspect ratio
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

        // High quality bicubic smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first (75% quality)
        canvas.toBlob(
          (webpBlob) => {
            if (webpBlob && webpBlob.size > 0) {
              const baseName = file.name.replace(/\.[^/.]+$/, '');
              const compressedFile = new File([webpBlob], `${baseName}.webp`, {
                type: 'image/webp',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              // Fallback to JPEG if WebP blob generation is not supported
              canvas.toBlob(
                (jpegBlob) => {
                  if (jpegBlob) {
                    const baseName = file.name.replace(/\.[^/.]+$/, '');
                    const jpegFile = new File([jpegBlob], `${baseName}.jpg`, {
                      type: 'image/jpeg',
                      lastModified: Date.now(),
                    });
                    resolve(jpegFile);
                  } else {
                    resolve(file);
                  }
                },
                'image/jpeg',
                0.75
              );
            }
          },
          'image/webp',
          0.75
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
 * Converts a File to Base64 data URL (failsafe fallback)
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
 * Uploads a compressed product image to Supabase Storage ('product-images' bucket)
 * Returns the public URL of the uploaded image.
 */
export async function uploadProductImage(
  file: File,
  itemId?: string
): Promise<string> {
  // 1. Client-side compression (< 400x400 WebP 75%)
  const compressed = await compressProductImage(file);
  const fileExt = compressed.type === 'image/webp' ? 'webp' : 'jpg';
  const idPart = itemId ? itemId.replace(/[^a-zA-Z0-9_-]/g, '') : 'new';
  const fileName = `item-${idPart}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

  // 2. Upload to Supabase Storage 'product-images' bucket
  try {
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, compressed, {
        contentType: compressed.type || 'image/webp',
        cacheControl: '31536000', // 1 year cache
        upsert: true,
      });

    if (!uploadError) {
      const { data } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      if (data?.publicUrl) {
        return data.publicUrl;
      }
    } else {
      console.warn('Storage bucket upload failed, trying fallback:', uploadError.message);
    }
  } catch (err) {
    console.warn('Error during product image upload:', err);
  }

  // 3. Failsafe fallback: return as compressed base64 data URL
  // Since it's already compressed to max 400x400 WebP (15-30KB), it can be stored directly
  return await fileToBase64(compressed);
}

/**
 * Deletes an old product image from Supabase Storage if it was hosted in 'product-images'
 */
export async function deleteProductImage(imageUrl?: string | null): Promise<void> {
  if (!imageUrl || !imageUrl.includes('/product-images/')) return;

  try {
    const parts = imageUrl.split('/product-images/');
    if (parts.length > 1) {
      const fileName = parts[1].split('?')[0];
      await supabase.storage.from('product-images').remove([fileName]);
    }
  } catch (err) {
    console.warn('Failed to delete old product image from storage:', err);
  }
}

