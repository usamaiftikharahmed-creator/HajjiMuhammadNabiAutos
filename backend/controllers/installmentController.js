import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Customer from '../models/Customer.js';
import InstallmentSale from '../models/InstallmentSale.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import CloudFile from '../models/CloudFile.js';
import jwt from 'jsonwebtoken';
import { logActivity } from '../utils/logger.js';
import { invalidateDashboardCache } from '../routes/dashboardRoutes.js';
import { triggerDebouncedLiveJsonSync } from '../services/backupService.js';
import { offlineDb, recordDeletion } from '../services/offlineDb.js';
import { mirrorUploadedFile, getUploadDirs } from '../services/uploadService.js';
import { deleteFromGoogleDrive, uploadToGoogleDrive, listCustomerDriveFiles, createResumableDriveUploadSession, registerUploadedDriveFile } from '../services/googleDriveService.js';

// Process-wide Singleton RAM cache for sub-millisecond page loads (<1ms)
const SALES_CACHE_TTL_MS = 2000; // 2 seconds TTL (prevents stale data across page refreshes)

export const invalidateSalesCache = () => {
  global.iss_cachedSales = null;
  global.iss_lastSalesFetchTime = 0;
  invalidateDashboardCache();
  triggerDebouncedLiveJsonSync();
  // Prewarm in background so next request is instant
  setTimeout(() => {
    prewarmSalesCache().catch(() => {});
  }, 10);
};

// Helper to safely extract and trim string from single or array/multer inputs
const cleanStr = (val) => String(Array.isArray(val) ? (val[0] ?? '') : (val ?? '')).trim();

// Helper to permanently save a file from disk into MongoDB CloudFile chunks (2MB per chunk)
const saveFileToCloudDB = async (filePath, filename, mimeType = 'application/octet-stream', customerId = '') => {
  try {
    if (!filePath || !fs.existsSync(filePath) || !filename) return false;
    const buffer = await fs.promises.readFile(filePath);
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk (well below MongoDB 16MB doc limit)
    const totalChunks = Math.max(1, Math.ceil(buffer.length / CHUNK_SIZE));
    await CloudFile.deleteMany({ filename });
    for (let i = 0; i < totalChunks; i++) {
      const slice = buffer.subarray(i * CHUNK_SIZE, Math.min(buffer.length, (i + 1) * CHUNK_SIZE));
      await CloudFile.create({
        filename,
        chunkIndex: i,
        totalChunks,
        mimeType: mimeType || 'application/octet-stream',
        size: buffer.length,
        customerId: String(customerId || ''),
        data: slice
      });
    }
    return true;
  } catch (err) {
    console.warn('saveFileToCloudDB notice:', err.message);
    return false;
  }
};

// Helper to parse "Nov 2025" / "Oct 2025, Nov 2025" into a comparable timestamp
const parseForMonthTimestamp = (forMonth) => {
  if (!forMonth || typeof forMonth !== 'string') return Number.MAX_SAFE_INTEGER;
  const firstPart = forMonth.split(',')[0].trim();
  const parsed = Date.parse(`1 ${firstPart}`);
  return isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
};

// Sort payments so Advance Payment is ALWAYS first, followed by 1st, 2nd, 3rd installments in chronological order
const sortPaymentsSequence = (list = []) => {
  return [...list].sort((a, b) => {
    const aMonthStr = String(a?.forMonth || '').trim().toLowerCase();
    const bMonthStr = String(b?.forMonth || '').trim().toLowerCase();
    const aIsAdv = aMonthStr === 'advance payment' || !aMonthStr || aMonthStr === '-';
    const bIsAdv = bMonthStr === 'advance payment' || !bMonthStr || bMonthStr === '-';

    if (aIsAdv && !bIsAdv) return -1;
    if (!aIsAdv && bIsAdv) return 1;

    // Next compare by payment date (oldest to newest)
    const aDate = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    const aDay = new Date(aDate).setHours(0, 0, 0, 0);
    const bDay = new Date(bDate).setHours(0, 0, 0, 0);

    // Also compare by target kist month (e.g., Nov 2025 before Dec 2025)
    const aMonthTs = parseForMonthTimestamp(a?.forMonth);
    const bMonthTs = parseForMonthTimestamp(b?.forMonth);

    if (aDay !== bDay) {
      return aDay - bDay;
    }
    if (aMonthTs !== bMonthTs) {
      return aMonthTs - bMonthTs;
    }
    if (aDate !== bDate) {
      return aDate - bDate;
    }
    return String(a?._id || '').localeCompare(String(b?._id || ''));
  });
};

// Helper to resolve logged-in user from req.user or JWT token (falls back to Admin/Owner)
const resolveReqUser = async (req) => {
  if (req?.user?._id) return req.user;
  const JWT_SECRET = process.env.JWT_SECRET || 'hajji_mohammad_nabi_autos_secret_key_2026_secure';
  let token = req?.cookies?.jwt;
  if (!token && req?.headers?.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded?.id && typeof decoded.id !== 'object') {
        const u = await User.findById(String(decoded.id)).select('_id name username role');
        if (u) {
          req.user = u;
          return u;
        }
      }
    } catch (e) {}
  }
  const fallbackAdmin =
    (await User.findOne({ username: 'admin' }).select('_id name username role')) ||
    (await User.findOne({ role: { $in: ['owner', 'admin'] } }).select('_id name username role'));
  if (fallbackAdmin && req) req.user = fallbackAdmin;
  return fallbackAdmin;
};

// 1. Add New Customer & Create Installment Sale
export const createInstallmentSale = async (req, res) => {
  try {
    const customerName = cleanStr(req.body.customerName || req.body.name);
    const phone = cleanStr(req.body.phone1 || req.body.phone);
    const phone2 = cleanStr(req.body.phone2);
    const cnic = cleanStr(req.body.cnic);
    const address = cleanStr(req.body.permanentAddress || req.body.address);
    
    const guarantor1Name = cleanStr(req.body.guarantor1Name || req.body.guarantorName);
    const guarantor1Phone = cleanStr(req.body.guarantor1Phone || req.body.guarantorPhone);
    const guarantor2Name = cleanStr(req.body.guarantor2Name);
    const guarantor2Phone = cleanStr(req.body.guarantor2Phone);

    const itemName = cleanStr(req.body.itemName);
    const registrationNumber = cleanStr(req.body.registrationNumber || req.body.itemRegNumber);
    const itemRegNumber = registrationNumber;
    const modelYear = cleanStr(req.body.modelYear || req.body.model);
    const engineNumber = cleanStr(req.body.engineNumber);
    const chassisNumber = cleanStr(req.body.chassisNumber);
    const totalAmount = Number(Array.isArray(req.body.totalAmount) ? req.body.totalAmount[0] : req.body.totalAmount);
    
    // Partial Advance Payment Management
    const totalAdvance = req.body.totalAdvance !== undefined && req.body.totalAdvance !== ''
      ? (Number(Array.isArray(req.body.totalAdvance) ? req.body.totalAdvance[0] : req.body.totalAdvance) || 0)
      : (Number(Array.isArray(req.body.advancePayment) ? req.body.advancePayment[0] : req.body.advancePayment) || 0);

    const advancePaidNow = req.body.advancePaidNow !== undefined && req.body.advancePaidNow !== ''
      ? Math.max(0, Number(Array.isArray(req.body.advancePaidNow) ? req.body.advancePaidNow[0] : req.body.advancePaidNow) || 0)
      : totalAdvance;

    const remainingAdvance = Math.max(0, totalAdvance - advancePaidNow);
    const rawRemPromiseDate = cleanStr(req.body.remainingAdvancePromiseDate || req.body.remainingAdvanceDate);
    let remainingAdvancePromiseDate = null;
    if (remainingAdvance > 0 && rawRemPromiseDate) {
      const parsed = new Date(rawRemPromiseDate);
      if (!isNaN(parsed.getTime())) remainingAdvancePromiseDate = parsed;
    }
    const remainingAdvanceStatus = remainingAdvance > 0 ? 'PENDING' : 'NONE';
    const advancePayment = totalAdvance; // Agreed advance

    const monthlyAmount = Number(Array.isArray(req.body.monthlyKist || req.body.monthlyAmount) ? (req.body.monthlyKist || req.body.monthlyAmount)[0] : (req.body.monthlyKist || req.body.monthlyAmount));
    const dueDateDay = Number(Array.isArray(req.body.dueDateDay) ? req.body.dueDateDay[0] : req.body.dueDateDay) || 5;
    const paymentMethod = cleanStr(req.body.paymentMode || req.body.paymentMethod) || 'Cash';

    // Support custom/past booking date for legacy client entry
    const rawBookingDate = cleanStr(req.body.bookingDate || req.body.saleDate || req.body.date);
    let bookingDate = new Date();
    if (rawBookingDate) {
      const parsed = new Date(rawBookingDate);
      if (!isNaN(parsed.getTime())) {
        bookingDate = parsed;
      }
    }

    const total = totalAmount;
    const remainingBalance = Math.max(0, total - totalAdvance);
    const totalMonths = Number(Array.isArray(req.body.totalMonths) ? req.body.totalMonths[0] : req.body.totalMonths) || (monthlyAmount > 0 ? Math.ceil(remainingBalance / monthlyAmount) : 1);
    const promiseMonth = cleanStr(req.body.promiseMonth);
    const promisedMonths = req.body.promisedMonths ? Number(Array.isArray(req.body.promisedMonths) ? req.body.promisedMonths[0] : req.body.promisedMonths) : null;

    if (!customerName || !phone || !itemName || !totalAmount || !monthlyAmount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please fill all required fields: Customer Name, Phone, Item Name, Total Amount, and Monthly Installment.' 
      });
    }

    // Find or determine customer first so files are saved directly in their Google Drive folder!
    let customer = await Customer.findOne({ 
      $or: [
        { phone },
        ...(cnic ? [{ cnic }] : [])
      ]
    });

    let assignedCustomerId = customer?.customerId;
    if (!assignedCustomerId) {
      let maxCustNum = 1000;
      const allCusts = await Customer.find({}, { customerId: 1 }).lean();
      allCusts.forEach(c => {
        if (c.customerId && typeof c.customerId === 'string') {
          const match = c.customerId.match(/\d+/);
          if (match) {
            const num = parseInt(match[0], 10);
            if (!isNaN(num) && num > maxCustNum) maxCustNum = num;
          }
        }
      });
      assignedCustomerId = `CUST-${maxCustNum + 1}`;
    }

    const customerContext = {
      customerId: assignedCustomerId,
      customerName: customerName || customer?.name || ''
    };

    // Process uploaded files directly into customer's Google Drive folder
    let profilePic = '';
    let cnicFront = '';
    let cnicBack = '';
    let guarantor1CnicFront = '';
    let guarantor1CnicBack = '';
    let guarantor2CnicFront = '';
    let guarantor2CnicBack = '';
    const documents = [];

    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        await saveFileToCloudDB(file.path, file.filename, file.mimetype, customerContext.customerId);
        let driveResult = null;
        try {
          driveResult = await uploadToGoogleDrive(file.path, file.filename, null, customerContext);
        } catch (err) {
          console.warn('Google Drive upload notice:', err.message);
        }

        // Clean up local file so it is NOT kept on local disk (saved only to Drive)
        if (driveResult) {
          try { fs.unlinkSync(file.path); } catch (e) {}
        }

        const fileUrl = `/uploads/${file.filename}`;
        const driveFileId = driveResult?.fileId || null;

        if (file.fieldname === 'profilePic' || file.fieldname === 'customerPhoto' || file.fieldname === 'photo') {
          profilePic = fileUrl;
        }
        else if (file.fieldname === 'cnicFront') cnicFront = fileUrl;
        else if (file.fieldname === 'cnicBack') cnicBack = fileUrl;
        else if (file.fieldname === 'guarantor1CnicFront') guarantor1CnicFront = fileUrl;
        else if (file.fieldname === 'guarantor1CnicBack') guarantor1CnicBack = fileUrl;
        else if (file.fieldname === 'guarantor2CnicFront') guarantor2CnicFront = fileUrl;
        else if (file.fieldname === 'guarantor2CnicBack') guarantor2CnicBack = fileUrl;
        else {
          let title = file.originalname || 'Document';
          const match = file.fieldname.match(/doc(?:Title_(\d+)|uments\[(\d+)\])/i);
          if (match) {
            const idx = match[1] || match[2];
            if (idx !== undefined) {
              title = req.body[`docTitle_${idx}`] || req.body[`documents[${idx}][title]`] || title;
            }
          } else {
            const idx = documents.length;
            title = req.body[`docTitle_${idx}`] || req.body[`docTitle[${idx}]`] || req.body.title || file.originalname || `Document ${idx + 1}`;
          }
          documents.push({ title, fileUrl, driveFileId });
        }
      }
    }

    if (!customer) {
      customer = await Customer.create({
        customerId: assignedCustomerId,
        name: customerName,
        phone,
        phone2,
        cnic,
        address,
        profilePic,
        guarantorName: guarantor1Name,
        guarantorPhone: guarantor1Phone,
        guarantor2Name,
        guarantor2Phone
      });
    } else {
      customer = await Customer.findByIdAndUpdate(
        customer._id,
        {
          $set: {
            name: customerName || customer.name,
            phone2: phone2 || customer.phone2,
            cnic: cnic || customer.cnic,
            address: address || customer.address,
            ...(profilePic ? { profilePic } : {}),
            guarantorName: guarantor1Name || customer.guarantorName,
            guarantorPhone: guarantor1Phone || customer.guarantorPhone,
            guarantor2Name: guarantor2Name || customer.guarantor2Name,
            guarantor2Phone: guarantor2Phone || customer.guarantor2Phone
          }
        },
        { new: true }
      );
    }

    // Calculate initial nextDueDate (Next month from bookingDate on dueDateDay)
    const nextDue = new Date(bookingDate);
    nextDue.setMonth(nextDue.getMonth() + 1);
    nextDue.setDate(dueDateDay);

    const installmentSale = await InstallmentSale.create({
      customer: customer._id,
      itemName,
      itemRegNumber,
      registrationNumber,
      modelYear,
      engineNumber,
      chassisNumber,
      totalAmount: total,
      advancePayment,
      totalAdvance,
      advancePaidNow,
      remainingAdvance,
      remainingAdvancePromiseDate,
      remainingAdvanceStatus,
      remainingBalance,
      monthlyAmount,
      totalMonths,
      promiseMonth,
      promisedMonths,
      dueDateDay,
      profilePic: profilePic || customer.profilePic || '',
      cnicFront,
      cnicBack,
      guarantorName: guarantor1Name || customer.guarantorName || '',
      guarantorPhone: guarantor1Phone || customer.guarantorPhone || '',
      guarantor1CnicFront,
      guarantor1CnicBack,
      guarantor2Name,
      guarantor2Phone,
      guarantor2CnicFront,
      guarantor2CnicBack,
      documents,
      nextDueDate: nextDue,
      createdAt: bookingDate,
      lastPaymentDate: advancePaidNow > 0 ? bookingDate : null,
      status: remainingBalance === 0 ? 'completed' : 'active',
      createdBy: (await resolveReqUser(req))?._id || null
    });

    let advancePaymentRecord = null;
    if (advancePaidNow > 0) {
      advancePaymentRecord = await Payment.create({
        installmentSale: installmentSale._id,
        customer: customer._id,
        amountPaid: advancePaidNow,
        paymentMethod,
        forMonth: 'Advance Payment',
        receivedBy: req.user?._id || null,
        notes: remainingAdvance > 0 
          ? `Advance Payment (Paid Rs. ${advancePaidNow.toLocaleString()} of Rs. ${totalAdvance.toLocaleString()} Agreed Advance. Baqi Advance Rs. ${remainingAdvance.toLocaleString()} promised on ${remainingAdvancePromiseDate ? remainingAdvancePromiseDate.toISOString().split('T')[0] : 'N/A'})`
          : 'Advance Payment at Booking',
        createdAt: bookingDate
      });
    }

    await logActivity({
      req,
      action: 'CREATE_SALE',
      module: 'Installments',
      details: `Naya Installment Khata: "${customer.name}" (${customer.phone}), Item: "${itemName}", Total: Rs. ${total.toLocaleString()}, Advance: Rs. ${advancePayment.toLocaleString()}`,
      targetId: installmentSale._id,
      targetName: customer.name,
      metadata: { itemName, total, advancePayment, paymentMethod }
    });

    invalidateSalesCache();

    res.status(201).json({
      success: true,
      message: 'Installment sale account created successfully',
      customerId: customer.customerId,
      customer,
      installmentSale,
      payment: advancePaymentRecord
    });
  } catch (error) {
    console.error('Create Sale Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Receive Monthly Installment Payment
export const recordPayment = async (req, res) => {
  try {
    await resolveReqUser(req);
    const saleId = req.body.installmentSaleId || req.body.saleId;
    const rawAmount = req.body.amountPaid ?? req.body.amount;
    const paymentMethod = req.body.paymentMethod || req.body.paymentMode || 'Cash';
    const transactionId = req.body.transactionId || '';
    const forMonth = req.body.forMonth || new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const notes = req.body.notes || '';

    // Support custom/past payment received date
    const rawPaymentDate = cleanStr(req.body.paymentDate || req.body.date || req.body.receivedDate);
    let paymentDate = new Date();
    if (rawPaymentDate) {
      const parsed = new Date(rawPaymentDate);
      if (!isNaN(parsed.getTime())) {
        paymentDate = parsed;
      }
    }

    if (!saleId || rawAmount === undefined || rawAmount === null) {
      return res.status(400).json({ success: false, message: 'Sale ID and amount are required' });
    }

    const sale = await InstallmentSale.findById(saleId).populate('customer');
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Installment account not found' });
    }

    // Advance payment date must always match sale creation date
    if (String(forMonth).toLowerCase() === 'advance payment' && sale.createdAt) {
      paymentDate = new Date(sale.createdAt);
    }

    const paid = Number(rawAmount);
    if (isNaN(paid) || paid <= 0) {
      return res.status(400).json({ success: false, message: 'Please enter a valid positive payment amount' });
    }

    const isRemainingAdvance = Boolean(
      req.body.isRemainingAdvance || 
      req.body.paymentType === 'REMAINING_ADVANCE' || 
      forMonth === 'Remaining Advance'
    );

    if (isRemainingAdvance) {
      if (!sale.remainingAdvance || sale.remainingAdvance <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Is khata mein koi Remaining Advance baqi nahi hai.' 
        });
      }

      if (paid > sale.remainingAdvance) {
        return res.status(400).json({ 
          success: false, 
          message: `Amount (Rs. ${paid.toLocaleString()}) baqi advance (Rs. ${sale.remainingAdvance.toLocaleString()}) se zyada hai.` 
        });
      }

      const payment = await Payment.create({
        installmentSale: sale._id,
        customer: sale.customer?._id || sale.customer,
        amountPaid: paid,
        paymentMethod,
        transactionId,
        forMonth: 'Remaining Advance',
        notes: notes || 'Remaining Advance Payment Received',
        receivedBy: req.user?._id || null,
        createdAt: paymentDate
      });

      sale.remainingAdvance = Math.max(0, (sale.remainingAdvance || 0) - paid);
      sale.advancePaidNow = (sale.advancePaidNow || 0) + paid;
      if (sale.remainingAdvance === 0) {
        sale.remainingAdvanceStatus = 'PAID';
      }
      if (!sale.lastPaymentDate || paymentDate > new Date(sale.lastPaymentDate)) {
        sale.lastPaymentDate = paymentDate;
      }
      await sale.save();

      await logActivity({
        req,
        action: 'RECORD_PAYMENT',
        module: 'Payments',
        details: `Remaining Advance Wasooli: Rs. ${paid.toLocaleString()} wasool huay for "${sale.customer?.name || 'Customer'}" (Item: "${sale.itemName}"). Baqi Advance: Rs. ${sale.remainingAdvance.toLocaleString()}`,
        targetId: payment._id,
        targetName: sale.customer?.name,
        metadata: { itemName: sale.itemName, paid, paymentMethod, remainingAdvance: sale.remainingAdvance, paymentDate }
      });

      invalidateSalesCache();

      return res.status(201).json({
        success: true,
        message: 'Remaining advance payment recorded successfully',
        remainingAdvance: sale.remainingAdvance,
        payment,
        sale
      });
    }

    if (paid > sale.remainingBalance) {
      return res.status(400).json({ 
        success: false, 
        message: `Amount (Rs. ${paid.toLocaleString()}) exceeds remaining balance of Rs. ${sale.remainingBalance.toLocaleString()}` 
      });
    }

    // Support Multi-Month Allocations (saves each month individually while generating a single combined receipt)
    const rawAllocations = Array.isArray(req.body.allocations)
      ? req.body.allocations
          .map(a => ({
            forMonth: cleanStr(a.forMonth || forMonth),
            amountPaid: Number(a.amountPaid || a.amount || 0)
          }))
          .filter(a => a.forMonth && a.amountPaid > 0)
      : [];

    let payment = null;
    let paymentsCreated = [];

    if (rawAllocations.length > 1) {
      const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const totalAllocated = rawAllocations.reduce((sum, a) => sum + a.amountPaid, 0);
      const effectivePaid = totalAllocated > 0 ? totalAllocated : paid;

      if (effectivePaid > sale.remainingBalance) {
        return res.status(400).json({
          success: false,
          message: `Total allocated amount (Rs. ${effectivePaid.toLocaleString()}) exceeds remaining balance of Rs. ${sale.remainingBalance.toLocaleString()}`
        });
      }

      const createdDoc = await Payment.create({
        installmentSale: sale._id,
        customer: sale.customer?._id || sale.customer,
        amountPaid: effectivePaid,
        paymentMethod,
        transactionId,
        forMonth: rawAllocations.map(a => a.forMonth).join(', '),
        notes,
        batchId,
        batchTotal: effectivePaid,
        batchBreakdown: rawAllocations,
        receivedBy: req.user?._id || null,
        createdAt: paymentDate
      });
      paymentsCreated = [createdDoc];
      payment = createdDoc;
    } else {
      const singleMonth = rawAllocations.length === 1 ? rawAllocations[0].forMonth : forMonth;
      const singleAmount = rawAllocations.length === 1 ? rawAllocations[0].amountPaid : paid;
      const createdDoc = await Payment.create({
        installmentSale: sale._id,
        customer: sale.customer?._id || sale.customer,
        amountPaid: singleAmount,
        paymentMethod,
        transactionId,
        forMonth: singleMonth,
        notes,
        receivedBy: req.user?._id || null,
        createdAt: paymentDate
      });
      paymentsCreated = [createdDoc];
      payment = createdDoc;
    }

    // Update remaining balance & completion status
    const finalPaidAmount = Number(payment.amountPaid || paid);
    sale.remainingBalance = Math.max(0, sale.remainingBalance - finalPaidAmount);
    if (sale.remainingBalance === 0) {
      sale.status = 'completed';
    }
    if (!sale.lastPaymentDate || paymentDate > new Date(sale.lastPaymentDate)) {
      sale.lastPaymentDate = paymentDate;
    }

    // Schedule next due date properly based on how many full monthly installments are cleared
    const totalFinanced = Math.max(0, (sale.totalAmount || 0) - (sale.advancePayment || 0));
    const totalPaidInstallments = Math.max(0, totalFinanced - sale.remainingBalance);
    const fullKistsPaid = Math.floor(totalPaidInstallments / (sale.monthlyAmount || 1));

    if (sale.remainingBalance === 0) {
      sale.nextDueDate = null;
    } else {
      const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
      const nextDue = new Date(saleDate.getFullYear(), saleDate.getMonth() + 1 + fullKistsPaid, sale.dueDateDay || 5);
      sale.nextDueDate = nextDue;
    }

    await sale.save();

    const monthsLabel = rawAllocations.length > 1
      ? rawAllocations.map(a => `${a.forMonth}: Rs. ${a.amountPaid.toLocaleString()}`).join(' + ')
      : payment.forMonth;

    await logActivity({
      req,
      action: 'RECORD_PAYMENT',
      module: 'Payments',
      details: `Kist Wasooli: Rs. ${finalPaidAmount.toLocaleString()} (${monthsLabel}) wasool huay for "${sale.customer?.name}" (Item: "${sale.itemName}"). [Payment Mode: ${paymentMethod}, Baqi Kist: Rs. ${sale.remainingBalance.toLocaleString()}]`,
      targetId: paymentsCreated[0]?._id,
      targetName: sale.customer?.name,
      metadata: { itemName: sale.itemName, paid: finalPaidAmount, monthsLabel, paymentMethod, remainingBalance: sale.remainingBalance }
    });

    invalidateSalesCache();

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      remainingBalance: sale.remainingBalance,
      payment,
      paymentsCreated,
      sale
    });
  } catch (error) {
    console.error('Record Payment Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Reusable DB aggregation pipeline
export const fetchSalesFromDB = async () => {
  const rawSales = await InstallmentSale.aggregate([
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: 'customers',
        localField: 'customer',
        foreignField: '_id',
        as: 'customer'
      }
    },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'createdBy'
      }
    },
    { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'payments',
        localField: '_id',
        foreignField: 'installmentSale',
        pipeline: [
          { $sort: { createdAt: -1 } },
          {
            $project: {
              installmentSale: 1,
              customer: 1,
              amountPaid: 1,
              paymentMethod: 1,
              forMonth: 1,
              transactionId: 1,
              notes: 1,
              batchId: 1,
              batchTotal: 1,
              batchBreakdown: 1,
              createdAt: 1
            }
          }
        ],
        as: 'payments'
      }
    }
  ]);

  // Ensure Advance Payment date always matches its Sale creation date and sort sequence-wise (Advance -> 1st -> 2nd...)
  return rawSales.map(sale => {
    if (Array.isArray(sale.payments)) {
      const mapped = sale.payments.map(p => {
        if (sale.createdAt && String(p.forMonth || '').toLowerCase() === 'advance payment') {
          return { ...p, createdAt: sale.createdAt };
        }
        return p;
      });
      sale.payments = sortPaymentsSequence(mapped);
    }
    return sale;
  });
};

// Prewarm sales cache into Node RAM on startup
export const prewarmSalesCache = async () => {
  try {
    const sales = await fetchSalesFromDB();
    global.iss_cachedSales = sales;
    global.iss_lastSalesFetchTime = Date.now();
    console.log(`⚡ In-memory sales cache prewarmed with ${sales.length} records!`);
  } catch (err) {
    console.log('Prewarm error:', err.message);
  }
};

// 3. Get All Accounts (Ultra-fast cached aggregation)
export const getInstallmentSales = async (req, res) => {
  try {
    const now = Date.now();
    if (!req.query.refresh && !process.env.VERCEL && global.iss_cachedSales && (now - (global.iss_lastSalesFetchTime || 0)) < SALES_CACHE_TTL_MS) {
      return res.json({ success: true, sales: global.iss_cachedSales, fromCache: true });
    }

    const sales = await fetchSalesFromDB();

    global.iss_cachedSales = sales;
    global.iss_lastSalesFetchTime = now;

    res.json({ success: true, sales });
  } catch (error) {
    console.error('Get Sales Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Get Customer Full Ledger with Multi-field Search
export const getCustomerLedger = async (req, res) => {
  try {
    const rawIdentifier = (req.params.identifier || '').trim();
    if (!rawIdentifier) {
      return res.status(400).json({ success: false, message: 'Please provide a search query' });
    }

    // Cleaned query: handle ID numbers like '1001' or 'CUST-1001'
    let custIdPattern = rawIdentifier.toUpperCase();
    if (/^\d{1,5}$/.test(rawIdentifier)) {
      custIdPattern = `CUST-${rawIdentifier}`;
    }

    const cleanDigits = rawIdentifier.replace(/\D/g, '');

    // Search conditions for customer
    const customerQuery = {
      $or: [
        { customerId: custIdPattern },
        { customerId: rawIdentifier.toUpperCase() },
        { phone: rawIdentifier },
        { phone2: rawIdentifier },
        ...(cleanDigits.length >= 10 ? [{ phone: { $regex: cleanDigits.slice(-10), $options: 'i' } }] : []),
        ...(rawIdentifier.includes('-') || cleanDigits.length === 13 
            ? [{ cnic: { $regex: cleanDigits, $options: 'i' } }, { cnic: rawIdentifier }] 
            : []),
        { name: { $regex: rawIdentifier, $options: 'i' } }
      ]
    };

    let customer = await Customer.findOne(customerQuery).lean();

    // If customer not found directly, check if identifier matches an itemRegNumber or itemName
    if (!customer) {
      const matchedSale = await InstallmentSale.findOne({
        $or: [
          { itemRegNumber: { $regex: `^${rawIdentifier}$`, $options: 'i' } },
          { registrationNumber: { $regex: `^${rawIdentifier}$`, $options: 'i' } },
          { engineNumber: { $regex: `^${rawIdentifier}$`, $options: 'i' } },
          { chassisNumber: { $regex: `^${rawIdentifier}$`, $options: 'i' } },
          { itemName: { $regex: rawIdentifier, $options: 'i' } }
        ]
      }).populate('customer').lean();

      if (matchedSale && matchedSale.customer) {
        customer = matchedSale.customer;
      }
    }

    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'No customer, CNIC, Phone, or Registration Number record found.' 
      });
    }

    const [rawInstallmentSales, rawPayments] = await Promise.all([
      InstallmentSale.find({ customer: customer._id }).sort({ createdAt: -1 }).lean(),
      Payment.find({ customer: customer._id })
        .populate('receivedBy', 'name username role')
        .populate('installmentSale', 'itemName itemRegNumber registrationNumber modelYear engineNumber chassisNumber totalAmount remainingBalance monthlyAmount createdAt')
        .sort({ createdAt: -1 })
        .lean()
    ]);

    // Always keep Advance Payment date synced with its Sale's createdAt date
    const saleDateMap = new Map();
    rawInstallmentSales.forEach(s => {
      if (s._id && s.createdAt) saleDateMap.set(String(s._id), s.createdAt);
    });
    const payments = sortPaymentsSequence(
      rawPayments.map(p => {
        if (String(p.forMonth || '').toLowerCase() === 'advance payment') {
          const sId = String(p.installmentSale?._id || p.installmentSale || '');
          const sDate = p.installmentSale?.createdAt || saleDateMap.get(sId);
          if (sDate) {
            return { ...p, createdAt: sDate };
          }
        }
        return p;
      })
    );

    // Attach each sale's payments array onto the sale object so QuickPaymentModal & OverdueAlert have 100% schedule accuracy
    const installmentSales = rawInstallmentSales.map(s => {
      const sId = String(s._id);
      const salePayments = payments.filter(p => String(p.installmentSale?._id || p.installmentSale || '') === sId);
      return {
        ...s,
        payments: salePayments
      };
    });

    // Auto-sync all files from customer's Google Drive folder into the primary sale documents
    try {
      if (installmentSales.length > 0 && customer.customerId) {
        const driveFiles = await listCustomerDriveFiles(customer.customerId, customer.name);
        if (driveFiles && driveFiles.length > 0) {
          const primarySale = installmentSales[0];
          let updatedDocs = false;
          if (!primarySale.documents) primarySale.documents = [];

          // Known identity files to prevent duplicating CNICs/Photos in documents
          const knownFiles = new Set([
            path.basename(customer.profilePic || ''),
            path.basename(primarySale.profilePic || ''),
            path.basename(primarySale.cnicFront || ''),
            path.basename(primarySale.cnicBack || ''),
            path.basename(primarySale.guarantor1CnicFront || ''),
            path.basename(primarySale.guarantor1CnicBack || ''),
            path.basename(primarySale.guarantor2CnicFront || ''),
            path.basename(primarySale.guarantor2CnicBack || ''),
          ].filter(Boolean));

          const deletedDocsSet = new Set(primarySale.deletedDocs || []);

          for (const df of driveFiles) {
            const fileName = path.basename(df.name);
            if (knownFiles.has(fileName) || deletedDocsSet.has(fileName) || deletedDocsSet.has(df.driveFileId)) continue;

            const exists = primarySale.documents.some(d => 
              (d.fileUrl && path.basename(d.fileUrl) === fileName) ||
              (d.driveFileId && d.driveFileId === df.driveFileId)
            );

            if (!exists) {
              const cleanTitle = fileName.replace(/^\d+-\d+\./, '').trim() || 'Attached Document';
              primarySale.documents.push({
                title: cleanTitle,
                fileUrl: `/uploads/${fileName}`,
                driveFileId: df.driveFileId
              });
              updatedDocs = true;
            }
          }

          if (updatedDocs) {
            InstallmentSale.findById(primarySale._id).then(async (saleDoc) => {
              if (saleDoc) {
                saleDoc.documents = primarySale.documents;
                saleDoc.markModified('documents');
                await saleDoc.save();
              }
            }).catch(() => {});
          }
        }
      }
    } catch (driveSyncErr) {
      console.warn('Drive auto-sync notice:', driveSyncErr.message);
    }

    res.json({
      success: true,
      customer,
      installmentSales,
      payments
    });
  } catch (error) {
    console.error('Get Ledger Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Update Customer Profile Information
export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, phone, phone2, cnic, address, 
      guarantorName, guarantorPhone, guarantor2Name, guarantor2Phone 
    } = req.body;

    let profilePic = req.body.profilePic;
    const picFile = (req.files && Array.isArray(req.files))
      ? req.files.find(f => f.fieldname === 'profilePic' || f.fieldname === 'photo' || f.fieldname === 'customerPhoto')
      : req.file;
    const existingCust = await Customer.findById(id);
    const customerContext = { customerId: existingCust?.customerId, customerName: existingCust?.name || name };

    if (picFile) {
      await saveFileToCloudDB(picFile.path, picFile.filename, picFile.mimetype, customerContext.customerId);
      let driveResult = null;
      try {
        driveResult = await uploadToGoogleDrive(picFile.path, picFile.filename, null, customerContext);
      } catch (err) {}
      if (driveResult) {
        try { fs.unlinkSync(picFile.path); } catch (e) {}
      }
      profilePic = `/uploads/${picFile.filename}`;
    }

    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(name && { name: cleanStr(name) }),
          ...(phone && { phone: cleanStr(phone) }),
          ...(phone2 !== undefined && { phone2: cleanStr(phone2) }),
          ...(cnic !== undefined && { cnic: cleanStr(cnic) }),
          ...(address !== undefined && { address: cleanStr(address) }),
          ...(profilePic !== undefined && { profilePic }),
          ...(guarantorName !== undefined && { guarantorName: cleanStr(guarantorName) }),
          ...(guarantorPhone !== undefined && { guarantorPhone: cleanStr(guarantorPhone) }),
          ...(guarantor2Name !== undefined && { guarantor2Name: cleanStr(guarantor2Name) }),
          ...(guarantor2Phone !== undefined && { guarantor2Phone: cleanStr(guarantor2Phone) })
        }
      },
      { new: true, runValidators: true }
    );

    if (!updatedCustomer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Mirror immediately to offlineDb JSON
    try {
      if (offlineDb?.customers?.findByIdAndUpdate) {
        const plainCust = JSON.parse(JSON.stringify(updatedCustomer));
        await offlineDb.customers.findByIdAndUpdate(id, plainCust);
      }
    } catch (e) {}

    if (profilePic) {
      await InstallmentSale.updateMany({ customer: id }, { $set: { profilePic } });
    }

    invalidateSalesCache();

    res.json({
      success: true,
      message: 'Customer profile updated successfully',
      customer: updatedCustomer
    });
  } catch (error) {
    console.error('Update Customer Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5a. Direct Upload / Update Customer Profile Photo
export const uploadCustomerPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    let profilePic = '';
    const file = (req.files && Array.isArray(req.files) && req.files.length > 0) ? req.files[0] : req.file;
    if (file) {
      const existingCust = await Customer.findById(id);
      const customerContext = { customerId: existingCust?.customerId, customerName: existingCust?.name };
      await saveFileToCloudDB(file.path, file.filename, file.mimetype, customerContext.customerId);
      let driveResult = null;
      try {
        driveResult = await uploadToGoogleDrive(file.path, file.filename, null, customerContext);
      } catch (err) {}
      if (driveResult) {
        try { fs.unlinkSync(file.path); } catch (e) {}
      }
      profilePic = `/uploads/${file.filename}`;
    }

    if (!profilePic) {
      return res.status(400).json({ success: false, message: 'No photo uploaded' });
    }

    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      { $set: { profilePic } },
      { new: true }
    );

    if (!updatedCustomer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    await InstallmentSale.updateMany({ customer: id }, { $set: { profilePic } });
    invalidateSalesCache();

    res.json({
      success: true,
      message: 'Customer profile picture updated successfully',
      profilePic,
      customer: updatedCustomer
    });
  } catch (error) {
    console.error('Upload Customer Photo Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5b. Update Installment Sale Details (All fields fully editable by admin)
export const updateSaleDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      itemName, totalAmount, advancePayment, bookingDate, saleDate,
      itemRegNumber, registrationNumber, modelYear, engineNumber, chassisNumber, monthlyAmount, dueDateDay, totalMonths, promiseMonth, promisedMonths,
      status, remarks, guarantorName, guarantorPhone, guarantor2Name, guarantor2Phone 
    } = req.body;

    const sale = await InstallmentSale.findById(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Installment sale not found' });
    }

    // Update sale creation/booking date if provided
    const rawNewDate = cleanStr(bookingDate || saleDate);
    if (rawNewDate) {
      const parsedDate = new Date(rawNewDate);
      if (!isNaN(parsedDate.getTime())) {
        sale.createdAt = parsedDate;
      }
    }

    if (itemName !== undefined && cleanStr(itemName)) {
      sale.itemName = cleanStr(itemName);
    }

    let hasPriceOrAdvanceChange = false;

    if (advancePayment !== undefined && !isNaN(Number(advancePayment))) {
      const newAdv = Number(advancePayment);
      if (newAdv !== sale.advancePayment) {
        sale.advancePayment = newAdv;
        hasPriceOrAdvanceChange = true;
      }
    }

    // Always keep Advance Payment record amount and date synced with sale.createdAt
    const advPayment = await Payment.findOne({
      installmentSale: sale._id,
      forMonth: 'Advance Payment'
    });

    if (advPayment) {
      if (sale.advancePayment > 0) {
        advPayment.amountPaid = sale.advancePayment;
        advPayment.createdAt = sale.createdAt || advPayment.createdAt;
        await advPayment.save();
        await Payment.updateOne({ _id: advPayment._id }, { $set: { amountPaid: sale.advancePayment, createdAt: sale.createdAt } });
      } else {
        await Payment.deleteOne({ _id: advPayment._id });
      }
    } else if (sale.advancePayment > 0) {
      await Payment.create({
        installmentSale: sale._id,
        customer: sale.customer,
        amountPaid: sale.advancePayment,
        paymentMethod: 'Cash',
        forMonth: 'Advance Payment',
        notes: 'Advance Payment at Booking',
        createdAt: sale.createdAt || new Date()
      });
    }

    if (totalAmount !== undefined && !isNaN(Number(totalAmount)) && Number(totalAmount) > 0) {
      if (Number(totalAmount) !== sale.totalAmount) {
        sale.totalAmount = Number(totalAmount);
        hasPriceOrAdvanceChange = true;
      }
    }

    // Editable fields
    const updatedReg = registrationNumber !== undefined ? cleanStr(registrationNumber) : (itemRegNumber !== undefined ? cleanStr(itemRegNumber) : undefined);
    if (updatedReg !== undefined) {
      sale.itemRegNumber = updatedReg;
      sale.registrationNumber = updatedReg;
    }
    if (modelYear !== undefined) sale.modelYear = cleanStr(modelYear);
    if (engineNumber !== undefined) sale.engineNumber = cleanStr(engineNumber);
    if (chassisNumber !== undefined) sale.chassisNumber = cleanStr(chassisNumber);
    if (monthlyAmount !== undefined && Number(monthlyAmount) > 0) sale.monthlyAmount = Number(monthlyAmount);
    if (dueDateDay !== undefined && Number(dueDateDay) >= 1 && Number(dueDateDay) <= 31) sale.dueDateDay = Number(dueDateDay);
    if (totalMonths !== undefined && Number(totalMonths) > 0) sale.totalMonths = Number(totalMonths);
    if (promiseMonth !== undefined) sale.promiseMonth = cleanStr(promiseMonth);
    if (promisedMonths !== undefined) sale.promisedMonths = promisedMonths ? Number(promisedMonths) : null;
    if (status && ['active', 'completed'].includes(status)) sale.status = status;
    if (remarks !== undefined) sale.remarks = cleanStr(remarks);

    if (guarantorName !== undefined) sale.guarantorName = cleanStr(guarantorName);
    if (guarantorPhone !== undefined) sale.guarantorPhone = cleanStr(guarantorPhone);
    if (guarantor2Name !== undefined) sale.guarantor2Name = cleanStr(guarantor2Name);
    if (guarantor2Phone !== undefined) sale.guarantor2Phone = cleanStr(guarantor2Phone);

    // Recalculate remainingBalance accurately if total or advance changed
    if (hasPriceOrAdvanceChange) {
      const allPayments = await Payment.find({ installmentSale: sale._id });
      const totalPaidAllTime = allPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);
      sale.remainingBalance = Math.max(0, sale.totalAmount - totalPaidAllTime);
      if (sale.remainingBalance === 0) {
        sale.status = 'completed';
      } else if (sale.status === 'completed' && sale.remainingBalance > 0) {
        sale.status = 'active';
      }
    }

    await sale.save();

    // Mirror immediately to offlineDb JSON so background sync never overwrites with old data
    try {
      if (offlineDb?.installmentSales?.findByIdAndUpdate) {
        const plainSale = JSON.parse(JSON.stringify(sale));
        await offlineDb.installmentSales.findByIdAndUpdate(sale._id, plainSale);
      }
    } catch (e) {}

    await logActivity({
      req,
      action: 'UPDATE_SALE',
      module: 'Installments',
      details: `Installment Khata update kiya for "${sale.itemName}": Total: Rs. ${sale.totalAmount.toLocaleString()}, Advance: Rs. ${sale.advancePayment.toLocaleString()}, Baqi: Rs. ${sale.remainingBalance.toLocaleString()}`,
      targetId: sale._id,
      targetName: sale.itemName,
      metadata: { itemName: sale.itemName, totalAmount: sale.totalAmount, advancePayment: sale.advancePayment, remainingBalance: sale.remainingBalance }
    });

    invalidateSalesCache();

    res.json({
      success: true,
      message: 'Installment sale details updated successfully',
      sale
    });
  } catch (error) {
    console.error('Update Sale Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. Upload Extra Documents to an Existing Installment Sale
export const uploadSaleDocuments = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // 1. Flexible lookup: match by sale ID, or if customer ID passed, find their sale
    let sale = null;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      sale = await InstallmentSale.findById(id);
      if (!sale) {
        sale = await InstallmentSale.findOne({ customer: id }).sort({ createdAt: -1 });
      }
    }
    if (!sale && id) {
      const cust = await Customer.findOne({ customerId: String(id).toUpperCase() });
      if (cust) {
        sale = await InstallmentSale.findOne({ customer: cust._id }).sort({ createdAt: -1 });
      }
    }

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Installment account not found' });
    }

    let customer = null;
    if (sale.customer) {
      customer = await Customer.findById(sale.customer);
    }
    const customerContext = { 
      customerId: customer?.customerId || sale.customerId, 
      customerName: customer?.name 
    };

    const newDocuments = [];
    for (let idx = 0; idx < req.files.length; idx++) {
      const file = req.files[idx];
      await saveFileToCloudDB(file.path, file.filename, file.mimetype, customerContext.customerId);
      let driveResult = null;
      try {
        driveResult = await uploadToGoogleDrive(file.path, file.filename, null, customerContext);
      } catch (mirrorErr) {
        console.warn('uploadToGoogleDrive notice:', mirrorErr.message);
      }

      // User requested: "meri local disk pr kuch bhi save nh krna sb kuch drive pr chaea mujhaa"
      // Clean up temporary local file once safely stored in Google Drive
      if (driveResult) {
        try { fs.unlinkSync(file.path); } catch (e) {}
      }

      const fileUrl = `/uploads/${file.filename}`;
      const driveFileId = driveResult?.fileId || null;
      const title = req.body[`docTitle_${idx}`] || req.body[`docTitle[${idx}]`] || req.body.title || file.originalname || `Document ${idx + 1}`;
      newDocuments.push({ title, fileUrl, driveFileId });
    }

    // Fetch fresh sale document to ensure array push and schema casting are 100% reliable
    const targetSale = await InstallmentSale.findById(sale._id);
    if (!targetSale) {
      return res.status(404).json({ success: false, message: 'Installment account not found' });
    }

    const identityFields = [
      'profilePic',
      'cnicFront',
      'cnicBack',
      'guarantor1CnicFront',
      'guarantor1CnicBack',
      'guarantor2CnicFront',
      'guarantor2CnicBack'
    ];
    const requestedField = cleanStr(req.body.field);

    if (requestedField && identityFields.includes(requestedField) && newDocuments.length > 0) {
      targetSale[requestedField] = newDocuments[0].fileUrl;
      await targetSale.save();
      if (requestedField === 'profilePic' && targetSale.customer) {
        await Customer.findByIdAndUpdate(targetSale.customer, { $set: { profilePic: newDocuments[0].fileUrl } }).catch(() => {});
      }
    } else {
      if (!targetSale.documents) targetSale.documents = [];
      targetSale.documents.push(...newDocuments);
      targetSale.markModified('documents');
      await targetSale.save();
    }

    // Mirror to offlineDb JSON
    try {
      if (offlineDb?.installmentSales?.findByIdAndUpdate) {
        offlineDb.installmentSales.findByIdAndUpdate(sale._id, { $set: { documents: targetSale.documents } }).catch(() => {});
      }
    } catch (e) {}

    invalidateSalesCache();

    res.json({
      success: true,
      message: 'Document(s) uploaded successfully',
      documents: targetSale.documents,
      saleId: sale._id
    });
  } catch (error) {
    console.error('Upload Documents Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6a-1. Initialize Direct Google Drive or Chunked Cloud DB Upload Session (Bypasses Vercel 4.5MB Payload Limit)
export const initDirectSaleDocumentUpload = async (req, res) => {
  try {
    const { id } = req.params;
    const { fileName, fileType, fileSize, title } = req.body;

    if (!fileName) {
      return res.status(400).json({ success: false, message: 'fileName is required' });
    }

    let sale = null;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      sale = await InstallmentSale.findById(id);
      if (!sale) {
        sale = await InstallmentSale.findOne({ customer: id }).sort({ createdAt: -1 });
      }
    }
    if (!sale && id) {
      const cust = await Customer.findOne({ customerId: String(id).toUpperCase() });
      if (cust) {
        sale = await InstallmentSale.findOne({ customer: cust._id }).sort({ createdAt: -1 });
      }
    }

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Installment account not found' });
    }

    let customer = null;
    if (sale.customer) {
      customer = await Customer.findById(sale.customer);
    }
    const customerContext = {
      customerId: customer?.customerId || sale.customerId,
      customerName: customer?.name
    };

    // Sanitize and create timestamped unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    let ext = path.extname(fileName || '').toLowerCase();
    if (!ext) {
      if (fileType === 'application/pdf') ext = '.pdf';
      else if (fileType === 'image/png') ext = '.png';
      else if (fileType === 'image/webp') ext = '.webp';
      else if (fileType?.startsWith('image/')) ext = '.jpg';
      else ext = '.bin';
    }
    const cleanFilename = `${uniqueSuffix}${ext}`;

    // Try Google Drive Resumable Session first; if Drive OAuth token is expired or unavailable,
    // gracefully return CHUNKED_DB mode (200 OK — never 500!) so the client streams chunks into MongoDB CloudFile!
    let uploadUrl = null;
    let uploadMode = 'CHUNKED_DB';
    try {
      const origin = req.headers.origin || req.headers.referer || '*';
      const session = await createResumableDriveUploadSession(
        cleanFilename,
        fileType || 'application/octet-stream',
        customerContext,
        origin
      );
      if (session?.uploadUrl) {
        uploadUrl = session.uploadUrl;
        uploadMode = 'GOOGLE_DRIVE';
      }
    } catch (driveSessionErr) {
      console.warn('Google Drive session unavailable, using CHUNKED_DB cloud storage:', driveSessionErr.message);
    }

    return res.json({
      success: true,
      uploadMode,
      uploadUrl,
      cleanFilename,
      saleId: sale._id
    });
  } catch (error) {
    console.error('initDirectSaleDocumentUpload error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to initialize direct cloud upload' });
  }
};

// 6a-1b. Receive a 1.5MB File Chunk into MongoDB CloudFile (Supports 25MB-50MB PDFs on Vercel Serverless with Zero 413 Errors)
export const uploadSaleDocumentChunk = async (req, res) => {
  try {
    const { id } = req.params;
    const { cleanFilename, chunkIndex, totalChunks, fileType, fileSize, chunkBase64 } = req.body;

    if (!cleanFilename || chunkBase64 === undefined) {
      return res.status(400).json({ success: false, message: 'cleanFilename and chunkBase64 are required' });
    }

    const buffer = Buffer.from(chunkBase64, 'base64');
    const idx = Number(chunkIndex) || 0;
    const total = Number(totalChunks) || 1;

    if (idx === 0) {
      await CloudFile.deleteMany({ filename: cleanFilename });
    }

    await CloudFile.findOneAndUpdate(
      { filename: cleanFilename, chunkIndex: idx },
      {
        $set: {
          filename: cleanFilename,
          chunkIndex: idx,
          totalChunks: total,
          mimeType: fileType || 'application/octet-stream',
          size: Number(fileSize) || buffer.length,
          customerId: String(id || ''),
          data: buffer
        }
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      cleanFilename,
      chunkIndex: idx,
      totalChunks: total
    });
  } catch (error) {
    console.error('uploadSaleDocumentChunk error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to store file chunk' });
  }
};

// 6a-2. Confirm Direct Google Drive or Chunked Cloud DB Upload and Link Document into Sale Record
export const confirmDirectSaleDocumentUpload = async (req, res) => {
  try {
    const { id } = req.params;
    const { driveFileId, cleanFilename, title, fileSize, fileType, field } = req.body;

    if (!cleanFilename) {
      return res.status(400).json({ success: false, message: 'cleanFilename is required' });
    }
    const resolvedDriveId = driveFileId || `db:${cleanFilename}`;

    let sale = null;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      sale = await InstallmentSale.findById(id);
      if (!sale) {
        sale = await InstallmentSale.findOne({ customer: id }).sort({ createdAt: -1 });
      }
    }
    if (!sale && id) {
      const cust = await Customer.findOne({ customerId: String(id).toUpperCase() });
      if (cust) {
        sale = await InstallmentSale.findOne({ customer: cust._id }).sort({ createdAt: -1 });
      }
    }

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Installment account not found' });
    }

    // Register with in-memory cache and ensure public read permissions if uploaded to Google Drive
    if (resolvedDriveId && !String(resolvedDriveId).startsWith('db:')) {
      try {
        await registerUploadedDriveFile(resolvedDriveId, cleanFilename, fileType, fileSize);
      } catch (regErr) {
        console.warn('registerUploadedDriveFile notice:', regErr.message);
      }
    }

    const targetSale = await InstallmentSale.findById(sale._id);
    if (!targetSale) {
      return res.status(404).json({ success: false, message: 'Installment account not found' });
    }

    const docTitle = (title || '').trim() || cleanFilename || 'Document';
    const fileUrl = `/uploads/${cleanFilename}`;

    const identityFields = [
      'profilePic',
      'cnicFront',
      'cnicBack',
      'guarantor1CnicFront',
      'guarantor1CnicBack',
      'guarantor2CnicFront',
      'guarantor2CnicBack'
    ];

    if (field && identityFields.includes(field)) {
      targetSale[field] = fileUrl;
      await targetSale.save();
      if (field === 'profilePic' && targetSale.customer) {
        await Customer.findByIdAndUpdate(targetSale.customer, { $set: { profilePic: fileUrl } }).catch(() => {});
      }
    } else {
      const newDoc = {
        title: docTitle,
        fileUrl,
        driveFileId: resolvedDriveId,
        createdAt: new Date()
      };

      if (!targetSale.documents) targetSale.documents = [];
      targetSale.documents.push(newDoc);
      targetSale.markModified('documents');
      await targetSale.save();
    }

    // Mirror to offlineDb if local
    try {
      if (offlineDb?.installmentSales?.findByIdAndUpdate) {
        offlineDb.installmentSales.findByIdAndUpdate(sale._id, {
          $set: {
            documents: targetSale.documents,
            profilePic: targetSale.profilePic,
            cnicFront: targetSale.cnicFront,
            cnicBack: targetSale.cnicBack,
            guarantor1CnicFront: targetSale.guarantor1CnicFront,
            guarantor1CnicBack: targetSale.guarantor1CnicBack,
            guarantor2CnicFront: targetSale.guarantor2CnicFront,
            guarantor2CnicBack: targetSale.guarantor2CnicBack
          }
        }).catch(() => {});
      }
    } catch (e) {}

    invalidateSalesCache();

    return res.json({
      success: true,
      message: 'Document saved and linked successfully',
      documents: targetSale.documents,
      fileUrl,
      field: field || 'documents',
      saleId: sale._id
    });
  } catch (error) {
    console.error('confirmDirectSaleDocumentUpload error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to confirm document upload' });
  }
};


// 6b. Delete a Document from an Existing Sale
export const deleteSaleDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;

    const sale = await InstallmentSale.findById(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Installment account not found' });
    }

    // 1. Identify the file being removed to delete it from Google Drive & local disk
    const docToDelete = (sale.documents || []).find(d => 
      d._id?.toString() === docId.toString() || 
      d.fileUrl === docId || 
      d.fileUrl === `/uploads/${docId}`
    );

    if (docToDelete) {
      if (docToDelete.driveFileId) {
        try {
          await deleteFromGoogleDrive(docToDelete.driveFileId);
        } catch (e) {}
      }
      if (docToDelete.fileUrl) {
        const filenameToDelete = path.basename(docToDelete.fileUrl);
        await CloudFile.deleteMany({ filename: filenameToDelete }).catch(() => {});
        // Delete directly from 200GB Google Drive uploads folder
        try {
          await deleteFromGoogleDrive(filenameToDelete);
        } catch (driveDelErr) {
          console.warn('Google Drive delete error:', driveDelErr.message);
        }
        // Delete from local disks if present
        getUploadDirs().forEach(dir => {
          try {
            const p = path.join(dir, filenameToDelete);
            if (fs.existsSync(p)) fs.unlinkSync(p);
          } catch (e) {}
        });
      }
    }

    // 2. Atomic $pull from MongoDB
    const targetObjId = mongoose.Types.ObjectId.isValid(docId) ? new mongoose.Types.ObjectId(docId) : null;
    const pullCondition = targetObjId 
      ? { $or: [{ _id: targetObjId }, { _id: docId }] }
      : { _id: docId };

    let updatedSale = await InstallmentSale.findByIdAndUpdate(
      id,
      { $pull: { documents: pullCondition } },
      { new: true }
    );

    // Defensive fallback: check if document still exists by ID or fileUrl
    if (!updatedSale || updatedSale.documents.some(d => d._id?.toString() === docId.toString() || d.fileUrl === docId || d.fileUrl === `/uploads/${docId}`)) {
      sale.documents = (sale.documents || []).filter(d => 
        d._id?.toString() !== docId.toString() && 
        d.fileUrl !== docId && 
        d.fileUrl !== `/uploads/${docId}`
      );
      sale.markModified('documents');
      await sale.save();
      updatedSale = sale;
    }

    if (!updatedSale) {
      return res.status(404).json({ success: false, message: 'Installment account not found' });
    }

    if (!sale.deletedDocs) sale.deletedDocs = [];
    if (docToDelete?.fileUrl) sale.deletedDocs.push(path.basename(docToDelete.fileUrl));
    if (docToDelete?.driveFileId) sale.deletedDocs.push(docToDelete.driveFileId);
    sale.markModified('deletedDocs');
    try { await sale.save(); } catch (e) {}

    // Mirror to offlineDb JSON
    try {
      if (offlineDb?.installmentSales?.findByIdAndUpdate) {
        offlineDb.installmentSales.findByIdAndUpdate(id, { $set: { documents: updatedSale.documents, deletedDocs: sale.deletedDocs } }).catch(() => {});
      }
    } catch (e) {}

    invalidateSalesCache();

    res.json({
      success: true,
      message: 'Document removed successfully',
      documents: updatedSale.documents
    });
  } catch (error) {
    console.error('Delete Document Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 7. Update Promise Date & Call Remarks (Supports Multi-Followup History)
export const updatePromiseDate = async (req, res) => {
  try {
    const { id } = req.params;
    const { followUpDate, promiseDate, remarks, addedByName, callStatus } = req.body;

    if (!promiseDate && !remarks) {
      return res.status(400).json({ success: false, message: 'Promise Date or Remarks is required' });
    }

    const sale = await InstallmentSale.findById(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Installment sale not found' });
    }

    // Try to resolve author name
    let authorName = addedByName || 'Admin';
    let authorId = null;
    if (req.user) {
      authorName = req.user.name || authorName;
      authorId = req.user._id;
    } else {
      // Decode JWT if passed in header/cookie
      const authHeader = req.headers.authorization;
      const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : req.cookies?.jwt;
      if (token && process.env.JWT_SECRET) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const foundUser = await User.findById(decoded.id).select('name');
          if (foundUser) {
            authorName = foundUser.name;
            authorId = foundUser._id;
          }
        } catch (e) {
          // Token decode optional
        }
      }
    }

    const pDate = promiseDate ? new Date(promiseDate) : null;
    const fDate = followUpDate ? new Date(followUpDate) : new Date();
    const resolvedCallStatus = callStatus || (pDate ? 'CALLED - PAYMENT PROMISED' : 'PENDING CALL');

    const newFollowUp = {
      callStatus: resolvedCallStatus,
      followUpDate: fDate,
      promiseDate: pDate,
      remarks: cleanStr(remarks),
      addedBy: authorId,
      addedByName: authorName,
      createdAt: new Date()
    };

    if (!sale.followUps) {
      sale.followUps = [];
    }
    sale.followUps.push(newFollowUp);
    sale.callStatus = resolvedCallStatus;
    sale.promiseDate = pDate;
    sale.remarks = cleanStr(remarks) || sale.remarks;

    await sale.save();
    await sale.populate('customer');

    // Mirror to offlineDb JSON
    try {
      if (offlineDb?.installmentSales?.findByIdAndUpdate) {
        const plainSale = JSON.parse(JSON.stringify(sale));
        await offlineDb.installmentSales.findByIdAndUpdate(sale._id, plainSale);
      }
    } catch (e) {}

    await logActivity({
      req,
      action: 'UPDATE_PROMISE_DATE',
      module: 'Installments',
      details: `Follow-up remarks & promise date darj ki for "${sale.customer?.name}": "${remarks}"`,
      targetId: sale._id,
      targetName: sale.customer?.name
    });

    invalidateSalesCache();

    res.json({
      success: true,
      message: 'Follow-up remarks and promise date saved successfully',
      sale
    });
  } catch (error) {
    console.error('Update Promise Date Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 8. Delete Installment Sale (Mistake Entry Reversal)
export const deleteInstallmentSale = async (req, res) => {
  try {
    const { id } = req.params;

    const sale = await InstallmentSale.findById(id).populate('customer');
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Installment sale not found' });
    }

    // 0. Record deletion tombstone immediately
    recordDeletion('installmentSales', id);

    const customerObj = sale.customer;
    const customerId = customerObj?._id || sale.customer;
    const customerName = customerObj?.name || 'Customer';
    const itemName = sale.itemName || 'Item';

    // 1. Delete the installment sale itself from MongoDB Atlas FIRST (instant, sub-millisecond)
    const saleObjId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
    await InstallmentSale.deleteOne({ $or: [{ _id: saleObjId }, { _id: String(id) }] });

    // 2. Delete all payments associated with this mistake sale and record tombstones
    const linkedPayments = await Payment.find({
      $or: [
        { installmentSale: sale._id },
        { sale: sale._id },
        { installmentSale: id },
        { sale: id }
      ]
    });
    for (const p of linkedPayments) {
      recordDeletion('payments', p._id);
    }

    await Payment.deleteMany({
      $or: [
        { installmentSale: sale._id },
        { sale: sale._id },
        { installmentSale: id },
        { sale: id }
      ]
    });

    // 3. Mirror deletion to offlineDb JSON immediately
    try {
      if (offlineDb?.installmentSales?.findByIdAndDelete) {
        await offlineDb.installmentSales.findByIdAndDelete(id);
      }
      if (offlineDb?.payments?.deleteMany) {
        await offlineDb.payments.deleteMany({
          $or: [
            { installmentSale: id },
            { sale: id }
          ]
        });
      }
    } catch (e) {}

    // 4. If this customer has no other sales, remove empty customer profile
    if (customerId) {
      const remainingSales = await InstallmentSale.countDocuments({ customer: customerId });
      if (remainingSales === 0) {
        recordDeletion('customers', customerId);
        const custObjId = mongoose.Types.ObjectId.isValid(customerId) ? new mongoose.Types.ObjectId(customerId) : customerId;
        await Customer.deleteOne({ $or: [{ _id: custObjId }, { _id: String(customerId) }] });
        try {
          if (offlineDb?.customers?.findByIdAndDelete) {
            await offlineDb.customers.findByIdAndDelete(customerId);
          }
        } catch (e) {}
      }
    }

    // 5. Invalidate caches immediately
    invalidateSalesCache();

    // 6. Delete associated documents from Google Drive asynchronously (non-blocking)
    const filesToDelete = [];
    if (sale.documents && Array.isArray(sale.documents)) {
      for (const doc of sale.documents) {
        if (doc.driveFileId) filesToDelete.push(doc.driveFileId);
        if (doc.fileUrl) filesToDelete.push(path.basename(doc.fileUrl));
      }
    }
    ['cnicFront', 'cnicBack', 'guarantor1CnicFront', 'guarantor1CnicBack', 'guarantor2CnicFront', 'guarantor2CnicBack'].forEach(k => {
      if (sale[k]) filesToDelete.push(path.basename(sale[k]));
    });

    setTimeout(async () => {
      for (const f of filesToDelete) {
        try {
          await deleteFromGoogleDrive(f);
        } catch (err) {}
        getUploadDirs().forEach(dir => {
          try {
            const p = path.join(dir, f);
            if (fs.existsSync(p)) fs.unlinkSync(p);
          } catch (e) {}
        });
      }
    }, 50);

    // 7. Audit log
    await logActivity({
      req,
      action: 'DELETE_INSTALLMENT_SALE',
      module: 'Installments',
      details: `Mistake installment sale deleted for "${customerName}" (${itemName}, Total: Rs. ${sale.totalAmount})`,
      targetId: sale._id,
      targetName: customerName
    });

    res.json({
      success: true,
      message: `Installment sale for "${itemName}" has been successfully deleted.`
    });
  } catch (error) {
    console.error('Delete Installment Sale Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 9. Delete a Payment Entry (Mistake Payment Reversal)
export const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment entry not found' });
    }

    const saleId = payment.installmentSale || payment.sale;
    let amountPaid = Number(payment.amountPaid || payment.amount || 0);
    let siblingIds = [String(payment._id)];

    if (payment.batchId) {
      const batchDocs = await Payment.find({ batchId: payment.batchId }).lean();
      if (batchDocs.length > 1) {
        amountPaid = batchDocs.reduce((sum, d) => sum + Number(d.amountPaid || 0), 0);
        siblingIds = batchDocs.map(d => String(d._id));
      }
    }

    siblingIds.forEach(sId => recordDeletion('payments', sId));

    // If linked to a sale, restore the sale balances
    let sale = null;
    if (saleId) {
      sale = await InstallmentSale.findById(saleId).populate('customer');
      if (sale) {
        const newRecovered = Math.max(0, Number(sale.totalRecoveredAmount || 0) - amountPaid);
        const newBalance = Number(sale.remainingBalance || 0) + amountPaid;
        const newStatus = newBalance <= 0 ? 'completed' : 'active';

        sale.totalRecoveredAmount = newRecovered;
        sale.remainingBalance = newBalance;
        sale.status = newStatus;
        await sale.save();

        try {
          if (offlineDb?.installmentSales?.findByIdAndUpdate) {
            await offlineDb.installmentSales.findByIdAndUpdate(saleId, {
              $set: {
                totalRecoveredAmount: newRecovered,
                remainingBalance: newBalance,
                status: newStatus
              }
            });
          }
        } catch (e) {}
      }
    }

    // Delete payment record(s) from MongoDB Atlas
    if (payment.batchId) {
      await Payment.deleteMany({ batchId: payment.batchId });
    } else {
      const payObjId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
      await Payment.deleteOne({ $or: [{ _id: payObjId }, { _id: String(id) }] });
    }

    try {
      if (offlineDb?.payments?.findByIdAndDelete) {
        for (const sId of siblingIds) {
          await offlineDb.payments.findByIdAndDelete(sId);
        }
      }
    } catch (e) {}

    invalidateSalesCache();

    await logActivity({
      req,
      action: 'DELETE_PAYMENT',
      module: 'Installments',
      details: `Mistake payment of Rs. ${amountPaid} deleted for "${sale?.customer?.name || 'Customer'}"`,
      targetId: payment._id,
      targetName: sale?.customer?.name || 'Payment'
    });

    res.json({
      success: true,
      message: `Payment of Rs. ${amountPaid.toLocaleString()} deleted and sale balance restored successfully.`,
      remainingBalance: sale?.remainingBalance
    });
  } catch (error) {
    console.error('Delete Payment Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};