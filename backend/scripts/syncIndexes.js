import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Customer from '../models/Customer.js';
import InstallmentSale from '../models/InstallmentSale.js';
import Payment from '../models/Payment.js';
import DailyClosing from '../models/DailyClosing.js';
import Expense from '../models/Expense.js';
import ActivityLog from '../models/ActivityLog.js';
import User from '../models/User.js';
import Product from '../models/Product.js';

dotenv.config();

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected! Syncing indexes across all collections...');

    const models = [
      { name: 'Customer', model: Customer },
      { name: 'InstallmentSale', model: InstallmentSale },
      { name: 'Payment', model: Payment },
      { name: 'DailyClosing', model: DailyClosing },
      { name: 'Expense', model: Expense },
      { name: 'ActivityLog', model: ActivityLog },
      { name: 'User', model: User },
      { name: 'Product', model: Product },
    ];

    for (const { name, model } of models) {
      console.log(`Creating indexes for ${name}...`);
      await model.createIndexes();
      const indexes = await model.collection.indexes();
      console.log(`✅ ${name} has ${indexes.length} active indexes:`, indexes.map(i => i.name).join(', '));
    }

    console.log('\n🚀 ALL DATABASE INDEXES SUCCESSFULLY BUILT AND ACTIVE!');
    process.exit(0);
  } catch (err) {
    console.error('Error syncing indexes:', err);
    process.exit(1);
  }
}

run();
