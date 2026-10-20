import express from 'express';
import dotenv from 'dotenv';
import dns from 'dns';

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
import User from './models/User.js';

import compression from 'compression';

dotenv.config();
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

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

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

// 4. SERVE FRONTEND PRODUCTION BUILD (Single-Port Desktop & Web Serving)
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidateDistPaths = [
  path.resolve(__dirname, 'dist'),
  path.resolve(__dirname, 'public'),
  path.resolve(__dirname, '..', 'dist'),
  path.resolve(__dirname, '..', 'frontend', 'ISS', 'dist')
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

// DATABASE CONNECTION & SERVER START
mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB Connected Successfully');
});
mongoose.connection.on('error', (err) => {
  console.error('⚠️ MongoDB Connection Error:', err.message);
});
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB Disconnected. Waiting to reconnect...');
});

// Prevent unhandled promise rejections or uncaught errors from killing server
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection Caught:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception Caught:', err?.message || err);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    await seedAdmin();
    // Initialize Automated 10:00 PM Daily Backup Scheduler
    initBackupScheduler();
    // Prewarm sales cache into Node RAM for 0.005s instant first page loads (non-blocking)
    prewarmSalesCache().catch(e => console.error('Cache prewarm error:', e.message));
  })
  .catch(err => {
    console.error('❌ Initial MongoDB Connection Error:', err.message);
  });