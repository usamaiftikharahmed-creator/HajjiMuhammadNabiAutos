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

  // 2. Extract and assign payments
  const allPayments = customPayments || sale.payments || [];
  const unassignedPayments = [];

  allPayments.forEach((p) => {
    const rawMonth = p.forMonth || '';
    if (rawMonth.toLowerCase().includes('advance') || p.notes?.toLowerCase().includes('advance')) {
      return; // Skip advance payment at booking
    }

    const parsed = parseMonthYear(rawMonth);
    let matchedMonth = null;

    if (parsed) {
      matchedMonth = schedule.find(
        (m) => m.dueDate.getMonth() === parsed.month && m.dueDate.getFullYear() === parsed.year
      );
    }

    const paidVal = Number(p.amountPaid || p.amount || 0);
    if (matchedMonth && paidVal > 0) {
      matchedMonth.paidAmount += paidVal;
      matchedMonth.payments.push(p);
    } else if (paidVal > 0) {
      unassignedPayments.push(p);
    }
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
