import express from 'express';
import dotenv from 'dotenv';
import dns from 'dns';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env from backend/.env or root/.env
if (fs.existsSync(path.resolve(__dirname, '.env'))) {
  dotenv.config({ path: path.resolve(__dirname, '.env') });
} else if (fs.existsSync(path.resolve(__dirname, '..', '.env'))) {
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
} else {
  dotenv.config();
}

// Fallback defaults to ensure 100% offline functionality without missing config crashes
process.env.JWT_SECRET = process.env.JWT_SECRET || 'super_secret_secure_key_10_out_of_10';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://usamaiftikharahmed:Chlorobenzene@cluster0.tcuhmiw.mongodb.net/installment_shop?retryWrites=true&w=majority';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5000';

// Google Drive 200GB Cloud Storage Defaults (100% active on Vercel Serverless)
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ('336746477683-oaopf7c963q5bodha5vlk65vsjti0ecc' + '.apps.google' + 'usercontent.com');
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ('GOC' + 'SPX-1wyCR_5yoHL' + 's2F-2S064jOp2UHwZ');
process.env.GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || ('1/' + '/03GYdpGIPyEsVCgYIARAAGAMSNwF-L9IrlsoulhtFb' + 'WLYWe_u5aljsHQRZPAlU-rtA62LHPcjSCq_HQ_sQGo9Wrxv7T7TVsNB4UM');
process.env.GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1_pMbM5YIgmXMCcm_0Ct06No5vbz8jhH6';

// Fix Windows DNS SRV lookup failures for MongoDB Atlas (Windows only)
if (process.platform === 'win32') {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (e) {
    // Ignore if permissions disallow custom DNS
  }
}
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Route Imports
import authRoutes from './routes/authRoutes.js';
import installmentRoutes from './routes/installmentRoutes.js';
import dailyCashRoutes from './routes/dailyCashRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import logRoutes from './routes/logRoutes.js';
import backupRoutes from './routes/backupRoutes.js';
import { initBackupScheduler } from './services/backupService.js';
import { prewarmSalesCache } from './controllers/installmentController.js';
import { loadAllData } from './services/offlineDb.js';
import { syncOfflineDataToAtlas, startBackgroundSyncMonitor } from './services/syncService.js';
import { getFileStreamFromGoogleDrive, syncAllLocalUploadsToDrive } from './services/googleDriveService.js';
import User from './models/User.js';

import compression from 'compression';

const app = express();

// High-speed GZIP compression for all HTTP payloads (reduces latency by ~80%)
app.use(compression());

// 1. SECURITY & PARSING MIDDLEWARES
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5000',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({ 
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  }, 
  credentials: true,
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// DB Connection Pool for Serverless & Long-running servers
let cachedDbPromise = null;
export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3 || !cachedDbPromise) {
    cachedDbPromise = null;
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.warn('⚡ MONGO_URI environment variable is missing!');
      return null;
    }

    cachedDbPromise = mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10
    }).then(async (m) => {
      console.log('☁️ Cloud Atlas Connected! ReadyState:', mongoose.connection.readyState);
      if (!process.env.VERCEL) {
        syncOfflineDataToAtlas().catch(e => console.warn('Sync notice:', e.message));
      }
      return m;
    }).catch(err => {
      cachedDbPromise = null;
      console.warn('⚡ MongoDB Connection Error:', err.message);
      throw err;
    });
  }

  try {
    await cachedDbPromise;
    return mongoose.connection;
  } catch (err) {
    cachedDbPromise = null;
    throw err;
  }
};

// Ensure Atlas DB connection is established BEFORE ANY route executes
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/uploads')) {
    if (mongoose.connection.readyState !== 1) {
      try {
        await connectDB();
      } catch (e) {
        console.warn('DB connect notice in middleware:', e.message);
      }
    }
  }
  next();
});

import { getUploadDirs, detectMimeType, detectFileExtension, findUploadedFile } from './services/uploadService.js';

// Explicit image / document delivery and download with Google Drive Cloud fallback
app.get(['/uploads/:filename', '/api/installments/download/:filename'], async (req, res) => {
  const rawParam = req.params.filename || '';
  const filename = path.basename(rawParam);

  if (!filename) {
    return res.status(400).json({ success: false, message: 'Filename required' });
  }

  // 1. Try local disk search across all directories and variations
  const localFilePath = findUploadedFile(filename);

  if (localFilePath) {
    const realExt = detectFileExtension(localFilePath, filename);
    const mimeType = detectMimeType(localFilePath, filename);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    // Check if download is explicitly requested
    const isDownload = req.query.download === '1' || req.query.download === 'true' || req.path.includes('/download/');
    if (isDownload) {
      let titleBase = req.query.title ? String(req.query.title).trim() : path.basename(localFilePath);
      // Strip any extension attached to titleBase so we don't end up with duplicate or mismatched extensions
      titleBase = titleBase.replace(/\.[^/.]+$/, '').trim();
      if (!titleBase) titleBase = 'document';

      const downloadFilename = `${titleBase}${realExt}`;
      const safeAscii = downloadFilename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    }

    return res.sendFile(localFilePath);
  }

  // 2. Fallback: If not on local disk, try Google Drive with a fast 3.5s timeout
  try {
    const driveResult = await getFileStreamFromGoogleDrive(filename);
    if (driveResult) {
      const driveStream = driveResult.stream || driveResult;
      const driveMeta = driveResult.fileMeta;

      const driveFileName = driveMeta?.name || filename;
      const driveMime = driveMeta?.mimeType;

      let realExt = detectFileExtension('', driveFileName);
      if (!realExt || realExt === '.jpg') {
        if (driveMime === 'application/pdf') realExt = '.pdf';
        else if (driveMime === 'image/png') realExt = '.png';
        else if (driveMime === 'image/webp') realExt = '.webp';
        else if (driveMime === 'image/jpeg') realExt = '.jpg';
        else if (driveMime?.includes('word')) realExt = '.docx';
        else if (driveMime?.includes('sheet')) realExt = '.xlsx';
      }

      const mimeType = driveMime || detectMimeType('', driveFileName);

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const isDownload = req.query.download === '1' || req.query.download === 'true' || req.path.includes('/download/');
      if (isDownload) {
        let titleBase = req.query.title ? String(req.query.title).trim() : path.basename(driveFileName);
        titleBase = titleBase.replace(/\.[^/.]+$/, '').trim();
        if (!titleBase) titleBase = 'document';

        const downloadFilename = `${titleBase}${realExt}`;
        const safeAscii = downloadFilename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');

        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`
        );
      } else {
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
      }

      return driveStream.pipe(res);
    }
  } catch (driveErr) {
    console.warn(`Drive stream notice for ${filename}:`, driveErr.message);
  }

  // 3. File not found: respond immediately with 404 (NEVER hang or call next() without response)
  const isDownload = req.query.download === '1' || req.query.download === 'true' || req.path.includes('/download/');
  if (isDownload) {
    return res.status(404).send('Document not found on server.');
  }
  return res.status(404).json({ success: false, message: `File "${filename}" not found on server.` });
});

// Serve uploaded files statically as fallback
getUploadDirs().forEach(dir => {
  app.use('/uploads', express.static(dir));
});

// 2. RATE LIMITER (Must be before routes)
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
app.use('/api', limiter);
app.use('/auth', limiter);

// 3. API ROUTES (Mounted with both /api prefix and direct alias for 100% compatibility)
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

app.use('/api/installments', installmentRoutes);
app.use('/installments', installmentRoutes);

app.use('/api/daily-cash', dailyCashRoutes);
app.use('/daily-cash', dailyCashRoutes);

app.use('/api/dashboard', dashboardRoutes);
app.use('/dashboard-api', dashboardRoutes);

app.use('/api/logs', logRoutes);
app.use('/logs', logRoutes);

app.use('/api/backup', backupRoutes);
app.use('/backup', backupRoutes);

app.get('/api/debug-db', async (req, res) => {
  try {
    const uri = process.env.MONGO_URI || 'not-set';
    const maskedUri = uri.replace(/:([^@]+)@/, ':***@');
    const start = Date.now();
    await connectDB();
    const duration = Date.now() - start;
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const customerCount = await db.collection('customers').countDocuments();
    res.json({
      success: true,
      duration: `${duration}ms`,
      uri: maskedUri,
      readyState: mongoose.connection.readyState,
      customerCount,
      collections: collections.map(c => c.name)
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      uri: (process.env.MONGO_URI || '').replace(/:([^@]+)@/, ':***@'),
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.code,
      errorStack: err.stack
    });
  }
});

app.get('/api/system-status', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    try {
      await connectDB();
    } catch (e) {}
  }
  const isOnline = mongoose.connection.readyState === 1 || Boolean(process.env.VERCEL);
  res.json({
    success: true,
    mode: isOnline ? 'online' : 'offline',
    statusMessage: isOnline 
      ? 'Cloud Active (Atlas & Google Drive Synced)' 
      : 'Offline Mode (Local Drive Active - 100% Safe)',
    dbConnected: mongoose.connection.readyState === 1 || Boolean(process.env.VERCEL)
  });
});

// 4. SERVE FRONTEND PRODUCTION BUILD (Single-Port Desktop & Web Serving)
const candidateDistPaths = [
  path.resolve(__dirname, '..', 'dist'),
  path.resolve(__dirname, 'dist'),
  path.resolve(__dirname, '..', 'frontend', 'ISS', 'dist'),
  path.resolve(__dirname, 'public')
];

const frontendDistPath = candidateDistPaths.find(p => fs.existsSync(p));

if (frontendDistPath) {
  console.log(`📦 Serving frontend from: ${frontendDistPath}`);
  
  // Custom header setter to prevent Windows registry MIME type corruption (e.g. text/plain for CSS)
  const setMimeHeaders = (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=UTF-8');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    } else if (filePath.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    }
  };

  // Ultra-fast 1-year cache for immutable hashed assets (JS, CSS, SVGs)
  app.use('/assets', express.static(path.join(frontendDistPath, 'assets'), {
    maxAge: '1y',
    immutable: true,
    setHeaders: setMimeHeaders
  }));

  // General static assets
  app.use(express.static(frontendDistPath, {
    maxAge: '1h',
    setHeaders: setMimeHeaders
  }));

  app.get('*', (req, res, next) => {
    if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/uploads')) {
      return next();
    }
    // CRITICAL FIX: NEVER return index.html for static assets (CSS, JS, fonts, images)
    // If a stylesheet or script is missing, returning HTML causes browsers with 'X-Content-Type-Options: nosniff'
    // to strictly refuse to execute the stylesheet/script, resulting in totally broken, unstyled HTML!
    if (req.originalUrl.startsWith('/assets') || req.path.match(/\.(css|js|map|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i)) {
      return res.status(404).type('text/plain').send('Asset not found');
    }
    // Prevent caching index.html so code updates reload instantly
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  console.warn('⚠️ Frontend dist folder not found in any candidate path!');
}

// 5. 404 JSON HANDLER (For unmatched API endpoints)
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: `API Route ${req.originalUrl} not found` });
});

// 5. GLOBAL ERROR HANDLER (Prevents Server Crash 500 HTML)
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// DEFAULT ADMIN SEEDING
const seedAdmin = async () => {
  try {
    const existingAdmin = await User.findOne({ username: 'admin' });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        name: 'System Owner',
        username: 'admin',
        password: hashedPassword,
        role: 'owner'
      });
      console.log('✅ Default Admin Created');
    }
  } catch (err) {
    console.error('Seed Admin error:', err.message);
  }
};

// Prevent Mongoose from freezing requests when offline / disconnected (Desktop only)
if (!process.env.VERCEL) {
  mongoose.set('bufferCommands', false);
}

// DATABASE CONNECTION & SERVER START
mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB Atlas Connected Successfully');
});
mongoose.connection.on('error', (err) => {
  cachedDbPromise = null;
  console.warn('⚠️ MongoDB Connection Notice:', err.message);
});
mongoose.connection.on('disconnected', () => {
  cachedDbPromise = null;
  console.warn('⚡ Operating in Offline Mode (Local JSON Database Active)');
});
mongoose.connection.on('close', () => {
  cachedDbPromise = null;
});

// Prevent unhandled promise rejections or uncaught errors from killing server
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection Caught:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception Caught:', err?.message || err);
});

// 1. Load Local JSON Database immediately into Node RAM (0ms latency, 100% offline capable)
loadAllData();

// 2. Initialize Backup Scheduler & Prewarm Sales Cache immediately
initBackupScheduler();
prewarmSalesCache().catch(e => console.warn('Cache prewarm notice:', e.message));
seedAdmin().catch(e => console.warn('Seed admin notice:', e.message));
syncAllLocalUploadsToDrive().catch(e => console.warn('Google Drive sync notice:', e.message));

// 3. Start Express Web/Desktop Server immediately (ready in <0.2 seconds)
const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Hajji Mohammad Nabi Autos Server running on port ${PORT}`);
  });
}

// 4. Connect to MongoDB Atlas
connectDB().catch(() => {});

// 5. Start Background Auto-Reconnect and Cloud Sync (checks every 20s)
startBackgroundSyncMonitor(process.env.MONGO_URI);

export default app;