/**
 * Utility to extract Promise Month, Promised Total Duration,
 * and Remaining Months until Promise for any Installment Sale.
 *
 * Guarantees that invoices, receipts, and ledger statements prioritize
 * the customer's committed Final Installment Date / Promise Date
 * rather than purely mechanical division.
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
 * Parses promiseMonth string (e.g. "10 October 2028", "2028-10-10", "October 2028", "24")
 * or promiseDate to determine target { day, month, year, durationMonths, finalDateStr }.
 */
export const parsePromiseDetails = (sale) => {
  if (!sale) return null;

  const rawPromise = sale.promiseMonth || sale.promiseDate;
  const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const saleYear = saleDate.getFullYear();
  const saleMonth = saleDate.getMonth();
  const defaultDueDay = Number(sale.dueDateDay) || (sale.createdAt && !isNaN(new Date(sale.createdAt).getTime()) ? new Date(sale.createdAt).getDate() : 10);

  const totalAmount = Number(sale.totalAmount || sale.grandTotal || 0);
  const advancePayment = Number(sale.advancePayment || sale.advanceAmount || 0);
  const monthlyAmount = Number(sale.monthlyAmount || sale.monthlyInstallment || 0);
  const mathMonths = monthlyAmount > 0 
    ? Math.ceil(Math.max(0, totalAmount - advancePayment) / monthlyAmount)
    : (Number(sale.totalMonths) || 1);

  if (!rawPromise) {
    const fallbackMonths = Number(sale.promisedMonths) || Number(sale.totalMonths) || mathMonths;
    const targetDate = new Date(saleYear, saleMonth + fallbackMonths, defaultDueDay);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    const targetDay = targetDate.getDate();
    const finalDateStr = `${targetDay} ${MONTH_NAMES[targetMonth]} ${targetYear}`;
    const formattedPromiseMonth = `${MONTH_NAMES[targetMonth]} ${targetYear}`;

    return {
      hasExplicitPromise: false,
      promisedTotalMonths: fallbackMonths,
      targetYear,
      targetMonth,
      targetDay,
      finalDateStr,
      formattedPromiseMonth
    };
  }

  let targetYear = null;
  let targetMonth = null;
  let targetDay = null;
  let explicitDuration = null;

  const pStr = String(rawPromise).trim();

  // 1. Check if YYYY-MM-DD or YYYY-M-D, e.g. "2028-10-15"
  const ymdMatch = pStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    targetYear = parseInt(ymdMatch[1], 10);
    targetMonth = parseInt(ymdMatch[2], 10) - 1;
    targetDay = parseInt(ymdMatch[3], 10);
  }

  // 2. Check if DD-MM-YYYY or DD/MM/YYYY, e.g. "15-10-2028" or "15/10/2028"
  if (targetYear === null) {
    const dmyMatch = pStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
      targetDay = parseInt(dmyMatch[1], 10);
      targetMonth = parseInt(dmyMatch[2], 10) - 1;
      targetYear = parseInt(dmyMatch[3], 10);
    }
  }

  // 3. Check if "DD Month YYYY", e.g. "15 October 2028" or "15 Oct 2028"
  if (targetYear === null) {
    const dayMonthYearMatch = pStr.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{2,4})$/);
    if (dayMonthYearMatch) {
      targetDay = parseInt(dayMonthYearMatch[1], 10);
      const mStr = dayMonthYearMatch[2].toLowerCase();
      for (let i = 0; i < 12; i++) {
        if (mStr.includes(SHORT_MONTHS[i].toLowerCase()) || mStr.includes(MONTH_NAMES[i].toLowerCase())) {
          targetMonth = i;
          break;
        }
      }
      const y = parseInt(dayMonthYearMatch[3], 10);
      targetYear = y < 100 ? 2000 + y : y;
    }
  }

  // 3b. Check if "Month DD, YYYY" or "Month DD YYYY", e.g. "October 15, 2028" or "October 15 2028"
  if (targetYear === null) {
    const monthDayYearMatch = pStr.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{2,4})$/);
    if (monthDayYearMatch) {
      targetDay = parseInt(monthDayYearMatch[2], 10);
      const mStr = monthDayYearMatch[1].toLowerCase();
      for (let i = 0; i < 12; i++) {
        if (mStr.includes(SHORT_MONTHS[i].toLowerCase()) || mStr.includes(MONTH_NAMES[i].toLowerCase())) {
          targetMonth = i;
          break;
        }
      }
      const y = parseInt(monthDayYearMatch[3], 10);
      targetYear = y < 100 ? 2000 + y : y;
    }
  }

  // 3c. Check if "Month YYYY DD", e.g. "June 2027 10" or "Jun 2027, 10"
  if (targetYear === null) {
    const monthYearDayMatch = pStr.match(/^([a-zA-Z]+)\s+(\d{2,4}),?\s+(\d{1,2})$/);
    if (monthYearDayMatch) {
      targetDay = parseInt(monthYearDayMatch[3], 10);
      const mStr = monthYearDayMatch[1].toLowerCase();
      for (let i = 0; i < 12; i++) {
        if (mStr.includes(SHORT_MONTHS[i].toLowerCase()) || mStr.includes(MONTH_NAMES[i].toLowerCase())) {
          targetMonth = i;
          break;
        }
      }
      const y = parseInt(monthYearDayMatch[2], 10);
      targetYear = y < 100 ? 2000 + y : y;
    }
  }

  // 4. Check if digits only / duration, e.g. "24", "24 months", "24 Months Plan"
  if (targetYear === null) {
    const digitsOnlyMatch = pStr.match(/^(\d{1,3})\s*(?:months?|mahiny?|mah)?(?:\s+plan)?$/i);
    if (digitsOnlyMatch) {
      explicitDuration = parseInt(digitsOnlyMatch[1], 10);
      const d = new Date(saleYear, saleMonth + explicitDuration, defaultDueDay);
      targetYear = d.getFullYear();
      targetMonth = d.getMonth();
      targetDay = d.getDate();
    }
  }

  // 5. Check if YYYY-MM format, e.g. "2028-10"
  if (targetYear === null) {
    const ymMatch = pStr.match(/^(\d{4})-(\d{1,2})$/);
    if (ymMatch) {
      targetYear = parseInt(ymMatch[1], 10);
      targetMonth = parseInt(ymMatch[2], 10) - 1;
      targetDay = defaultDueDay;
    }
  }

  // 6. Check if Month Name + Year, e.g. "October 2028" or "Oct 2028"
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
    if (targetMonth !== null && targetYear !== null) {
      targetDay = defaultDueDay;
    }
  }

  // 7. If promise was a Date or ISO string
  if (targetYear === null && !isNaN(new Date(pStr).getTime())) {
    const d = new Date(pStr);
    targetYear = d.getFullYear();
    targetMonth = d.getMonth();
    targetDay = d.getDate();
  }

  if (targetYear !== null && targetMonth !== null) {
    targetDay = targetDay || defaultDueDay;
    const diff = (targetYear - saleYear) * 12 + (targetMonth - saleMonth);
    const promisedTotalMonths = explicitDuration || Number(sale.promisedMonths) || Math.max(1, diff);
    const formattedPromiseMonth = `${MONTH_NAMES[targetMonth]} ${targetYear}`;
    const finalDateStr = `${targetDay} ${MONTH_NAMES[targetMonth]} ${targetYear}`;

    return {
      hasExplicitPromise: true,
      promisedTotalMonths,
      targetYear,
      targetMonth,
      targetDay,
      finalDateStr,
      formattedPromiseMonth
    };
  }

  const fallbackMonths = Number(sale.promisedMonths) || Number(sale.totalMonths) || mathMonths;
  const targetDate = new Date(saleYear, saleMonth + fallbackMonths, defaultDueDay);
  return {
    hasExplicitPromise: false,
    promisedTotalMonths: fallbackMonths,
    targetYear: targetDate.getFullYear(),
    targetMonth: targetDate.getMonth(),
    targetDay: targetDate.getDate(),
    finalDateStr: `${targetDate.getDate()} ${MONTH_NAMES[targetDate.getMonth()]} ${targetDate.getFullYear()}`,
    formattedPromiseMonth: pStr
  };
};

/**
 * Returns complete promise and final installment info for any installment sale:
 * - totalMonths: Total commitment duration from Date of Purchase to Final Date
 * - remainingMonths: Calendar months remaining from Current/Receipt Date to Final Date
 * - finalDateStr: Full date string with exact day (e.g. "10 October 2028")
 * - promiseMonthStr: Formatted Target Promise Month (e.g. "October 2028")
 * - hasPromise: boolean
 * - isCleared: boolean
 * - isExpired: boolean
 * - isLastMonth: boolean
 */
export const getPromiseMonthsInfo = (sale, asOfDate = new Date()) => {
  if (!sale) {
    return { 
      totalMonths: 0, 
      remainingMonths: 0, 
      finalDateStr: '',
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
  let targetDay = details.targetDay || Number(sale.dueDateDay) || (sale.createdAt && !isNaN(new Date(sale.createdAt).getTime()) ? new Date(sale.createdAt).getDate() : 10);

  if (targetYear === null || targetMonth === null) {
    const duration = details.promisedTotalMonths || Number(sale.totalMonths) || 1;
    const targetDate = new Date(saleYear, saleMonth + duration, targetDay);
    targetYear = targetDate.getFullYear();
    targetMonth = targetDate.getMonth();
    targetDay = targetDate.getDate();
  }

  // Display strings
  const promiseMonthStr = details.formattedPromiseMonth || `${MONTH_NAMES[targetMonth]} ${targetYear}`;
  const finalDateStr = details.finalDateStr || `${targetDay} ${MONTH_NAMES[targetMonth]} ${targetYear}`;

  // 3. Total Commitment Duration
  const diffFromPurchase = (targetYear - saleYear) * 12 + (targetMonth - saleMonth);
  const totalMonths = details.promisedTotalMonths || Math.max(1, diffFromPurchase);

  // If account is cleared in full (remainingBalance <= 0), exactly 0 months remaining
  if (isCleared) {
    return {
      totalMonths,
      remainingMonths: 0,
      finalDateStr,
      promiseMonthStr,
      hasPromise: true,
      isCleared: true,
      isExpired: false,
      isLastMonth: false,
      monthsUntilPromise: 0
    };
  }

  // 4. Remaining Months: Strictly counted from Reference Date (today / receipt date) to Target Final Date!
  const refDate = asOfDate instanceof Date && !isNaN(asOfDate.getTime()) ? asOfDate : new Date();
  const currentYear = refDate.getFullYear();
  const currentMonth = refDate.getMonth();

  const monthsUntilPromise = (targetYear - currentYear) * 12 + (targetMonth - currentMonth);
  const isExpired = monthsUntilPromise < 0;
  const isLastMonth = monthsUntilPromise === 0;

  const remainingMonths = monthsUntilPromise > 0 
    ? monthsUntilPromise 
    : (isLastMonth ? 1 : 0);

  return {
    totalMonths,
    remainingMonths,
    finalDateStr,
    promiseMonthStr,
    hasPromise: true,
    isCleared: false,
    isExpired,
    isLastMonth,
    monthsUntilPromise
  };
};

/**
 * Generates official Urdu note text prioritizing the selected full final date:
 * "نوٹ: آپ کی آخری قسط کی تاریخ [تاریخ] کو ہے۔"
 */
export const formatPromiseUrduNote = (sale, asOfDate = new Date()) => {
  const info = getPromiseMonthsInfo(sale, asOfDate);
  if (info.isCleared) {
    return 'نوٹ: آپ کی تمام اقساط مکمل ہو چکی ہیں۔';
  }

  const finalDate = info.finalDateStr || info.promiseMonthStr;

  // We wrap the date with Unicode Left-to-Right Marks (\u200E) and Left-to-Right Isolate (\u2066...\u2069).
  // In RTL contexts (Urdu text on screen, print invoices, and WhatsApp messages),
  // this prevents the bidirectional algorithm from inverting numbers and English month names,
  // guaranteeing that "10 June 2027" displays strictly in natural "10 June 2027" order
  // instead of flipping to "June 2027 10".
  const ltrDate = `\u200E\u2066${finalDate}\u2069\u200E`;

  if (info.isExpired) {
    return `نوٹ: آپ کی آخری قسط کی تاریخ ${ltrDate} کو گزر چکی ہے، مہربانی کر کے بقیہ رقم فوری ادا کریں۔`;
  }

  return `نوٹ: آپ کی آخری قسط کی تاریخ ${ltrDate} کو ہے۔`;
};
