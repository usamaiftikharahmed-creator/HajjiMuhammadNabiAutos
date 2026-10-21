import mongoose from 'mongoose';
import { createHybridModel } from './hybridModel.js';

const activityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    userName: {
      type: String,
      default: 'Admin / System',
      trim: true
    },
    userRole: {
      type: String,
      default: 'owner'
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    module: {
      type: String,
      required: true,
      enum: ['Installments', 'Payments', 'Expenses', 'DailyCash', 'Customers', 'Backup', 'Auth', 'Staff', 'System'],
      default: 'System',
      index: true
    },
    details: {
      type: String,
      required: true,
      trim: true
    },
    targetId: {
      type: String,
      default: ''
    },
    targetName: {
      type: String,
      default: ''
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      default: '127.0.0.1'
    }
  },
  { timestamps: true }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ module: 1, createdAt: -1 });
activityLogSchema.index({ user: 1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
export default createHybridModel(ActivityLog, 'activityLogs');
