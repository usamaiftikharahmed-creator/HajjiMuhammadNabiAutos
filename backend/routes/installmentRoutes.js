import express from 'express';
import multer from 'multer';
import { 
  createInstallmentSale, 
  recordPayment, 
  getInstallmentSales, 
  getCustomerLedger,
  updateCustomer,
  uploadCustomerPhoto,
  updateSaleDetails,
  updatePromiseDate,
  uploadSaleDocuments,
  deleteSaleDocument 
} from '../controllers/installmentController.js';
import { compressUploads } from '../utils/fileCompressor.js';

const router = express.Router();

// Setup Multer for image & document file uploads
const upload = multer({ dest: 'uploads/' });

// Create installment sale routes (Support both '/sales' and '/create')
router.post('/sales', upload.any(), compressUploads, createInstallmentSale);
router.post('/create', upload.any(), compressUploads, createInstallmentSale);

// Payment routes (Support both '/payment' and '/record-payment')
router.post('/payment', recordPayment);
router.post('/record-payment', recordPayment);

// Upload & Delete extra documents to existing sale
router.post('/sales/:id/documents', upload.any(), compressUploads, uploadSaleDocuments);
router.delete('/sales/:id/documents/:docId', deleteSaleDocument);

// Retrieval routes
router.get('/sales', getInstallmentSales);
router.get('/ledger/:identifier', getCustomerLedger);

// Update customer details (with file upload support for profilePic)
router.put('/customers/:id', upload.any(), compressUploads, updateCustomer);
router.post('/customers/:id/photo', upload.any(), compressUploads, uploadCustomerPhoto);

// Update Installment Sale details (Strictly locks itemName, totalAmount, advancePayment)
router.put('/sales/:id', updateSaleDetails);

// Update Recovery Promise Date & Remarks
router.put('/sales/:id/promise', updatePromiseDate);

export default router;