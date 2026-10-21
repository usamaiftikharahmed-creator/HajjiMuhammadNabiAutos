import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { cache, saveCollection, loadAllData, updateSummary } from './offlineDb.js';
import { MAIN_UPLOADS_DIR, GDRIVE_UPLOADS_DIR } from './uploadService.js';

let isSyncing = false;

// Collection mapping to Mongoose collection names
const colMapping = {
  users: 'users',
  customers: 'customers',
  installmentSales: 'installmentsales',
  payments: 'payments',
  expenses: 'expenses',
  dailyClosings: 'dailyclosings',
  activityLogs: 'activitylogs',
  backupSettings: 'backupsettings'
};

export const syncOfflineDataToAtlas = async () => {
  if (mongoose.connection.readyState !== 1 || isSyncing) return;
  isSyncing = true;

  try {
    const db = mongoose.connection.db;
    let totalSyncedToCloud = 0;
    let totalFetchedFromCloud = 0;

    for (const [cacheKey, mongoColName] of Object.entries(colMapping)) {
      const localDocs = cache[cacheKey] || [];
      const col = db.collection(mongoColName);

      // 1. Push local docs to Atlas
      if (localDocs.length > 0) {
        const ops = localDocs.map(doc => {
          const plain = { ...doc };
          delete plain.save;
          delete plain.comparePassword;
          delete plain.id;
          
          if (cacheKey === 'users') {
            delete plain._id;
            return {
              updateOne: {
                filter: { username: doc.username },
                update: { $set: plain },
                upsert: true
              }
            };
          }

          return {
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: plain },
              upsert: true
            }
          };
        });
        const result = await col.bulkWrite(ops, { ordered: false });
        totalSyncedToCloud += (result.upsertedCount || 0) + (result.modifiedCount || 0);
      }

      // 2. Pull any missing remote docs from Atlas to local
      const remoteDocs = await col.find().toArray();
      let localModified = false;
      for (const rDoc of remoteDocs) {
        const rId = String(rDoc._id);
        const existsLocally = localDocs.some(l => String(l._id) === rId);
        if (!existsLocally) {
          localDocs.push(rDoc);
          localModified = true;
          totalFetchedFromCloud++;
        }
      }

      if (localModified) {
        saveCollection(cacheKey);
      }
    }

    if (totalSyncedToCloud > 0 || totalFetchedFromCloud > 0) {
      console.log(`☁️ Cloud Auto-Sync Complete: ${totalSyncedToCloud} updated on Atlas, ${totalFetchedFromCloud} fetched locally.`);
    }

    // Auto-sync uploaded customer photos to Google Drive
    await syncUploadsToGoogleDrive();

    updateSummary();
  } catch (err) {
    console.warn('Sync notice:', err.message);
  } finally {
    isSyncing = false;
  }
};

export const syncUploadsToGoogleDrive = async () => {
  if (!fs.existsSync('G:\\My Drive')) return;
  try {
    const localUploads = MAIN_UPLOADS_DIR;
    const gDriveUploads = GDRIVE_UPLOADS_DIR;
    if (!fs.existsSync(localUploads)) return;
    if (!fs.existsSync(gDriveUploads)) fs.mkdirSync(gDriveUploads, { recursive: true });

    const files = await fs.promises.readdir(localUploads);
    for (const file of files) {
      if (file === 'temp_backups') continue;
      const srcFile = path.join(localUploads, file);
      const destFile = path.join(gDriveUploads, file);
      if (!fs.existsSync(destFile)) {
        try {
          await fs.promises.copyFile(srcFile, destFile);
        } catch (e) {}
      }
    }
  } catch (e) {}
};

// Continuous background reconnect & sync monitor
export const startBackgroundSyncMonitor = (mongoUri) => {
  if (!mongoUri) return;

  setInterval(async () => {
    try {
      if (mongoose.connection.readyState !== 1) {
        // Try connecting with short timeout (non-blocking)
        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 2500,
          connectTimeoutMS: 2500
        });
        console.log('🌐 Internet Connection Restored! Connected to MongoDB Atlas.');
        await syncOfflineDataToAtlas();
      } else {
        // Already connected, sync any recent local edits
        await syncOfflineDataToAtlas();
      }
    } catch (e) {
      // Offline, quietly ignore
    }
  }, 20000); // Check every 20 seconds
};
