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

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

router.get('/overview', protect, async (req, res) => {
  try {
    const now = Date.now();
    if (!req.query.refresh && cachedDashboard && (now - lastDashboardCacheTime) < DASHBOARD_CACHE_TTL) {
      return res.status(200).json(cachedDashboard);
    }

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const currentMonthLabel = `${SHORT_MONTHS[currentMonth]} ${currentYear}`;

    // 1. Fetch Sales and Payments in Parallel
    const [rawSales, allPayments] = await Promise.all([
      InstallmentSale.find()
        .populate('customer', 'name customerId phone phone2 cnic address')
        .sort({ createdAt: -1 })
        .lean(),
      Payment.find().lean()
    ]);

    // 2. Calculate Current Month Collected Installments (by forMonth / batchBreakdown, excluding Advance)
    let currentMonthCollectedAmount = 0;
    const paidSaleIdsInCurrentMonth = new Set();
    const targetMonthLower = currentMonthLabel.toLowerCase();

    for (const p of (allPayments || [])) {
      const fm = String(p.forMonth || '');
      const note = String(p.notes || p.remarks || '').toLowerCase();
      if (fm.toLowerCase().includes('advance') || note.includes('advance')) continue;

      if (Array.isArray(p.batchBreakdown) && p.batchBreakdown.length > 0) {
        for (const b of p.batchBreakdown) {
          const m = String(b.forMonth || '').trim();
          if (!m || m.toLowerCase().includes('advance')) continue;
          if (m.toLowerCase() === targetMonthLower) {
            const amt = Number(b.amountPaid || 0) || 0;
            if (amt > 0) {
              currentMonthCollectedAmount += amt;
              if (p.installmentSale) paidSaleIdsInCurrentMonth.add(String(p.installmentSale));
            }
          }
        }
      } else if (fm) {
        const parts = fm.split(',').map(s => s.trim()).filter(Boolean);
        const share = (Number(p.amountPaid || 0) || 0) / (parts.length || 1);
        for (const m of parts) {
          if (m.toLowerCase() === targetMonthLower && share > 0) {
            currentMonthCollectedAmount += share;
            if (p.installmentSale) paidSaleIdsInCurrentMonth.add(String(p.installmentSale));
          }
        }
      }
    }
    currentMonthCollectedAmount = Math.round(currentMonthCollectedAmount);

    // 3. Normalize Sales Data & Calculate Current Month Installment Amount (Active Accounts Only)
    let allTimeInstallmentCapital = 0;
    let allTimeRemainingBalance = 0;
    let currentMonthInstallmentAmount = 0;
    let currentMonthKistsCount = 0;
    let currentMonthBookedCapital = 0;
    let activeAccountsCount = 0;

    const allSales = (rawSales || []).map(sale => {
      const cust = sale.customer || {};
      const name = cust.name || sale.customerName || 'Customer';
      const customerId = cust.customerId || sale.customerId || (cust._id ? String(cust._id).slice(-6).toUpperCase() : 'N/A');
      const phone = cust.phone || sale.phone || '';

      const total = Number(sale.totalAmount || 0);
      const advance = Number(sale.totalAdvance || sale.advancePayment || 0);
      const installmentOnlyCapital = Math.max(0, total - advance);
      const remaining = Number(sale.remainingBalance || 0);
      const isActive = sale.status !== 'completed' && remaining > 0;

      allTimeInstallmentCapital += installmentOnlyCapital;
      if (isActive) {
        allTimeRemainingBalance += remaining;
        activeAccountsCount++;
      }

      // Check if sale was booked in current month
      const sDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
      if (sDate.getFullYear() === currentYear && sDate.getMonth() === currentMonth) {
        currentMonthBookedCapital += installmentOnlyCapital;
      }

      // Calculate scheduled installment falling in current month (only for active accounts)
      if (isActive) {
        const monthlyAmt = Number(sale.monthlyAmount) || 1;
        const totMonths = Number(sale.totalMonths) || Math.max(1, Math.ceil(installmentOnlyCapital / monthlyAmt));
        const dueDay = Number(sale.dueDateDay) || 5;
        let allocated = 0;
        for (let i = 0; i < totMonths; i++) {
          const dueDate = new Date(sDate.getFullYear(), sDate.getMonth() + 1 + i, dueDay);
          let target = monthlyAmt;
          if (allocated + target > installmentOnlyCapital) {
            target = Math.max(0, installmentOnlyCapital - allocated);
          }
          allocated += target;
          if (target <= 0) break;

          if (dueDate.getFullYear() === currentYear && dueDate.getMonth() === currentMonth) {
            currentMonthInstallmentAmount += target;
            currentMonthKistsCount += 1;
          }
        }
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

    const currentMonthOutstandingAmount = Math.max(0, currentMonthInstallmentAmount - currentMonthCollectedAmount);
    const currentMonthPaidKistsCount = paidSaleIdsInCurrentMonth.size;
    const currentMonthPendingKistsCount = Math.max(0, currentMonthKistsCount - currentMonthPaidKistsCount);

    // Map top-level card stats to Current Month (auto-switches every month, e.g. Nov 2026 -> Dec 2026 on 1st Dec)
    const totalSalesCapital = currentMonthInstallmentAmount;
    const activeMarketOutstanding = currentMonthOutstandingAmount;
    const collectedThisMonth = currentMonthCollectedAmount;

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
        currentMonthInstallmentAmount,
        currentMonthCollectedAmount,
        currentMonthOutstandingAmount,
        currentMonthKistsCount,
        currentMonthPaidKistsCount,
        currentMonthPendingKistsCount,
        currentMonthBookedCapital,
        currentMonthLabel,
        activeMarketOutstanding,
        collectedThisMonth,
        activeAccountsCount,
        allTimeInstallmentCapital,
        allTimeRemainingBalance,
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
