import mongoose from 'mongoose';
import { createHybridModel } from './hybridModel.js';

const expenseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    default: 'General',
    trim: true
  },
  paymentMethod: {
    type: String,
    default: 'Cash',
    trim: true
  },
  notes: {
    type: String,
    default: ''
  },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  date: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

expenseSchema.index({ createdAt: -1 });
expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ date: -1, category: 1 });

const Expense = mongoose.model('Expense', expenseSchema);
export default createHybridModel(Expense, 'expenses');