import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { 
  createBackup, 
  listAllBackups, 
  restoreDatabaseFromBackup, 
  getBackupSettings,
  exportLiveJsonData,
  MAIN_DRIVE_FOLDER,
  MAIN_DIR,
  BACKUP_DIR,
  DATA_DIR
} from '../services/backupService.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

import { tempBackupUpload } from '../services/uploadService.js';

const router = express.Router();
const upload = tempBackupUpload;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUP_ROOT = path.resolve(__dirname, '..', 'backups');
const LEGACY_MAIN_DIR = path.join(BACKUP_ROOT, 'Haji_Muhammad_Nabi_Electronics_Backups');

// 1. LIST ALL STORED BACKUPS
router.get('/list', protect, authorize('owner'), async (req, res) => {
  try {
    const backups = await listAllBackups();
    const settings = await getBackupSettings();
    res.json({
      success: true,
      backups,
      settings,
      mainFolderName: MAIN_DRIVE_FOLDER,
      mainDirPath: MAIN_DIR
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. GET BACKUP SETTINGS
router.get('/settings', protect, authorize('owner'), async (req, res) => {
  try {
    const settings = await getBackupSettings();
    res.json({ 
      success: true, 
      settings,
      mainFolderName: MAIN_DRIVE_FOLDER,
      mainDirPath: MAIN_DIR
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. UPDATE BACKUP SETTINGS (Email, Drive Preferences, Auto-backup)
router.put('/settings', protect, authorize('owner'), async (req, res) => {
  try {
    const { backupEmail, autoBackupEnabled, backupTime, googleDriveSyncEnabled, customDrivePath } = req.body;
    const settings = await getBackupSettings();

    if (backupEmail !== undefined) settings.backupEmail = backupEmail.trim();
    if (autoBackupEnabled !== undefined) settings.autoBackupEnabled = Boolean(autoBackupEnabled);
    if (backupTime !== undefined) settings.backupTime = backupTime;
    if (googleDriveSyncEnabled !== undefined) settings.googleDriveSyncEnabled = Boolean(googleDriveSyncEnabled);
    if (customDrivePath !== undefined) settings.customDrivePath = customDrivePath.trim();

    await settings.save();
    res.json({ success: true, message: 'Backup settings updated!', settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. CREATE BACKUP NOW (Manual Trigger)
router.post('/create', protect, authorize('owner'), async (req, res) => {
  try {
    const result = await createBackup('Manual Admin Request (Dashboard)', req.user);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. EXPORT & SYNC LIVE DATA TO JSON FILES (Zero-DB JSON Mirror)
router.post('/sync-live-json', protect, authorize('owner'), async (req, res) => {
  try {
    const result = await exportLiveJsonData();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. 1-CLICK RESTORE FROM LISTED BACKUP
router.post('/restore', protect, authorize('owner'), async (req, res) => {
  try {
    const { backupId } = req.body; // e.g. "2026-10-01/backup_2026-10-01_21-00-00.json"
    if (!backupId) {
      return res.status(400).json({ success: false, message: 'Backup identifier required' });
    }

    const result = await restoreDatabaseFromBackup(backupId, req.user);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 7. UPLOAD EXTERNAL JSON BACKUP FILE & RESTORE
router.post('/upload-restore', protect, authorize('owner'), upload.single('backupFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Backup JSON file is required' });
    }

    const tempPath = req.file.path;
    const fileContent = fs.readFileSync(tempPath, 'utf-8');
    const parsedData = JSON.parse(fileContent);

    // Clean up temp file
    try { fs.unlinkSync(tempPath); } catch (e) {}

    const result = await restoreDatabaseFromBackup(parsedData, req.user);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: `Restore failed: ${error.message}` });
  }
});

// 8. DOWNLOAD SPECIFIC BACKUP FILE
router.get('/download/:folderDate/:fileName', protect, authorize('owner'), (req, res) => {
  try {
    const { folderDate, fileName } = req.params;
    const safeFolder = path.basename(folderDate);
    const safeFile = path.basename(fileName);

    let targetPath = path.join(BACKUP_DIR, safeFolder, safeFile);
    if (!fs.existsSync(targetPath)) {
      targetPath = path.join(LEGACY_MAIN_DIR, safeFolder, safeFile);
    }

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ success: false, message: 'Backup file not found' });
    }

    res.download(targetPath, safeFile);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 9. DELETE SPECIFIC BACKUP
router.delete('/:folderDate/:fileName', protect, authorize('owner'), (req, res) => {
  try {
    const { folderDate, fileName } = req.params;
    const safeFolder = path.basename(folderDate);
    const safeFile = path.basename(fileName);

    let targetPath = path.join(BACKUP_DIR, safeFolder, safeFile);
    let deleted = false;
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      deleted = true;
    }

    const legacyPath = path.join(LEGACY_MAIN_DIR, safeFolder, safeFile);
    if (fs.existsSync(legacyPath)) {
      fs.unlinkSync(legacyPath);
      deleted = true;
    }

    if (deleted) {
      return res.json({ success: true, message: 'Backup file deleted successfully' });
    } else {
      return res.status(404).json({ success: false, message: 'Backup file not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
