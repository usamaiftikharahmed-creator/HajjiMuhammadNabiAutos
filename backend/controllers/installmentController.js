import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Customer from '../models/Customer.js';
import InstallmentSale from '../models/InstallmentSale.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { logActivity } from '../utils/logger.js';
import { invalidateDashboardCache } from '../routes/dashboardRoutes.js';
import { triggerDebouncedLiveJsonSync } from '../services/backupService.js';
import { offlineDb } from '../services/offlineDb.js';
import { mirrorUploadedFile, getUploadDirs } from '../services/uploadService.js';
import { deleteFromGoogleDrive } from '../services/googleDriveService.js';

// Process-wide Singleton RAM cache for sub-millisecond page loads (<1ms)
const SALES_CACHE_TTL_MS = 60000; // 60 seconds TTL

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

    // Process uploaded files if any
    let profilePic = '';
    let cnicFront = '';
    let cnicBack = '';
    let guarantor1CnicFront = '';
    let guarantor1CnicBack = '';
    let guarantor2CnicFront = '';
    let guarantor2CnicBack = '';
    const documents = [];

    if (req.files && Array.isArray(req.files)) {
      req.files.forEach((file) => {
        const fileUrl = `/uploads/${file.filename}`;
        mirrorUploadedFile(file.path, file.filename).catch(() => {});
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
          documents.push({ title, fileUrl });
        }
      });
    }

    // Find or create customer
    let customer = await Customer.findOne({ 
      $or: [
        { phone },
        ...(cnic ? [{ cnic }] : [])
      ]
    });

    if (!customer) {
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
      const customerId = `CUST-${maxCustNum + 1}`;

      customer = await Customer.create({
        customerId,
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
      createdBy: req.user?._id || null
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
    const saleId = req.body.installmentSaleId || req.body.saleId;
    const rawAmount = req.body.amountPaid ?? req.body.amount;
    const paymentMethod = req.body.paymentMethod || req.body.paymentMode || 'Cash';
    const transactionId = req.body.transactionId || '';
    const forMonth = req.body.forMonth || new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const notes = req.body.notes || '';

    if (!saleId || rawAmount === undefined || rawAmount === null) {
      return res.status(400).json({ success: false, message: 'Sale ID and amount are required' });
    }

    const sale = await InstallmentSale.findById(saleId).populate('customer');
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Installment account not found' });
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
        receivedBy: req.user?._id || null
      });

      sale.remainingAdvance = Math.max(0, (sale.remainingAdvance || 0) - paid);
      sale.advancePaidNow = (sale.advancePaidNow || 0) + paid;
      if (sale.remainingAdvance === 0) {
        sale.remainingAdvanceStatus = 'PAID';
      }
      sale.lastPaymentDate = new Date();
      await sale.save();

      await logActivity({
        req,
        action: 'RECORD_PAYMENT',
        module: 'Payments',
        details: `Remaining Advance Wasooli: Rs. ${paid.toLocaleString()} wasool huay for "${sale.customer?.name || 'Customer'}" (Item: "${sale.itemName}"). Baqi Advance: Rs. ${sale.remainingAdvance.toLocaleString()}`,
        targetId: payment._id,
        targetName: sale.customer?.name,
        metadata: { itemName: sale.itemName, paid, paymentMethod, remainingAdvance: sale.remainingAdvance }
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

    const payment = await Payment.create({
      installmentSale: sale._id,
      customer: sale.customer?._id || sale.customer,
      amountPaid: paid,
      paymentMethod,
      transactionId,
      forMonth,
      notes,
      receivedBy: req.user?._id || null
    });

    // Update remaining balance & completion status
    sale.remainingBalance = Math.max(0, sale.remainingBalance - paid);
    if (sale.remainingBalance === 0) {
      sale.status = 'completed';
    }
    sale.lastPaymentDate = new Date();

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

    await logActivity({
      req,
      action: 'RECORD_PAYMENT',
      module: 'Payments',
      details: `Kist Wasooli: Rs. ${paid.toLocaleString()} wasool huay for "${sale.customer?.name}" (Item: "${sale.itemName}"). [Payment Mode: ${paymentMethod}, Baqi Kist: Rs. ${sale.remainingBalance.toLocaleString()}]`,
      targetId: payment._id,
      targetName: sale.customer?.name,
      metadata: { itemName: sale.itemName, paid, paymentMethod, remainingBalance: sale.remainingBalance }
    });

    invalidateSalesCache();

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      remainingBalance: sale.remainingBalance,
      payment,
      sale
    });
  } catch (error) {
    console.error('Record Payment Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Reusable DB aggregation pipeline
export const fetchSalesFromDB = async () => {
  return await InstallmentSale.aggregate([
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
              createdAt: 1
            }
          }
        ],
        as: 'payments'
      }
    }
  ]);
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
    if (global.iss_cachedSales && (now - (global.iss_lastSalesFetchTime || 0)) < SALES_CACHE_TTL_MS) {
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

    const [installmentSales, payments] = await Promise.all([
      InstallmentSale.find({ customer: customer._id }).sort({ createdAt: -1 }).lean(),
      Payment.find({ customer: customer._id })
        .populate('receivedBy', 'name')
        .populate('installmentSale', 'itemName itemRegNumber registrationNumber modelYear engineNumber chassisNumber totalAmount remainingBalance monthlyAmount')
        .sort({ createdAt: -1 })
        .lean()
    ]);

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
    if (req.files && Array.isArray(req.files)) {
      const picFile = req.files.find(f => f.fieldname === 'profilePic' || f.fieldname === 'photo' || f.fieldname === 'customerPhoto');
      if (picFile) {
        profilePic = `/uploads/${picFile.filename}`;
      }
    } else if (req.file) {
      profilePic = `/uploads/${req.file.filename}`;
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
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      profilePic = `/uploads/${req.files[0].filename}`;
    } else if (req.file) {
      profilePic = `/uploads/${req.file.filename}`;
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
      itemName, totalAmount, advancePayment,
      itemRegNumber, registrationNumber, modelYear, engineNumber, chassisNumber, monthlyAmount, dueDateDay, totalMonths, promiseMonth, promisedMonths,
      status, remarks, guarantorName, guarantorPhone, guarantor2Name, guarantor2Phone 
    } = req.body;

    const sale = await InstallmentSale.findById(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Installment sale not found' });
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

        const advPayment = await Payment.findOne({
          installmentSale: sale._id,
          forMonth: 'Advance Payment'
        });

        if (advPayment) {
          if (newAdv > 0) {
            advPayment.amountPaid = newAdv;
            await advPayment.save();
          } else {
            await Payment.deleteOne({ _id: advPayment._id });
          }
        } else if (newAdv > 0) {
          await Payment.create({
            installmentSale: sale._id,
            customer: sale.customer,
            amountPaid: newAdv,
            paymentMethod: 'Cash',
            forMonth: 'Advance Payment',
            notes: 'Advance Payment at Booking',
            createdAt: sale.createdAt || new Date()
          });
        }
      }
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

    const newDocuments = [];
    for (let idx = 0; idx < req.files.length; idx++) {
      const file = req.files[idx];
      const fileUrl = `/uploads/${file.filename}`;
      const title = req.body[`docTitle_${idx}`] || req.body[`docTitle[${idx}]`] || req.body.title || file.originalname || `Document ${idx + 1}`;
      newDocuments.push({ title, fileUrl });
    }

    // 2. CRITICAL: Save to MongoDB Atlas FIRST so document is immediately registered!
    const updatedSale = await InstallmentSale.findByIdAndUpdate(
      sale._id,
      { $push: { documents: { $each: newDocuments } } },
      { new: true }
    );

    // 3. Mirror/upload to Google Drive Cloud folder
    for (const file of req.files) {
      try {
        await mirrorUploadedFile(file.path, file.filename);
      } catch (mirrorErr) {
        console.warn('mirrorUploadedFile warning:', mirrorErr.message);
      }
    }

    // Mirror to offlineDb JSON
    try {
      if (offlineDb?.installmentSales?.findByIdAndUpdate && updatedSale) {
        offlineDb.installmentSales.findByIdAndUpdate(sale._id, { $set: { documents: updatedSale.documents } }).catch(() => {});
      }
    } catch (e) {}

    invalidateSalesCache();

    res.json({
      success: true,
      message: 'Document(s) uploaded successfully',
      documents: updatedSale ? updatedSale.documents : sale.documents,
      saleId: sale._id
    });
  } catch (error) {
    console.error('Upload Documents Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
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

    if (docToDelete && docToDelete.fileUrl) {
      const filenameToDelete = path.basename(docToDelete.fileUrl);
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

    // Mirror to offlineDb JSON
    try {
      if (offlineDb?.installmentSales?.findByIdAndUpdate) {
        offlineDb.installmentSales.findByIdAndUpdate(id, { $set: { documents: updatedSale.documents } }).catch(() => {});
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