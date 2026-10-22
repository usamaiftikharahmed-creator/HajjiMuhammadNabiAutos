import React, { useState, useEffect } from 'react';
import { 
  Wallet, TrendingUp, TrendingDown, Plus, Trash2, 
  Printer, CheckCircle, RefreshCw, FileSpreadsheet
} from 'lucide-react';
import toast from 'react-hot-toast';

import DateSelector from '../components/Amountcomponents/DateSelector';
import CashDrawerSplit from '../components/Amountcomponents/CashDrawerSplit';
import DayLockBanner from '../components/Amountcomponents/DayLockBanner';
import MonthlyReportExport from '../components/Amountcomponents/MonthlyReportExport';
import { API_BASE_URL } from '../api/axios';

export default function DailyCashManager() {
  const getTodayDateStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [selectedDate, setSelectedDate] = useState(getTodayDateStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);

  // Expense Form State
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('General');
  const [expensePaymentMethod, setExpensePaymentMethod] = useState('Cash');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [addingExpense, setAddingExpense] = useState(false);

  const fetchSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      const res = await fetch(`${API_BASE_URL}/daily-cash/summary?date=${selectedDate}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include'
      });

      const result = await res.json();
      if (res.ok && result.success) {
        setData(result);
      } else {
        const errMsg = result.message || 'Failed to fetch cash summary';
        setError(errMsg);
        toast.error(errMsg);
      }
    } catch (err) {
      const errMsg = err.message || 'Server connection error';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [selectedDate]);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseTitle || !expenseAmount) return;

    setAddingExpense(true);
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      const res = await fetch(`${API_BASE_URL}/daily-cash/expense`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include',
        body: JSON.stringify({
          title: expenseTitle,
          amount: Number(expenseAmount),
          category: expenseCategory,
          paymentMethod: expensePaymentMethod,
          notes: expenseNotes,
          date: selectedDate
        })
      });

      const result = await res.json();
      if (res.ok && result.success) {
        toast.success('Expense entry added successfully!');
        setExpenseTitle('');
        setExpenseAmount('');
        setExpenseCategory('General');
        setExpensePaymentMethod('Cash');
        setExpenseNotes('');
        fetchSummary();
      } else {
        toast.error(result.message || 'Failed to add expense');
      }
    } catch (err) {
      toast.error(err.message || 'Error adding expense');
    } finally {
      setAddingExpense(false);
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense record?')) return;

    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      const res = await fetch(`${API_BASE_URL}/daily-cash/expense/${id}`, {
        method: 'DELETE',
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) },
        credentials: 'include'
      });

      if (res.ok) {
        toast.success('Expense record deleted!');
        fetchSummary();
      } else {
        const result = await res.json();
        toast.error(result.message || 'Failed to delete expense');
      }
    } catch (err) {
      toast.error(err.message || 'Error deleting expense');
    }
  };

  const handleCloseDay = async () => {
    if (!window.confirm("Officially CLOSE & LOCK today's account?")) return;

    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      const res = await fetch(`${API_BASE_URL}/daily-cash/close-day`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include',
        body: JSON.stringify({
          dateStr: selectedDate,
          openingBalance: data?.openingBalance || 0,
          onlineOpeningBalance: data?.onlineOpeningBalance || 0,
          cashRecovery: data?.cashRecovery || 0,
          onlineRecovery: data?.onlineRecovery || 0,
          totalExpenses: data?.totalExpenses || 0,
          closingBalance: data?.closingBalance || 0,
          onlineClosingBalance: data?.onlineClosingBalance || 0
        })
      });

      const result = await res.json();
      if (res.ok && result.success) {
        toast.success('Day Officially Locked & Closed!');
        fetchSummary();
        window.print();
      } else {
        toast.error(result.message || 'Failed to close day');
      }
    } catch (err) {
      toast.error(err.message || 'Error closing day');
    }
  };

  const handleUnlockDay = async () => {
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      const res = await fetch(`${API_BASE_URL}/daily-cash/unlock-day`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include',
        body: JSON.stringify({ dateStr: selectedDate })
      });

      const result = await res.json();
      if (res.ok && result.success) {
        toast.success('Day Unlocked!');
        fetchSummary();
      } else {
        toast.error(result.message || 'Failed to unlock day');
      }
    } catch (err) {
      toast.error(err.message || 'Error unlocking day');
    }
  };

  const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white p-2 sm:p-4 max-w-7xl mx-auto print:p-0 print:m-0">
      
      {/* Printable Official Shop Header (Visible on print) */}
      <div className="hidden print:flex justify-between items-center border-b-2 border-slate-900 pb-3 mb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 uppercase">Hajji Mohammad Nabi Autos</h1>
          <p className="text-xs text-slate-700 font-semibold mt-0.5">Daily Cash & Expense Roznamcha Report ({selectedDate})</p>
          <div className="text-[10px] text-slate-600 flex items-center gap-2 mt-0.5">
            <span>📍 <strong>Shop # 14, Sector 16-B, Main Godhra Stop New Karachi</strong></span>
            <span>•</span>
            <span>📞 <strong>03232200325</strong> (EasyPaisa)</span>
            <span>•</span>
            <span>📞 <strong>03030246040</strong> (JazzCash)</span>
          </div>
        </div>
        <div className="text-center p-1 bg-white border border-slate-300 rounded-lg">
          <img src="/shop_location_qr.png" alt="Shop Location QR" className="w-12 h-12 object-contain mx-auto" />
          <span className="text-[8px] font-bold text-slate-700 block leading-tight mt-0.5">📍 Shop Location</span>
        </div>
      </div>

      {/* PAGE HEADER */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 print:hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Wallet className="w-6 h-6 text-emerald-400" />
              <h2 className="text-xl font-bold text-white">Daily Cash & Expense Manager (Roznamcha)</h2>
            </div>
            <p className="text-slate-400 text-xs mt-1">
              Track daily recoveries, shop expenses, counter cash, and 10 PM PDF Roznamcha report.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowExportModal(true)}
              className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" /> Excel Export
            </button>

            <button
              onClick={() => window.print()}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Print Report
            </button>

            {!data?.isClosed && (
              <button
                onClick={handleCloseDay}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-emerald-950"
              >
                <CheckCircle className="w-4 h-4" /> 10 PM Day Close
              </button>
            )}
          </div>
        </div>

        {/* COMPONENT 1: DATE SELECTOR */}
        <DateSelector 
          selectedDate={selectedDate} 
          setSelectedDate={setSelectedDate} 
          isToday={data?.isToday} 
        />
      </div>

      {/* COMPONENT 3: DAY LOCK BANNER */}
      <DayLockBanner 
        isClosed={data?.isClosed} 
        closedDetails={data?.closedDetails} 
        userRole={userInfo?.role}
        onUnlock={handleUnlockDay}
      />

      {/* COMPONENT 2: PHYSICAL COUNTER CASH VS ONLINE BREAKDOWN */}
      {(() => {
        const allRecoveries = data?.recoveries || data?.payments || data?.transactions || data?.breakdown || [];

        const isCashItem = (item) => {
          const mode = (item.paymentMode || item.paymentMethod || item.mode || item.type || 'cash').toLowerCase().trim();
          return mode === 'cash' || mode === 'naqd' || mode === 'cash_payment' || mode === 'counter cash';
        };

        const cashList = (data?.cashTransactions && Array.isArray(data.cashTransactions))
          ? data.cashTransactions
          : allRecoveries.filter(item => isCashItem(item));

        const onlineList = (data?.onlineTransactions && Array.isArray(data.onlineTransactions))
          ? data.onlineTransactions
          : allRecoveries.filter(item => !isCashItem(item));

        return (
          <CashDrawerSplit 
            openingBalance={data?.openingBalance || 0}
            onlineOpeningBalance={data?.onlineOpeningBalance || 0}
            cashRecovery={data?.cashRecovery || 0}
            onlineRecovery={data?.onlineRecovery || 0}
            totalExpenses={data?.totalExpenses || 0}
            cashExpenses={data?.cashExpenses || 0}
            onlineExpenses={data?.onlineExpenses || 0}
            physicalCashInDrawer={data?.physicalCashInDrawer || 0}
            onlineClosingBalance={data?.onlineClosingBalance || 0}
            cashTransactions={cashList}
            onlineTransactions={onlineList}
            expenses={data?.expenses || []}
            customers={data?.customers || []}
          />
        );
      })()}

      {/* METRIC SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1 print:bg-white print:border-gray-300">
          <p className="text-slate-400 text-xs font-medium print:text-gray-600">Opening Cash</p>
          <h4 className="text-2xl font-bold text-slate-200 print:text-black">Rs. {data?.openingBalance?.toLocaleString()}</h4>
          <span className="text-[10px] text-slate-500">Yesterday's carried forward</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1 print:bg-white print:border-gray-300">
          <div className="flex justify-between items-center">
            <p className="text-slate-400 text-xs font-medium print:text-gray-600">Total Recovery (+)</p>
            <TrendingUp className="w-4 h-4 text-emerald-400 print:hidden" />
          </div>
          <h4 className="text-2xl font-bold text-emerald-400 print:text-emerald-700">Rs. {data?.totalRecovery?.toLocaleString()}</h4>
          <p className="text-[10px] text-slate-400">Cash + Online Transfers</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1 print:bg-white print:border-gray-300">
          <div className="flex justify-between items-center">
            <p className="text-slate-400 text-xs font-medium print:text-gray-600">Total Expenses (-)</p>
            <TrendingDown className="w-4 h-4 text-rose-400 print:hidden" />
          </div>
          <h4 className="text-2xl font-bold text-rose-400 print:text-red-700">Rs. {data?.totalExpenses?.toLocaleString()}</h4>
          <span className="text-[10px] text-slate-400">
            Cash: Rs. {(data?.cashExpenses || 0).toLocaleString()} | Online: Rs. {(data?.onlineExpenses || 0).toLocaleString()}
          </span>
        </div>

        <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-5 space-y-1 print:bg-white print:border-gray-400">
          <p className="text-slate-400 text-xs font-medium print:text-gray-600">Net Total Assets</p>
          <h4 className="text-2xl font-black text-amber-400 print:text-black">Rs. {data?.netTotalClosing?.toLocaleString()}</h4>
          <span className="text-[10px] text-amber-500/80 font-bold">Drawer Cash + Bank</span>
        </div>
      </div>

      {/* TWO COLUMNS: EXPENSE FORM & EXPENSE LIST */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:grid-cols-1">
        
        {/* ADD EXPENSE FORM */}
        <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl print:hidden ${data?.isClosed ? 'opacity-50 pointer-events-none' : ''}`}>
          <h3 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
            <Plus className="w-4 h-4 text-rose-400" />
            <span>Record Shop Expense</span>
            <span className="text-rose-300 font-semibold text-sm">/ دکان کا خرچہ درج کریں</span>
          </h3>

          <form onSubmit={handleAddExpense} className="space-y-3.5 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Expense Title / Reason / خرچے کا عنوان یا وجہ *</label>
              <input
                type="text"
                placeholder="e.g. Electricity Bill, Tea/Khana / بجلی کا بل، چائے کھانا وغیرہ"
                value={expenseTitle}
                onChange={(e) => setExpenseTitle(e.target.value)}
                disabled={data?.isClosed}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Amount / رقم (روپے) *</label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  disabled={data?.isClosed}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-bold focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Category / کیٹیگری</label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  disabled={data?.isClosed}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none cursor-pointer"
                >
                  <option value="General">General (عام خرچہ)</option>
                  <option value="Tea & Refreshment">Tea & Refreshment (چائے و کھانا)</option>
                  <option value="Utility Bills">Utility Bills (یوٹیلیٹی بلز)</option>
                  <option value="Shop Maintenance">Shop Maintenance (دکان کی دیکھ بھال)</option>
                  <option value="Salary/Advance">Salary/Advance (تنخواہ یا ایڈوانس)</option>
                  <option value="Transport">Transport (کرایہ یا پیٹرول)</option>
                </select>
              </div>
            </div>

            {/* PAYMENT MODE SELECTOR (Cash, Bank Transfer, JazzCash, EasyPaisa) */}
            <div>
              <label className="text-slate-400 block mb-1.5 font-medium">Payment Mode / ادائیگی کا ذریعہ *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'Cash', label: 'Cash (Gulla / گلہ)', color: 'emerald' },
                  { id: 'Bank Transfer', label: 'Bank (بینک)', color: 'purple' },
                  { id: 'JazzCash', label: 'JazzCash (جاز کیش)', color: 'amber' },
                  { id: 'EasyPaisa', label: 'EasyPaisa (ایزی پیسہ)', color: 'teal' }
                ].map((pm) => {
                  const isSelected = expensePaymentMethod === pm.id;
                  let selectedClass = '';
                  if (pm.id === 'Cash') selectedClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-sm';
                  else if (pm.id === 'Bank Transfer') selectedClass = 'bg-purple-500/20 text-purple-300 border-purple-500 shadow-sm';
                  else if (pm.id === 'JazzCash') selectedClass = 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm';
                  else selectedClass = 'bg-teal-500/20 text-teal-300 border-teal-500 shadow-sm';

                  let dotClass = '';
                  if (pm.id === 'Cash') dotClass = 'bg-emerald-400';
                  else if (pm.id === 'Bank Transfer') dotClass = 'bg-purple-400';
                  else if (pm.id === 'JazzCash') dotClass = 'bg-amber-400';
                  else dotClass = 'bg-teal-400';

                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setExpensePaymentMethod(pm.id)}
                      disabled={data?.isClosed}
                      className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                        isSelected
                          ? selectedClass
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? dotClass : 'bg-slate-600'}`} />
                      {pm.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Notes / Remarks / تفصیل یا ریمارکس</label>
              <input
                type="text"
                placeholder="Details / تفصیل لکھیں..."
                value={expenseNotes}
                onChange={(e) => setExpenseNotes(e.target.value)}
                disabled={data?.isClosed}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={addingExpense || data?.isClosed}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 text-xs"
            >
              {addingExpense ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Adding / درج ہو رہا ہے...
                </>
              ) : (
                'Add Expense Entry / دکان کا خرچہ درج کریں'
              )}
            </button>
          </form>
        </div>

        {/* EXPENSES BREAKDOWN TABLE */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl print:bg-white print:border-gray-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h3 className="text-base font-bold text-white print:text-black">Shop Expenses Breakdown</h3>
              <p className="text-[11px] text-slate-400">
                Cash Exp: <strong className="text-emerald-400">Rs. {(data?.cashExpenses || 0).toLocaleString()}</strong> | 
                Online Exp: <strong className="text-purple-400">Rs. {(data?.onlineExpenses || 0).toLocaleString()}</strong>
              </p>
            </div>
            <span className="text-xs text-rose-400 font-bold bg-rose-950/40 border border-rose-800/50 px-3 py-1.5 rounded-xl">
              Total Exp: Rs. {data?.totalExpenses?.toLocaleString()}
            </span>
          </div>

          {data?.expenses?.length === 0 ? (
            <p className="text-slate-500 text-xs italic py-6 text-center">No expenses recorded for this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase font-semibold print:bg-gray-100 print:text-black">
                    <th className="p-3">Reason</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Payment Mode</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Time</th>
                    <th className="p-3 text-right print:hidden">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300 print:divide-gray-300 print:text-black">
                  {data?.expenses?.map((exp) => {
                    const mode = exp.paymentMethod || 'Cash';
                    let modeBadgeClass = 'bg-emerald-950 text-emerald-400 border-emerald-800/60';
                    if (mode === 'Bank Transfer') modeBadgeClass = 'bg-purple-950 text-purple-400 border-purple-800/60';
                    else if (mode === 'JazzCash') modeBadgeClass = 'bg-amber-950 text-amber-400 border-amber-800/60';
                    else if (mode === 'EasyPaisa') modeBadgeClass = 'bg-teal-950 text-teal-400 border-teal-800/60';

                    return (
                      <tr key={exp._id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-semibold text-white print:text-black">
                          <div>{exp.title}</div>
                          {exp.notes && <div className="text-[10px] text-slate-500 font-normal italic">{exp.notes}</div>}
                        </td>
                        <td className="p-3"><span className="bg-slate-800 px-2 py-0.5 rounded text-[11px] print:bg-gray-200">{exp.category}</span></td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${modeBadgeClass} print:border-gray-400 print:text-black`}>
                            {mode}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-rose-400 print:text-red-700">Rs. {exp.amount?.toLocaleString()}</td>
                        <td className="p-3 text-slate-400 print:text-gray-700">{new Date(exp.createdAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="p-3 text-right print:hidden">
                          {!data?.isClosed && (
                            <button onClick={() => handleDeleteExpense(exp._id)} className="text-slate-500 hover:text-rose-400 transition cursor-pointer">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* COMPONENT 4: MONTHLY REPORT EXPORT MODAL */}
      {showExportModal && (
        <MonthlyReportExport onClose={() => setShowExportModal(false)} />
      )}

      <style>{`
        @media print {
          @page { size: 5.84in 8.27in; margin: 4mm; }
          *, *:before, *:after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box !important; }
          nav, header, aside, button, .print\\:hidden { display: none !important; }
          body, html, #root { background: #ffffff !important; color: #000000 !important; width: 100% !important; margin: 0 !important; padding: 0 !important; font-size: 11px !important; }
          .max-w-7xl { max-width: 100% !important; padding: 0 !important; }
        }
      `}</style>

    </div>
  );
}