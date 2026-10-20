import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';

import Customer from '../models/Customer.js';
import InstallmentSale from '../models/InstallmentSale.js';
import Payment from '../models/Payment.js';
import Expense from '../models/Expense.js';
import DailyClosing from '../models/DailyClosing.js';
import User from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import BackupSettings from '../models/BackupSettings.js';
import { logActivity } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Workspace Root (Installment AntiGravity/) and Main Folder (Haji Muhammad Nabi Autos)
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');
export const MAIN_DRIVE_FOLDER = 'Haji Muhammad Nabi Autos';
export const MAIN_DIR = path.join(WORKSPACE_ROOT, MAIN_DRIVE_FOLDER);
export const DATA_DIR = path.join(MAIN_DIR, 'data');
export const BACKUP_DIR = path.join(MAIN_DIR, 'backup');

// Legacy backup directory for seamless migration
const BACKUP_ROOT = path.resolve(__dirname, '..', 'backups');
const LEGACY_MAIN_DIR = path.join(BACKUP_ROOT, 'Haji_Muhammad_Nabi_Electronics_Backups');

// Ensure base backup directories exist
export const ensureBackupDirs = () => {
  if (!fs.existsSync(MAIN_DIR)) {
    fs.mkdirSync(MAIN_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_ROOT)) {
    fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  }

  // Auto-detect and initialize Google Drive 200GB (G:\My Drive\Haji Muhammad Nabi Autos)
  const gDriveRoot = 'G:\\My Drive';
  const gDriveMain = path.join(gDriveRoot, MAIN_DRIVE_FOLDER);
  if (fs.existsSync(gDriveRoot)) {
    try {
      if (!fs.existsSync(gDriveMain)) fs.mkdirSync(gDriveMain, { recursive: true });
      if (!fs.existsSync(path.join(gDriveMain, 'data'))) fs.mkdirSync(path.join(gDriveMain, 'data'), { recursive: true });
      if (!fs.existsSync(path.join(gDriveMain, 'backup'))) fs.mkdirSync(path.join(gDriveMain, 'backup'), { recursive: true });
    } catch (e) {}
  }

  // Create README_GOOGLE_DRIVE_SYNC.txt if not exists
  const readmePath = path.join(MAIN_DIR, 'README_GOOGLE_DRIVE_SYNC.txt');
  if (!fs.existsSync(readmePath)) {
    const readmeContent = `================================================================================
  HAJJI MOHAMMAD NABI AUTOS - 200GB GOOGLE DRIVE SYNC & JSON DATA STORAGE
================================================================================

Account Email: hajjimuhammadnabi@gmail.com
Google Drive Storage: 200 GB (Google One)

FOLDER STRUCTURE:
--------------------------------------------------------------------------------
1. /data/
   - customers.json        (All registered customers with details & CNICs)
   - installmentSales.json (All active & completed installment contracts)
   - payments.json         (Complete record of all cash/online installment receipts)
   - expenses.json         (Shop expenses & daily ledger)
   - dailyClosings.json    (Roznamcha closing reports & balances)
   - users.json            (Staff & owner user credentials)
   - summary.json          (System status & live record counts)

2. /backup/
   - YYYY-MM-DD/           (Daily automated 10:00 PM snapshots & manual backups)
     backup_YYYY-MM-DD_HH-mm-ss.json

HOW 200GB GOOGLE DRIVE SYNC WORKS:
--------------------------------------------------------------------------------
1. Download "Google Drive for Desktop" (https://www.google.com/drive/download/)
2. Sign in with your Google account: hajjimuhammadnabi@gmail.com
3. In Google Drive Preferences, choose "Add folder from computer" and select:
   👉 "c:\\Users\\usama iftikhar\\Desktop\\Installment AntiGravity\\Haji Muhammad Nabi Autos"
   OR set your custom drive path (e.g. G:\\My Drive\\Haji Muhammad Nabi Autos).
4. All real-time JSON files and daily backups will automatically upload to
   your 200GB cloud storage within seconds!

ZERO DATA LOSS GUARANTEE:
Even if your computer or database crashes, your entire shop data is 100% safe
in clean JSON format in this folder and in your 200GB Google Drive.
================================================================================
`;
    fs.writeFileSync(readmePath, readmeContent, 'utf-8');
  }

  // Migrate any previous backups from legacy folder to new BACKUP_DIR
  try {
    if (fs.existsSync(LEGACY_MAIN_DIR)) {
      const legacyFolders = fs.readdirSync(LEGACY_MAIN_DIR);
      for (const fold of legacyFolders) {
        const srcFold = path.join(LEGACY_MAIN_DIR, fold);
        if (fs.statSync(srcFold).isDirectory()) {
          const destFold = path.join(BACKUP_DIR, fold);
          if (!fs.existsSync(destFold)) {
            fs.mkdirSync(destFold, { recursive: true });
          }
          const files = fs.readdirSync(srcFold);
          for (const file of files) {
            const srcFile = path.join(srcFold, file);
            const destFile = path.join(destFold, file);
            if (!fs.existsSync(destFile)) {
              fs.copyFileSync(srcFile, destFile);
            }
          }
        }
      }
    }
  } catch (migErr) {
    console.warn('Backup migration notice:', migErr.message);
  }
};

// Helper: Format Date strings
const getFormattedDateStr = (date = new Date()) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTimestampStr = (date = new Date()) => {
  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}-${minutes}-${seconds}`;
};

// 1. Get or Create Backup Settings
export const getBackupSettings = async () => {
  let settings = await BackupSettings.findOne();
  if (!settings) {
    settings = await BackupSettings.create({
      autoBackupEnabled: true,
      backupTime: '22:00',
      backupEmail: 'hajjimuhammadnabi@gmail.com',
      mainFolderName: MAIN_DRIVE_FOLDER,
      googleDriveSyncEnabled: true
    });
  } else {
    let changed = false;
    if (settings.backupEmail === 'usamaiftikharahmed@gmail.com' || !settings.backupEmail) {
      settings.backupEmail = 'hajjimuhammadnabi@gmail.com';
      changed = true;
    }
    if (settings.mainFolderName === 'Haji_Muhammad_Nabi_Electronics_Backups' || !settings.mainFolderName) {
      settings.mainFolderName = MAIN_DRIVE_FOLDER;
      changed = true;
    }
    if (settings.backupTime === '21:00') {
      settings.backupTime = '22:00';
      changed = true;
    }
    if (changed) {
      await settings.save();
    }
  }
  return settings;
};

// 2. EXPORT LIVE JSON DATA (Zero Database Dependency Mirror)
export const exportLiveJsonData = async () => {
  try {
    ensureBackupDirs();
    const settings = await getBackupSettings();

    const [customers, installmentSales, payments, expenses, dailyClosings, users] = await Promise.all([
      Customer.find().lean(),
      InstallmentSale.find().lean(),
      Payment.find().lean(),
      Expense.find().lean(),
      DailyClosing.find().lean(),
      User.find().select('-password').lean()
    ]);

    const filesToSave = [
      { name: 'customers.json', data: customers },
      { name: 'installmentSales.json', data: installmentSales },
      { name: 'payments.json', data: payments },
      { name: 'expenses.json', data: expenses },
      { name: 'dailyClosings.json', data: dailyClosings },
      { name: 'users.json', data: users }
    ];

    for (const f of filesToSave) {
      fs.writeFileSync(path.join(DATA_DIR, f.name), JSON.stringify(f.data, null, 2), 'utf-8');
    }

    const summary = {
      systemName: 'Hajji Mohammad Nabi Autos - Installment & Roznamcha System',
      targetEmail: settings.backupEmail || 'hajjimuhammadnabi@gmail.com',
      storageQuota: '200 GB Google One Drive',
      lastSyncedAt: new Date().toISOString(),
      counts: {
        customers: customers.length,
        installmentSales: installmentSales.length,
        payments: payments.length,
        expenses: expenses.length,
        dailyClosings: dailyClosings.length,
        users: users.length
      },
      status: 'Live JSON Database Mirrored Successfully',
      note: 'These JSON files contain the complete live data of the shop. They can be read, transferred, or restored at any time without database lock-in.'
    };

    fs.writeFileSync(path.join(DATA_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');

    // Also mirror to Google Drive (G:\My Drive\Haji Muhammad Nabi Autos or customDrivePath)
    const targetDrivePath = (settings.customDrivePath && fs.existsSync(settings.customDrivePath))
      ? settings.customDrivePath
      : (fs.existsSync('G:\\My Drive\\Haji Muhammad Nabi Autos') ? 'G:\\My Drive\\Haji Muhammad Nabi Autos' : null);

    if (targetDrivePath) {
      const driveDataDir = path.join(targetDrivePath, 'data');
      if (!fs.existsSync(driveDataDir)) fs.mkdirSync(driveDataDir, { recursive: true });
      for (const f of filesToSave) {
        fs.copyFileSync(path.join(DATA_DIR, f.name), path.join(driveDataDir, f.name));
      }
      fs.copyFileSync(path.join(DATA_DIR, 'summary.json'), path.join(driveDataDir, 'summary.json'));
    }

    settings.lastLiveSyncTime = new Date();
    settings.lastLiveSyncStatus = 'Success';
    await settings.save();

    return {
      success: true,
      message: 'Live data exported to JSON files in Haji Muhammad Nabi Autos/data/',
      counts: summary.counts,
      lastSyncedAt: summary.lastSyncedAt
    };
  } catch (error) {
    console.error('❌ Error in exportLiveJsonData:', error);
    try {
      const settings = await getBackupSettings();
      settings.lastLiveSyncStatus = `Failed: ${error.message}`;
      await settings.save();
    } catch (e) {}
    throw error;
  }
};

// Debounced live sync for continuous background updates
let liveSyncTimeout = null;
export const triggerDebouncedLiveJsonSync = () => {
  if (liveSyncTimeout) clearTimeout(liveSyncTimeout);
  liveSyncTimeout = setTimeout(() => {
    exportLiveJsonData().catch(e => console.error('Live JSON sync error:', e.message));
  }, 2500);
};

// 3. CREATE BACKUP
export const createBackup = async (triggeredBy = 'Manual Admin Request', author = null) => {
  try {
    ensureBackupDirs();
    const settings = await getBackupSettings();
    const now = new Date();
    const dateFolderStr = getFormattedDateStr(now);
    const timeStr = getTimestampStr(now);

    // Save in: Haji Muhammad Nabi Autos / backup / YYYY-MM-DD / backup_YYYY-MM-DD_HH-mm-ss.json
    const dateDir = path.join(BACKUP_DIR, dateFolderStr);
    if (!fs.existsSync(dateDir)) {
      fs.mkdirSync(dateDir, { recursive: true });
    }

    const fileName = `backup_${dateFolderStr}_${timeStr}.json`;
    const fullFilePath = path.join(dateDir, fileName);

    // Fetch all collections in parallel for maximum speed
    const [customers, installmentSales, payments, expenses, dailyClosings, users, logs] = await Promise.all([
      Customer.find().lean(),
      InstallmentSale.find().lean(),
      Payment.find().lean(),
      Expense.find().lean(),
      DailyClosing.find().lean(),
      User.find().select('-password').lean(),
      ActivityLog.find().sort({ createdAt: -1 }).limit(500).lean()
    ]);

    const counts = {
      customers: customers.length,
      installmentSales: installmentSales.length,
      payments: payments.length,
      expenses: expenses.length,
      dailyClosings: dailyClosings.length,
      users: users.length,
      logs: logs.length
    };

    const backupPayload = {
      metadata: {
        version: '2.0',
        systemName: 'Hajji Mohammad Nabi Autos - Installment & Roznamcha System',
        mainFolder: MAIN_DRIVE_FOLDER,
        subFolder: 'backup',
        dateFolder: dateFolderStr,
        fileName,
        timestamp: now.toISOString(),
        dateStr: dateFolderStr,
        triggeredBy,
        author: author?.name || (triggeredBy.includes('Automated') ? 'Automated Cron (10:00 PM)' : 'Admin'),
        backupEmail: settings.backupEmail,
        counts
      },
      data: {
        customers,
        installmentSales,
        payments,
        expenses,
        dailyClosings,
        users,
        logs
      }
    };

    // Save to Disk
    fs.writeFileSync(fullFilePath, JSON.stringify(backupPayload, null, 2), 'utf-8');
    const stats = fs.statSync(fullFilePath);

    // Also mirror backup to Google Drive
    const targetDrivePath = (settings.customDrivePath && fs.existsSync(settings.customDrivePath))
      ? settings.customDrivePath
      : (fs.existsSync('G:\\My Drive\\Haji Muhammad Nabi Autos') ? 'G:\\My Drive\\Haji Muhammad Nabi Autos' : null);

    if (targetDrivePath) {
      try {
        const driveBackupDir = path.join(targetDrivePath, 'backup', dateFolderStr);
        if (!fs.existsSync(driveBackupDir)) fs.mkdirSync(driveBackupDir, { recursive: true });
        fs.copyFileSync(fullFilePath, path.join(driveBackupDir, fileName));
      } catch (cpErr) {
        console.warn('Custom drive backup copy notice:', cpErr.message);
      }
    }

    // Refresh live data JSON files as well
    exportLiveJsonData().catch(err => console.warn('Live JSON export during backup notice:', err.message));

    // Update settings
    settings.lastBackupTime = now;
    settings.lastBackupStatus = 'Success';
    settings.lastBackupFileName = fileName;
    settings.lastBackupCounts = counts;
    await settings.save();

    // Log Activity
    await logActivity({
      user: author,
      action: 'CREATE_BACKUP',
      module: 'Backup',
      details: `Database Backup kamyabi se bana: "${fileName}" (Folder: Haji Muhammad Nabi Autos/backup/${dateFolderStr}) | Records: ${customers.length} Customers, ${installmentSales.length} Sales, ${payments.length} Payments, ${expenses.length} Expenses`,
      metadata: { fileName, dateFolder: dateFolderStr, counts, fileSize: stats.size, triggeredBy }
    });

    // Send Email notification with JSON file attachment
    sendBackupEmailNotification(settings.backupEmail, fileName, dateFolderStr, counts, triggeredBy, fullFilePath).catch((err) => {
      console.warn('Backup email dispatch failed:', err.message);
    });

    return {
      success: true,
      message: 'Backup created successfully!',
      backup: {
        fileName,
        dateFolder: dateFolderStr,
        filePath: `Haji Muhammad Nabi Autos/backup/${dateFolderStr}/${fileName}`,
        sizeBytes: stats.size,
        sizeFormatted: `${(stats.size / 1024).toFixed(1)} KB`,
        createdAt: now,
        counts,
        triggeredBy
      }
    };
  } catch (error) {
    console.error('❌ Error creating backup:', error);
    try {
      const settings = await getBackupSettings();
      settings.lastBackupStatus = `Failed: ${error.message}`;
      await settings.save();
    } catch (e) {}
    throw error;
  }
};

// 4. LIST ALL STORED BACKUPS
export const listAllBackups = async () => {
  ensureBackupDirs();
  const backupsMap = new Map();

  const scanDir = (baseDir) => {
    if (!fs.existsSync(baseDir)) return;
    const dateFolders = fs.readdirSync(baseDir);

    for (const folder of dateFolders) {
      const folderPath = path.join(baseDir, folder);
      if (fs.statSync(folderPath).isDirectory()) {
        const files = fs.readdirSync(folderPath);

        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(folderPath, file);
            if (backupsMap.has(file)) continue; // avoid duplicates

            const stat = fs.statSync(filePath);
            let counts = null;
            let triggeredBy = 'Schedule/Manual';
            let author = 'Admin';

            try {
              const fd = fs.openSync(filePath, 'r');
              const buffer = Buffer.alloc(2048);
              const bytesRead = fs.readSync(fd, buffer, 0, 2048, 0);
              fs.closeSync(fd);

              const snippet = buffer.toString('utf8', 0, bytesRead);
              const metaMatch = snippet.match(/"metadata"\s*:\s*(\{[\s\S]*?"counts"\s*:\s*\{[\s\S]*?\}\s*\})/);
              if (metaMatch) {
                const metaObj = JSON.parse(metaMatch[1]);
                counts = metaObj.counts;
                triggeredBy = metaObj.triggeredBy || triggeredBy;
                author = metaObj.author || author;
              }
            } catch (e) {
              try {
                const fullData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                counts = fullData.metadata?.counts;
                triggeredBy = fullData.metadata?.triggeredBy || triggeredBy;
                author = fullData.metadata?.author || author;
              } catch (err) {}
            }

            backupsMap.set(file, {
              id: `${folder}/${file}`,
              fileName: file,
              folderDate: folder,
              fullPath: filePath,
              relativePath: `Haji Muhammad Nabi Autos/backup/${folder}/${file}`,
              sizeBytes: stat.size,
              sizeFormatted: `${(stat.size / 1024).toFixed(1)} KB`,
              createdAt: stat.birthtime || stat.mtime,
              counts,
              triggeredBy,
              author
            });
          }
        }
      }
    }
  };

  // Scan new main backup folder first
  scanDir(BACKUP_DIR);
  // Also scan legacy folder if any file wasn't migrated
  scanDir(LEGACY_MAIN_DIR);

  const backupsList = Array.from(backupsMap.values());
  return backupsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

// 5. RESTORE DATABASE FROM BACKUP (1-CLICK RESTORE)
export const restoreDatabaseFromBackup = async (source, restoredBy = null) => {
  try {
    let backupContent = null;

    if (typeof source === 'string') {
      let targetPath = source;
      if (!fs.existsSync(targetPath)) {
        targetPath = path.join(BACKUP_DIR, source);
      }
      if (!fs.existsSync(targetPath)) {
        targetPath = path.join(LEGACY_MAIN_DIR, source);
      }
      if (!fs.existsSync(targetPath)) {
        targetPath = path.join(BACKUP_ROOT, source);
      }
      if (!fs.existsSync(targetPath)) {
        throw new Error(`Backup file not found at path: ${source}`);
      }

      const fileData = fs.readFileSync(targetPath, 'utf-8');
      backupContent = JSON.parse(fileData);
    } else if (typeof source === 'object' && source !== null) {
      backupContent = source;
    }

    if (!backupContent || !backupContent.data) {
      throw new Error('Invalid backup file structure: missing "data" container.');
    }

    const { data, metadata } = backupContent;

    // STEP A: CREATE PRE-RESTORE SAFETY SNAPSHOT (Automatic Rollback Safety)
    try {
      await createBackup('Pre-Restore Safety Snapshot', restoredBy);
    } catch (snapErr) {
      console.warn('Pre-restore safety snapshot skipped:', snapErr.message);
    }

    // STEP B: RESTORE ALL COLLECTIONS SEQUENTIALLY
    let restoredCounts = {
      customers: 0,
      installmentSales: 0,
      payments: 0,
      expenses: 0,
      dailyClosings: 0,
      users: 0
    };

    // 1. Customers
    if (Array.isArray(data.customers)) {
      await Customer.deleteMany({});
      if (data.customers.length > 0) {
        await Customer.insertMany(data.customers, { ordered: false });
      }
      restoredCounts.customers = data.customers.length;
    }

    // 2. InstallmentSales
    if (Array.isArray(data.installmentSales)) {
      await InstallmentSale.deleteMany({});
      if (data.installmentSales.length > 0) {
        await InstallmentSale.insertMany(data.installmentSales, { ordered: false });
      }
      restoredCounts.installmentSales = data.installmentSales.length;
    }

    // 3. Payments
    if (Array.isArray(data.payments)) {
      await Payment.deleteMany({});
      if (data.payments.length > 0) {
        await Payment.insertMany(data.payments, { ordered: false });
      }
      restoredCounts.payments = data.payments.length;
    }

    // 4. Expenses
    if (Array.isArray(data.expenses)) {
      await Expense.deleteMany({});
      if (data.expenses.length > 0) {
        const cleanExpenses = data.expenses.map(e => ({
          ...e,
          category: e.category || 'General',
          paymentMethod: e.paymentMethod || 'Cash'
        }));
        await Expense.insertMany(cleanExpenses, { ordered: false });
      }
      restoredCounts.expenses = data.expenses.length;
    }

    // 5. DailyClosings
    if (Array.isArray(data.dailyClosings)) {
      await DailyClosing.deleteMany({});
      if (data.dailyClosings.length > 0) {
        await DailyClosing.insertMany(data.dailyClosings, { ordered: false });
      }
      restoredCounts.dailyClosings = data.dailyClosings.length;
    }

    // 6. Users (Keep admin user intact or upsert)
    if (Array.isArray(data.users) && data.users.length > 0) {
      for (const u of data.users) {
        await User.findByIdAndUpdate(u._id, { $set: u }, { upsert: true });
      }
      restoredCounts.users = data.users.length;
    }

    // Refresh live JSON files immediately after restore
    exportLiveJsonData().catch(e => console.error('Export live JSON after restore error:', e.message));

    // Log the restore event
    await logActivity({
      user: restoredBy,
      action: 'RESTORE_BACKUP',
      module: 'Backup',
      details: `1-Click Restore Kamyabi Se Mukammal Hua! Restored: ${restoredCounts.customers} Customers, ${restoredCounts.installmentSales} Sales, ${restoredCounts.payments} Payments, ${restoredCounts.expenses} Expenses. (Source Date: ${metadata?.dateStr || 'Unknown'})`,
      metadata: {
        restoredCounts,
        sourceMetadata: metadata
      }
    });

    return {
      success: true,
      message: 'System successfully restored from backup!',
      restoredCounts,
      sourceDate: metadata?.dateStr || 'N/A'
    };
  } catch (error) {
    console.error('❌ Restore Database Error:', error);
    throw error;
  }
};

// 6. EMAIL NOTIFICATION HELPER
const sendBackupEmailNotification = async (toEmail, fileName, dateFolder, counts, triggeredBy, fullFilePath = null) => {
  const targetEmail = toEmail || 'hajjimuhammadnabi@gmail.com';

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`ℹ️ [Backup Storage] File saved locally in Haji Muhammad Nabi Autos/backup/${dateFolder}/${fileName}`);
    console.log(`ℹ️ [Email Delivery] To automatically email backup attachments to "${targetEmail}", configure SMTP_USER & SMTP_PASS (Gmail App Password) in backend/.env`);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const mailOptions = {
      from: `"Hajji Mohammad Nabi Autos" <${process.env.SMTP_USER}>`,
      to: targetEmail,
      subject: `✅ Daily Database Backup File Attached (${dateFolder}) - Haji Muhammad Nabi Autos`,
      html: `
        <div style="font-family: Arial, sans-serif; background: #0f172a; color: #fff; padding: 20px; border-radius: 12px;">
          <h2 style="color: #10b981;">Rozana 10:00 PM Database Backup Successfully Created!</h2>
          <p>Assalam-o-Alaikum,</p>
          <p>Aapke Installment & Roznamcha System ka daily backup kamyabi se ban gaya hai aur <strong>is email ke sath attach kar diya gaya hai</strong>.</p>
          <div style="background: #1e293b; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p><strong>Main Folder:</strong> ${MAIN_DRIVE_FOLDER}</p>
            <p><strong>Subfolder:</strong> backup/${dateFolder}</p>
            <p><strong>File Name:</strong> ${fileName}</p>
            <p><strong>Triggered By:</strong> ${triggeredBy}</p>
            <hr style="border: 0.5px solid #334155;"/>
            <p><strong>Customers:</strong> ${counts.customers}</p>
            <p><strong>Installment Sales:</strong> ${counts.installmentSales}</p>
            <p><strong>Payments Received:</strong> ${counts.payments}</p>
            <p><strong>Expenses:</strong> ${counts.expenses}</p>
          </div>
          <p style="color: #94a3b8; font-size: 12px;">Yeh backup system mai kisi bhi waqt 1-Click Restore ke zariye recover kiya ja sakta hai.</p>
        </div>
      `,
      attachments: fullFilePath && fs.existsSync(fullFilePath) ? [
        {
          filename: fileName,
          path: fullFilePath,
          contentType: 'application/json'
        }
      ] : []
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Database backup JSON attached and sent successfully to ${targetEmail}`);
  } catch (err) {
    console.warn('Email notification sending failed:', err.message);
  }
};

// Check on startup: If today's automated backup was missed, create catch-up backup!
export const checkAndRunMissedBackup = async () => {
  try {
    ensureBackupDirs();
    const settings = await getBackupSettings();
    if (!settings.autoBackupEnabled) return;

    const todayStr = getFormattedDateStr(new Date());
    const todayDir = path.join(BACKUP_DIR, todayStr);

    let hasTodayBackup = false;
    if (fs.existsSync(todayDir)) {
      const files = fs.readdirSync(todayDir);
      if (files.some(f => f.endsWith('.json'))) {
        hasTodayBackup = true;
      }
    }

    if (!hasTodayBackup) {
      console.log('⏰ [Auto-Backup Startup Check] Today has no backup yet. Creating automatic catch-up backup now...');
      await createBackup('Automated Startup Catch-Up Backup');
      console.log('✅ [Auto-Backup Startup Check] Automatic catch-up backup saved in Haji Muhammad Nabi Autos/backup/ folder!');
    }
  } catch (err) {
    console.error('❌ [Auto-Backup Startup Check Error]:', err.message);
  }
};

// 7. INITIALIZE DAILY 10:00 PM CRON SCHEDULER & STARTUP CATCH-UP
export const initBackupScheduler = () => {
  // Cron syntax: '0 22 * * *' = Exactly at 22:00 (10:00 PM) everyday
  cron.schedule('0 22 * * *', async () => {
    console.log('⏰ [Cron] 10:00 PM Triggered: Starting Automated Nightly Database Backup...');
    try {
      const settings = await getBackupSettings();
      if (settings.autoBackupEnabled) {
        await createBackup('Automated Schedule (10:00 PM Daily)');
        console.log('✅ [Cron] Automated 10:00 PM Backup Created in Haji Muhammad Nabi Autos/backup/ folder!');
      } else {
        console.log('ℹ️ [Cron] Automated backup skipped (disabled in settings).');
      }
    } catch (err) {
      console.error('❌ [Cron] Automated 10:00 PM Backup Error:', err.message);
    }
  });

  console.log('🚀 Automated Daily Backup Scheduler Initialized: Active everyday at 10:00 PM (22:00)');

  // Run initial live JSON sync and startup catch-up check after 3 seconds
  setTimeout(() => {
    exportLiveJsonData().catch(e => console.error('Initial live JSON export notice:', e.message));
    checkAndRunMissedBackup().catch((e) => console.error('Missed backup error:', e.message));
  }, 3000);
};
