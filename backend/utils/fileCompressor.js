import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

/**
 * Enterprise Image Optimizer
 * - Preserves original formats: JPG remains JPG, PNG remains PNG, PDF remains PDF!
 * - Never converts files to .webp so Windows and mobile devices open them directly in Photo Viewer.
 * - Auto-rotates mobile photos based on EXIF orientation.
 * - Downscales ultra-large camera photos (>2200px) cleanly while keeping crisp text readability.
 */
export const compressSingleFile = async (file, options = {}) => {
  if (!file || !file.path) return file;

  const maxWidth = options.maxWidth || 2200;
  const maxHeight = options.maxHeight || 2200;
  const quality = options.quality || 85;

  const originalPath = file.path;
  const rawExt = path.extname(file.originalname || file.filename || '').toLowerCase();
  
  const isJpg = rawExt === '.jpg' || rawExt === '.jpeg' || rawExt === '.jfif';
  const isPng = rawExt === '.png';
  const isWebp = rawExt === '.webp';

  // Only optimize JPEG, PNG, and WebP; leave PDFs, Word docs, and other formats completely untouched!
  if (!isJpg && !isPng && !isWebp) {
    return file;
  }

  const tempOptimizedPath = `${originalPath}.opt`;

  try {
    const pipeline = sharp(originalPath)
      .rotate()
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: 'inside',
        withoutEnlargement: true
      });

    if (isPng) {
      await pipeline.png({ compressionLevel: 8 }).toFile(tempOptimizedPath);
      file.mimetype = 'image/png';
    } else if (isWebp) {
      await pipeline.webp({ quality }).toFile(tempOptimizedPath);
      file.mimetype = 'image/webp';
    } else {
      await pipeline.jpeg({ quality, mozjpeg: true }).toFile(tempOptimizedPath);
      file.mimetype = 'image/jpeg';
    }

    // Replace original file with optimized version preserving same path & extension
    await fs.unlink(originalPath);
    await fs.rename(tempOptimizedPath, originalPath);

    const stats = await fs.stat(originalPath);
    file.size = stats.size;

    return file;
  } catch (error) {
    console.warn(`Optimization notice for "${file.originalname || file.filename}":`, error.message);
    try {
      await fs.unlink(tempOptimizedPath).catch(() => {});
    } catch (e) {}
    return file;
  }
};

/**
 * Express Middleware to automatically optimize incoming uploads
 */
export const compressUploads = async (req, res, next) => {
  try {
    const promises = [];

    if (req.files && Array.isArray(req.files)) {
      for (let i = 0; i < req.files.length; i++) {
        promises.push(
          compressSingleFile(req.files[i]).then(updated => {
            req.files[i] = updated;
          })
        );
      }
    } else if (req.files && typeof req.files === 'object') {
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
    next();
  }
};
