// Utility to calculate exact Month-by-Month Installment Plan, Missed Kists, and Oldest Pending Months

export const parseMonthYear = (str) => {
  if (!str) return null;
  const s = String(str).toLowerCase().trim();
  if (s.includes('advance')) return null;

  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let foundMonth = -1;
  for (let i = 0; i < monthNames.length; i++) {
    if (s.includes(monthNames[i])) {
      foundMonth = i;
      break;
    }
  }

  const yearMatch = s.match(/(20\d\d|\d{2})/);
  let foundYear = new Date().getFullYear();
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    foundYear = y < 100 ? 2000 + y : y;
  }

  if (foundMonth !== -1) {
    return { month: foundMonth, year: foundYear };
  }
  return null;
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Merges any split payments that share the same batchId into a single combined payment entry
 * so the Ledger and Payment History always display 1 clean row per transaction.
 */
export const mergeBatchPayments = (payments = []) => {
  if (!Array.isArray(payments) || payments.length === 0) return [];
  const seenBatches = new Map();
  const result = [];

  for (const p of payments) {
    if (!p.batchId) {
      result.push(p);
      continue;
    }

    if (!seenBatches.has(p.batchId)) {
      const clone = { ...p };
      seenBatches.set(p.batchId, clone);
      result.push(clone);
    } else {
      const primary = seenBatches.get(p.batchId);
      // If multiple DB rows exist for the same batchId, combine them into the single row
      const breakdown = Array.isArray(primary.batchBreakdown) && primary.batchBreakdown.length > 1
        ? primary.batchBreakdown
        : [
            { forMonth: primary.forMonth, amountPaid: Number(primary.amountPaid || 0) },
            { forMonth: p.forMonth, amountPaid: Number(p.amountPaid || 0) }
          ];
      const total = primary.batchTotal || breakdown.reduce((s, b) => s + (Number(b.amountPaid) || 0), 0);
      primary.amountPaid = total;
      primary.batchTotal = total;
      primary.batchBreakdown = breakdown;
      primary.forMonth = breakdown.map(b => b.forMonth).join(', ');
    }
  }

  return result;
};

export const calculateInstallmentPlan = (sale, customPayments = null) => {
  if (!sale) return null;

  const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const dueDay = Number(sale.dueDateDay) || 5;
  const monthlyAmount = Number(sale.monthlyAmount) || 1;
  const totalAmount = Number(sale.totalAmount) || 0;
  const advancePayment = Number(sale.advancePayment) || 0;
  const totalFinanced = Math.max(0, totalAmount - advancePayment);
  const totalMonths = Number(sale.totalMonths) || Math.max(1, Math.ceil(totalFinanced / monthlyAmount));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Build scheduled monthly installment buckets
  const schedule = [];
  let allocatedTarget = 0;

  for (let i = 0; i < totalMonths; i++) {
    const dueDate = new Date(saleDate.getFullYear(), saleDate.getMonth() + 1 + i, dueDay);
    dueDate.setHours(0, 0, 0, 0);

    const mIdx = dueDate.getMonth();
    const yVal = dueDate.getFullYear();
    const monthKey = `${SHORT_MONTHS[mIdx]} ${yVal}`;
    const fullMonthName = `${LONG_MONTHS[mIdx]} ${yVal}`;
    const dueDateStr = `${dueDate.getDate()} ${SHORT_MONTHS[mIdx]} ${yVal}`;

    // Target amount for this installment
    let target = monthlyAmount;
    if (allocatedTarget + target > totalFinanced) {
      target = Math.max(0, totalFinanced - allocatedTarget);
    }
    allocatedTarget += target;
    if (target <= 0) break;

    schedule.push({
      monthIndex: i + 1,
      monthKey,
      fullMonthName,
      dueDate,
      dueDateStr,
      targetAmount: target,
      paidAmount: 0,
      remainingAmount: target,
      status: 'UNPAID', // 'CLEARED' | 'SHORT' | 'UNPAID'
      isOverdue: false,
      payments: []
    });
  }

  // 2. Extract and assign payments (supporting both single-month and multi-month batchBreakdown entries)
  const rawPayments = customPayments || sale.payments || [];
  const allPayments = mergeBatchPayments(rawPayments);
  const unassignedPayments = [];

  const assignSingleMonthItem = (rawMonthStr, paidVal, sourcePayment) => {
    if (paidVal <= 0) return;
    const parsed = parseMonthYear(rawMonthStr);
    let matchedMonth = null;
    if (parsed) {
      matchedMonth = schedule.find(
        (m) => m.dueDate.getMonth() === parsed.month && m.dueDate.getFullYear() === parsed.year
      );
    }
    if (matchedMonth) {
      matchedMonth.paidAmount += paidVal;
      matchedMonth.payments.push({ ...sourcePayment, forMonth: rawMonthStr, amountPaid: paidVal });
    } else {
      unassignedPayments.push({ ...sourcePayment, forMonth: rawMonthStr, amountPaid: paidVal });
    }
  };

  allPayments.forEach((p) => {
    const rawMonth = p.forMonth || '';
    if (rawMonth.toLowerCase().includes('advance') || p.notes?.toLowerCase().includes('advance')) {
      return; // Skip advance payment at booking
    }

    if (Array.isArray(p.batchBreakdown) && p.batchBreakdown.length > 0) {
      p.batchBreakdown.forEach((b) => {
        assignSingleMonthItem(b.forMonth, Number(b.amountPaid || 0), p);
      });
      return;
    }

    const paidVal = Number(p.amountPaid || p.amount || 0);
    if (rawMonth.includes(',')) {
      const parts = rawMonth.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        const share = paidVal / parts.length;
        parts.forEach((part) => assignSingleMonthItem(part, share, p));
        return;
      }
    }
    assignSingleMonthItem(rawMonth, paidVal, p);
  });

  // 3. Allocate any unassigned / FIFO payments to the earliest months
  unassignedPayments.forEach((p) => {
    let remainingPaid = Number(p.amountPaid || p.amount || 0);
    for (let m of schedule) {
      if (remainingPaid <= 0) break;
      const needed = Math.max(0, m.targetAmount - m.paidAmount);
      if (needed > 0) {
        const alloc = Math.min(needed, remainingPaid);
        m.paidAmount += alloc;
        m.payments.push({ ...p, amountAllocated: alloc });
        remainingPaid -= alloc;
      }
    }
  });

  // 4. Determine status & overdue flags
  let missedInstallmentsCount = 0;
  let totalMissedAmount = 0;
  const missedMonths = [];
  const clearedMonths = [];
  const shortMonths = [];
  let oldestPendingMonth = null;

  schedule.forEach((m) => {
    m.remainingAmount = Math.max(0, m.targetAmount - m.paidAmount);

    if (m.remainingAmount === 0) {
      m.status = 'CLEARED';
      clearedMonths.push(m);
    } else if (m.paidAmount > 0) {
      m.status = 'SHORT';
      shortMonths.push(m);
    } else {
      m.status = 'UNPAID';
    }

    // Overdue condition: due date is on or before today and not fully cleared
    if (m.dueDate <= today && m.status !== 'CLEARED') {
      m.isOverdue = true;
      missedInstallmentsCount++;
      totalMissedAmount += m.remainingAmount;
      missedMonths.push(m);
    }

    // The very first uncleared month in sequence
    if (!oldestPendingMonth && m.status !== 'CLEARED') {
      oldestPendingMonth = m;
    }
  });

  return {
    schedule,
    missedInstallmentsCount,
    totalMissedAmount,
    missedMonths,
    clearedMonths,
    shortMonths,
    oldestPendingMonth: oldestPendingMonth || schedule[0] || null,
    totalMonths: schedule.length,
    totalFinanced,
    remainingBalance: sale.remainingBalance ?? Math.max(0, totalFinanced - schedule.reduce((sum, s) => sum + s.paidAmount, 0))
  };
};

/**
 * Automatically splits a single payment amount across sequential installment months
 * starting from `startMonthKey` (e.g., Rs. 34,000 -> Sep: 15,000, Oct: 15,000, Nov: 4,000)
 */
export const buildMultiMonthAllocation = (plan, startMonthKey, rawTotalAmount, fallbackMonthlyAmount = 0) => {
  const totalAmount = Number(rawTotalAmount) || 0;
  if (totalAmount <= 0) return [];

  const schedule = plan?.schedule || [];
  const monthlyKist = Number(fallbackMonthlyAmount) || (schedule[0]?.targetAmount) || totalAmount;

  if (schedule.length === 0) {
    return [{
      forMonth: startMonthKey || new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      amountPaid: totalAmount,
      targetAmount: monthlyKist,
      remainingBefore: monthlyKist,
      remainingAfter: Math.max(0, monthlyKist - totalAmount),
      isCleared: totalAmount >= monthlyKist
    }];
  }

  let startIdx = schedule.findIndex(m => m.monthKey === startMonthKey);
  if (startIdx === -1) startIdx = 0;

  // Order months starting from selected month, then any earlier uncleared months
  const orderedMonths = [
    ...schedule.slice(startIdx),
    ...schedule.slice(0, startIdx)
  ];

  const allocations = [];
  let leftover = totalAmount;

  for (let i = 0; i < orderedMonths.length; i++) {
    if (leftover <= 0) break;
    const m = orderedMonths[i];
    const cap = m.remainingAmount > 0 ? m.remainingAmount : (i === 0 ? m.targetAmount : 0);
    if (cap <= 0) continue;

    const alloc = Math.min(leftover, cap);
    const remAfter = Math.max(0, m.remainingAmount - alloc);
    allocations.push({
      forMonth: m.monthKey,
      amountPaid: alloc,
      targetAmount: m.targetAmount,
      remainingBefore: m.remainingAmount,
      remainingAfter: remAfter,
      isCleared: remAfter === 0
    });
    leftover -= alloc;
  }

  // If there is still leftover beyond the scheduled months, allocate to subsequent months
  if (leftover > 0) {
    const lastScheduled = schedule[schedule.length - 1];
    let baseDate = lastScheduled?.dueDate ? new Date(lastScheduled.dueDate) : new Date();
    let extraStep = 1;
    while (leftover > 0 && extraStep <= 36) {
      const nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + extraStep, 1);
      const nextKey = `${SHORT_MONTHS[nextDate.getMonth()]} ${nextDate.getFullYear()}`;
      const alloc = Math.min(leftover, monthlyKist);
      const remAfter = Math.max(0, monthlyKist - alloc);
      allocations.push({
        forMonth: nextKey,
        amountPaid: alloc,
        targetAmount: monthlyKist,
        remainingBefore: monthlyKist,
        remainingAfter: remAfter,
        isCleared: remAfter === 0
      });
      leftover -= alloc;
      extraStep++;
    }
  }

  return allocations;
};
