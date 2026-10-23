import fs from 'fs';
import path from 'path';
import os from 'os';
import multer from 'multer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = Boolean(process.env.VERCEL);
const tmpUploadsDir = path.join(os.tmpdir(), 'uploads');

// 1. Primary uploads directory
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');
export const MAIN_UPLOADS_DIR = isVercel 
  ? tmpUploadsDir 
  : path.join(WORKSPACE_ROOT, 'Haji Muhammad Nabi Autos', 'uploads');

// 2. Secondary directory: backend/uploads
export const BACKEND_UPLOADS_DIR = isVercel
  ? tmpUploadsDir
  : path.join(path.resolve(__dirname, '..'), 'uploads');

// 3. Workspace root uploads directory: <root>/uploads
export const ROOT_UPLOADS_DIR = isVercel
  ? tmpUploadsDir
  : path.join(WORKSPACE_ROOT, 'uploads');

// 4. Google Drive mirror directory: G:\My Drive\Haji Muhammad Nabi Autos\uploads
export const GDRIVE_UPLOADS_DIR = 'G:\\My Drive\\Haji Muhammad Nabi Autos\\uploads';

// Ensure all upload directories exist
export const ensureUploadDirs = () => {
  const dirs = [
    MAIN_UPLOADS_DIR,
    path.join(MAIN_UPLOADS_DIR, 'temp_backups'),
    BACKEND_UPLOADS_DIR,
    path.join(BACKEND_UPLOADS_DIR, 'temp_backups'),
    ROOT_UPLOADS_DIR,
    tmpUploadsDir
  ];

  dirs.forEach(d => {
    try {
      if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
      }
    } catch (e) {}
  });

  // If Google Drive 200GB drive is mounted, ensure cloud uploads folder exists
  if (!isVercel && fs.existsSync('G:\\My Drive')) {
    try {
      if (!fs.existsSync(GDRIVE_UPLOADS_DIR)) {
        fs.mkdirSync(GDRIVE_UPLOADS_DIR, { recursive: true });
      }
    } catch (e) {}
  }
};

// Initial creation
ensureUploadDirs();

// Disk storage engine with unique timestamped filenames and correct extensions
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      ensureUploadDirs();
      if (!fs.existsSync(MAIN_UPLOADS_DIR)) {
        fs.mkdirSync(MAIN_UPLOADS_DIR, { recursive: true });
      }
      cb(null, MAIN_UPLOADS_DIR);
    } catch (err) {
      // Emergency fallback to /tmp
      try {
        if (!fs.existsSync(tmpUploadsDir)) fs.mkdirSync(tmpUploadsDir, { recursive: true });
      } catch (e) {}
      cb(null, tmpUploadsDir);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    let ext = path.extname(file.originalname || '').toLowerCase();
    
    // If extension is missing, infer from mimetype
    if (!ext || ext === '') {
      if (file.mimetype === 'application/pdf') ext = '.pdf';
      else if (file.mimetype === 'image/webp') ext = '.webp';
      else if (file.mimetype === 'image/png') ext = '.png';
      else if (file.mimetype === 'image/jpeg') ext = '.jpg';
      else if (file.mimetype && file.mimetype.includes('word')) ext = '.docx';
      else if (file.mimetype && file.mimetype.includes('sheet')) ext = '.xlsx';
      else ext = '.jpg';
    }
    
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const tempBackupStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join(MAIN_UPLOADS_DIR, 'temp_backups');
    try {
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      cb(null, tempDir);
    } catch (e) {
      try {
        if (!fs.existsSync(tmpUploadsDir)) fs.mkdirSync(tmpUploadsDir, { recursive: true });
      } catch (err) {}
      cb(null, tmpUploadsDir);
    }
  },
  filename: function (req, file, cb) {
    cb(null, `backup-${Date.now()}-${file.originalname}`);
  }
});

export const tempBackupUpload = multer({
  storage: tempBackupStorage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

import { uploadToGoogleDrive, isGoogleDriveConfigured } from './googleDriveService.js';

/**
 * Mirror file to ALL upload directories (Haji Muhammad Nabi Autos/uploads, backend/uploads, <root>/uploads)
 * and Google Drive Cloud API (200GB)
 */
export const mirrorUploadedFile = async (filePath, filename) => {
  if (!fs.existsSync(filePath)) return;

  const targetDirs = [
    MAIN_UPLOADS_DIR,
    BACKEND_UPLOADS_DIR,
    ROOT_UPLOADS_DIR
  ];

  for (const dir of targetDirs) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, filename);
      if (path.resolve(filePath) !== path.resolve(target)) {
        await fs.promises.copyFile(filePath, target);
      }
    } catch (e) {}
  }

  // 2. Direct Cloud Upload to 200GB Google Drive API (Permanent Zero Data Loss)
  if (isGoogleDriveConfigured()) {
    try {
      await uploadToGoogleDrive(filePath, filename);
    } catch (e) {
      console.warn('Google Drive API upload notice:', e.message);
    }
  }

  // 3. Fallback: Copy to mounted Google Drive letter if exists
  if (fs.existsSync('G:\\My Drive')) {
    try {
      if (!fs.existsSync(GDRIVE_UPLOADS_DIR)) fs.mkdirSync(GDRIVE_UPLOADS_DIR, { recursive: true });
      const gDriveTarget = path.join(GDRIVE_UPLOADS_DIR, filename);
      await fs.promises.copyFile(filePath, gDriveTarget);
      console.log(`☁️ Synced upload to local Google Drive mount: ${filename}`);
    } catch (e) {}
  }
};

/**
 * Return all candidate directories where uploads can be served from
 */
export const getUploadDirs = () => {
  return [
    MAIN_UPLOADS_DIR,
    BACKEND_UPLOADS_DIR,
    ROOT_UPLOADS_DIR,
    GDRIVE_UPLOADS_DIR,
    path.resolve(process.cwd(), 'Haji Muhammad Nabi Autos', 'uploads'),
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(process.cwd(), 'backend', 'uploads'),
    tmpUploadsDir
  ].filter(dir => {
    try {
      return fs.existsSync(dir);
    } catch (e) {
      return false;
    }
  });
};

/**
 * Accurately detect MIME type of any file (inspects magic numbers if no/unknown extension)
 */
export const detectMimeType = (filePath, originalFilename = '') => {
  const ext = path.extname(originalFilename || filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.doc' || ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === '.xls' || ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    if (buffer.slice(0, 4).toString() === '%PDF') return 'application/pdf';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
    if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  } catch (e) {}

  return 'application/octet-stream';
};

/**
 * Robustly find an uploaded file across all candidate directories,
 * checking exact names, base names, and common extensions.
 */
export const findUploadedFile = (filename) => {
  if (!filename) return null;
  const dirs = getUploadDirs();
  const baseName = filename.replace(/\.[^/.]+$/, '');
  const variations = [
    filename,
    baseName,
    `${baseName}.webp`,
    `${baseName}.pdf`,
    `${baseName}.jpg`,
    `${baseName}.jpeg`,
    `${baseName}.png`
  ];

  for (const dir of dirs) {
    for (const v of variations) {
      const fullPath = path.join(dir, v);
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          return fullPath;
        }
      } catch (e) {}
    }
  }

  return null;
};
