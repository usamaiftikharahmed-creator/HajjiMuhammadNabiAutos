import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, default: 'General' },
  totalStock: { type: Number, default: 0 },
  availableStock: { type: Number, default: 0 },
  unitPrice: { type: Number, required: true },
  // List of available serial/IMEI numbers for this product
  serialNumbers: [{
    serialOrImei: { type: String, required: true, unique: true },
    status: { type: String, enum: ['available', 'sold'], default: 'available' },
    soldToSaleId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentSale', default: null }
  }]
}, { timestamps: true });

export default mongoose.model('Product', productSchema);