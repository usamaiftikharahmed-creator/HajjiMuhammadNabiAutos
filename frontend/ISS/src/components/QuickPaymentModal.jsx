import React, { useState, useMemo, useEffect } from 'react';
import { X, Printer, CheckCircle2, DollarSign, Send, RefreshCw, Calendar, AlertTriangle, Clock } from 'lucide-react';
import PaymentReceiptModal from './PaymentReceiptModal';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { calculateInstallmentPlan } from '../utils/installmentSchedule';
import { getPromiseMonthsInfo, formatPromiseUrduNote } from '../utils/promiseUtils';

export default function QuickPaymentModal({ customer, activeSales, sales, initialSaleId, onClose, onSuccess }) {
  const salesList = useMemo(() => {
    if (activeSales && activeSales.length > 0) return activeSales;
    if (sales && sales.length > 0) return sales;
    return [];
  }, [activeSales, sales]);

  // Find preferred default sale: matches initialSaleId, or first with remaining balance > 0, or first sale
  const defaultSale = useMemo(() => {
    if (initialSaleId) {
      const match = salesList.find(s => s._id === initialSaleId);
      if (match) return match;
    }
    return salesList.find(s => Number(s.remainingBalance || 0) > 0) || salesList[0] || null;
  }, [salesList, initialSaleId]);

  const [selectedSaleId, setSelectedSaleId] = useState(defaultSale?._id || '');

  // Keep selectedSaleId in sync if initialSaleId or defaultSale changes
  useEffect(() => {
    if (initialSaleId) {
      setSelectedSaleId(initialSaleId);
    } else if (!selectedSaleId && defaultSale?._id) {
      setSelectedSaleId(defaultSale._id);
    }
  }, [initialSaleId, defaultSale, selectedSaleId]);

  const selectedSale = useMemo(() => {
    return salesList.find(s => s._id === selectedSaleId) || defaultSale || null;
  }, [salesList, selectedSaleId, defaultSale]);

  // 1. Calculate Full Installment Schedule for Selected Sale
  const plan = useMemo(() => {
    if (!selectedSale) return null;
    return calculateInstallmentPlan(selectedSale);
  }, [selectedSale]);

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
    return selectedSale?.monthlyAmount || '';
  }, [plan, selectedSale]);

  const promiseInfo = useMemo(() => {
    if (!selectedSale) return { totalMonths: 0, remainingMonths: 0 };
    return getPromiseMonthsInfo(selectedSale);
  }, [selectedSale]);

  const [amountPaid, setAmountPaid] = useState(defaultAmount);
  const [forMonth, setForMonth] = useState(defaultMonth);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [transactionId, setTransactionId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sync state when selected sale changes
  useEffect(() => {
    if (plan?.oldestPendingMonth) {
      setForMonth(plan.oldestPendingMonth.monthKey);
      setAmountPaid(plan.oldestPendingMonth.remainingAmount || selectedSale?.monthlyAmount || '');
    } else if (selectedSale) {
      setAmountPaid(selectedSale.monthlyAmount || '');
    }
  }, [selectedSaleId, plan, selectedSale]);

  // Success state for showing invoice receipt options
  const [createdPayment, setCreatedPayment] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);

  // Selected Month Object from Schedule
  const selectedMonthObj = useMemo(() => {
    if (!plan?.schedule) return null;
    return plan.schedule.find(m => m.monthKey === forMonth) || plan.oldestPendingMonth;
  }, [plan, forMonth]);

  const handleSelectMonth = (monthKey) => {
    setForMonth(monthKey);
    const targetMonth = plan?.schedule?.find(m => m.monthKey === monthKey);
    if (targetMonth) {
      setAmountPaid(targetMonth.remainingAmount || selectedSale?.monthlyAmount || '');
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

    const options = [];
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    for (let i = -12; i <= 12; i++) {
      const d = new Date(currentYear, currentMonth + i, 1);
      const monthStr = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const label = i === 0 ? `${monthStr} (Current)` : monthStr;
      options.push({ value: monthStr, label });
    }
    return options;
  }, [plan]);

  // Update monthly target amount when switching item account
  const handleItemChange = (e) => {
    const saleId = e.target.value;
    setSelectedSaleId(saleId);
  };

  const currentRemaining = Number(selectedSale?.remainingBalance || 0);
  const inputAmount = Number(amountPaid) || 0;
  const projectedRemaining = Math.max(0, currentRemaining - inputAmount);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSaleId) {
      const msg = 'Barah-e-karam active item account muntakhib karein.';
      setError(msg);
      toast.error(msg);
      return;
    }

    const numAmount = Number(amountPaid);
    if (!numAmount || numAmount <= 0) {
      const msg = 'Barah-e-karam durust wasooli raqam darj karein.';
      setError(msg);
      toast.error(msg);
      return;
    }

    if (currentRemaining > 0 && numAmount > currentRemaining) {
      const msg = `Raqam kul baqaya (Rs. ${currentRemaining.toLocaleString()}) se zyada nahi ho sakti.`;
      setError(msg);
      toast.error(msg);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await API.post('/installments/payment', {
        installmentSaleId: selectedSaleId,
        amountPaid: numAmount,
        paymentMethod,
        transactionId,
        forMonth,
        notes
      });

      if (res.data?.success) {
        if (selectedSale) {
          selectedSale.remainingBalance = res.data.remainingBalance ?? projectedRemaining;
          if (selectedSale.remainingBalance === 0) {
            selectedSale.status = 'completed';
          }
        }
        setCreatedPayment(res.data.payment);
        toast.success(`Rs. ${numAmount.toLocaleString()} ki payment kamyabi se wasool ho gayi!`);
        if (onSuccess) onSuccess();
      } else {
        const msg = res.data?.message || 'Payment wasool karne me masla aaya.';
        setError(msg);
        toast.error(msg);
      }
    } catch (err) {
      console.error('Quick payment error:', err);
      const msg = err.response?.data?.message || err.message || 'Server error occurred while recording payment';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // WhatsApp Sender
  const handleWhatsAppSend = () => {
    if (!createdPayment || !selectedSale) return;

    let rawPhone = (customer?.phone || selectedSale?.customerPhone || '').replace(/\D/g, '');
    if (rawPhone.startsWith('03')) {
      rawPhone = '92' + rawPhone.slice(1);
    }

    const regParts = [];
    if (selectedSale.registrationNumber || selectedSale.itemRegNumber) regParts.push(`Reg: ${selectedSale.registrationNumber || selectedSale.itemRegNumber}`);
    if (selectedSale.engineNumber) regParts.push(`Eng: ${selectedSale.engineNumber}`);
    if (selectedSale.chassisNumber) regParts.push(`Chas: ${selectedSale.chassisNumber}`);
    const regStr = regParts.length > 0 ? ` (${regParts.join(' | ')})` : '';

    const message = 
      `*HAJJI MOHAMMAD NABI AUTOS*\n` +
      `*OFFICIAL PAYMENT RECEIPT*\n` +
      `----------------------------------------\n` +
      `*Customer:* ${customer?.name || 'Customer'} (${customer?.customerId || ''})\n` +
      `*Item:* ${selectedSale.itemName}${regStr}\n` +
      `*Amount Received:* Rs. ${Number(createdPayment.amountPaid || amountPaid).toLocaleString()}\n` +
      `*For Month:* ${createdPayment.forMonth || 'Monthly Installment'}\n` +
      `*Payment Method:* ${(createdPayment.paymentMethod || paymentMethod).toUpperCase()}\n` +
      (createdPayment.transactionId ? `*TRX Ref:* ${createdPayment.transactionId}\n` : '') +
      `----------------------------------------\n` +
      `*Remaining Balance:* Rs. ${selectedSale.remainingBalance?.toLocaleString()}\n` +
      `----------------------------------------\n` +
      `*` + formatPromiseUrduNote(selectedSale) + `*\n` +
      `----------------------------------------\n` +
      `*Shop Address:* Shop # 14, Sector 16-B, Main Godhra Stop New Karachi\n` +
      `*Online Accounts:*\n` +
      `📲 03232200325 (EasyPaisa)\n` +
      `📲 03030246040 (JazzCash)\n` +
      `Thank you for your payment!`;

    window.open(`https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // Fallback if no installment accounts exist for this customer
  if (!salesList || salesList.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/30">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">Koi Khata Nahi Mila</h3>
          <p className="text-xs text-slate-400">
            Is customer ({customer?.name || 'Unknown'}) ka koi installment khata ya account mojood nahi hai.
          </p>
          <button
            onClick={onClose}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 rounded-xl text-xs cursor-pointer transition"
          >
            Band Karein
          </button>
        </div>
      </div>
    );
  }

  // 1. Direct Invoice View Screen
  if (showReceipt && createdPayment && selectedSale) {
    return (
      <PaymentReceiptModal
        payment={createdPayment}
        sale={{
          ...selectedSale,
          customer: customer || selectedSale.customer
        }}
        onClose={onClose}
      />
    );
  }

  // 2. Success Screen with Action Buttons (Print, WhatsApp, Close)
  if (createdPayment && selectedSale) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white">Payment Recorded Successfully!</h3>
            <p className="text-xs text-slate-400 mt-1">
              Rs. {Number(createdPayment.amountPaid).toLocaleString()} received for {selectedSale?.itemName}
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left text-xs space-y-2 text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Customer:</span>
              <span className="text-white font-bold">{customer?.name} ({customer?.customerId || ''})</span>
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
              <span className={`font-black text-sm ${selectedSale.remainingBalance === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {selectedSale.remainingBalance === 0 ? 'PAID IN FULL (NIL)' : `Rs. ${selectedSale.remainingBalance?.toLocaleString()}`}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-900 text-center">
              <p className="text-xs font-bold text-amber-400 font-sans tracking-wide" dir="rtl">
                {formatPromiseUrduNote(selectedSale)}
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
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 text-white shadow-2xl my-6">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Receive Installment Payment</h3>
              <p className="text-xs text-slate-400">{customer?.name} ({customer?.customerId})</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Item Account Selector */}
        {salesList.length > 1 && (
          <div>
            <label className="block text-slate-300 text-xs font-medium mb-1">Select Item Account *</label>
            <select
              value={selectedSaleId}
              onChange={handleItemChange}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {salesList.map(s => {
                const reg = s.registrationNumber || s.itemRegNumber || s.engineNumber;
                const isCleared = Number(s.remainingBalance || 0) === 0;
                return (
                  <option key={s._id} value={s._id}>
                    {s.itemName} {reg ? `(${reg})` : ''} — {isCleared ? '✓ FULLY PAID' : `Baqi: Rs. ${Number(s.remainingBalance || 0).toLocaleString()}`}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Item Summary Card */}
        {selectedSale && (
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1.5">
            <div className="flex justify-between items-start">
              <span className="text-slate-400">Item:</span>
              <div className="text-right">
                <span className="text-white font-bold">{selectedSale.itemName}</span>
                {(selectedSale.registrationNumber || selectedSale.itemRegNumber || selectedSale.engineNumber || selectedSale.chassisNumber) && (
                  <div className="text-[10px] text-slate-400 font-mono space-x-1.5 mt-0.5">
                    {(selectedSale.registrationNumber || selectedSale.itemRegNumber) && (
                      <span className="text-blue-300">Reg: {selectedSale.registrationNumber || selectedSale.itemRegNumber}</span>
                    )}
                    {selectedSale.engineNumber && (
                      <span className="text-amber-300">Eng: {selectedSale.engineNumber}</span>
                    )}
                    {selectedSale.chassisNumber && (
                      <span className="text-emerald-300">Chas: {selectedSale.chassisNumber}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Monthly Target Kist:</span>
              <span className="text-blue-400 font-semibold">Rs. {Number(selectedSale.monthlyAmount || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Remaining Balance:</span>
              <span className={`font-bold ${currentRemaining === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {currentRemaining === 0 ? '✓ FULLY PAID (NIL)' : `Rs. ${currentRemaining.toLocaleString()}`}
              </span>
            </div>
          </div>
        )}

        {/* SEQUENTIAL SCHEDULE TIMELINE CHIPS */}
        {plan?.schedule && plan.schedule.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[11px] text-slate-400">
              <span className="flex items-center gap-1 font-semibold text-slate-300">
                <Clock className="w-3.5 h-3.5 text-blue-400" /> Kist Schedule (Oldest Pending Pahle):
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
                    {m.status === 'SHORT' && <span className="text-[10px] font-bold">({Math.round(m.remainingAmount / 1000)}k)</span>}
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
                  Target Kist: <span className="text-purple-300 font-mono">{selectedMonthObj.monthKey}</span>
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
                  Rs. {Number(selectedMonthObj.targetAmount || 0).toLocaleString()}
                </span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Pehle Wasool Shuda</span>
                <span className="text-xs font-bold text-emerald-400 font-mono">
                  Rs. {Number(selectedMonthObj.paidAmount || 0).toLocaleString()}
                </span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Is Month Ka Baqi</span>
                <span className="text-xs font-black text-amber-400 font-mono">
                  Rs. {Number(selectedMonthObj.remainingAmount || 0).toLocaleString()}
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
                  ⚡ Set Remaining: Rs. {Number(selectedMonthObj.remainingAmount).toLocaleString()}
                </button>
              )}
            </div>
            <input
              type="number"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder={`Standard: ${selectedMonthObj?.remainingAmount || selectedSale?.monthlyAmount || 0}`}
              required
              min="1"
              max={currentRemaining > 0 ? currentRemaining : undefined}
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
              placeholder="e.g. TRX-982312"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Notes / Remarks (Optional)</label>
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