import mongoose from 'mongoose';

const installmentSaleSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },
    itemName: {
      type: String,
      required: true
    },
    itemRegNumber: {
      type: String,
      default: ''
    },
    registrationNumber: {
      type: String,
      default: ''
    },
    engineNumber: {
      type: String,
      default: ''
    },
    chassisNumber: {
      type: String,
      default: ''
    },
    totalAmount: {
      type: Number,
      required: true
    },
    advancePayment: {
      type: Number,
      default: 0
    },
    remainingBalance: {
      type: Number,
      required: true
    },
    monthlyAmount: {
      type: Number,
      required: true
    },
    totalMonths: {
      type: Number,
      required: true
    },
    promiseMonth: {
      type: String,
      default: ''
    },
    promisedMonths: {
      type: Number,
      default: null
    },
    dueDateDay: {
      type: Number,
      required: true
    },

    // Customer Profile Picture & CNIC Copies
    profilePic: { type: String, default: '' },
    cnicFront: { type: String, default: '' },
    cnicBack: { type: String, default: '' },

    // Guarantor 1 Fields
    guarantorName: { type: String, default: '' },
    guarantorPhone: { type: String, default: '' },
    guarantor1CnicFront: { type: String, default: '' },
    guarantor1CnicBack: { type: String, default: '' },

    // Guarantor 2 Fields
    guarantor2Name: { type: String, default: '' },
    guarantor2Phone: { type: String, default: '' },
    guarantor2CnicFront: { type: String, default: '' },
    guarantor2CnicBack: { type: String, default: '' },

    // Dynamic Item Documents (Images / PDFs)
    documents: [
      {
        title: { type: String, default: '' },
        fileUrl: { type: String, default: '' }
      }
    ],

    // Recovery Fields
    promiseDate: {
      type: Date,
      default: null
    },
    remarks: {
      type: String,
      default: ''
    },
    callStatus: {
      type: String,
      default: 'PENDING CALL'
    },
    followUps: [
      {
        callStatus: {
          type: String,
          default: 'CALLED - PAYMENT PROMISED'
        },
        followUpDate: { type: Date, default: Date.now },
        promiseDate: { type: Date, default: null },
        remarks: { type: String, default: '' },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        addedByName: { type: String, default: 'Admin' },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    // Payment tracking fields
    lastPaymentDate: {
      type: Date,
      default: null
    },
    nextDueDate: {
      type: Date,
      default: null
    },

    status: {
      type: String,
      enum: ['active', 'completed'],
      default: 'active'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

// High-performance single-field and compound indexes
installmentSaleSchema.index({ customer: 1, status: 1 });
installmentSaleSchema.index({ customer: 1, createdAt: -1 });
installmentSaleSchema.index({ status: 1, createdAt: -1 });
installmentSaleSchema.index({ status: 1, nextDueDate: 1 });
installmentSaleSchema.index({ status: 1, promiseDate: 1 });
installmentSaleSchema.index({ status: 1, remainingBalance: 1 });
installmentSaleSchema.index({ nextDueDate: 1 });
installmentSaleSchema.index({ promiseDate: 1 });
installmentSaleSchema.index({ dueDateDay: 1 });
installmentSaleSchema.index({ itemName: 1 });
installmentSaleSchema.index({ registrationNumber: 1 });
installmentSaleSchema.index({ itemRegNumber: 1 });
installmentSaleSchema.index({ engineNumber: 1 });
installmentSaleSchema.index({ chassisNumber: 1 });
installmentSaleSchema.index({ createdAt: -1 });
installmentSaleSchema.index({
  itemName: 'text',
  registrationNumber: 'text',
  itemRegNumber: 'text',
  engineNumber: 'text',
  chassisNumber: 'text'
}, {
  name: 'SaleVehicleTextIdx'
});

export default mongoose.model('InstallmentSale', installmentSaleSchema);