import express from 'express';
import mongoose from 'mongoose';
import Expense from '../models/Expense.js';
import Payment from '../models/Payment.js';
import DailyClosing from '../models/DailyClosing.js';
import { protect } from '../middleware/authMiddleware.js';
import { logActivity } from '../utils/logger.js';
import { offlineDb, recordDeletion } from '../services/offlineDb.js';

const router = express.Router();

// Helper to format YYYY-MM-DD (local time)
const formatDateStr = (d) => {
  const dateObj = d ? new Date(d) : new Date();
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 1. GET Daily Summary (Supports single date & date-range exports)
router.get('/summary', protect, async (req, res) => {
  try {
    // If range query is provided (e.g. from MonthlyReportExport)
    if (req.query.rangeStartDate && req.query.rangeEndDate) {
      const rangeStart = new Date(req.query.rangeStartDate);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(req.query.rangeEndDate);
      rangeEnd.setHours(23, 59, 59, 999);

      const [rangePayments, rangeExpenses] = await Promise.all([
        Payment.find({ createdAt: { $gte: rangeStart, $lte: rangeEnd } })
          .populate('customer', 'name fullName customerName phone')
          .populate({
            path: 'installmentSale',
            select: 'itemName customer',
            populate: { path: 'customer', select: 'name fullName customerName phone' }
          })
          .sort({ createdAt: -1 })
          .lean(),
        Expense.find({ createdAt: { $gte: rangeStart, $lte: rangeEnd } })
          .sort({ createdAt: -1 })
          .lean()
      ]);

      let rangeCashRecovery = 0;
      let rangeOnlineRecovery = 0;
      rangePayments.forEach(p => {
        if (p.paymentMethod?.toLowerCase() === 'cash') {
          rangeCashRecovery += (p.amountPaid || 0);
        } else {
          rangeOnlineRecovery += (p.amountPaid || 0);
        }
      });

      const rangeTotalRecovery = rangeCashRecovery + rangeOnlineRecovery;
      const rangeTotalExpenses = rangeExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      const rangeNetCash = rangeTotalRecovery - rangeTotalExpenses;

      return res.json({
        success: true,
        rangeStats: {
          totalRecovery: rangeTotalRecovery,
          totalExpenses: rangeTotalExpenses,
          netCash: rangeNetCash,
          cashRecovery: rangeCashRecovery,
          onlineRecovery: rangeOnlineRecovery,
          payments: rangePayments,
          expenses: rangeExpenses
        },
        payments: rangePayments,
        expenses: rangeExpenses
      });
    }

    const queryDateStr = req.query.date || formatDateStr();

    // Use local day boundaries so timezone matches 00:00:00 to 23:59:59.999
    const [year, month, day] = queryDateStr.split('-').map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

    // Run primary DB queries in Parallel using Promise.all + .lean() for maximum speed
    const [todayPayments, todayExpenses, existingClosing] = await Promise.all([
      Payment.find({ createdAt: { $gte: startOfDay, $lte: endOfDay } })
        .populate('customer', 'name fullName customerName phone')
        .populate({
          path: 'installmentSale',
          select: 'itemName customer',
          populate: {
            path: 'customer',
            select: 'name fullName customerName phone'
          }
        })
        .sort({ createdAt: -1 })
        .lean(),

      Expense.find({ createdAt: { $gte: startOfDay, $lte: endOfDay } })
        .sort({ createdAt: -1 })
        .lean(),

      DailyClosing.findOne({ dateStr: queryDateStr })
        .populate('closedBy', 'name')
        .lean()
    ]);

    // Calculate Today's Recoveries and separate Cash vs Online transactions
    let cashRecovery = 0;
    let onlineRecovery = 0;
    const cashPayments = [];
    const onlinePayments = [];

    for (let i = 0; i < todayPayments.length; i++) {
      const p = todayPayments[i];
      const m = (p.paymentMethod || 'cash').toLowerCase().trim();
      if (m === 'cash' || m === 'naqd' || m === 'counter cash') {
        cashRecovery += (p.amountPaid || 0);
        cashPayments.push(p);
      } else {
        onlineRecovery += (p.amountPaid || 0);
        onlinePayments.push(p);
      }
    }

    // Calculate Expenses (Categorize Cash vs Online / Bank)
    let totalExpenses = 0;
    let cashExpenses = 0;
    let onlineExpenses = 0;
    const cashExpensesList = [];
    const onlineExpensesList = [];

    for (let i = 0; i < todayExpenses.length; i++) {
      const e = todayExpenses[i];
      const amt = Number(e.amount) || 0;
      totalExpenses += amt;
      const m = (e.paymentMethod || 'cash').toLowerCase().trim();
      if (m === 'cash' || m === 'naqd' || m === 'counter cash') {
        cashExpenses += amt;
        cashExpensesList.push(e);
      } else {
        onlineExpenses += amt;
        onlineExpensesList.push(e);
      }
    }

    // Automatic Carry-Over Opening Balance Calculation (Cash & Online)
    // NEVER resets to 0: always starts from previous day's closing balance!
    let openingBalance = 0;
    let onlineOpeningBalance = 0;

    if (existingClosing && existingClosing.isClosed) {
      openingBalance = existingClosing.openingBalance || 0;
      onlineOpeningBalance = existingClosing.onlineOpeningBalance || 0;
    } else {
      // Find latest closed day before queryDateStr
      const lastClosing = await DailyClosing.findOne({ 
        dateStr: { $lt: queryDateStr },
        isClosed: true 
      })
      .sort({ dateStr: -1 })
      .lean();

      if (lastClosing) {
        let baseCash = lastClosing.closingBalance || 0;
        let baseOnline = lastClosing.onlineClosingBalance || 0;

        const [ly, lm, ld] = lastClosing.dateStr.split('-').map(Number);
        const lastCloseEnd = new Date(ly, lm - 1, ld, 23, 59, 59, 999);

        // Add any interim transactions between last closed day and start of queryDateStr
        const [interimPayments, interimExpenses] = await Promise.all([
          Payment.find({ createdAt: { $gt: lastCloseEnd, $lt: startOfDay } }).select('paymentMethod amountPaid').lean(),
          Expense.find({ createdAt: { $gt: lastCloseEnd, $lt: startOfDay } }).select('paymentMethod amount').lean()
        ]);

        let interimCash = 0;
        let interimOnline = 0;
        for (const p of interimPayments) {
          const m = (p.paymentMethod || 'cash').toLowerCase().trim();
          if (m === 'cash' || m === 'naqd' || m === 'counter cash') {
            interimCash += (p.amountPaid || 0);
          } else {
            interimOnline += (p.amountPaid || 0);
          }
        }

        let interimCashExp = 0;
        let interimOnlineExp = 0;
        for (const e of interimExpenses) {
          const m = (e.paymentMethod || 'cash').toLowerCase().trim();
          if (m === 'cash' || m === 'naqd' || m === 'counter cash') {
            interimCashExp += (e.amount || 0);
          } else {
            interimOnlineExp += (e.amount || 0);
          }
        }

        openingBalance = Math.max(0, baseCash + interimCash - interimCashExp);
        onlineOpeningBalance = Math.max(0, baseOnline + interimOnline - interimOnlineExp);
      } else {
        // No day has ever been locked yet: calculate cumulative balances of all transactions prior to startOfDay
        const [priorPayments, priorExpenses] = await Promise.all([
          Payment.find({ createdAt: { $lt: startOfDay } }).select('paymentMethod amountPaid').lean(),
          Expense.find({ createdAt: { $lt: startOfDay } }).select('paymentMethod amount').lean()
        ]);

        let priorCash = 0;
        let priorOnline = 0;
        for (const p of priorPayments) {
          const m = (p.paymentMethod || 'cash').toLowerCase().trim();
          if (m === 'cash' || m === 'naqd' || m === 'counter cash') {
            priorCash += (p.amountPaid || 0);
          } else {
            priorOnline += (p.amountPaid || 0);
          }
        }

        let priorCashExp = 0;
        let priorOnlineExp = 0;
        for (const e of priorExpenses) {
          const m = (e.paymentMethod || 'cash').toLowerCase().trim();
          if (m === 'cash' || m === 'naqd' || m === 'counter cash') {
            priorCashExp += (e.amount || 0);
          } else {
            priorOnlineExp += (e.amount || 0);
          }
        }

        openingBalance = Math.max(0, priorCash - priorCashExp);
        onlineOpeningBalance = Math.max(0, priorOnline - priorOnlineExp);
      }
    }

    const physicalCashInDrawer = openingBalance + cashRecovery - cashExpenses;
    const onlineClosingBalance = onlineOpeningBalance + onlineRecovery - onlineExpenses;
    const netTotalClosing = physicalCashInDrawer + onlineClosingBalance;

    res.json({
      success: true,
      selectedDate: queryDateStr,
      isToday: queryDateStr === formatDateStr(),
      isClosed: existingClosing ? existingClosing.isClosed : false,
      closedDetails: existingClosing || null,
      openingBalance,
      onlineOpeningBalance,
      cashRecovery,
      onlineRecovery,
      totalRecovery: cashRecovery + onlineRecovery,
      totalExpenses,
      cashExpenses,
      onlineExpenses,
      physicalCashInDrawer,
      closingBalance: physicalCashInDrawer,
      onlineClosingBalance,
      netTotalClosing,
      payments: todayPayments,
      cashTransactions: cashPayments,
      onlineTransactions: onlinePayments,
      expenses: todayExpenses,
      cashExpensesList,
      onlineExpensesList
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. ADD Expense
router.post('/expense', protect, async (req, res) => {
  try {
    const { title, amount, category, paymentMethod, notes, date } = req.body;
    if (!title || !amount) {
      return res.status(400).json({ success: false, message: 'Title and amount required' });
    }

    const expenseDate = date ? new Date(date) : new Date();

    const newExpense = await Expense.create({
      title: title.trim(),
      amount: Number(amount),
      category: category || 'General',
      paymentMethod: paymentMethod || 'Cash',
      notes: (notes || '').trim(),
      recordedBy: req.user._id,
      createdAt: expenseDate
    });

    await logActivity({
      req,
      action: 'ADD_EXPENSE',
      module: 'Expenses',
      details: `Shop Kharcha: Rs. ${Number(amount).toLocaleString()} for "${title.trim()}" (${category || 'General'}) [Mode: ${paymentMethod || 'Cash'}]`,
      targetId: newExpense._id,
      targetName: title.trim(),
      metadata: { amount: Number(amount), category, paymentMethod }
    });

    res.status(201).json({ success: true, expense: newExpense });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. DELETE Expense
router.delete('/expense/:id', protect, async (req, res) => {
  try {
    const id = req.params.id;
    recordDeletion('expenses', id);
    const expToDelete = await Expense.findById(id);
    const objId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
    await Expense.deleteOne({ $or: [{ _id: objId }, { _id: String(id) }] });
    if (offlineDb?.expenses?.findByIdAndDelete) {
      await offlineDb.expenses.findByIdAndDelete(id);
    }

    await logActivity({
      req,
      action: 'DELETE_EXPENSE',
      module: 'Expenses',
      details: `Shop Kharcha Delete Kiya Gaya: "${expToDelete?.title || 'Unknown'}" (Rs. ${expToDelete?.amount || 0})`,
      targetId: id,
      targetName: expToDelete?.title || ''
    });

    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. LOCK / CLOSE DAY OFFICIAL ACTION
router.post('/close-day', protect, async (req, res) => {
  try {
    const { 
      dateStr, 
      openingBalance = 0, 
      onlineOpeningBalance = 0,
      cashRecovery = 0, 
      onlineRecovery = 0, 
      totalExpenses = 0, 
      closingBalance = 0,
      onlineClosingBalance = 0,
      notes 
    } = req.body;
    const targetDate = dateStr || formatDateStr();

    const finalOnlineClosing = Number(onlineClosingBalance ?? (Number(onlineOpeningBalance || 0) + Number(onlineRecovery || 0)));

    let closing = await DailyClosing.findOne({ dateStr: targetDate });

    if (closing) {
      closing.openingBalance = Number(openingBalance) || 0;
      closing.onlineOpeningBalance = Number(onlineOpeningBalance) || 0;
      closing.totalCashRecovery = Number(cashRecovery) || 0;
      closing.totalOnlineRecovery = Number(onlineRecovery) || 0;
      closing.totalExpenses = Number(totalExpenses) || 0;
      closing.closingBalance = Number(closingBalance) || 0;
      closing.onlineClosingBalance = finalOnlineClosing;
      closing.isClosed = true;
      closing.closedBy = req.user._id;
      closing.notes = notes || 'Day Closed';
      await closing.save();
    } else {
      closing = await DailyClosing.create({
        dateStr: targetDate,
        openingBalance: Number(openingBalance) || 0,
        onlineOpeningBalance: Number(onlineOpeningBalance) || 0,
        totalCashRecovery: Number(cashRecovery) || 0,
        totalOnlineRecovery: Number(onlineRecovery) || 0,
        totalExpenses: Number(totalExpenses) || 0,
        closingBalance: Number(closingBalance) || 0,
        onlineClosingBalance: finalOnlineClosing,
        isClosed: true,
        closedBy: req.user._id,
        notes: notes || 'Day Closed'
      });
    }

    await logActivity({
      req,
      action: 'CLOSE_DAY',
      module: 'DailyCash',
      details: `Roznamcha Day Lock kiya gaya (${targetDate}). Counter Cash: Rs. ${Number(closingBalance).toLocaleString()}, Online Balance: Rs. ${finalOnlineClosing.toLocaleString()}`,
      metadata: { targetDate, closingBalance, finalOnlineClosing }
    });

    res.json({ success: true, message: 'Day Officially Locked & Closed!', closing });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. UNLOCK DAY (Owner Only)
router.post('/unlock-day', protect, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only owner can unlock day' });
    }
    const { dateStr } = req.body;
    await DailyClosing.findOneAndUpdate({ dateStr }, { isClosed: false });

    await logActivity({
      req,
      action: 'UNLOCK_DAY',
      module: 'DailyCash',
      details: `Roznamcha Day Unlock kiya gaya for date "${dateStr}"`
    });

    res.json({ success: true, message: 'Day Unlocked successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;