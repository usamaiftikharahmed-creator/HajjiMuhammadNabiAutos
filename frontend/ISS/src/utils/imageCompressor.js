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

    const isImage = file.type && file.type.startsWith('image/');
    if (!isImage) {
      return resolve(file);
    }

    const maxWidth = options.maxWidth || 1600;
    const maxHeight = options.maxHeight || 1600;
    const quality = options.quality !== undefined ? options.quality : 0.8;
    const outputType = options.mimeType || 'image/jpeg';

    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        try {
          let { width, height } = img;

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

              // Construct a new File preserving original name
              const fileName = file.name || 'compressed_image.jpg';
              const compressedFile = new File([blob], fileName, {
                type: outputType,
                lastModified: Date.now()
              });

              console.log(
                `⚡ [Client-side Compressed]: "${fileName}" ` +
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
