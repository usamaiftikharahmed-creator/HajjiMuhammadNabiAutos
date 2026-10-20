import React from 'react';
import { AlertTriangle, Clock, Calendar, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function OverdueAlert({ sales }) {
  if (!Array.isArray(sales) || sales.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Analyze each active sale for due dates
  const statusSummary = sales
    .filter(s => s.status !== 'completed' && s.remainingBalance > 0)
    .map(sale => {
      const saleDate = new Date(sale.createdAt);
      
      // Calculate Next Due Date
      // If backend provides nextDueDate, use it; otherwise compute based on purchase day
      let nextDue = sale.nextDueDate ? new Date(sale.nextDueDate) : null;

      if (!nextDue) {
        const purchaseDay = saleDate.getDate();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();

        // Target due date in current month
        nextDue = new Date(currentYear, currentMonth, purchaseDay);

        // If purchase was made in the current month and today is before/on purchase day, 
        // first installment is due NEXT month
        if (
          saleDate.getFullYear() === currentYear && 
          saleDate.getMonth() === currentMonth
        ) {
          nextDue.setMonth(nextDue.getMonth() + 1);
        } else if (today > nextDue) {
          // If current month's due date has already passed without payment, keep it as overdue
        }
      }

      nextDue.setHours(0, 0, 0, 0);

      // Calculate difference in days
      const diffTime = nextDue.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return {
        item: sale.itemName,
        remaining: sale.remainingBalance,
        nextDue,
        diffDays
      };
    });

  if (statusSummary.length === 0) return null;

  // Find the most urgent sale status
  const overdueSales = statusSummary.filter(s => s.diffDays < 0);
  const dueTodaySales = statusSummary.filter(s => s.diffDays === 0);
  const upcomingSales = statusSummary.filter(s => s.diffDays > 0 && s.diffDays <= 5);

  // 1. OVERDUE STATUS (RED BANNER)
  if (overdueSales.length > 0) {
    const worstOverdue = overdueSales.reduce((min, s) => s.diffDays < min.diffDays ? s : min, overdueSales[0]);
    const daysLate = Math.abs(worstOverdue.diffDays);

    return (
      <div className="bg-red-950/70 border border-red-500/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-white print:hidden shadow-lg shadow-red-950/50">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-red-500/20 text-red-400 rounded-xl border border-red-500/30 animate-pulse">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-red-300 text-sm">PAYMENT OVERDUE ALERT</h4>
              <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                {daysLate} Days Late
              </span>
            </div>
            <p className="text-xs text-red-200/80 mt-1">
              Installment payment for <strong className="text-white">{worstOverdue.item}</strong> was due on{' '}
              <span className="underline font-semibold">{worstOverdue.nextDue.toLocaleDateString('en-PK')}</span>.
            </p>
          </div>
        </div>

        <div className="bg-red-900/40 border border-red-700/50 px-4 py-2 rounded-xl text-xs text-red-200 shrink-0">
          Remaining Balance: <strong className="text-white text-sm">Rs. {worstOverdue.remaining.toLocaleString()}</strong>
        </div>
      </div>
    );
  }

  // 2. DUE TODAY STATUS (ORANGE BANNER)
  if (dueTodaySales.length > 0) {
    const saleToday = dueTodaySales[0];
    return (
      <div className="bg-orange-950/70 border border-orange-500/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-white print:hidden shadow-lg shadow-orange-950/50">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-orange-500/20 text-orange-400 rounded-xl border border-orange-500/30">
            <Clock className="w-6 h-6 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-orange-300 text-sm">INSTALLMENT DUE TODAY</h4>
              <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                Due Today
              </span>
            </div>
            <p className="text-xs text-orange-200/80 mt-1">
              Today is the installment payment date for <strong className="text-white">{saleToday.item}</strong>.
            </p>
          </div>
        </div>

        <div className="bg-orange-900/40 border border-orange-700/50 px-4 py-2 rounded-xl text-xs text-orange-200 shrink-0">
          Balance: <strong className="text-white text-sm">Rs. {saleToday.remaining.toLocaleString()}</strong>
        </div>
      </div>
    );
  }

  // 3. UPCOMING DUE WITHIN 5 DAYS (YELLOW BANNER)
  if (upcomingSales.length > 0) {
    const upcoming = upcomingSales[0];
    return (
      <div className="bg-amber-950/50 border border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-white print:hidden">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-amber-300 text-sm">Upcoming Installment Due Soon</h4>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                Due in {upcoming.diffDays} Day(s)
              </span>
            </div>
            <p className="text-xs text-amber-200/70 mt-1">
              Next payment due on <strong className="text-white">{upcoming.nextDue.toLocaleDateString('en-PK')}</strong> for {upcoming.item}.
            </p>
          </div>
        </div>

        <div className="bg-amber-900/30 border border-amber-800/40 px-3.5 py-2 rounded-xl text-xs text-amber-200 shrink-0">
          Balance: <strong className="text-white">Rs. {upcoming.remaining.toLocaleString()}</strong>
        </div>
      </div>
    );
  }

  // 4. MORE THAN 5 DAYS LEFT -> HIDE BAR COMPLETELY
  return null;
}