import mongoose from 'mongoose';

const cloudFileSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
      index: true
    },
    chunkIndex: {
      type: Number,
      default: 0
    },
    totalChunks: {
      type: Number,
      default: 1
    },
    mimeType: {
      type: String,
      default: 'application/octet-stream'
    },
    size: {
      type: Number,
      default: 0
    },
    customerId: {
      type: String,
      default: ''
    },
    data: {
      type: Buffer,
      required: true
    }
  },
  { timestamps: true }
);

cloudFileSchema.index({ filename: 1, chunkIndex: 1 });

const CloudFile = mongoose.models.CloudFile || mongoose.model('CloudFile', cloudFileSchema);
export default CloudFile;

