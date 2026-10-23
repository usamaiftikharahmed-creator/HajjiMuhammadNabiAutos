/**
 * Client-Side Image Compression Utility
 * - Compresses high-resolution camera photos (e.g. 5MB - 15MB) down to ~150KB - 250KB in browser memory
 * - Preserves crystal-clear readability for CNIC numbers, guarantor details, and photos
 * - Non-image files (like PDFs) pass through untouched
 * - Zero external dependencies (uses native HTML5 Canvas)
 */

export const compressImage = (file, options = {}) => {
  return new Promise((resolve) => {
    // If not a file or not an image (e.g., PDF document), return untouched
    if (!file || !(file instanceof File || file instanceof Blob)) {
      return resolve(file);
    }

    // Only compress standard raster photos (JPEG, PNG, WEBP)
    // Non-raster or documents (PDF, DOCX, XLSX, SVG, GIF) must pass through completely untouched!
    const fileType = (file.type || '').toLowerCase();
    const isCompressible = 
      fileType === 'image/jpeg' || 
      fileType === 'image/jpg' || 
      fileType === 'image/png' || 
      fileType === 'image/webp';

    if (!isCompressible) {
      return resolve(file);
    }

    const maxWidth = options.maxWidth || 1600;
    const maxHeight = options.maxHeight || 1600;
    const quality = options.quality !== undefined ? options.quality : 0.8;
    
    // Maintain EXACT uploaded image format (PNG stays PNG, WEBP stays WEBP, JPEG stays JPEG)
    const outputType = options.mimeType || (
      fileType === 'image/png' ? 'image/png' :
      fileType === 'image/webp' ? 'image/webp' :
      'image/jpeg'
    );

    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        try {
          let { width, height } = img;

          // If image is already smaller than max bounds and small size, avoid redundant re-compression
          if (width <= maxWidth && height <= maxHeight && file.size < 500 * 1024) {
            return resolve(file);
          }

          // Scale down proportionally if image exceeds max bounds
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return resolve(file);
          }

          // Draw image smoothly onto canvas
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                return resolve(file);
              }

              // Construct a new File preserving original format & extension
              const originalExt = (file.name ? file.name.split('.').pop().toLowerCase() : '') || 'jpg';
              let cleanExt = 'jpg';
              if (outputType === 'image/png') cleanExt = 'png';
              else if (outputType === 'image/webp') cleanExt = 'webp';
              else if (originalExt === 'jpeg') cleanExt = 'jpeg';
              else cleanExt = 'jpg';

              const baseName = (file.name || 'image').replace(/\.[^/.]+$/, "");
              const fileName = `${baseName}.${cleanExt}`;

              const compressedFile = new File([blob], fileName, {
                type: outputType,
                lastModified: Date.now()
              });

              console.log(
                `⚡ [Client-side Optimized]: "${fileName}" ` +
                `(${Math.round(file.size / 1024)} KB -> ${Math.round(compressedFile.size / 1024)} KB)`
              );

              resolve(compressedFile);
            },
            outputType,
            quality
          );
        } catch (canvasErr) {
          console.warn('Canvas compression error, using original file:', canvasErr);
          resolve(file);
        }
      };

      img.onerror = () => {
        resolve(file);
      };

      img.src = e.target.result;
    };

    reader.onerror = () => {
      resolve(file);
    };

    reader.readAsDataURL(file);
  });
};

/**
 * Batch compress an array of files
 */
export const compressMultipleFiles = async (files, options = {}) => {
  if (!Array.isArray(files)) return [];
  return await Promise.all(files.map(f => compressImage(f, options)));
};
