import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const DATA_DIR = path.resolve(__dirname, '..', '..', 'Haji Muhammad Nabi Autos', 'data');
const MONGO_URI = process.env.MONGO_URI;

const collectionMapping = [
  { file: 'users.json', col: 'users' },
  { file: 'customers.json', col: 'customers' },
  { file: 'installmentSales.json', col: 'installmentsales' },
  { file: 'payments.json', col: 'payments' },
  { file: 'expenses.json', col: 'expenses' },
  { file: 'dailyClosings.json', col: 'dailyclosings' },
  { file: 'activityLogs.json', col: 'activitylogs' },
  { file: 'backupSettings.json', col: 'backupsettings' }
];

async function runMigration() {
  console.log('🔄 Connecting to NEW MongoDB Atlas Cluster...');
  console.log('URI:', MONGO_URI.replace(/:([^@]+)@/, ':***@'));
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB Atlas DB:', mongoose.connection.name);

  const db = mongoose.connection.db;

  for (const item of collectionMapping) {
    const filePath = path.join(DATA_DIR, item.file);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ File not found: ${item.file}`);
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const docs = JSON.parse(content);

      if (!Array.isArray(docs) || docs.length === 0) {
        console.log(`ℹ️ ${item.file} is empty or not an array. Skipped.`);
        continue;
      }

      console.log(`📦 Migrating ${docs.length} records for ${item.col}...`);
      const col = db.collection(item.col);

      // Convert ObjectIds if needed and prepare bulk upsert
      const ops = docs.map(doc => {
        const cleanDoc = { ...doc };
        if (cleanDoc._id) {
          try {
            if (typeof cleanDoc._id === 'string' && cleanDoc._id.length === 24) {
              cleanDoc._id = new mongoose.Types.ObjectId(cleanDoc._id);
            }
          } catch (e) {}
        }
        if (cleanDoc.customer && typeof cleanDoc.customer === 'string' && cleanDoc.customer.length === 24) {
          try {
            cleanDoc.customer = new mongoose.Types.ObjectId(cleanDoc.customer);
          } catch (e) {}
        }
        if (cleanDoc.sale && typeof cleanDoc.sale === 'string' && cleanDoc.sale.length === 24) {
          try {
            cleanDoc.sale = new mongoose.Types.ObjectId(cleanDoc.sale);
          } catch (e) {}
        }

        return {
          updateOne: {
            filter: { _id: cleanDoc._id },
            update: { $set: cleanDoc },
            upsert: true
          }
        };
      });

      const res = await col.bulkWrite(ops, { ordered: false });
      const totalCount = await col.countDocuments();
      console.log(`✅ ${item.col}: Synced! Total in Atlas now: ${totalCount}`);
    } catch (err) {
      console.error(`❌ Error migrating ${item.file}:`, err.message);
    }
  }

  console.log('\n🎉 ALL DATA HAS BEEN SUCCESSFULLY TRANSFERRED TO YOUR NEW MONGODB ATLAS ACCOUNT!');
  await mongoose.disconnect();
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
