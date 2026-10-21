import mongoose from 'mongoose';
import { createHybridModel } from './hybridModel.js';

const backupSettingsSchema = new mongoose.Schema(
  {
    autoBackupEnabled: {
      type: Boolean,
      default: true
    },
    backupTime: {
      type: String,
      default: '22:00' // 10:00 PM
    },
    backupEmail: {
      type: String,
      default: 'hajjimuhammadnabi@gmail.com',
      trim: true
    },
    mainFolderName: {
      type: String,
      default: 'Haji Muhammad Nabi Autos'
    },
    customDrivePath: {
      type: String,
      default: ''
    },
    googleDriveSyncEnabled: {
      type: Boolean,
      default: true
    },
    lastLiveSyncTime: {
      type: Date,
      default: null
    },
    lastLiveSyncStatus: {
      type: String,
      default: 'Ready'
    },
    lastBackupTime: {
      type: Date,
      default: null
    },
    lastBackupStatus: {
      type: String,
      default: 'Ready'
    },
    lastBackupFileName: {
      type: String,
      default: ''
    },
    lastBackupCounts: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

const BackupSettings = mongoose.model('BackupSettings', backupSettingsSchema);
export default createHybridModel(BackupSettings, 'backupSettings');
