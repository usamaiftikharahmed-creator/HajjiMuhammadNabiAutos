import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Calendar, DollarSign, Users, CheckCircle2, AlertTriangle,
  Search, ChevronDown, ChevronUp, RefreshCw, Eye, Filter
} from 'lucide-react';
import API from '../api/axios';
import { calculateInstallmentPlan } from '../utils/installmentSchedule';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Helper to format YYYY-MM from a Date
const toYearMonthStr = (d) => {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${yr}-${mo}`;
};

export default function MonthlyCapitalBreakdownModal({ onClose, onSelectSale, totalSalesCapital }) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const currentMonthKey = `${SHORT_MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  // Default range: Last 5 Months + Current Month (e.g. Jun 2026 to Nov 2026)
  const defaultFromYM = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return toYearMonthStr(d);
  }, []);
  const defaultToYM = useMemo(() => {
    return toYearMonthStr(now);
  }, []);

  const [rangePreset, setRangePreset] = useState('LAST_5'); // 'LAST_5' | 'CURRENT' | 'LAST_12' | 'ALL' | 'CUSTOM'
  const [fromMonth, setFromMonth] = useState(defaultFromYM); // YYYY-MM
  const [toMonth, setToMonth] = useState(defaultToYM);     // YYYY-MM
  const [monthSearch, setMonthSearch] = useState('');
  const [expandedMonthKey, setExpandedMonthKey] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState('ALL'); // ALL | PENDING | CLEARED

  useEffect(() => {
    let isMounted = true;
    const fetchAllSales = async () => {
      setLoading(true);
      try {
        // Real endpoint in installmentRoutes.js is /installments/sales
        const res = await API.get('/installments/sales?refresh=1');
        if (isMounted && res.data?.success && Array.isArray(res.data.sales)) {
          setSales(res.data.sales);
        }
      } catch (err) {
        console.error('Error fetching sales for monthly breakdown:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchAllSales();
    return () => {
      isMounted = false;
    };
  }, []);

  // Build month-by-month aggregation across all sales
  const { monthlyData, grandTotals } = useMemo(() => {
    const monthMap = new Map();
    let totalInstallmentAmount = 0;
    let totalCollectedInstallments = 0;
    let totalPendingInstallments = 0;

    const ensureBucket = (yearVal, monthVal) => {
      const monthKey = `${SHORT_MONTHS[monthVal]} ${yearVal}`;
      const fullMonthName = `${LONG_MONTHS[monthVal]} ${yearVal}`;
      const ymStr = `${yearVal}-${String(monthVal + 1).padStart(2, '0')}`;
      const sortKey = yearVal * 100 + monthVal;
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          monthKey,
          fullMonthName,
          ymStr,
          year: yearVal,
          month: monthVal,
          sortKey,
          accountsCount: 0,
          clearedCount: 0,
          shortCount: 0,
          unpaidCount: 0,
          targetAmount: 0,
          paidAmount: 0,
          remainingAmount: 0,
          bookedSalesCapital: 0,
          bookedSalesCount: 0,
          customers: []
        });
      }
      return monthMap.get(monthKey);
    };

    (sales || []).forEach((sale) => {
      const cust = sale.customer && typeof sale.customer === 'object' ? sale.customer : {};
      const customerName = cust.name || sale.customerName || 'Customer';
      const customerId = cust.customerId || sale.customerId || 'N/A';
      const customerPhone = cust.phone || sale.customerPhone || '';
      const regNumber = sale.registrationNumber || sale.itemRegNumber || '';

      // Track new installment capital booked in sale creation month (excluding advance)
      const sDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
      const sTotal = Number(sale.totalAmount || 0);
      const sAdvance = Number(sale.totalAdvance || sale.advancePayment || 0);
      const sFinanced = Math.max(0, sTotal - sAdvance);
      if (sFinanced > 0 && !isNaN(sDate.getTime())) {
        const bookedBucket = ensureBucket(sDate.getFullYear(), sDate.getMonth());
        bookedBucket.bookedSalesCapital += sFinanced;
        bookedBucket.bookedSalesCount += 1;
      }

      const plan = calculateInstallmentPlan(sale);
      if (!plan || !Array.isArray(plan.schedule)) return;

      plan.schedule.forEach((m) => {
        const target = Number(m.targetAmount || 0);
        const paid = Number(m.paidAmount || 0);
        const remaining = Number(m.remainingAmount || 0);
        if (target <= 0) return;

        const yearVal = m.dueDate.getFullYear();
        const monthVal = m.dueDate.getMonth();

        totalInstallmentAmount += target;
        totalCollectedInstallments += paid;
        totalPendingInstallments += remaining;

        const bucket = ensureBucket(yearVal, monthVal);
        bucket.accountsCount += 1;
        bucket.targetAmount += target;
        bucket.paidAmount += paid;
        bucket.remainingAmount += remaining;

        if (m.status === 'CLEARED') bucket.clearedCount += 1;
        else if (m.status === 'SHORT') bucket.shortCount += 1;
        else bucket.unpaidCount += 1;

        bucket.customers.push({
          sale,
          saleId: sale._id,
          customerName,
          customerId,
          customerPhone,
          itemName: sale.itemName || 'Item',
          regNumber,
          dueDay: sale.dueDateDay || m.dueDate.getDate(),
          dueDateStr: m.dueDateStr,
          monthIndex: m.monthIndex,
          totalMonths: plan.totalMonths,
          targetAmount: target,
          paidAmount: paid,
          remainingAmount: remaining,
          status: m.status,
          isOverdue: m.isOverdue
        });
      });
    });

    // Sort newest-first within range so Current Month and Last 5 Months appear cleanly at the top
    const sortedMonths = Array.from(monthMap.values()).sort((a, b) => b.sortKey - a.sortKey);

    return {
      monthlyData: sortedMonths,
      grandTotals: {
        totalInstallmentAmount: totalInstallmentAmount || totalSalesCapital || 0,
        totalCollectedInstallments,
        totalPendingInstallments
      }
    };
  }, [sales, totalSalesCapital]);

  const currentMonthStats = useMemo(() => {
    return monthlyData.find((m) => m.monthKey === currentMonthKey) || null;
  }, [monthlyData, currentMonthKey]);

  // Preset Handlers
  const handleSelectPreset = (preset) => {
    setRangePreset(preset);
    if (preset === 'LAST_5') {
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      setFromMonth(toYearMonthStr(start));
      setToMonth(toYearMonthStr(now));
    } else if (preset === 'CURRENT') {
      const cur = toYearMonthStr(now);
      setFromMonth(cur);
      setToMonth(cur);
    } else if (preset === 'LAST_12') {
      const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      setFromMonth(toYearMonthStr(start));
      setToMonth(toYearMonthStr(now));
    } else if (preset === 'ALL') {
      setFromMonth('');
      setToMonth('');
    }
  };

  // Filtered months based on calendar range & search
  const filteredMonths = useMemo(() => {
    return monthlyData.filter((m) => {
      if (fromMonth && m.ymStr < fromMonth) return false;
      if (toMonth && m.ymStr > toMonth) return false;

      if (monthSearch.trim()) {
        const q = monthSearch.toLowerCase().trim();
        const matchMonth =
          m.monthKey.toLowerCase().includes(q) ||
          m.fullMonthName.toLowerCase().includes(q);
        const matchCust = m.customers.some(
          (c) =>
            c.customerName.toLowerCase().includes(q) ||
            c.customerId.toLowerCase().includes(q) ||
            c.itemName.toLowerCase().includes(q) ||
            c.regNumber.toLowerCase().includes(q)
        );
        return matchMonth || matchCust;
      }
      return true;
    });
  }, [monthlyData, fromMonth, toMonth, monthSearch]);

  // Totals for the currently selected calendar range
  const rangeTotals = useMemo(() => {
    return filteredMonths.reduce(
      (acc, m) => {
        acc.targetAmount += m.targetAmount;
        acc.paidAmount += m.paidAmount;
        acc.remainingAmount += m.remainingAmount;
        acc.bookedSalesCapital += m.bookedSalesCapital;
        acc.accountsCount += m.accountsCount;
        return acc;
      },
      { targetAmount: 0, paidAmount: 0, remainingAmount: 0, bookedSalesCapital: 0, accountsCount: 0 }
    );
  }, [filteredMonths]);

  const handleToggleMonth = (monthKey) => {
    if (expandedMonthKey === monthKey) {
      setExpandedMonthKey(null);
    } else {
      setExpandedMonthKey(monthKey);
      setCustomerSearch('');
      setCustomerStatusFilter('ALL');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full p-4 sm:p-6 max-h-[92vh] flex flex-col space-y-4 text-white shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-3.5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-2xl">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2 flex-wrap">
                <span>Month-Wise Installments Breakdown</span>
                <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/30">
                  Excluding Advance
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Current month, pichle 5 months, aur calendar range ke mutabiq har mahine ki installments amount
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
          {/* Card A: Current Month Installments */}
          <div className="bg-blue-950/30 border border-blue-500/40 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-blue-300 font-bold">
                Current Month ({currentMonthKey}) Installments
              </span>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold">
                {currentMonthStats?.accountsCount || 0} Kists
              </span>
            </div>
            <p className="text-lg sm:text-xl font-black text-blue-400 font-mono">
              Rs. {(currentMonthStats?.targetAmount || 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400 block">
              Wasool: <strong className="text-emerald-400">Rs. {(currentMonthStats?.paidAmount || 0).toLocaleString()}</strong> | Baqi: <strong className="text-amber-400">Rs. {(currentMonthStats?.remainingAmount || 0).toLocaleString()}</strong>
            </span>
          </div>

          {/* Card B: Selected Range Installments Total */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-medium">
                Selected Months ({filteredMonths.length}) Installment Total
              </span>
            </div>
            <p className="text-lg sm:text-xl font-black text-emerald-400 font-mono">
              Rs. {rangeTotals.targetAmount.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400 block">
              Wasool: <strong className="text-emerald-400">Rs. {rangeTotals.paidAmount.toLocaleString()}</strong> | Baqi: <strong className="text-amber-400">Rs. {rangeTotals.remainingAmount.toLocaleString()}</strong>
            </span>
          </div>

          {/* Card C: All-Time Total Installments Capital */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <span className="text-[11px] text-slate-400 font-medium block">
              All-Time Total Installment Capital
            </span>
            <p className="text-lg sm:text-xl font-black text-white font-mono">
              Rs. {grandTotals.totalInstallmentAmount.toLocaleString()}
            </p>
            <span className="text-[10px] text-blue-400 font-semibold block">
              Sirf Installments (Advance Shamil Nahi)
            </span>
          </div>
        </div>

        {/* CALENDAR RANGE SELECTOR & QUICK PRESETS */}
        <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2.5 shrink-0">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            {/* Calendar Month Range Inputs */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                <Calendar className="w-4 h-4" /> Select Month Range:
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="month"
                  value={fromMonth}
                  onChange={(e) => {
                    setRangePreset('CUSTOM');
                    setFromMonth(e.target.value);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500 cursor-pointer"
                />
                <span className="text-xs text-slate-400 font-bold">to</span>
                <input
                  type="month"
                  value={toMonth}
                  onChange={(e) => {
                    setRangePreset('CUSTOM');
                    setToMonth(e.target.value);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Quick Range Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              <button
                type="button"
                onClick={() => handleSelectPreset('LAST_5')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                  rangePreset === 'LAST_5'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                Current + Last 5 Months
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('CURRENT')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                  rangePreset === 'CURRENT'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                Only {currentMonthKey}
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('LAST_12')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                  rangePreset === 'LAST_12'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                Last 12 Months
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                  rangePreset === 'ALL'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                All Months ({monthlyData.length})
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={monthSearch}
              onChange={(e) => setMonthSearch(e.target.value)}
              placeholder="Search month (e.g. Nov 2026, Oct 2026) or customer name / ID / bike..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Month-by-Month List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-semibold">
                Loading month-wise installment amounts...
              </p>
            </div>
          ) : filteredMonths.length === 0 ? (
            <div className="py-12 text-center bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
              <p className="text-sm text-slate-400 font-medium">Is selected calendar range me koi month nahi mila.</p>
              <button
                type="button"
                onClick={() => handleSelectPreset('ALL')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white cursor-pointer"
              >
                Show All Months
              </button>
            </div>
          ) : (
            filteredMonths.map((m) => {
              const isCurrent = m.monthKey === currentMonthKey;
              const isExpanded = expandedMonthKey === m.monthKey;
              const progressPct = m.targetAmount > 0 ? Math.min(100, Math.round((m.paidAmount / m.targetAmount) * 100)) : 0;

              const subCustomers = m.customers.filter((c) => {
                if (customerStatusFilter === 'PENDING' && c.status === 'CLEARED') return false;
                if (customerStatusFilter === 'CLEARED' && c.status !== 'CLEARED') return false;
                if (customerSearch.trim()) {
                  const q = customerSearch.toLowerCase().trim();
                  return (
                    c.customerName.toLowerCase().includes(q) ||
                    c.customerId.toLowerCase().includes(q) ||
                    c.itemName.toLowerCase().includes(q) ||
                    c.regNumber.toLowerCase().includes(q)
                  );
                }
                return true;
              });

              return (
                <div
                  key={m.monthKey}
                  className={`rounded-2xl border transition overflow-hidden ${
                    isCurrent
                      ? 'bg-blue-950/20 border-blue-500/50 shadow-lg'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Month Row Header */}
                  <div
                    onClick={() => handleToggleMonth(m.monthKey)}
                    className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-mono font-bold text-xs shrink-0 border ${
                          isCurrent
                            ? 'bg-blue-600 text-white border-blue-400'
                            : 'bg-slate-900 text-slate-200 border-slate-800'
                        }`}
                      >
                        <span>{m.monthKey.split(' ')[0]}</span>
                        <span className="text-[9px] opacity-80">{m.year}</span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm sm:text-base font-extrabold text-white">
                            {m.fullMonthName}
                          </h4>
                          {isCurrent && (
                            <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                              Current Month
                            </span>
                          )}
                          <span className="text-[11px] bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded-lg font-mono">
                            {m.accountsCount} Customer Kists
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 flex-wrap">
                          <span className="text-emerald-400 font-semibold">
                            ✓ {m.clearedCount} Cleared
                          </span>
                          {m.shortCount > 0 && (
                            <span className="text-amber-400 font-semibold">
                              ⚠️ {m.shortCount} Partial
                            </span>
                          )}
                          <span className="text-rose-400 font-semibold">
                            ● {m.unpaidCount} Unpaid
                          </span>
                          {m.bookedSalesCapital > 0 && (
                            <span className="text-purple-400 font-mono text-[10.5px]">
                              • New Sales Financed: Rs. {m.bookedSalesCapital.toLocaleString()} ({m.bookedSalesCount})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Month Financial Totals */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 border-t sm:border-t-0 border-slate-800/80 pt-2.5 sm:pt-0">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Month Installment Amount
                        </span>
                        <span className="text-sm sm:text-base font-black text-blue-400 font-mono">
                          Rs. {m.targetAmount.toLocaleString()}
                        </span>
                      </div>

                      <div className="text-center sm:text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Wasool (Paid)
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-emerald-400 font-mono">
                          Rs. {m.paidAmount.toLocaleString()}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Baqi (Pending)
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-amber-400 font-mono">
                          Rs. {m.remainingAmount.toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-slate-400">
                        <span className="text-[10px] font-mono font-bold bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg">
                          {progressPct}%
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-blue-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Customer List for this Month */}
                  {isExpanded && (
                    <div className="border-t border-slate-800 bg-slate-900/60 p-3.5 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCustomerStatusFilter('ALL')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                              customerStatusFilter === 'ALL'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-950 text-slate-400 border border-slate-800'
                            }`}
                          >
                            All ({m.customers.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomerStatusFilter('PENDING')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                              customerStatusFilter === 'PENDING'
                                ? 'bg-amber-600 text-white'
                                : 'bg-slate-950 text-slate-400 border border-slate-800'
                            }`}
                          >
                            Baqi / Pending ({m.unpaidCount + m.shortCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomerStatusFilter('CLEARED')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                              customerStatusFilter === 'CLEARED'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-950 text-slate-400 border border-slate-800'
                            }`}
                          >
                            Cleared ({m.clearedCount})
                          </button>
                        </div>

                        <div className="relative w-full sm:w-56">
                          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            placeholder={`Filter customers in ${m.monthKey}...`}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/70 text-[11px]">
                              <th className="py-2 px-3">Customer</th>
                              <th className="py-2 px-3">Item / Reg #</th>
                              <th className="py-2 px-3">Due Date</th>
                              <th className="py-2 px-3">Month Target</th>
                              <th className="py-2 px-3">Paid</th>
                              <th className="py-2 px-3">Baqi</th>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 px-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {subCustomers.map((c, idx) => (
                              <tr key={`${c.saleId}-${idx}`} className="hover:bg-slate-900/40">
                                <td className="py-2 px-3">
                                  <span className="font-bold text-white block">{c.customerName}</span>
                                  <span className="text-[10px] font-mono text-blue-400">{c.customerId}</span>
                                </td>
                                <td className="py-2 px-3">
                                  <span className="text-slate-200 font-medium block">{c.itemName}</span>
                                  {c.regNumber && (
                                    <span className="text-[10px] font-mono text-slate-400">Reg: {c.regNumber}</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono text-[11px] text-slate-300">
                                  {c.dueDateStr}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-blue-400">
                                  Rs. {c.targetAmount.toLocaleString()}
                                </td>
                                <td className="py-2 px-3 font-mono font-semibold text-emerald-400">
                                  Rs. {c.paidAmount.toLocaleString()}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-amber-400">
                                  Rs. {c.remainingAmount.toLocaleString()}
                                </td>
                                <td className="py-2 px-3">
                                  {c.status === 'CLEARED' ? (
                                    <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                                      ✓ Cleared
                                    </span>
                                  ) : c.status === 'SHORT' ? (
                                    <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                                      ⚠️ Short
                                    </span>
                                  ) : (
                                    <span className="text-[10px] bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full font-bold">
                                      Pending
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {onSelectSale && (
                                    <button
                                      type="button"
                                      onClick={() => onSelectSale(c.sale)}
                                      className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <Eye className="w-3 h-3" /> Khata
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-800 shrink-0 text-xs">
          <span className="text-slate-400">
            Showing <strong>{filteredMonths.length}</strong> months | Range Total: <strong className="text-emerald-400 font-mono">Rs. {rangeTotals.targetAmount.toLocaleString()}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-5 py-2 rounded-xl transition cursor-pointer"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
