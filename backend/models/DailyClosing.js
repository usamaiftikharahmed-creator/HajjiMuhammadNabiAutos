import mongoose from 'mongoose';
import { createHybridModel } from './hybridModel.js';

const dailyClosingSchema = new mongoose.Schema({
  dateStr: {
    type: String, // Format: YYYY-MM-DD
    required: true,
    unique: true
  },
  openingBalance: {
    type: Number,
    default: 0
  },
  onlineOpeningBalance: {
    type: Number,
    default: 0
  },
  totalCashRecovery: {
    type: Number,
    default: 0
  },
  totalOnlineRecovery: {
    type: Number,
    default: 0
  },
  totalExpenses: {
    type: Number,
    default: 0
  },
  closingBalance: {
    type: Number,
    default: 0
  },
  onlineClosingBalance: {
    type: Number,
    default: 0
  },
  isClosed: {
    type: Boolean,
    default: false
  },
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: {
    type: String,
    default: ''
  }
}, { timestamps: true });
dailyClosingSchema.index({ createdAt: -1 });
dailyClosingSchema.index({ isClosed: 1 });
const DailyClosing = mongoose.model('DailyClosing', dailyClosingSchema);
export default createHybridModel(DailyClosing, 'dailyClosings');