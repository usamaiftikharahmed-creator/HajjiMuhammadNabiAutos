import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import Customer from '../models/Customer.js';
import InstallmentSale from '../models/InstallmentSale.js';
import Payment from '../models/Payment.js';
import Expense from '../models/Expense.js';
import DailyClosing from '../models/DailyClosing.js';
import Product from '../models/Product.js';
import ActivityLog from '../models/ActivityLog.js';
import User from '../models/User.js';
import BackupSettings from '../models/BackupSettings.js';
import { createBackup, exportLiveJsonData } from '../services/backupService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function cleanData() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected successfully!');

    // 1. CREATE PRE-CLEANUP SAFETY SNAPSHOT
    console.log('📦 Step 1: Creating Safety Backup of current dummy data before clearance...');
    const backupResult = await createBackup('Pre-Deployment Clean Slate Snapshot');
    console.log('✅ Safety backup created successfully:', backupResult.backup?.fileName);

    // 2. VERIFY USERS TO PRESERVE
    const users = await User.find().select('-password');
    console.log('👥 Preserving Users:');
    users.forEach(u => console.log(`   - ${u.name} (@${u.username}) [Role: ${u.role}]`));

    // 3. DELETE DUMMY COLLECTIONS
    console.log('🧹 Step 2: Clearing Dummy Records...');
    const [delCust, delSales, delPay, delExp, delClosing, delProd, delLogs] = await Promise.all([
      Customer.deleteMany({}),
      InstallmentSale.deleteMany({}),
      Payment.deleteMany({}),
      Expense.deleteMany({}),
      DailyClosing.deleteMany({}),
      Product.deleteMany({}),
      ActivityLog.deleteMany({})
    ]);

    console.log(`   - Deleted ${delCust.deletedCount} Customers`);
    console.log(`   - Deleted ${delSales.deletedCount} Installment Sales`);
    console.log(`   - Deleted ${delPay.deletedCount} Payments`);
    console.log(`   - Deleted ${delExp.deletedCount} Expenses`);
    console.log(`   - Deleted ${delClosing.deletedCount} Daily Closings`);
    console.log(`   - Deleted ${delProd.deletedCount} Products`);
    console.log(`   - Deleted ${delLogs.deletedCount} Activity Logs`);

    // 4. CLEAN UPLOADS FOLDER (PRESERVE temp_backups)
    console.log('📁 Step 3: Cleaning dummy uploads...');
    const uploadsDir = path.resolve(__dirname, '..', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      let removedUploads = 0;
      for (const f of files) {
        if (f !== 'temp_backups') {
          const filePath = path.join(uploadsDir, f);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
            removedUploads++;
          }
        }
      }
      console.log(`   - Removed ${removedUploads} dummy upload files.`);
    }

    // 5. CREATE CLEAN INITIAL ACTIVITY LOG
    const adminUser = await User.findOne({ role: 'owner' }) || users[0];
    await ActivityLog.create({
      user: adminUser?._id,
      action: 'SYSTEM_INITIALIZATION',
      module: 'System',
      details: 'System successfully reset to clean state for real-time production deployment. All credentials preserved.',
      metadata: {
        preservedUsers: users.map(u => ({ username: u.username, role: u.role })),
        cleanDate: new Date()
      }
    });
    console.log('✅ Initialized clean production activity log');

    // 6. EXPORT FRESH CLEAN JSON DATA TO LOCAL & GOOGLE DRIVE
    console.log('☁️ Step 4: Syncing clean JSON files to Haji Muhammad Nabi Autos/data/ and Google Drive...');
    const syncRes = await exportLiveJsonData();
    console.log('✅ Live JSON Export completed:', syncRes);

    console.log('\n🎉 ========================================================');
    console.log('🎉 ALL DUMMY DATA HAS BEEN REMOVED SUCCESSFULLY!');
    console.log('🎉 SYSTEM IS NOW 100% READY FOR REAL SHOP DEPLOYMENT!');
    console.log('🎉 Admin & Staff credentials are fully intact and ready to login.');
    console.log('🎉 ========================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Clean data error:', err);
    process.exit(1);
  }
}

cleanData();
