import React, { useState, useMemo } from 'react';
import { X, Printer, CheckCircle2, DollarSign, Send, RefreshCw, Calendar, AlertTriangle, Clock } from 'lucide-react';
import PaymentReceiptModal from './PaymentReceiptModal';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { calculateInstallmentPlan } from '../utils/installmentSchedule';
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

  const [forMonth, setForMonth] = useState(defaultMonth);
  const [amountPaid, setAmountPaid] = useState(defaultAmount);
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

  // Handle Month Switch: auto-populate the exact remaining amount for that month
  const handleSelectMonth = (monthKey) => {
    setForMonth(monthKey);
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
  const inputAmount = Number(amountPaid) || 0;
  const projectedRemaining = Math.max(0, currentRemaining - inputAmount);

  const customerObj = typeof activeSale.customer === 'object' ? activeSale.customer : {};
  const customerName = customerObj.name || customerObj.fullName || activeSale.customerName || 'Customer';
  const customerId = customerObj.customerId || activeSale.customerId || 'N/A';
  const customerPhone = customerObj.phone || activeSale.customerPhone || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amountPaid || Number(amountPaid) <= 0) {
      toast.error('Kripya valid payment amount dakhil karein.');
      return;
    }

    if (Number(amountPaid) > currentRemaining) {
      toast.error(`Amount baki baqaya (Rs. ${currentRemaining.toLocaleString()}) se zyada nahi ho sakti.`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await API.post('/installments/payment', {
        installmentSaleId: activeSale._id,
        amountPaid: Number(amountPaid),
        paymentMethod,
        transactionId,
        forMonth,
        notes
      });

      if (res.data?.success) {
        // Update local object balance
        activeSale.remainingBalance = res.data.remainingBalance ?? projectedRemaining;
        if (activeSale.remainingBalance === 0) {
          activeSale.status = 'completed';
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

    const message = 
      `*HAJJI MOHAMMAD NABI AUTOS*\n` +
      `*PAYMENT CONFIRMATION RECEIPT*\n` +
      `----------------------------------------\n` +
      `*Customer:* ${customerName} (${customerId})\n` +
      `*Item:* ${activeSale.itemName}${regStr}\n` +
      `*Amount Received:* Rs. ${Number(createdPayment.amountPaid || amountPaid).toLocaleString()}\n` +
      `*For Month:* ${createdPayment.forMonth || forMonth}\n` +
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
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white">Payment Recorded Successfully!</h3>
            <p className="text-xs text-slate-400 mt-1">
              Rs. {Number(createdPayment.amountPaid).toLocaleString()} received for <strong className="text-white">{activeSale.itemName}</strong>
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left text-xs space-y-2 text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Customer:</span>
              <span className="text-white font-bold">{customerName} ({customerId})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Installment Month:</span>
              <span className="text-purple-400 font-semibold">{createdPayment.forMonth}</span>
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
                <Printer className="w-4 h-4" /> Print Invoice
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
              <h3 className="text-base font-bold text-white">Receive Installment Payment</h3>
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

        {/* Item & Financial Summary Card */}
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
            <span className="text-slate-400">Monthly Target Kist:</span>
            <span className="text-blue-400 font-semibold">Rs. {Number(activeSale.monthlyAmount || 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Current Outstanding Balance:</span>
            <span className="text-amber-400 font-bold">Rs. {currentRemaining.toLocaleString()}</span>
          </div>
          {inputAmount > 0 && (
            <div className="flex justify-between pt-1 border-t border-slate-900 text-slate-300">
              <span className="text-slate-400">Balance After This Payment:</span>
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
                const isOldestPending = plan.oldestPendingMonth?.monthKey === m.monthKey;

                let chipStyle = 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700';
                if (m.status === 'CLEARED') {
                  chipStyle = 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300';
                } else if (m.status === 'SHORT') {
                  chipStyle = isSelected
                    ? 'bg-amber-600 border-amber-500 text-white shadow-md'
                    : 'bg-amber-950/60 border-amber-800 text-amber-300';
                } else if (isSelected) {
                  chipStyle = 'bg-blue-600 border-blue-500 text-white shadow-md';
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

            {/* Real-time Dynamic Feedback when entering amount */}
            {inputAmount > 0 && selectedMonthObj.remainingAmount > 0 && (
              <div className={`p-2 rounded-xl text-[11px] font-medium border flex items-center gap-1.5 ${
                inputAmount < selectedMonthObj.remainingAmount
                  ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                  : inputAmount === selectedMonthObj.remainingAmount
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                  : 'bg-blue-950/40 border-blue-800/60 text-blue-200'
              }`}>
                {inputAmount < selectedMonthObj.remainingAmount ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>
                      ⚠️ <strong>Short Payment:</strong> Rs. {inputAmount.toLocaleString()} wasool hone ke baad bhi is mahine ({selectedMonthObj.monthKey}) me <strong>Rs. {(selectedMonthObj.remainingAmount - inputAmount).toLocaleString()}</strong> baqi reh jayenge.
                    </span>
                  </>
                ) : inputAmount === selectedMonthObj.remainingAmount ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>
                      ✓ <strong>Mukammal Kist:</strong> Rs. {inputAmount.toLocaleString()} wasool hone par <strong>{selectedMonthObj.monthKey}</strong> ki kist 100% CLEAR ho jayegi!
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>
                      ⚡ <strong>Multi-Month:</strong> Rs. {selectedMonthObj.remainingAmount.toLocaleString()} se {selectedMonthObj.monthKey} clear hoga, aur baqi Rs. {(inputAmount - selectedMonthObj.remainingAmount).toLocaleString()} aglay mahine k liye cover honge!
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Payment Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-slate-300 font-medium">Amount Received (Rs.) *</label>
              {selectedMonthObj?.remainingAmount > 0 && (
                <button
                  type="button"
                  onClick={() => setAmountPaid(selectedMonthObj.remainingAmount)}
                  className="text-[10px] text-amber-400 hover:text-amber-300 font-bold cursor-pointer"
                >
                  ⚡ Set Remaining: Rs. {selectedMonthObj.remainingAmount.toLocaleString()}
                </button>
              )}
            </div>
            <input
              type="number"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder={`Standard: ${selectedMonthObj?.remainingAmount || activeSale.monthlyAmount}`}
              required
              min="1"
              max={currentRemaining}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500 font-mono text-sm font-bold"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">For Kist Month *</label>
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
              <label className="block text-slate-300 font-medium mb-1">Payment Method Mode *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="Cash">Cash (Counter Gullay)</option>
                <option value="Bank Transfer">Bank Transfer (Raast / IBFT)</option>
                <option value="EasyPaisa">EasyPaisa</option>
                <option value="JazzCash">JazzCash</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Transaction Ref / ID (Optional)</label>
            <input
              type="text"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="e.g. TRX-982312 or Bank Ref"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Remarks / Notes (Optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 6000 wasool, 2000 baqi aglay hafte dega"
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
                <RefreshCw className="w-4 h-4 animate-spin" /> Saving Payment...
              </>
            ) : (
              'Save & Update Ledger'
            )}
          </button>
        </form>

      </div>
    </div>
  );
}