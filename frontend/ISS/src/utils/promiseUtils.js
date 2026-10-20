/**
 * Utility to extract Promise Month, Promised Total Duration,
 * and Remaining Months until Promise for any Installment Sale.
 *
 * Guarantees that invoices, receipts, and ledger statements prioritize
 * the customer's committed Promise Month / Duration (e.g. 24 Months)
 * rather than purely mechanical division (e.g. 33 Months).
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Parses promiseMonth string (e.g. "October 2028", "2028-10", "Oct 2028", "24", "24 Months")
 * or promiseDate to determine target { month, year, durationMonths }.
 */
export const parsePromiseDetails = (sale) => {
  if (!sale) return null;

  const rawPromise = sale.promiseMonth || sale.promiseDate;
  const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const saleYear = saleDate.getFullYear();
  const saleMonth = saleDate.getMonth();

  const totalAmount = Number(sale.totalAmount || sale.grandTotal || 0);
  const advancePayment = Number(sale.advancePayment || sale.advanceAmount || 0);
  const monthlyAmount = Number(sale.monthlyAmount || sale.monthlyInstallment || 0);
  const mathMonths = monthlyAmount > 0 
    ? Math.ceil(Math.max(0, totalAmount - advancePayment) / monthlyAmount)
    : (Number(sale.totalMonths) || 1);

  if (!rawPromise) {
    return {
      hasExplicitPromise: false,
      promisedTotalMonths: Number(sale.promisedMonths) || Number(sale.totalMonths) || mathMonths,
      targetYear: null,
      targetMonth: null,
      formattedPromiseMonth: ''
    };
  }

  let targetYear = null;
  let targetMonth = null;
  let explicitDuration = null;

  const pStr = String(rawPromise).trim();

  // 1. Check if string has digits followed by months/plan, e.g. "24", "24 months", "24 Months Plan"
  const digitsOnlyMatch = pStr.match(/^(\d{1,3})\s*(?:months?|mahiny?|mah)?(?:\s+plan)?$/i);
  if (digitsOnlyMatch) {
    explicitDuration = parseInt(digitsOnlyMatch[1], 10);
    const d = new Date(saleYear, saleMonth + explicitDuration, 1);
    targetYear = d.getFullYear();
    targetMonth = d.getMonth();
  }

  // 2. Check if YYYY-MM format, e.g. "2028-10"
  if (targetYear === null) {
    const ymMatch = pStr.match(/^(\d{4})-(\d{1,2})$/);
    if (ymMatch) {
      targetYear = parseInt(ymMatch[1], 10);
      targetMonth = parseInt(ymMatch[2], 10) - 1;
    }
  }

  // 3. Check if Month Name + Year, e.g. "October 2028" or "Oct 2028"
  if (targetYear === null) {
    const lower = pStr.toLowerCase();
    for (let i = 0; i < 12; i++) {
      if (lower.includes(SHORT_MONTHS[i].toLowerCase()) || lower.includes(MONTH_NAMES[i].toLowerCase())) {
        targetMonth = i;
        break;
      }
    }
    const yearMatch = pStr.match(/(20\d\d|\d{2})/);
    if (yearMatch) {
      const y = parseInt(yearMatch[1], 10);
      targetYear = y < 100 ? 2000 + y : y;
    }
  }

  // 4. If promise was a Date or ISO string
  if (targetYear === null && !isNaN(new Date(pStr).getTime())) {
    const d = new Date(pStr);
    targetYear = d.getFullYear();
    targetMonth = d.getMonth();
  }

  if (targetYear !== null && targetMonth !== null) {
    const diff = (targetYear - saleYear) * 12 + (targetMonth - saleMonth);
    const promisedTotalMonths = explicitDuration || Number(sale.promisedMonths) || Math.max(1, diff);
    const formattedPromiseMonth = `${MONTH_NAMES[targetMonth]} ${targetYear}`;

    return {
      hasExplicitPromise: true,
      promisedTotalMonths,
      targetYear,
      targetMonth,
      formattedPromiseMonth
    };
  }

  const fallbackMonths = Number(sale.promisedMonths) || Number(sale.totalMonths) || mathMonths;
  return {
    hasExplicitPromise: false,
    promisedTotalMonths: fallbackMonths,
    targetYear: null,
    targetMonth: null,
    formattedPromiseMonth: pStr
  };
};

/**
 * Returns complete promise info for any installment sale:
 * - totalMonths: Total commitment duration from Date of Purchase to Promise Month (e.g. 24)
 * - remainingMonths: Calendar months remaining from Current/Receipt Date to Promise Month (e.g. 24, 23, 22...)
 * - promiseMonthStr: Formatted Target Promise Month (e.g. "October 2028")
 * - hasPromise: boolean
 * - isCleared: boolean
 * - isExpired: boolean
 * - isLastMonth: boolean
 *
 * ZERO CONNECTION with amounts or payment count — strictly calendar timeline!
 */
export const getPromiseMonthsInfo = (sale, asOfDate = new Date()) => {
  if (!sale) {
    return { 
      totalMonths: 0, 
      remainingMonths: 0, 
      promiseMonthStr: '', 
      hasPromise: false, 
      isCleared: true,
      isExpired: false,
      isLastMonth: false,
      monthsUntilPromise: 0
    };
  }

  const remainingBal = Number(sale.remainingBalance ?? 0);
  const isCleared = remainingBal <= 0 || sale.status === 'completed';

  const details = parsePromiseDetails(sale);

  // 1. Date of Purchase (Sale Date)
  const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const saleYear = saleDate.getFullYear();
  const saleMonth = saleDate.getMonth();

  // 2. Target Promise Date
  let targetYear = details.targetYear;
  let targetMonth = details.targetMonth;

  if (targetYear === null || targetMonth === null) {
    const duration = details.promisedTotalMonths || Number(sale.totalMonths) || 1;
    const targetDate = new Date(saleYear, saleMonth + duration, 1);
    targetYear = targetDate.getFullYear();
    targetMonth = targetDate.getMonth();
  }

  // Target Promise Month display string (e.g. "October 2028")
  const promiseMonthStr = details.formattedPromiseMonth || `${MONTH_NAMES[targetMonth]} ${targetYear}`;

  // 3. Total Commitment Duration: Strictly from Date of Purchase to Target Promise Month
  const diffFromPurchase = (targetYear - saleYear) * 12 + (targetMonth - saleMonth);
  const totalMonths = details.promisedTotalMonths || Math.max(1, diffFromPurchase);

  // If account is cleared in full (remainingBalance <= 0), exactly 0 months remaining
  if (isCleared) {
    return {
      totalMonths,
      remainingMonths: 0,
      promiseMonthStr,
      hasPromise: true,
      isCleared: true,
      isExpired: false,
      isLastMonth: false,
      monthsUntilPromise: 0
    };
  }

  // 4. Remaining Months: Strictly counted from Reference Date (today / receipt date) to Target Promise Month!
  // Amount paid has ZERO connection to remaining months!
  const refDate = asOfDate instanceof Date && !isNaN(asOfDate.getTime()) ? asOfDate : new Date();
  const currentYear = refDate.getFullYear();
  const currentMonth = refDate.getMonth();

  const monthsUntilPromise = (targetYear - currentYear) * 12 + (targetMonth - currentMonth);
  const isExpired = monthsUntilPromise < 0;
  const isLastMonth = monthsUntilPromise === 0;

  // If target month is ahead: remainingMonths = monthsUntilPromise (e.g. 24, 23, 22...)
  // If target month is current month: 1 month remaining (last month)
  // If target month has passed: 0 months remaining (expired/overdue)
  const remainingMonths = monthsUntilPromise > 0 
    ? monthsUntilPromise 
    : (isLastMonth ? 1 : 0);

  return {
    totalMonths,
    remainingMonths,
    promiseMonthStr,
    hasPromise: true,
    isCleared: false,
    isExpired,
    isLastMonth,
    monthsUntilPromise
  };
};

/**
 * Generates official Urdu note text prioritizing promise commitment and calendar timeline
 */
export const formatPromiseUrduNote = (sale, asOfDate = new Date()) => {
  const info = getPromiseMonthsInfo(sale, asOfDate);
  if (info.isCleared) {
    return 'نوٹ: آپ کی تمام اقساط مکمل ہو چکی ہیں۔';
  }
  if (info.isExpired) {
    return `نوٹ: آپ کے وعدے کی مدت (${info.promiseMonthStr}) گزر چکی ہے۔ بقیہ رقم فوری ادا کریں۔`;
  }
  if (info.isLastMonth) {
    return `نوٹ: یہ آپ کے وعدے کا آخری مہینہ ہے (${info.promiseMonthStr})۔ بقیہ رقم کلیئر کریں۔`;
  }
  const promiseTag = info.promiseMonthStr ? ` (وعدہ: ${info.promiseMonthStr})` : '';
  return `نوٹ: آپ کی اقساط ختم ہونے میں ${info.remainingMonths} ماہ باقی ہیں۔${promiseTag}`;
};


