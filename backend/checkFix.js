import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/installment_shop';

async function verifyAndFix() {
  console.log('\n====================================');
  console.log('🔍 1. CONNECTING TO DB:', MONGO_URI);
  
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ 2. DATABASE CONNECTED!');

    // Puraana admin delete karein
    await User.deleteOne({ username: 'admin' });

    // Fresh admin create karein
    const admin = new User({
      name: 'System Owner',
      username: 'admin',
      password: 'admin123',
      role: 'owner',
      isActive: true
    });

    await admin.save();
    console.log('✅ 3. FRESH ADMIN CREATED!');

    // Script me hi instant test check karein
    const testUser = await User.findOne({ username: 'admin' });
    const isPasswordCorrect = await testUser.comparePassword('admin123');

    console.log('====================================');
    if (isPasswordCorrect) {
      console.log('🎉 RESULT: BACKEND & DATABASE IS 100% FIXED!');
      console.log('Credentials: admin / admin123');
    } else {
      console.log('❌ RESULT: Password match failed inside schema.');
    }
    console.log('====================================\n');
    process.exit(0);

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    process.exit(1);
  }
}

verifyAndFix();