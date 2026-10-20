import express from 'express';
import InstallmentSale from '../models/InstallmentSale.js';
import Customer from '../models/Customer.js';
import Payment from '../models/Payment.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Singleton RAM Cache for Dashboard Overview (sub-millisecond instant loads)
let cachedDashboard = null;
let lastDashboardCacheTime = 0;
const DASHBOARD_CACHE_TTL = 30000; // 30 seconds

export const invalidateDashboardCache = () => {
  cachedDashboard = null;
  lastDashboardCacheTime = 0;
};

router.get('/overview', protect, async (req, res) => {
  try {
    const now = Date.now();
    if (cachedDashboard && (now - lastDashboardCacheTime) < DASHBOARD_CACHE_TTL) {
      return res.status(200).json(cachedDashboard);
    }

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // 1. Fetch Sales and Monthly Collection in Parallel with DB-level Aggregation
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

    const [rawSales, paymentAgg] = await Promise.all([
      InstallmentSale.find()
        .populate('customer', 'name customerId phone phone2 cnic address')
        .sort({ createdAt: -1 })
        .lean(),
      Payment.aggregate([
        { $match: { createdAt: { $gte: startOfMonth, $lte: endOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } }
      ])
    ]);

    const collectedThisMonth = paymentAgg?.[0]?.total || 0;

    // 2. Normalize Sales Data
    let totalSalesCapital = 0;
    let activeMarketOutstanding = 0;
    let activeAccountsCount = 0;

    const allSales = (rawSales || []).map(sale => {
      const cust = sale.customer || {};
      const name = cust.name || sale.customerName || 'Customer';
      const customerId = cust.customerId || sale.customerId || (cust._id ? String(cust._id).slice(-6).toUpperCase() : 'N/A');
      const phone = cust.phone || sale.phone || '';

      const total = Number(sale.totalAmount || 0);
      const remaining = Number(sale.remainingBalance || 0);

      totalSalesCapital += total;
      if (sale.status !== 'completed' && remaining > 0) {
        activeMarketOutstanding += remaining;
        activeAccountsCount++;
      }

      return {
        ...sale,
        customer: {
          ...cust,
          name,
          customerId,
          phone
        },
        customerName: name,
        customerId: customerId,
        customerPhone: phone
      };
    });

    // 4. TODAY'S DUE INSTALLMENTS FILTER (FIXED LOGIC)
    const todaysDue = allSales.filter(sale => {
      const remaining = Number(sale.remainingBalance || 0);
      
      // Condition A: Fully paid sales skip
      if (sale.status === 'completed' || remaining <= 0) return false;

      const rawDate = sale.createdAt || sale.date || Date.now();
      const saleDate = new Date(rawDate);
      
      // Calculate age of sale in months
      const monthsDiff = (currentYear - saleDate.getFullYear()) * 12 + (currentMonth - saleDate.getMonth());

      // Condition B: Issi month me hui sale ki pehli kist next month due hogi
      if (monthsDiff < 1) {
        return false;
      }

      // Condition C: Agar is month already payment jama ho chuki hai toh aaj show na ho
      if (sale.lastPaymentDate) {
        const lastPay = new Date(sale.lastPaymentDate);
        if (lastPay.getFullYear() === currentYear && lastPay.getMonth() === currentMonth) {
          return false;
        }
      }

      // Condition D: Agar explicit nextDueDate saved hai DB me
      if (sale.nextDueDate) {
        const nextDue = new Date(sale.nextDueDate);
        return nextDue.getDate() === currentDay && nextDue.getMonth() === currentMonth;
      }

      // Default: Check if today matches customer's monthly installment due date
      const dueDay = Number(sale.dueDateDay || saleDate.getDate() || 1);
      return dueDay === currentDay;
    });

    const todaysExpectedAmount = todaysDue.reduce((sum, s) => sum + Number(s.monthlyAmount || s.monthlyInstallment || 0), 0);

    // 5. PROMISE ALERTS (Customer promises that have arrived or passed today without completion)
    const startOfToday = new Date(currentYear, currentMonth, currentDay, 0, 0, 0, 0);
    const endOfToday = new Date(currentYear, currentMonth, currentDay, 23, 59, 59, 999);

    const promiseAlerts = allSales.filter(sale => {
      const remaining = Number(sale.remainingBalance || 0);
      if (sale.status === 'completed' || remaining <= 0) return false;
      if (!sale.promiseDate) return false;

      const pDate = new Date(sale.promiseDate);
      return pDate <= endOfToday; // Promise date has reached or passed!
    }).map(s => {
      const pDate = new Date(s.promiseDate);
      const isDueToday = pDate >= startOfToday && pDate <= endOfToday;
      const isOverduePromise = pDate < startOfToday;
      return {
        _id: s._id,
        customerName: s.customerName,
        customerId: s.customerId,
        customerPhone: s.customerPhone,
        itemName: s.itemName,
        monthlyAmount: s.monthlyAmount,
        remainingBalance: s.remainingBalance,
        promiseDate: s.promiseDate,
        remarks: s.remarks,
        followUps: s.followUps || [],
        isDueToday,
        isOverduePromise
      };
    });

    const payload = {
      success: true,
      stats: {
        totalSalesCapital,
        activeMarketOutstanding,
        collectedThisMonth,
        activeAccountsCount,
        todaysDueCount: todaysDue.length,
        todaysExpectedAmount,
        promiseAlertsCount: promiseAlerts.length
      },
      todaysDueSales: todaysDue,
      promiseAlerts
    };

    cachedDashboard = payload;
    lastDashboardCacheTime = Date.now();

    return res.status(200).json(payload);

  } catch (err) {
    console.error("DASHBOARD OVERVIEW ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;