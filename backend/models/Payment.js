import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    installmentSale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InstallmentSale',
      required: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },
    amountPaid: {
      type: Number,
      required: true
    },
    paymentMethod: {
      type: String,
      required: true
    },
    forMonth: {
      type: String // Month save karne ke liye (e.g., 'Sep 2026')
    },
    transactionId: {
      type: String
    },
    notes: {
      type: String
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

// High-performance single and compound indexes
paymentSchema.index({ installmentSale: 1, createdAt: -1 });
paymentSchema.index({ customer: 1, createdAt: -1 });
paymentSchema.index({ createdAt: -1, amountPaid: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ forMonth: 1 });
paymentSchema.index({ paymentMethod: 1 });
paymentSchema.index({ receivedBy: 1 });

export default mongoose.model('Payment', paymentSchema);