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

// 2. Secondary fallback directory: backend/uploads
export const BACKEND_UPLOADS_DIR = isVercel
  ? tmpUploadsDir
  : path.join(path.resolve(__dirname, '..'), 'uploads');

// 3. Google Drive mirror directory: G:\My Drive\Haji Muhammad Nabi Autos\uploads
export const GDRIVE_UPLOADS_DIR = 'G:\\My Drive\\Haji Muhammad Nabi Autos\\uploads';

// Ensure all upload directories exist
export const ensureUploadDirs = () => {
  const dirs = [
    MAIN_UPLOADS_DIR,
    path.join(MAIN_UPLOADS_DIR, 'temp_backups'),
    BACKEND_UPLOADS_DIR,
    path.join(BACKEND_UPLOADS_DIR, 'temp_backups'),
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

// Disk storage engine with unique timestamped filenames
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
    const ext = path.extname(file.originalname || '') || '.jpg';
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
 * Mirror file to secondary backend folder and Google Drive Cloud API (200GB)
 */
export const mirrorUploadedFile = async (filePath, filename) => {
  if (!fs.existsSync(filePath)) return;

  // 1. Copy to backend/uploads if distinct
  const backendTarget = path.join(BACKEND_UPLOADS_DIR, filename);
  if (path.resolve(filePath) !== path.resolve(backendTarget)) {
    try {
      await fs.promises.copyFile(filePath, backendTarget);
    } catch (e) {}
  }

  // 2. Direct Cloud Upload to 200GB Google Drive API (Permanent Zero Data Loss)
  if (isGoogleDriveConfigured()) {
    try {
      uploadToGoogleDrive(filePath, filename).catch(err => {
        console.warn('Background Google Drive API upload error:', err.message);
      });
    } catch (e) {}
  }

  // 3. Fallback: Copy to mounted Google Drive letter if exists
  if (fs.existsSync('G:\\My Drive')) {
    try {
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
    GDRIVE_UPLOADS_DIR,
    path.resolve(process.cwd(), 'Haji Muhammad Nabi Autos', 'uploads'),
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(process.cwd(), 'backend', 'uploads')
  ].filter(dir => {
    try {
      return fs.existsSync(dir);
    } catch (e) {
      return false;
    }
  });
};
