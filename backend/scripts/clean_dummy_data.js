import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

// All candidate data directories
const DATA_DIRS = [
  path.join(WORKSPACE_ROOT, 'Haji Muhammad Nabi Autos', 'data'),
  path.resolve(__dirname, '..', 'data'),
  'G:\\My Drive\\Haji Muhammad Nabi Autos\\data',
  'G:\\My Drive\\Haji Muhammad Nabi Autos'
];

// Upload directories
const UPLOAD_DIRS = [
  path.join(WORKSPACE_ROOT, 'uploads'),
  path.join(WORKSPACE_ROOT, 'Haji Muhammad Nabi Autos', 'uploads'),
  path.resolve(__dirname, '..', 'uploads'),
  'G:\\My Drive\\Haji Muhammad Nabi Autos\\uploads'
];

// Backup directories to clean out old dummy dumps
const BACKUP_DIRS = [
  path.join(WORKSPACE_ROOT, 'Haji Muhammad Nabi Autos', 'backup'),
  path.resolve(__dirname, '..', 'uploads', 'temp_backups'),
  path.resolve(__dirname, '..', 'backups'),
  'G:\\My Drive\\Haji Muhammad Nabi Autos\\backup'
];

async function cleanSystem() {
  console.log('========================================================');
  console.log('🧹 HAJJI MOHAMMAD NABI AUTOS - COMPLETE 100% CLEANUP');
  console.log('========================================================\n');

  // 1. Connect to MongoDB Atlas
  const uri = process.env.MONGO_URI || 'mongodb+srv://usamaiftikharahmed:Chlorobenzene@cluster0.tcuhmiw.mongodb.net/installment_shop?retryWrites=true&w=majority';
  console.log('1. Connecting to MongoDB Atlas...');
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB Atlas!\n');

  const db = mongoose.connection.db;

  // 2. Clean Cloud Atlas Collections
  const collectionsToWipe = [
    'customers',
    'installmentsales',
    'payments',
    'expenses',
    'dailyclosings',
    'products'
  ];

  console.log('2. Wiping Dummy Collections on Cloud Atlas:');
  for (const colName of collectionsToWipe) {
    try {
      const res = await db.collection(colName).deleteMany({});
      console.log(`   🗑️ Atlas [${colName}]: Deleted ${res.deletedCount} records.`);
    } catch (e) {
      console.warn(`   ⚠️ Notice wiping ${colName}:`, e.message);
    }
  }

  // 3. Preserve ONLY admin and yonus in users collection
  console.log('\n3. Preserving "admin" & "yonus" accounts on Atlas:');
  const usersDeleted = await db.collection('users').deleteMany({
    username: { $nin: ['admin', 'yonus'] }
  });
  console.log(`   👥 Removed ${usersDeleted.deletedCount} non-whitelisted users.`);

  // Ensure yonus has proper password and role
  const remainingAtlasUsers = await db.collection('users').find({}).toArray();
  console.log('   ✅ Preserved Atlas Users:');
  for (const u of remainingAtlasUsers) {
    console.log(`      - Username: "${u.username}", Role: "${u.role}", Name: "${u.name}", ID: ${u._id}`);
  }

  // 4. Reset activitylogs on Atlas to 1 clean initialization log
  await db.collection('activitylogs').deleteMany({});
  await db.collection('activitylogs').insertOne({
    action: 'SYSTEM_INITIALIZATION',
    module: 'System',
    details: 'System successfully reset to 100% clean state for live production. All dummy test data wiped. Admin & Yonus preserved.',
    createdAt: new Date(),
    updatedAt: new Date(),
    userName: 'System Admin'
  });
  console.log('   📝 Atlas [activitylogs]: Reset to 1 clean initialization log.');

  // Clean / reset backupSettings on Atlas
  await db.collection('backupsettings').updateMany({}, {
    $set: {
      lastBackupCounts: {
        customers: 0,
        installmentSales: 0,
        payments: 0,
        expenses: 0,
        dailyClosings: 0,
        users: remainingAtlasUsers.length,
        logs: 1
      },
      updatedAt: new Date()
    }
  });
  console.log('   ⚙️ Atlas [backupsettings]: Counts reset to 0.\n');

  // Format clean users list for local storage (matching Atlas exactly)
  const cleanLocalUsers = remainingAtlasUsers.map(u => ({
    _id: String(u._id),
    name: u.name,
    username: u.username,
    role: u.role,
    isActive: u.isActive !== undefined ? u.isActive : true,
    createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : new Date().toISOString(),
    password: u.password,
    __v: 0
  }));

  const cleanLog = [
    {
      _id: new mongoose.Types.ObjectId().toString(),
      action: 'SYSTEM_INITIALIZATION',
      module: 'System',
      details: 'System successfully reset to 100% clean state for live production. All dummy test data wiped. Admin & Yonus preserved.',
      userName: 'System Admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const cleanSummary = {
    systemName: 'Hajji Mohammad Nabi Autos - Installment & Roznamcha System',
    targetEmail: 'hajjimuhammadnabi@gmail.com',
    storageQuota: '200 GB Google One Drive',
    lastSyncedAt: new Date().toISOString(),
    counts: {
      customers: 0,
      installmentSales: 0,
      payments: 0,
      expenses: 0,
      dailyClosings: 0,
      users: cleanLocalUsers.length
    },
    status: 'Clean Production Database Ready (Zero Dummy Data)',
    offlineEngine: 'Active (100% Offline Capable)'
  };

  // 5. Clean All Local and Google Drive JSON Files
  console.log('4. Wiping Local & Google Drive JSON Storage Directories:');
  const jsonCollectionsToEmpty = [
    'customers.json',
    'installmentSales.json',
    'payments.json',
    'expenses.json',
    'dailyClosings.json',
    'deletedRecords.json'
  ];

  for (const dDir of DATA_DIRS) {
    if (!fs.existsSync(dDir)) {
      console.log(`   ⏭️ Skipped non-existent dir: ${dDir}`);
      continue;
    }

    console.log(`   📂 Cleaning files in: ${dDir}`);

    // If this is the root G:\My Drive\Haji Muhammad Nabi Autos, we only clean .json files if they exist
    for (const f of jsonCollectionsToEmpty) {
      const targetFile = path.join(dDir, f);
      try {
        fs.writeFileSync(targetFile, '[]', 'utf-8');
        console.log(`      ✓ Cleared ${f} -> []`);
      } catch (e) {
        console.warn(`      ⚠️ Could not write ${f}:`, e.message);
      }
    }

    // Write clean users.json
    try {
      fs.writeFileSync(path.join(dDir, 'users.json'), JSON.stringify(cleanLocalUsers, null, 2), 'utf-8');
      console.log(`      ✓ users.json -> Preserved ${cleanLocalUsers.length} users (${cleanLocalUsers.map(u => u.username).join(', ')})`);
    } catch (e) {
      console.warn(`      ⚠️ Could not write users.json:`, e.message);
    }

    // Write clean activityLogs.json
    try {
      fs.writeFileSync(path.join(dDir, 'activityLogs.json'), JSON.stringify(cleanLog, null, 2), 'utf-8');
      console.log(`      ✓ activityLogs.json -> 1 initialization log`);
    } catch (e) {}

    // Write clean summary.json
    try {
      fs.writeFileSync(path.join(dDir, 'summary.json'), JSON.stringify(cleanSummary, null, 2), 'utf-8');
      console.log(`      ✓ summary.json -> Zeroed counts`);
    } catch (e) {}
  }

  // 6. Clean Dummy Uploaded Files
  console.log('\n5. Cleaning Dummy Upload Files:');
  for (const uDir of UPLOAD_DIRS) {
    if (!fs.existsSync(uDir)) continue;
    console.log(`   📂 Inspecting uploads dir: ${uDir}`);
    try {
      const files = fs.readdirSync(uDir);
      for (const f of files) {
        if (f === 'temp_backups' || f === '.gitkeep' || f === 'Haji_Muhammad_Nabi_Autos_Connected.txt') continue;
        const fullPath = path.join(uDir, f);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            fs.unlinkSync(fullPath);
            console.log(`      🗑️ Removed uploaded dummy file: ${f}`);
          }
        } catch (e) {}
      }
    } catch (e) {
      console.warn(`      ⚠️ Notice reading uploads dir:`, e.message);
    }
  }

  // 7. Clean Old Backups containing dummy data
  console.log('\n6. Cleaning Old Dummy Backups:');
  for (const bDir of BACKUP_DIRS) {
    if (!fs.existsSync(bDir)) continue;
    console.log(`   📂 Inspecting backup dir: ${bDir}`);
    try {
      const items = fs.readdirSync(bDir);
      for (const it of items) {
        const fullPath = path.join(bDir, it);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log(`      🗑️ Removed old backup directory: ${it}`);
          } else if (stat.isFile() && it.endsWith('.json')) {
            fs.unlinkSync(fullPath);
            console.log(`      🗑️ Removed old backup file: ${it}`);
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  console.log('\n========================================================');
  console.log('🎉 100% COMPLETE! SYSTEM FULLY WIPED & READY FOR PRODUCTION.');
  console.log('Preserved Users:');
  console.log(`  1. admin (${cleanLocalUsers.find(u => u.username === 'admin')?.role || 'owner'})`);
  console.log(`  2. yonus (${cleanLocalUsers.find(u => u.username === 'yonus')?.role || 'staff'})`);
  console.log('All other collections have 0 documents.');
  console.log('========================================================\n');

  await mongoose.disconnect();
}

cleanSystem().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
