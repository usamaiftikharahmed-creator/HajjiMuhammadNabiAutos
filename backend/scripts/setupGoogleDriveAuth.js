import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.resolve(__dirname, '..');

// 1. Locate Client Secret JSON
const filesInBackend = fs.readdirSync(BACKEND_DIR);
const secretFile = filesInBackend.find(f => f.startsWith('client_secret_') && f.endsWith('.json'));

if (!secretFile) {
  console.error('❌ Could not find client_secret_*.json in backend/ folder.');
  process.exit(1);
}

const secretData = JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, secretFile), 'utf-8'));
const clientConfig = secretData.installed || secretData.web;

if (!clientConfig) {
  console.error('❌ Invalid client secret JSON structure: missing "installed" or "web" key.');
  process.exit(1);
}

const { client_id, client_secret } = clientConfig;
const PORT = 8085;
const REDIRECT_URI = `http://localhost:${PORT}`;
const FOLDER_ID = '1_pMbM5YIgmXMCcm_0Ct06No5vbz8jhH6';

const oauth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file'
  ]
});

console.log('\n===============================================================');
console.log('   🚀 GOOGLE DRIVE 200GB CLOUD AUTHORIZATION');
console.log('===============================================================');
console.log('Client ID:', client_id);
console.log('Target Folder ID:', FOLDER_ID);
console.log('\nPlease open this link in your browser to authorize:');
console.log('\n👉 ' + authUrl + '\n');
console.log('===============================================================\n');

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url, true);
    const code = parsedUrl.query.code;

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h3>Missing authorization code. Please retry.</h3>');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 80px; background: #0f172a; color: #fff; padding: 40px; border-radius: 12px; max-width: 600px; margin-left: auto; margin-right: auto;">
        <h1 style="color: #10b981;">✅ Google Drive Authorization Successful!</h1>
        <p style="font-size: 18px; color: #cbd5e1;">Aapka Google One 200GB Drive kamyabi se connect ho gaya hai.</p>
        <p style="font-size: 14px; color: #94a3b8;">Aap is tab ko band kar sakte hain aur wapas terminal/chat par ja sakte hain.</p>
      </div>
    `);

    console.log('🔑 Authorization code received! Exchanging for tokens...');
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.warn('⚠️ No refresh_token returned. (Prompt consent was requested). Using existing token if available.');
    }

    console.log('✅ Tokens successfully obtained!');

    // Update backend/.env file
    const envPath = path.join(BACKEND_DIR, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

    const updateEnvVar = (key, value) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    };

    updateEnvVar('GOOGLE_CLIENT_ID', client_id);
    updateEnvVar('GOOGLE_CLIENT_SECRET', client_secret);
    if (tokens.refresh_token) {
      updateEnvVar('GOOGLE_REFRESH_TOKEN', tokens.refresh_token);
    }
    updateEnvVar('GOOGLE_DRIVE_FOLDER_ID', FOLDER_ID);

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
    console.log('💾 Updated backend/.env with Google Drive credentials!');

    // Test upload to verify folder permission
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    console.log('🔄 Uploading connection test file to Google Drive folder...');
    const fileMetadata = {
      name: 'Haji_Muhammad_Nabi_Autos_Connected.txt',
      parents: [FOLDER_ID]
    };
    const media = {
      mimeType: 'text/plain',
      body: `Hajji Mohammad Nabi Autos - Google Drive 200GB Storage Successfully Linked!\nTimestamp: ${new Date().toISOString()}\nTarget Folder: ${FOLDER_ID}\nStatus: Live Cloud Uploads Active`
    };

    const testFile = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });

    // Make test file readable so public links work
    try {
      await drive.permissions.create({
        fileId: testFile.data.id,
        requestBody: { role: 'reader', type: 'anyone' }
      });
    } catch (permErr) {
      console.warn('Permission warning:', permErr.message);
    }

    console.log('🎉 TEST FILE UPLOADED SUCCESSFULLY TO GOOGLE DRIVE!');
    console.log('File Name:', testFile.data.name);
    console.log('File ID:', testFile.data.id);
    console.log('Web View Link:', testFile.data.webViewLink);
    console.log('\n===============================================================');
    console.log('   ✅ ALL DONE! GOOGLE DRIVE IS FULLY OPERATIONAL');
    console.log('===============================================================\n');

    server.close(() => {
      process.exit(0);
    });
  } catch (err) {
    console.error('❌ Error handling OAuth callback:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Error: ' + err.message);
    server.close(() => process.exit(1));
  }
});

server.listen(PORT, () => {
  console.log(`Listening for Google OAuth callback on ${REDIRECT_URI} ...`);
});
