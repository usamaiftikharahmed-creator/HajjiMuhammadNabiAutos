import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDist = path.resolve(__dirname, 'dist');
const targets = [
  path.resolve(__dirname, '..', '..', 'dist'),
  path.resolve(__dirname, '..', '..', 'backend', 'dist')
];

for (const target of targets) {
  try {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(sourceDist, target, { recursive: true });
    console.log(`✅ Synced dist to: ${target}`);
  } catch (err) {
    console.error(`⚠️ Failed to sync dist to ${target}:`, err.message);
  }
}
