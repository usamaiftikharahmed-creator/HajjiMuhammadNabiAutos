import React, { useState, useMemo } from 'react';
import { X, Printer, CheckCircle2, DollarSign, Send, RefreshCw, Calendar, AlertTriangle, Clock, Plus, Trash2, Layers } from 'lucide-react';
import PaymentReceiptModal from './PaymentReceiptModal';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { calculateInstallmentPlan, buildMultiMonthAllocation } from '../utils/installmentSchedule';
import { getPromiseMonthsInfo, formatPromiseUrduNote } from '../utils/promiseUtils';

export default function PayKistModal({ sale, selectedSale, onClose, onSuccess }) {
  const activeSale = sale || selectedSale;

  // 1. Calculate Full Installment Schedule & Outstanding Installments
  const plan = useMemo(() => {
    return calculateInstallmentPlan(activeSale);
  }, [activeSale]);

  // Default to Oldest Pending Month (Earliest Unpaid or Short Payment Month)
  const defaultMonth = useMemo(() => {
    if (plan?.oldestPendingMonth?.monthKey) {
      return plan.oldestPendingMonth.monthKey;
    }
    return new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, [plan]);

  // Default amount: remaining balance for this oldest pending month
  const defaultAmount = useMemo(() => {
    if (plan?.oldestPendingMonth && plan.oldestPendingMonth.remainingAmount > 0) {
      return plan.oldestPendingMonth.remainingAmount;
    }
    return activeSale?.monthlyAmount || '';
  }, [plan, activeSale]);

  const promiseInfo = useMemo(() => {
    return getPromiseMonthsInfo(activeSale);
  }, [activeSale]);

  const [isPayingRemainingAdvance, setIsPayingRemainingAdvance] = useState(false);
  const [forMonth, setForMonth] = useState(defaultMonth);
  const [amountPaid, setAmountPaid] = useState(defaultAmount);
  const [customRows, setCustomRows] = useState(null); // null = automatic multi-month split; array = manual rows
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [transactionId, setTransactionId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Success state for showing invoice receipt options
  const [createdPayment, setCreatedPayment] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);

  // Selected Month Object from Schedule
  const selectedMonthObj = useMemo(() => {
    if (!plan?.schedule) return null;
    return plan.schedule.find(m => m.monthKey === forMonth) || plan.oldestPendingMonth;
  }, [plan, forMonth]);

  // Automatic Multi-Month Allocation when user types a larger amount (e.g. 34,000 across Sep, Oct, Nov)
  const autoAllocations = useMemo(() => {
    if (isPayingRemainingAdvance) return [];
    return buildMultiMonthAllocation(plan, forMonth, amountPaid, activeSale?.monthlyAmount);
  }, [plan, forMonth, amountPaid, activeSale, isPayingRemainingAdvance]);

  const activeAllocations = customRows !== null ? customRows : autoAllocations;

  // Handle Month Switch: auto-populate the exact remaining amount for that month
  const handleSelectMonth = (monthKey) => {
    setForMonth(monthKey);
    setCustomRows(null);
    const targetMonth = plan?.schedule?.find(m => m.monthKey === monthKey);
    if (targetMonth) {
      setAmountPaid(targetMonth.remainingAmount || activeSale?.monthlyAmount || '');
    }
  };

  // Month Options for dropdown
  const monthOptions = useMemo(() => {
    if (plan?.schedule && plan.schedule.length > 0) {
      return plan.schedule.map(m => {
        let tag = '';
        if (m.status === 'CLEARED') tag = '✓ Cleared';
        else if (m.status === 'SHORT') tag = `⚠️ Short (Baqi: Rs. ${m.remainingAmount.toLocaleString()})`;
        else if (m.isOverdue) tag = '● Overdue Kist';
        else tag = 'Pending';
        return {
          value: m.monthKey,
          label: `${m.monthKey} — Rs. ${m.targetAmount.toLocaleString()} (${tag})`
        };
      });
    }

    // Fallback options if schedule cannot be calculated
    const options = [];
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    for (let i = -12; i <= 12; i++) {
      const d = new Date(currentYear, currentMonth + i, 1);
      const monthStr = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const label = i === 0 ? `${monthStr} (Current Month)` : monthStr;
      options.push({ value: monthStr, label });
    }
    return options;
  }, [plan]);

  if (!activeSale) return null;

  const currentRemaining = Number(activeSale.remainingBalance || 0);
  const pendingAdvanceAmount = Number(activeSale.remainingAdvance || 0);
  const inputAmount = Number(amountPaid) || 0;
  const projectedRemaining = Math.max(0, currentRemaining - inputAmount);

  const customerObj = typeof activeSale.customer === 'object' ? activeSale.customer : {};
  const customerName = customerObj.name || customerObj.fullName || activeSale.customerName || 'Customer';
  const customerId = customerObj.customerId || activeSale.customerId || 'CUST';
  const customerPhone = customerObj.phone || activeSale.customerPhone || '';

  // Handlers for custom manual multi-month editing
  const handleEnableManualSplit = () => {
    const initial = autoAllocations.length > 0
      ? autoAllocations.map(a => ({ forMonth: a.forMonth, amountPaid: a.amountPaid }))
      : [{ forMonth, amountPaid: Number(amountPaid) || Number(activeSale.monthlyAmount) || 0 }];
    setCustomRows(initial);
  };

  const handleAddManualRow = () => {
    const currentList = customRows !== null
      ? [...customRows]
      : (autoAllocations.length > 0
          ? autoAllocations.map(a => ({ forMonth: a.forMonth, amountPaid: a.amountPaid }))
          : [{ forMonth, amountPaid: Number(amountPaid) || 0 }]);

    const usedMonths = new Set(currentList.map(r => r.forMonth));
    const nextPending = plan?.schedule?.find(m => m.status !== 'CLEARED' && !usedMonths.has(m.monthKey))
      || plan?.schedule?.find(m => !usedMonths.has(m.monthKey));

    const nextMonthKey = nextPending?.monthKey || monthOptions[0]?.value || forMonth;
    const nextMonthAmt = nextPending?.remainingAmount || Number(activeSale.monthlyAmount) || 0;

    const updated = [...currentList, { forMonth: nextMonthKey, amountPaid: nextMonthAmt }];
    setCustomRows(updated);
    const total = updated.reduce((s, r) => s + (Number(r.amountPaid) || 0), 0);
    setAmountPaid(total);
  };

  const handleManualRowChange = (idx, field, val) => {
    if (!customRows) return;
    const updated = customRows.map((r, i) => {
      if (i !== idx) return r;
      if (field === 'forMonth') {
        const schedMonth = plan?.schedule?.find(m => m.monthKey === val);
        return {
          ...r,
          forMonth: val,
          amountPaid: schedMonth?.remainingAmount > 0 ? schedMonth.remainingAmount : r.amountPaid
        };
      }
      return { ...r, [field]: val };
    });
    setCustomRows(updated);
    const total = updated.reduce((s, r) => s + (Number(r.amountPaid) || 0), 0);
    setAmountPaid(total);
  };

  const handleRemoveManualRow = (idx) => {
    if (!customRows || customRows.length <= 1) {
      setCustomRows(null);
      return;
    }
    const updated = customRows.filter((_, i) => i !== idx);
    setCustomRows(updated);
    const total = updated.reduce((s, r) => s + (Number(r.amountPaid) || 0), 0);
    setAmountPaid(total);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amountPaid || Number(amountPaid) <= 0) {
      toast.error('Kripya valid payment amount dakhil karein.');
      return;
    }

    if (isPayingRemainingAdvance) {
      if (Number(amountPaid) > pendingAdvanceAmount) {
        toast.error(`Amount baki advance (Rs. ${pendingAdvanceAmount.toLocaleString()}) se zyada nahi ho sakti.`);
        return;
      }
    } else {
      if (Number(amountPaid) > currentRemaining) {
        toast.error(`Amount baki baqaya (Rs. ${currentRemaining.toLocaleString()}) se zyada nahi ho sakti.`);
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const payloadAllocations = !isPayingRemainingAdvance && activeAllocations.length > 0
        ? activeAllocations
            .map(a => ({ forMonth: a.forMonth, amountPaid: Number(a.amountPaid) || 0 }))
            .filter(a => a.forMonth && a.amountPaid > 0)
        : [];

      const res = await API.post('/installments/payment', {
        installmentSaleId: activeSale._id,
        amountPaid: Number(amountPaid),
        paymentMethod,
        transactionId,
        forMonth: isPayingRemainingAdvance
          ? 'Remaining Advance'
          : (payloadAllocations[0]?.forMonth || forMonth),
        allocations: payloadAllocations,
        notes: notes || (isPayingRemainingAdvance ? 'Remaining Advance Cleared' : ''),
        isRemainingAdvance: isPayingRemainingAdvance,
        paymentDate
      });

      if (res.data?.success) {
        if (isPayingRemainingAdvance) {
          activeSale.remainingAdvance = res.data.remainingAdvance ?? Math.max(0, pendingAdvanceAmount - Number(amountPaid));
          if (activeSale.remainingAdvance === 0) {
            activeSale.remainingAdvanceStatus = 'PAID';
          }
        } else {
          activeSale.remainingBalance = res.data.remainingBalance ?? projectedRemaining;
          if (activeSale.remainingBalance === 0) {
            activeSale.status = 'completed';
          }
        }
        setCreatedPayment(res.data.payment);
        toast.success(`Rs. ${Number(amountPaid).toLocaleString()} ki payment kamyabi se record ho gayi!`);
        if (onSuccess) onSuccess();
      } else {
        const msg = res.data?.message || 'Payment record karne me masla aaya.';
        setError(msg);
        toast.error(msg);
      }
    } catch (err) {
      console.error('Payment Error:', err);
      const msg = err.response?.data?.message || err.message || 'Server error occurred while recording payment';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // WhatsApp Sender
  const handleWhatsAppSend = () => {
    if (!createdPayment) return;

    let rawPhone = customerPhone.replace(/\D/g, '');
    if (rawPhone.startsWith('03')) {
      rawPhone = '92' + rawPhone.slice(1);
    }

    const regParts = [];
    if (activeSale.registrationNumber || activeSale.itemRegNumber) regParts.push(`Reg: ${activeSale.registrationNumber || activeSale.itemRegNumber}`);
    if (activeSale.engineNumber) regParts.push(`Eng: ${activeSale.engineNumber}`);
    if (activeSale.chassisNumber) regParts.push(`Chas: ${activeSale.chassisNumber}`);
    const regStr = regParts.length > 0 ? ` (${regParts.join(' | ')})` : '';

    const formattedPayDate = new Date(createdPayment.createdAt || paymentDate).toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const breakdownLines = Array.isArray(createdPayment.batchBreakdown) && createdPayment.batchBreakdown.length > 1
      ? createdPayment.batchBreakdown.map(b => `  • ${b.forMonth}: Rs. ${Number(b.amountPaid).toLocaleString()}`).join('\n')
      : '';

    const message = 
      `*HAJJI MOHAMMAD NABI AUTOS*\n` +
      `*PAYMENT CONFIRMATION RECEIPT*\n` +
      `----------------------------------------\n` +
      `*Date:* ${formattedPayDate}\n` +
      `*Customer:* ${customerName} (${customerId})\n` +
      `*Item:* ${activeSale.itemName}${regStr}\n` +
      `*Total Amount Received:* Rs. ${Number(createdPayment.batchTotal || createdPayment.amountPaid || amountPaid).toLocaleString()}\n` +
      `*For Month(s):* ${createdPayment.forMonth || forMonth}\n` +
      (breakdownLines ? `*Month-Wise Detail:*\n${breakdownLines}\n` : '') +
      `*Payment Method:* ${(createdPayment.paymentMethod || paymentMethod).toUpperCase()}\n` +
      (createdPayment.transactionId ? `*TRX Ref:* ${createdPayment.transactionId}\n` : '') +
      `----------------------------------------\n` +
      `*Remaining Balance:* Rs. ${activeSale.remainingBalance.toLocaleString()}\n` +
      `----------------------------------------\n` +
      `*` + formatPromiseUrduNote(activeSale) + `*\n` +
      `----------------------------------------\n` +
      `*Shop Address:* Shop # 14, Sector 16-B, Main Godhra Stop New Karachi\n` +
      `*Online Accounts:*\n` +
      `📲 03232200325 (EasyPaisa)\n` +
      `📲 03030246040 (JazzCash)\n` +
      `Shukriya aapki payment ka!`;

    window.open(`https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // 1. Direct Invoice View Screen
  if (showReceipt && createdPayment) {
    return (
      <PaymentReceiptModal
        payment={createdPayment}
        sale={activeSale}
        onClose={onClose}
      />
    );
  }

  // 2. Success Screen with Action Buttons (Print, WhatsApp, Close)
  if (createdPayment) {
    const breakdownList = Array.isArray(createdPayment.batchBreakdown) ? createdPayment.batchBreakdown : [];
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white">Payment Recorded Successfully!</h3>
            <p className="text-xs text-slate-400 mt-1">
              Rs. {Number(createdPayment.batchTotal || createdPayment.amountPaid).toLocaleString()} received for <strong className="text-white">{activeSale.itemName}</strong>
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left text-xs space-y-2 text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Customer:</span>
              <span className="text-white font-bold">{customerName} ({customerId})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Installment Month(s):</span>
              <span className="text-purple-400 font-semibold text-right">{createdPayment.forMonth}</span>
            </div>
            {breakdownList.length > 1 && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1">
                <span className="text-[10px] font-bold uppercase text-blue-300 block">Month-Wise Saved Breakdown:</span>
                {breakdownList.map((b, i) => (
                  <div key={i} className="flex justify-between text-[11px] font-mono">
                    <span className="text-slate-300">{b.forMonth}</span>
                    <span className="text-emerald-400 font-bold">Rs. {Number(b.amountPaid).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400">Payment Date:</span>
              <span className="text-emerald-300 font-semibold">
                {new Date(createdPayment.createdAt || paymentDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Payment Mode:</span>
              <span className="text-slate-200 font-medium uppercase">{createdPayment.paymentMethod}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-900">
              <span className="text-slate-400">Net Remaining Balance:</span>
              <span className={`font-black text-sm ${activeSale.remainingBalance === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {activeSale.remainingBalance === 0 ? 'PAID IN FULL (NIL)' : `Rs. ${activeSale.remainingBalance.toLocaleString()}`}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-900 text-center">
              <p className="text-xs font-bold text-amber-400 font-sans tracking-wide" dir="rtl">
                {formatPromiseUrduNote(activeSale)}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-1">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setShowReceipt(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition shadow-lg shadow-emerald-950"
              >
                <Printer className="w-4 h-4" /> Print Combined Invoice
              </button>

              <button
                onClick={handleWhatsAppSend}
                className="bg-green-700 hover:bg-green-600 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition shadow-md"
              >
                <Send className="w-4 h-4" /> WhatsApp Slip
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2.5 px-4 rounded-xl text-xs cursor-pointer transition"
            >
              Close Window
            </button>
          </div>
        </div>
      </div>
    );
  }

  const coveredMonthsSet = new Set(activeAllocations.map(a => a.forMonth));

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-5 sm:p-6 space-y-4 text-white shadow-2xl my-6">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-1.5 flex-wrap">
                <span>Receive Installment Payment</span>
                <span className="text-emerald-300 font-semibold text-sm">/ قسط وصول کریں</span>
              </h3>
              <p className="text-xs text-slate-400">{customerName} <span className="font-mono text-blue-400">({customerId})</span></p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl">
            {error}
          </div>
        )}

        {/* PENDING REMAINING ADVANCE NOTIFICATION & QUICK SWITCH */}
        {pendingAdvanceAmount > 0 && (
          <div className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
            isPayingRemainingAdvance 
              ? 'bg-amber-950/60 border-amber-500 text-white shadow-lg' 
              : 'bg-amber-950/20 border-amber-500/30 text-amber-300'
          }`}>
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <div>
                <p className="text-xs font-bold text-amber-200">
                  Baqi Advance: Rs. {pendingAdvanceAmount.toLocaleString()}
                </p>
                {activeSale.remainingAdvancePromiseDate && (
                  <p className="text-[10px] text-slate-400">
                    Wada: {new Date(activeSale.remainingAdvancePromiseDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextState = !isPayingRemainingAdvance;
                setIsPayingRemainingAdvance(nextState);
                setCustomRows(null);
                if (nextState) {
                  setAmountPaid(pendingAdvanceAmount);
                  setForMonth('Remaining Advance');
                  setNotes('Remaining Advance Cleared');
                } else {
                  setAmountPaid(defaultAmount);
                  setForMonth(defaultMonth);
                  setNotes('');
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                isPayingRemainingAdvance 
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md' 
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
              }`}
            >
              {isPayingRemainingAdvance ? '✓ Paying Remaining Advance' : 'Pay Baqi Advance'}
            </button>
          </div>
        )}

        <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-xs space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-slate-400">Item Account:</span>
            <div className="text-right">
              <span className="text-white font-bold">{activeSale.itemName}</span>
              {(activeSale.registrationNumber || activeSale.itemRegNumber || activeSale.engineNumber || activeSale.chassisNumber) && (
                <div className="text-[10px] text-slate-400 font-mono space-x-1.5 mt-0.5">
                  {(activeSale.registrationNumber || activeSale.itemRegNumber) && (
                    <span className="text-blue-300">Reg: {activeSale.registrationNumber || activeSale.itemRegNumber}</span>
                  )}
                  {activeSale.engineNumber && (
                    <span className="text-amber-300">Eng: {activeSale.engineNumber}</span>
                  )}
                  {activeSale.chassisNumber && (
                    <span className="text-emerald-300">Chas: {activeSale.chassisNumber}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Monthly Target Kist / ماہانہ قسط ہدف:</span>
            <span className="text-blue-400 font-semibold">Rs. {Number(activeSale.monthlyAmount || 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Current Outstanding / موجودہ باقی واجب الادا:</span>
            <span className="text-amber-400 font-bold">Rs. {currentRemaining.toLocaleString()}</span>
          </div>
          {inputAmount > 0 && (
            <div className="flex justify-between pt-1 border-t border-slate-900 text-slate-300">
              <span className="text-slate-400">Balance After Payment / ادائیگی کے بعد باقی:</span>
              <span className="text-emerald-400 font-bold">Rs. {projectedRemaining.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* SEQUENTIAL INSTALLMENT SCHEDULE CHIPS */}
        {plan?.schedule && plan.schedule.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[11px] text-slate-400">
              <span className="flex items-center gap-1 font-semibold text-slate-300">
                <Clock className="w-3.5 h-3.5 text-blue-400" /> Kist Mahinay (Pehle Oldest Missing Clear Karein):
              </span>
              {plan.missedInstallmentsCount > 0 && (
                <span className="bg-rose-950 border border-rose-800 text-rose-300 px-2 py-0.5 rounded-full font-bold text-[10px]">
                  {plan.missedInstallmentsCount} Kist Missed
                </span>
              )}
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {plan.schedule.map((m) => {
                const isSelected = m.monthKey === forMonth;
                const isCoveredInMulti = coveredMonthsSet.has(m.monthKey) && activeAllocations.length > 1;
                const isOldestPending = plan.oldestPendingMonth?.monthKey === m.monthKey;

                let chipStyle = 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700';
                if (m.status === 'CLEARED') {
                  chipStyle = 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300';
                } else if (isSelected || isCoveredInMulti) {
                  chipStyle = 'bg-blue-600 border-blue-400 text-white shadow-md';
                } else if (m.status === 'SHORT') {
                  chipStyle = 'bg-amber-950/60 border-amber-800 text-amber-300';
                } else if (m.isOverdue) {
                  chipStyle = 'bg-rose-950/40 border-rose-900/60 text-rose-300';
                }

                return (
                  <button
                    key={m.monthIndex}
                    type="button"
                    onClick={() => handleSelectMonth(m.monthKey)}
                    className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-mono border transition flex items-center gap-1 cursor-pointer ${chipStyle}`}
                    title={`Due: ${m.dueDateStr} | Target: Rs. ${m.targetAmount} | Paid: Rs. ${m.paidAmount}`}
                  >
                    {isOldestPending && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
                    <span>{m.monthKey}</span>
                    {m.status === 'CLEARED' && <span>✓</span>}
                    {m.status === 'SHORT' && <span className="text-[10px] font-bold">({m.remainingAmount / 1000}k)</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* MONTH INSTALLMENT TRACKER CARD */}
        {selectedMonthObj && (
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
            <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Select Shuda Kist: <span className="text-purple-300 font-mono">{selectedMonthObj.monthKey}</span>
                </span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                selectedMonthObj.status === 'CLEARED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : selectedMonthObj.status === 'SHORT'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : selectedMonthObj.isOverdue
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              }`}>
                {selectedMonthObj.status === 'CLEARED'
                  ? '✓ Mukammal Cleared'
                  : selectedMonthObj.status === 'SHORT'
                  ? '⚠️ Partial / Short Payment'
                  : selectedMonthObj.isOverdue
                  ? '● Overdue Kist'
                  : 'Pending Due'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Kist Target</span>
                <span className="text-xs font-bold text-white font-mono">
                  Rs. {selectedMonthObj.targetAmount.toLocaleString()}
                </span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Pehle Wasool Shuda</span>
                <span className="text-xs font-bold text-emerald-400 font-mono">
                  Rs. {selectedMonthObj.paidAmount.toLocaleString()}
                </span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Is Month Ka Baqi</span>
                <span className="text-xs font-black text-amber-400 font-mono">
                  Rs. {selectedMonthObj.remainingAmount.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Real-time Dynamic Feedback & Multi-Month Breakdown */}
            {!isPayingRemainingAdvance && inputAmount > 0 && selectedMonthObj.remainingAmount > 0 && (
              activeAllocations.length > 1 || customRows !== null ? (
                <div className="bg-blue-950/30 border border-blue-500/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-blue-300 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-400" />
                      Multi-Month Breakdown (1 Combined Invoice, Month-Wise Save):
                    </span>
                    {customRows === null ? (
                      <button
                        type="button"
                        onClick={handleEnableManualSplit}
                        className="text-[10px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-lg border border-blue-500/30 font-semibold cursor-pointer"
                      >
                        Customize Split
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCustomRows(null)}
                        className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        Auto Split
                      </button>
                    )}
                  </div>

                  {customRows === null ? (
                    <div className="space-y-1">
                      {activeAllocations.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-slate-900/90 border border-slate-800 px-2.5 py-1.5 rounded-lg text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-300 font-mono text-[10px] flex items-center justify-center font-bold">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-white font-mono">{item.forMonth}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-emerald-400">
                              Rs. {Number(item.amountPaid).toLocaleString()}
                            </span>
                            {item.isCleared ? (
                              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                                ✓ 100% Clear
                              </span>
                            ) : (
                              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                                Baqi: Rs. {Number(item.remainingAfter).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {customRows.map((row, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <select
                            value={row.forMonth}
                            onChange={(e) => handleManualRowChange(idx, 'forMonth', e.target.value)}
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white"
                          >
                            {monthOptions.map((m, mIdx) => (
                              <option key={mIdx} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={row.amountPaid}
                            onChange={(e) => handleManualRowChange(idx, 'amountPaid', e.target.value)}
                            className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] font-mono font-bold text-emerald-400"
                            placeholder="Amount"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveManualRow(idx)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={handleAddManualRow}
                        className="text-[11px] text-blue-300 hover:text-blue-200 font-semibold flex items-center gap-1 pt-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Another Month
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className={`p-2 rounded-xl text-[11px] font-medium border flex items-center justify-between gap-2 ${
                  inputAmount < selectedMonthObj.remainingAmount
                    ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                    : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                }`}>
                  <div className="flex items-center gap-1.5">
                    {inputAmount < selectedMonthObj.remainingAmount ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>
                          ⚠️ <strong>Short Payment:</strong> Rs. {inputAmount.toLocaleString()} ke baad is mahine ({selectedMonthObj.monthKey}) me <strong>Rs. {(selectedMonthObj.remainingAmount - inputAmount).toLocaleString()}</strong> baqi rahenge.
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>
                          ✓ <strong>Mukammal Kist:</strong> Rs. {inputAmount.toLocaleString()} wasool hone par <strong>{selectedMonthObj.monthKey}</strong> ki kist 100% CLEAR ho jayegi!
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleAddManualRow}
                    className="shrink-0 text-[10px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 px-2 py-1 rounded-lg border border-blue-500/30 font-bold cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> + Add Month
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* Payment Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-slate-300 font-medium">Total Amount Received / کل وصول کردہ رقم (روپے) *</label>
              {selectedMonthObj?.remainingAmount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomRows(null);
                    setAmountPaid(selectedMonthObj.remainingAmount);
                  }}
                  className="text-[10px] text-amber-400 hover:text-amber-300 font-bold cursor-pointer"
                >
                  ⚡ Set 1 Month: Rs. {selectedMonthObj.remainingAmount.toLocaleString()}
                </button>
              )}
            </div>
            <input
              type="number"
              value={amountPaid}
              onChange={(e) => {
                setCustomRows(null);
                setAmountPaid(e.target.value);
              }}
              placeholder={`e.g. ${selectedMonthObj?.remainingAmount || activeSale.monthlyAmount} (ya multiple months ki total raqam likhein)`}
              required
              min="1"
              max={currentRemaining}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500 font-mono text-sm font-bold"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Starting Kist Month / قسط کا مہینہ *</label>
              <select
                value={forMonth}
                onChange={(e) => handleSelectMonth(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 cursor-pointer font-medium"
              >
                {monthOptions.map((m, idx) => (
                  <option key={idx} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-emerald-300 font-semibold mb-1">Payment Date / تاریخ وصولی *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
                className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 cursor-pointer font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Payment Method / ادائیگی کا طریقہ *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="Cash">Cash (Counter Gullay / کاؤنٹر کیش)</option>
                <option value="Bank Transfer">Bank Transfer (بینک ٹرانسفر / راست IBFT)</option>
                <option value="EasyPaisa">EasyPaisa (ایزی پیسہ)</option>
                <option value="JazzCash">JazzCash (جاز کیش)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Transaction Ref / ID / رسید نمبر <span className="text-slate-400 font-normal">(Optional)</span></label>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="e.g. TRX-982312 or Bank Ref"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Remarks / Notes / تفصیل یا ریمارکس <span className="text-slate-400 font-normal">(Optional / اختیاری)</span></label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 6000 wasool, 2000 baqi aglay hafte dega / تفصیل لکھیں"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 mt-2 shadow-lg shadow-emerald-950 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Saving Payment / محفوظ ہو رہا ہے...
              </>
            ) : activeAllocations.length > 1 ? (
              `Save ${activeAllocations.length} Months (Rs. ${inputAmount.toLocaleString()}) & 1 Combined Invoice`
            ) : (
              'Save & Update Ledger / ادائیگی درج کریں اور کھاتہ اپڈیٹ کریں'
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
