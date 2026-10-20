import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import User from './models/User.js';

dotenv.config();

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Purana 'admin' record delete karein taake double hashing ka issue na rahe
    await User.deleteOne({ username: 'admin' });

    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    // Direct collection insert (is se Mongoose pre-save hook bypass ho jata hai aur double hash nahi hota)
    await User.collection.insertOne({
      name: 'System Owner',
      username: 'admin',
      password: hashedPassword,
      role: 'owner',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('✅ Fresh Admin created successfully!');
    console.log('Username: admin');
    console.log('Password: admin123');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
};

createAdmin();