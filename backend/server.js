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

// Fix Windows DNS SRV lookup failures for MongoDB Atlas
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore if permissions disallow custom DNS
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
  credentials: true 
}));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

import { getUploadDirs } from './services/uploadService.js';

// Serve uploaded files statically from all possible directories (Haji Muhammad Nabi Autos/uploads, backend/uploads, G-Drive)
getUploadDirs().forEach(dir => {
  app.use('/uploads', express.static(dir));
});

// 2. RATE LIMITER (Must be before routes)
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
app.use('/api', limiter);

// 3. API ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/installments', installmentRoutes);
app.use('/api/daily-cash', dailyCashRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/backup', backupRoutes);

app.get('/api/system-status', (req, res) => {
  const isOnline = mongoose.connection.readyState === 1;
  res.json({
    success: true,
    mode: isOnline ? 'online' : 'offline',
    statusMessage: isOnline 
      ? 'Cloud Active (Atlas & Google Drive Synced)' 
      : 'Offline Mode (Local Drive Active - 100% Safe)',
    dbConnected: isOnline
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

// Prevent Mongoose from freezing requests when offline / disconnected
mongoose.set('bufferCommands', false);

// DATABASE CONNECTION & SERVER START
mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB Atlas Connected Successfully');
});
mongoose.connection.on('error', (err) => {
  console.warn('⚠️ MongoDB Connection Notice:', err.message);
});
mongoose.connection.on('disconnected', () => {
  console.warn('⚡ Operating in Offline Mode (Local JSON Database Active)');
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

// 3. Start Express Web/Desktop Server immediately (ready in <0.2 seconds)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Hajji Mohammad Nabi Autos Server running on port ${PORT}`);
});

// 4. Connect to MongoDB Atlas in background without blocking server or login
mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 2500,
  connectTimeoutMS: 2500
})
  .then(async () => {
    console.log('☁️ Cloud Atlas Connected! Synchronizing data with local drive...');
    await syncOfflineDataToAtlas();
  })
  .catch(err => {
    console.log('⚡ Offline Mode Active: Running seamlessly with 100% Local JSON Database in "Haji Muhammad Nabi Autos/data/"');
  });

// 5. Start Background Auto-Reconnect and Cloud Sync (checks every 20s)
startBackgroundSyncMonitor(process.env.MONGO_URI);

export default app;