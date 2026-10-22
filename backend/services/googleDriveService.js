import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';

// Ensure .env is loaded
dotenv.config();

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

/**
 * Upload a file directly to the user's 200GB Google One Drive folder
 */
export const uploadToGoogleDrive = async (filePath, customFileName = null, mimeType = null) => {
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

    const fileName = customFileName || path.basename(filePath);
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

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
      parents: [folderId]
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
  }
};

/**
 * Find and stream a file from Google Drive if it is missing locally
 */
export const getFileStreamFromGoogleDrive = async (fileNameOrId) => {
  try {
    const drive = getDriveClient();
    if (!drive) return null;

    let targetFileId = fileNameOrId;

    // If it looks like a filename, search by name in folder
    if (fileNameOrId.includes('.') || fileNameOrId.length > 30) {
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      const searchRes = await drive.files.list({
        q: `'${folderId}' in parents and name = '${fileNameOrId}' and trashed = false`,
        fields: 'files(id, name, mimeType)',
        spaces: 'drive',
        pageSize: 1
      });

      if (searchRes.data.files && searchRes.data.files.length > 0) {
        targetFileId = searchRes.data.files[0].id;
      }
    }

    const response = await drive.files.get(
      { fileId: targetFileId, alt: 'media' },
      { responseType: 'stream' }
    );

    return response.data;
  } catch (error) {
    console.warn(`⚠️ Could not stream file from Google Drive "${fileNameOrId}":`, error.message);
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
