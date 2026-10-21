import mongoose from 'mongoose';
import { createHybridModel } from './hybridModel.js';

const customerSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true
    },
    phone2: {
      type: String,
      trim: true
    },
    cnic: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    profilePic: {
      type: String,
      default: ''
    },
    guarantorName: {
      type: String,
      trim: true
    },
    guarantorPhone: {
      type: String,
      trim: true
    },
    guarantor2Name: {
      type: String,
      trim: true
    },
    guarantor2Phone: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

// Ultra-fast indexes for production search and ledger lookup
customerSchema.index({ phone: 1 });
customerSchema.index({ phone2: 1 });
customerSchema.index({ cnic: 1 });
customerSchema.index({ name: 1 });
customerSchema.index({ createdAt: -1 });
customerSchema.index({ phone: 1, cnic: 1 });
customerSchema.index({ name: 1, phone: 1 });
customerSchema.index({
  name: 'text',
  phone: 'text',
  phone2: 'text',
  cnic: 'text',
  customerId: 'text'
}, {
  weights: { customerId: 10, phone: 8, cnic: 8, name: 5 },
  name: 'CustomerFullTextIdx'
});

const Customer = mongoose.model('Customer', customerSchema);
export default createHybridModel(Customer, 'customers');