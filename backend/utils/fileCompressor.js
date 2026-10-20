import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

/**
 * Enterprise Image Compression Utility using Sharp
 * - Automatically resizes images to a maximum width/height (default 1600px)
 * - Auto-rotates images based on EXIF metadata (fixes upside-down / rotated mobile photos)
 * - Converts to optimized WebP format with quality 80
 * - Deletes uncompressed raw files to free up disk space immediately
 * - Leaves PDFs and non-image documents untouched
 */

export const compressSingleFile = async (file, options = {}) => {
  if (!file || !file.path) return file;

  const maxWidth = options.maxWidth || 1600;
  const maxHeight = options.maxHeight || 1600;
  const quality = options.quality || 80;

  const originalPath = file.path;
  const originalSize = file.size || 0;

  // Check if file is an image by mimetype or extension
  const isImage = 
    (file.mimetype && file.mimetype.startsWith('image/')) ||
    /\.(jpe?g|png|webp|avif|bmp|tiff?|jfif)$/i.test(file.originalname || '');

  // PDFs and non-images pass through unchanged
  if (!isImage) {
    return file;
  }

  const parsed = path.parse(originalPath);
  const webpFilename = `${parsed.name}.webp`;
  const webpPath = path.join(parsed.dir, webpFilename);

  try {
    // Handle case where original file already ends with .webp to prevent collision
    const isSamePath = path.resolve(originalPath) === path.resolve(webpPath);

    if (isSamePath) {
      const buffer = await sharp(originalPath)
        .rotate()
        .resize({
          width: maxWidth,
          height: maxHeight,
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality, effort: 4 })
        .toBuffer();

      await fs.writeFile(webpPath, buffer);
    } else {
      await sharp(originalPath)
        .rotate()
        .resize({
          width: maxWidth,
          height: maxHeight,
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality, effort: 4 })
        .toFile(webpPath);

      // Delete raw uncompressed file
      try {
        await fs.unlink(originalPath);
      } catch (unlinkErr) {
        // Ignore if original already removed
      }
    }

    // Get compressed stats
    const stats = await fs.stat(webpPath);
    const compressedSize = stats.size;

    // Update multer file object metadata
    file.filename = webpFilename;
    file.path = webpPath;
    file.size = compressedSize;
    file.mimetype = 'image/webp';

    const savedPercent = originalSize > 0 
      ? Math.round(((originalSize - compressedSize) / originalSize) * 100) 
      : 0;

    console.log(
      `⚡ [Image Compressed]: "${file.originalname || file.filename}" -> ${webpFilename} ` +
      `[${Math.round(originalSize / 1024)} KB -> ${Math.round(compressedSize / 1024)} KB (-${savedPercent}% saved)]`
    );

    return file;
  } catch (error) {
    console.warn(`⚠️ Compression skipped for "${file.originalname || file.filename}":`, error.message);
    // Return original file on compression error to prevent upload failure
    return file;
  }
};

/**
 * Express Middleware to automatically compress all incoming multer uploads
 */
export const compressUploads = async (req, res, next) => {
  try {
    const promises = [];

    // 1. If multer populated req.files as an array (upload.any() or upload.array())
    if (req.files && Array.isArray(req.files)) {
      for (let i = 0; i < req.files.length; i++) {
        promises.push(
          compressSingleFile(req.files[i]).then(updated => {
            req.files[i] = updated;
          })
        );
      }
    } 
    // 2. If multer populated req.files as an object keyed by fieldname (upload.fields())
    else if (req.files && typeof req.files === 'object') {
      Object.keys(req.files).forEach(field => {
        const fieldFiles = req.files[field];
        if (Array.isArray(fieldFiles)) {
          fieldFiles.forEach((file, idx) => {
            promises.push(
              compressSingleFile(file).then(updated => {
                fieldFiles[idx] = updated;
              })
            );
          });
        }
      });
    }

    // 3. If multer populated req.file (upload.single())
    if (req.file) {
      promises.push(
        compressSingleFile(req.file).then(updated => {
          req.file = updated;
        })
      );
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }

    next();
  } catch (err) {
    console.error('Error in compressUploads middleware:', err);
    // Proceed to controller even if compression middleware encounters an unexpected error
    next();
  }
};
