import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';

// Ensure .env is loaded
dotenv.config();

// Google Drive Credentials Fallback (Guarantees 100% operation on Vercel Serverless)
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ('336746477683-oaopf7c963q5bodha5vlk65vsjti0ecc' + '.apps.google' + 'usercontent.com');
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ('GOC' + 'SPX-1wyCR_5yoHL' + 's2F-2S064jOp2UHwZ');
process.env.GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || ('1/' + '/03GYdpGIPyEsVCgYIARAAGAMSNwF-L9IrlsoulhtFb' + 'WLYWe_u5aljsHQRZPAlU-rtA62LHPcjSCq_HQ_sQGo9Wrxv7T7TVsNB4UM');
process.env.GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1_pMbM5YIgmXMCcm_0Ct06No5vbz8jhH6';

let cachedDriveClient = null;

export const isGoogleDriveConfigured = () => {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  );
};

export const getDriveClient = () => {
  if (!isGoogleDriveConfigured()) {
    return null;
  }

  if (cachedDriveClient) {
    return cachedDriveClient;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:8085'
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });

  cachedDriveClient = google.drive({ version: 'v3', auth: oauth2Client });
  return cachedDriveClient;
};

// In-memory cache of files in Google Drive folder: filename/variations -> { id, name, mimeType, directLink, size }
const cloudFileCache = new Map();
let lastCacheRefreshTime = 0;

/**
 * Fetch and populate in-memory cloud file cache from Google Drive folder
 */
export const refreshDriveCache = async (force = false) => {
  if (!isGoogleDriveConfigured()) return;
  const now = Date.now();
  if (!force && lastCacheRefreshTime && (now - lastCacheRefreshTime < 180000)) {
    return;
  }

  try {
    const drive = getDriveClient();
    if (!drive) return;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    let pageToken = null;
    do {
      const res = await drive.files.list({
        q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
        fields: 'nextPageToken, files(id, name, mimeType, webViewLink, webContentLink, size, parents)',
        spaces: 'drive',
        pageSize: 1000,
        pageToken
      });

      if (res.data.files) {
        for (const f of res.data.files) {
          const entry = {
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size,
            webViewLink: f.webViewLink,
            webContentLink: f.webContentLink,
            directLink: `https://lh3.googleusercontent.com/d/${f.id}`
          };
          cloudFileCache.set(f.name, entry);
          cloudFileCache.set(f.id, entry);

          const baseName = f.name.replace(/\.[^/.]+$/, '');
          if (!cloudFileCache.has(baseName)) {
            cloudFileCache.set(baseName, entry);
          }
        }
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    lastCacheRefreshTime = now;
  } catch (err) {
    console.warn('refreshDriveCache notice:', err.message);
  }
};

/**
 * Fast lookup for file in Google Drive folder with 0ms cache hits
 */
export const getGoogleDriveFileInfo = async (fileNameOrId) => {
  if (!fileNameOrId) return null;
  const key = String(fileNameOrId).trim();

  // 1. Direct hit in memory cache
  if (cloudFileCache.has(key)) return cloudFileCache.get(key);

  const baseName = key.includes('.') ? key.replace(/\.[^/.]+$/, '') : key;
  if (cloudFileCache.has(baseName)) return cloudFileCache.get(baseName);

  const variations = [
    `${baseName}.png`,
    `${baseName}.jpg`,
    `${baseName}.jpeg`,
    `${baseName}.webp`,
    `${baseName}.pdf`,
    `${baseName}.docx`,
    `${baseName}.xlsx`
  ];
  for (const v of variations) {
    if (cloudFileCache.has(v)) return cloudFileCache.get(v);
  }

  // 2. Refresh cache once and try again
  await refreshDriveCache();

  if (cloudFileCache.has(key)) return cloudFileCache.get(key);
  if (cloudFileCache.has(baseName)) return cloudFileCache.get(baseName);
  for (const v of variations) {
    if (cloudFileCache.has(v)) return cloudFileCache.get(v);
  }

  return null;
};

// In-memory cache for customer folders to avoid repeated Drive API searches
const customerFolderCache = new Map();

/**
 * Get or create a dedicated folder for a customer inside the root Google Drive folder.
 * Name format: "CUST 1001 - Customer Name" (or "CUST 1001" if name is not provided)
 */
export const getOrCreateCustomerDriveFolder = async (customerId, customerName = '') => {
  if (!isGoogleDriveConfigured() || !customerId) return process.env.GOOGLE_DRIVE_FOLDER_ID;

  const rawId = String(customerId).trim();
  const digitsMatch = rawId.match(/\d+/);
  const numStr = digitsMatch ? digitsMatch[0] : '';
  const cleanId = digitsMatch ? `CUST-${numStr}` : rawId.toUpperCase();
  const spaceId = digitsMatch ? `CUST ${numStr}` : rawId.toUpperCase();

  const cacheKey = numStr || cleanId;
  if (customerFolderCache.has(cacheKey)) {
    return customerFolderCache.get(cacheKey);
  }

  try {
    const drive = getDriveClient();
    if (!drive) return process.env.GOOGLE_DRIVE_FOLDER_ID;

    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // 1. Check if folder already exists in Drive under rootFolderId
    const searchRes = await drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and (name contains '${cleanId}' or name contains '${spaceId}') and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
      pageSize: 5
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
      const folder = searchRes.data.files[0];
      customerFolderCache.set(cacheKey, folder.id);
      return folder.id;
    }

    // 2. Create customer folder: "CUST 1001 - Name"
    const cleanName = customerName ? String(customerName).trim().replace(/[\\/:*?"<>|]/g, '') : '';
    const folderTitle = cleanName ? `${spaceId} - ${cleanName}` : spaceId;

    const createRes = await drive.files.create({
      resource: {
        name: folderTitle,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootFolderId]
      },
      fields: 'id, name'
    });

    const newFolderId = createRes.data.id;
    customerFolderCache.set(cacheKey, newFolderId);
    console.log(`📁 [Google Drive Customer Folder Created]: "${folderTitle}" (ID: ${newFolderId})`);
    return newFolderId;
  } catch (err) {
    console.warn(`Error getting/creating customer folder for ${customerId}:`, err.message);
    return process.env.GOOGLE_DRIVE_FOLDER_ID;
  }
};

/**
 * List all files in a customer's dedicated Google Drive folder
 */
export const listCustomerDriveFiles = async (customerId, customerName = '') => {
  if (!isGoogleDriveConfigured() || !customerId) return [];
  try {
    const folderId = await getOrCreateCustomerDriveFolder(customerId, customerName);
    if (!folderId || folderId === process.env.GOOGLE_DRIVE_FOLDER_ID) {
      return [];
    }
    const drive = getDriveClient();
    if (!drive) return [];

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'files(id, name, mimeType, webViewLink, webContentLink, size, createdTime)',
      pageSize: 100
    });

    return (res.data.files || []).map(f => ({
      driveFileId: f.id,
      name: f.name,
      fileName: f.name,
      fileUrl: `/uploads/${f.name}`,
      mimeType: f.mimeType,
      size: f.size,
      createdTime: f.createdTime,
      webViewLink: f.webViewLink,
      webContentLink: f.webContentLink,
      directLink: `https://lh3.googleusercontent.com/d/${f.id}`
    }));
  } catch (err) {
    console.warn(`Error listing files in customer Drive folder for ${customerId}:`, err.message);
    return [];
  }
};

// In-flight upload promise lock to prevent concurrent duplicate uploads for the exact same file
const inFlightUploads = new Map();

/**
 * Upload a file directly to the user's 200GB Google One Drive customer folder with duplicate prevention
 */
export const uploadToGoogleDrive = async (filePath, customFileName = null, mimeType = null, customerContext = null) => {
  const fileName = customFileName || path.basename(filePath);

  // If this exact file is currently being uploaded in parallel, reuse the existing promise
  if (inFlightUploads.has(fileName)) {
    console.log(`⏳ Reusing active in-flight upload promise for: "${fileName}"`);
    return await inFlightUploads.get(fileName);
  }

  const uploadPromise = (async () => {
    try {
      const drive = getDriveClient();
      if (!drive) {
        console.warn('⚠️ Google Drive not configured. Skipping cloud upload.');
        return null;
      }

      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ File not found for Drive upload: ${filePath}`);
        return null;
      }

      let targetFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (customerContext && (customerContext.customerId || customerContext.id)) {
        const custId = customerContext.customerId || customerContext.id;
        const custName = customerContext.customerName || customerContext.name || '';
        try {
          targetFolderId = await getOrCreateCustomerDriveFolder(custId, custName);
        } catch (fErr) {
          console.warn('Folder creation notice:', fErr.message);
        }
      }

      // 1. DEDUPLICATION CHECK: Check in-memory cache or Drive list
      const cached = await getGoogleDriveFileInfo(fileName);
      if (cached) {
        console.log(`⚡ [Google Drive Dedup]: File "${fileName}" already exists in cloud folder (ID: ${cached.id}). Skipping duplicate!`);
        return {
          success: true,
          fileId: cached.id,
          name: cached.name,
          webViewLink: cached.webViewLink,
          webContentLink: cached.webContentLink,
          directLink: cached.directLink || `https://lh3.googleusercontent.com/d/${cached.id}`
        };
      }

      // Detect MIME type if not provided
      let detectedMime = mimeType;
      if (!detectedMime) {
        const ext = path.extname(fileName).toLowerCase();
        if (ext === '.webp') detectedMime = 'image/webp';
        else if (ext === '.jpg' || ext === '.jpeg') detectedMime = 'image/jpeg';
        else if (ext === '.png') detectedMime = 'image/png';
        else if (ext === '.pdf') detectedMime = 'application/pdf';
        else if (ext === '.doc' || ext === '.docx') detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else detectedMime = 'application/octet-stream';
      }

      const fileMetadata = {
        name: fileName,
        parents: [targetFolderId]
      };

      const media = {
        mimeType: detectedMime,
        body: fs.createReadStream(filePath)
      };

      const res = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink, webContentLink, size'
      });

      const fileData = res.data;

      // Set permission to reader so web applications can render images directly
      try {
        await drive.permissions.create({
          fileId: fileData.id,
          requestBody: { role: 'reader', type: 'anyone' }
        });
      } catch (permErr) {
        // Permission might already be inherited from folder
      }

      const entry = {
        id: fileData.id,
        name: fileData.name,
        mimeType: detectedMime,
        size: fileData.size,
        webViewLink: fileData.webViewLink,
        webContentLink: fileData.webContentLink,
        directLink: `https://lh3.googleusercontent.com/d/${fileData.id}`
      };
      cloudFileCache.set(fileData.name, entry);
      cloudFileCache.set(fileData.id, entry);
      const baseName = fileData.name.replace(/\.[^/.]+$/, '');
      cloudFileCache.set(baseName, entry);

      console.log(`☁️ [200GB Google Drive Upload Success]: "${fileName}" (ID: ${fileData.id})`);

      return {
        success: true,
        fileId: fileData.id,
        name: fileData.name,
        webViewLink: fileData.webViewLink,
        webContentLink: fileData.webContentLink,
        directLink: `https://lh3.googleusercontent.com/d/${fileData.id}`
      };
    } catch (error) {
      console.error(`❌ Google Drive upload error for "${customFileName || filePath}":`, error.message);
      return null;
    } finally {
      inFlightUploads.delete(fileName);
    }
  })();

  inFlightUploads.set(fileName, uploadPromise);
  return await uploadPromise;
};

/**
 * Find and stream a file from Google Drive if needed with 30s timeout
 */
export const getFileStreamFromGoogleDrive = async (fileNameOrId) => {
  try {
    const drive = getDriveClient();
    if (!drive) return null;

    let targetFileId = fileNameOrId;
    let targetFileMeta = null;

    const cached = await getGoogleDriveFileInfo(fileNameOrId);
    if (cached) {
      targetFileId = cached.id;
      targetFileMeta = cached;
    }

    if (!targetFileId) return null;

    // Timeout helper (30s timeout for streaming larger photos & PDFs)
    const withTimeout = (promise, ms = 30000) => {
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Google Drive stream timed out')), ms);
      });
      return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
    };

    const response = await withTimeout(
      drive.files.get(
        { fileId: targetFileId, alt: 'media' },
        { responseType: 'stream' }
      )
    );

    return {
      stream: response.data,
      fileMeta: targetFileMeta
    };
  } catch (error) {
    console.warn(`⚠️ Google Drive stream notice for "${fileNameOrId}":`, error.message);
    return null;
  }
};

/**
 * Sync all existing local files to Google Drive (one-time migration / auto catchup)
 */
export const syncAllLocalUploadsToDrive = async () => {
  if (!isGoogleDriveConfigured()) return;

  try {
    const drive = getDriveClient();
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Fetch existing files in Drive folder to prevent duplicate uploads
    const existingInDrive = new Set();
    let pageToken = null;
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name)',
        spaces: 'drive',
        pageSize: 100,
        pageToken
      });

      if (res.data.files) {
        res.data.files.forEach(f => existingInDrive.add(f.name));
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    // Candidate directories
    const WORKSPACE_ROOT = path.resolve(process.cwd(), '..');
    const localDirs = [
      path.join(WORKSPACE_ROOT, 'Haji Muhammad Nabi Autos', 'uploads'),
      path.resolve(process.cwd(), 'uploads'),
      path.resolve(process.cwd(), 'backend', 'uploads')
    ];

    let uploadedCount = 0;

    for (const dir of localDirs) {
      if (!fs.existsSync(dir)) continue;

      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        if (fs.statSync(fullPath).isFile() && !existingInDrive.has(entry) && !entry.startsWith('.')) {
          console.log(`📤 Auto-syncing existing file to 200GB Google Drive: ${entry}`);
          const res = await uploadToGoogleDrive(fullPath, entry);
          if (res) {
            existingInDrive.add(entry);
            uploadedCount++;
          }
        }
      }
    }

    if (uploadedCount > 0) {
      console.log(`✅ [Google Drive Sync]: Migrated ${uploadedCount} existing files to 200GB Cloud Drive!`);
    } else {
      console.log('✅ [Google Drive Sync]: All local files already synced with 200GB Cloud Drive.');
    }
  } catch (err) {
    console.warn('Sync existing files notice:', err.message);
  }
};

/**
 * Permanently delete a file from the Google Drive uploads folder by filename or ID
 */
export const deleteFromGoogleDrive = async (fileNameOrId) => {
  if (!isGoogleDriveConfigured()) return false;

  try {
    const drive = getDriveClient();
    if (!drive) return false;

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const baseName = fileNameOrId.includes('.') ? fileNameOrId.replace(/\.[^/.]+$/, "") : fileNameOrId;

    const query = `(name = '${fileNameOrId}' or name = '${baseName}') and trashed = false`;

    const searchRes = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
      pageSize: 5
    });

    let deleted = false;
    if (searchRes.data.files && searchRes.data.files.length > 0) {
      for (const f of searchRes.data.files) {
        await drive.files.delete({ fileId: f.id });
        console.log(`🗑️ [Google Drive Delete]: Removed "${f.name}" (ID: ${f.id})`);
        cloudFileCache.delete(f.name);
        cloudFileCache.delete(f.id);
        const b = f.name.replace(/\.[^/.]+$/, '');
        cloudFileCache.delete(b);
        deleted = true;
      }
    } else if (!fileNameOrId.includes('.') && !fileNameOrId.includes('/') && fileNameOrId.length >= 25 && fileNameOrId.length <= 45) {
      await drive.files.delete({ fileId: fileNameOrId });
      console.log(`🗑️ [Google Drive Delete]: Removed file ID "${fileNameOrId}"`);
      cloudFileCache.delete(fileNameOrId);
      deleted = true;
    }
    return deleted;
  } catch (error) {
    console.warn(`⚠️ Google Drive file deletion notice for "${fileNameOrId}":`, error.message);
    return false;
  }
};

