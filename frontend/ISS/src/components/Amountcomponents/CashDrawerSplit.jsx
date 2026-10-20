import React, { useState } from 'react';
import { 
  Wallet, CreditCard, Eye, X, Search, Receipt, User, ArrowUpRight, CheckCircle2, TrendingDown, ArrowDownRight, Layers, Calendar, Filter, Printer
} from 'lucide-react';

export default function CashDrawerSplit({
  openingBalance = 0,
  onlineOpeningBalance = 0,
  cashRecovery = 0,
  onlineRecovery = 0,
  totalExpenses = 0,
  cashExpenses = 0,
  onlineExpenses = 0,
  physicalCashInDrawer = 0,
  onlineClosingBalance = 0,
  cashTransactions = [], 
  onlineTransactions = [],
  expenses = [],
  todayExpenses = [],
  customers = []
}) {
  const [activeModal, setActiveModal] = useState(null); // 'cash' | 'online' | null
  const [modalTab, setModalTab] = useState('all');      // 'all' | 'cash' | 'expense'
  const [channelFilter, setChannelFilter] = useState('all'); // 'all' | 'banktransfer' | 'easypaisa' | 'jazzcash'
  const [searchTerm, setSearchTerm] = useState('');
  
  // Date Range inside Modal
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  // Selected Item for Receipt Modal
  const [selectedReceiptItem, setSelectedReceiptItem] = useState(null);

  const isCash = activeModal === 'cash';
  const rawTransactions = isCash ? cashTransactions : onlineTransactions;

  // Safe Expenses Resolution
  const resolvedExpenses = (expenses && expenses.length > 0) 
    ? expenses 
    : ((todayExpenses && todayExpenses.length > 0) ? todayExpenses : []);

  const safeExpensesList = (resolvedExpenses.length === 0 && totalExpenses > 0 && isCash)
    ? [{ _id: 'summary-expense-1', title: 'Total Shop Expenses (Combined)', amount: totalExpenses, category: 'Deduction', createdAt: new Date() }]
    : resolvedExpenses;

  // Helpers
  const getAmount = (item) => {
    if (!item || typeof item !== 'object') return 0;
    const val = item.amountPaid ?? item.amount ?? item.paidAmount ?? item.receivedAmount ?? item.installmentSale?.amountPaid ?? 0;
    return Number(val) || 0;
  };

  const getCustomerName = (item) => {
    if (!item || typeof item !== 'object') return 'Walk-in Customer';
    const custObj = item.customer || item.customerId || item.client || item.installmentSale?.customer;
    if (typeof custObj === 'object' && custObj !== null) {
      const name = custObj.name || custObj.fullName || custObj.customerName;
      if (name) return name;
    }
    const rawId = typeof item.customer === 'string' ? item.customer : (typeof item.customerId === 'string' ? item.customerId : null);
    if (rawId && customers && customers.length > 0) {
      const matchedCust = customers.find(c => c._id === rawId || c.id === rawId);
      if (matchedCust) return matchedCust.name || matchedCust.fullName || matchedCust.customerName;
    }
    return item.customerName || item.clientName || item.partyName || item.title || 'Walk-in Customer';
  };

  const getPaymentChannel = (item) => {
    const m = (item.paymentMethod || item.paymentMode || item.bankName || item.paymentChannel || '').toLowerCase().trim();
    if (m.includes('easypaisa')) return 'easypaisa';
    if (m.includes('jazzcash') || m.includes('jazz')) return 'jazzcash';
    if (m === 'cash' || m === 'naqd' || m === 'counter cash' || m === 'cash_payment') return 'cash';
    return 'banktransfer';
  };

  // Date Filter Check
  const isWithinDateRange = (itemDateStr) => {
    if (!startDateFilter && !endDateFilter) return true;
    const itemDate = new Date(itemDateStr);
    if (isNaN(itemDate.getTime())) return true;

    if (startDateFilter) {
      const start = new Date(startDateFilter);
      start.setHours(0,0,0,0);
      if (itemDate < start) return false;
    }
    if (endDateFilter) {
      const end = new Date(endDateFilter);
      end.setHours(23,59,59,999);
      if (itemDate > end) return false;
    }
    return true;
  };

  // Filter Payments
  const filteredPayments = (rawTransactions || []).filter(item => {
    const name = getCustomerName(item).toLowerCase();
    const notes = (item.notes || item.title || item.bankName || item.paymentMethod || '').toLowerCase();
    const query = searchTerm.toLowerCase();
    const matchesSearch = name.includes(query) || notes.includes(query);
    const matchesDate = isWithinDateRange(item.createdAt || item.date);

    if (!isCash) {
      const channel = getPaymentChannel(item);
      const matchesChannel = channelFilter === 'all' || channel === channelFilter;
      return matchesSearch && matchesDate && matchesChannel;
    }
    return matchesSearch && matchesDate;
  });

  // Filter Expenses
  const filteredExpenses = (safeExpensesList || []).filter(item => {
    const title = (item.title || item.category || item.notes || item.paymentMethod || item.paymentMode || '').toLowerCase();
    const matchesSearch = title.includes(searchTerm.toLowerCase());
    const matchesDate = isWithinDateRange(item.createdAt || item.date);
    const channel = getPaymentChannel(item);

    if (isCash) {
      const matchesCash = channel === 'cash';
      return matchesSearch && matchesDate && matchesCash;
    } else {
      const matchesOnline = channel !== 'cash';
      const matchesChannel = channelFilter === 'all' || channel === channelFilter;
      return matchesSearch && matchesDate && matchesOnline && matchesChannel;
    }
  });

  // Combined Items
  const combinedItems = [
    ...filteredPayments.map(p => ({ ...p, _itemType: 'income' })),
    ...filteredExpenses.map(e => ({ ...e, _itemType: 'expense' }))
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  // Items to Render in Modal
  const displayItems = modalTab === 'cash' 
    ? filteredPayments.map(p => ({ ...p, _itemType: 'income' }))
    : modalTab === 'expense' 
    ? filteredExpenses.map(e => ({ ...e, _itemType: 'expense' }))
    : combinedItems;

  const modalCashInTotal = filteredPayments.reduce((acc, item) => acc + getAmount(item), 0);
  const modalExpenseTotal = filteredExpenses.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  return (
    <>
      {/* 2 MAIN CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
        
        {/* PHYSICAL CASH CARD */}
        <div 
          onClick={() => { setActiveModal('cash'); setModalTab('all'); setChannelFilter('all'); setSearchTerm(''); setStartDateFilter(''); setEndDateFilter(''); }}
          className="bg-slate-900 border border-slate-800 hover:border-emerald-500/60 transition duration-300 rounded-2xl p-5 shadow-xl cursor-pointer group relative overflow-hidden print:bg-white print:border-gray-300"
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 transition">
                <Wallet className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white print:text-black">Physical Counter Cash (Naqd Gullay Cash)</h3>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/60 text-[10px] font-semibold px-2 py-0.5 rounded-full print:hidden">
                Naqd Cash
              </span>
              <span className="bg-slate-800 text-slate-300 group-hover:bg-emerald-500 group-hover:text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 transition print:hidden">
                <Eye className="w-3 h-3" /> Details
              </span>
            </div>
          </div>

          <h2 className="text-3xl font-black text-white mt-3 print:text-black">
            Rs. {(physicalCashInDrawer || 0).toLocaleString()}
          </h2>

          <p className="text-[11px] text-slate-400 mt-2 print:text-gray-600">
            Starting (Rs. {(openingBalance || 0).toLocaleString()}) + Rec (Rs. {(cashRecovery || 0).toLocaleString()}) - Cash Exp (Rs. {(cashExpenses || 0).toLocaleString()})
          </p>

          <div className="mt-3 pt-2 border-t border-slate-800/80 flex justify-between items-center text-[11px] text-emerald-400 font-medium group-hover:translate-x-0.5 transition print:hidden">
            <span>Click to view breakdown & receipts</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* ONLINE TRANSFER CARD */}
        <div 
          onClick={() => { setActiveModal('online'); setModalTab('all'); setChannelFilter('all'); setSearchTerm(''); setStartDateFilter(''); setEndDateFilter(''); }}
          className="bg-slate-900 border border-slate-800 hover:border-purple-500/60 transition duration-300 rounded-2xl p-5 shadow-xl cursor-pointer group relative overflow-hidden print:bg-white print:border-gray-300"
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-500/10 rounded-xl text-purple-400 group-hover:bg-purple-500 group-hover:text-slate-950 transition">
                <CreditCard className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white print:text-black">Online / Bank Accounts Total</h3>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="bg-purple-950 text-purple-400 border border-purple-800/60 text-[10px] font-semibold px-2 py-0.5 rounded-full print:hidden">
                Bank / EasyPaisa / JazzCash
              </span>
              <span className="bg-slate-800 text-slate-300 group-hover:bg-purple-500 group-hover:text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 transition print:hidden">
                <Eye className="w-3 h-3" /> Details
              </span>
            </div>
          </div>

          <h2 className="text-3xl font-black text-purple-400 mt-3 print:text-purple-800">
            Rs. {(onlineClosingBalance ?? ((onlineOpeningBalance || 0) + (onlineRecovery || 0) - (onlineExpenses || 0))).toLocaleString()}
          </h2>

          <p className="text-[11px] text-slate-400 mt-2 print:text-gray-600">
            Starting (Rs. {(onlineOpeningBalance || 0).toLocaleString()}) + Today Rec (Rs. {(onlineRecovery || 0).toLocaleString()}) {onlineExpenses > 0 ? `- Online Exp (Rs. ${(onlineExpenses || 0).toLocaleString()})` : ''}
          </p>

          <div className="mt-3 pt-2 border-t border-slate-800/80 flex justify-between items-center text-[11px] text-purple-400 font-medium group-hover:translate-x-0.5 transition print:hidden">
            <span>Click to filter Bank / JazzCash / EasyPaisa</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </div>
        </div>

      </div>

      {/* POPUP BREAKDOWN MODAL */}
      {activeModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200 print:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* MODAL HEADER */}
            <div className={`p-5 border-b border-slate-800 flex justify-between items-center ${isCash ? 'bg-slate-900' : 'bg-purple-950/30'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${isCash ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-400'}`}>
                  {isCash ? <Wallet className="w-6 h-6" /> : <CreditCard className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isCash ? 'Physical Cash Register Breakdown' : 'Online / Bank Accounts Breakdown'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Starting Balance: <strong className="text-amber-400">Rs. {(isCash ? openingBalance : onlineOpeningBalance).toLocaleString()}</strong>
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setActiveModal(null)}
                className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-full transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* MODAL CONTROLS & FILTERS */}
            <div className="p-4 bg-slate-950/90 border-b border-slate-800 space-y-3">
              
              {/* CHANNEL FILTER FOR ONLINE MODAL */}
              {!isCash && (
                <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto text-xs font-semibold">
                  <span className="text-slate-400 px-2 flex items-center gap-1"><Filter className="w-3 h-3"/> Channel:</span>
                  {[
                    { id: 'all', label: 'All Channels' },
                    { id: 'banktransfer', label: 'Bank Transfer' },
                    { id: 'jazzcash', label: 'JazzCash' },
                    { id: 'easypaisa', label: 'EasyPaisa' }
                  ].map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => setChannelFilter(ch.id)}
                      className={`px-3 py-1.5 rounded-lg transition shrink-0 ${
                        channelFilter === ch.id 
                          ? 'bg-purple-600 text-white shadow' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              )}

              {/* TYPE TABS: ALL / RECEIVING / EXPENSES */}
              <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
                <button
                  onClick={() => setModalTab('all')}
                  className={`flex-1 py-1.5 px-3 rounded-lg transition flex items-center justify-center gap-1.5 ${
                    modalTab === 'all' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> All Transactions
                </button>

                <button
                  onClick={() => setModalTab('cash')}
                  className={`flex-1 py-1.5 px-3 rounded-lg transition flex items-center justify-center gap-1.5 ${
                    modalTab === 'cash' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow' : 'text-slate-400 hover:text-emerald-400'
                  }`}
                >
                  <ArrowDownRight className="w-3.5 h-3.5" /> Received (+Rs. {modalCashInTotal.toLocaleString()})
                </button>

                <button
                  onClick={() => setModalTab('expense')}
                  className={`flex-1 py-1.5 px-3 rounded-lg transition flex items-center justify-center gap-1.5 ${
                    modalTab === 'expense' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow' : 'text-slate-400 hover:text-rose-400'
                  }`}
                >
                  <TrendingDown className="w-3.5 h-3.5" /> Expenses (-Rs. {modalExpenseTotal.toLocaleString()})
                </button>
              </div>

              {/* SEARCH & DATE RANGE FILTERS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search name, notes, mode..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2 py-1 rounded-xl text-xs">
                  <span className="text-[10px] text-slate-400 shrink-0">From:</span>
                  <input
                    type="date"
                    value={startDateFilter}
                    onChange={(e) => setStartDateFilter(e.target.value)}
                    className="bg-transparent text-white font-medium focus:outline-none w-full"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2 py-1 rounded-xl text-xs">
                  <span className="text-[10px] text-slate-400 shrink-0">To:</span>
                  <input
                    type="date"
                    value={endDateFilter}
                    onChange={(e) => setEndDateFilter(e.target.value)}
                    className="bg-transparent text-white font-medium focus:outline-none w-full"
                  />
                </div>
              </div>

            </div>

            {/* LIST ITEMS */}
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {displayItems.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  No matching transaction records found.
                </div>
              ) : (
                displayItems.map((item, index) => {
                  const isExpenseItem = item._itemType === 'expense';
                  const amount = isExpenseItem ? (Number(item.amount) || 0) : getAmount(item);
                  const titleName = isExpenseItem ? (item.title || item.category || 'Shop Expense') : getCustomerName(item);
                  const timeStr = item.createdAt ? new Date(item.createdAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : '';
                  const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-PK') : '';
                  const modeTag = item.paymentMode || item.paymentMethod || (isExpenseItem ? 'Cash' : 'Cash');

                  return (
                    <div 
                      key={item._id || item.id || index}
                      onClick={() => setSelectedReceiptItem({ ...item, titleName, amount, isExpenseItem, modeTag })}
                      className={`p-3 rounded-2xl flex items-center justify-between gap-3 transition border cursor-pointer ${
                        isExpenseItem 
                          ? 'bg-rose-950/10 border-rose-900/30 hover:border-rose-500' 
                          : 'bg-slate-950 border-slate-800/80 hover:border-emerald-500/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isExpenseItem ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {isExpenseItem ? <TrendingDown className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold truncate text-white">
                            {titleName}
                          </h4>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                            <span>{dateStr} {timeStr}</span>
                            <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                              {modeTag}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`text-sm font-black block ${
                          isExpenseItem ? 'text-rose-400' : 'text-emerald-400'
                        }`}>
                          {isExpenseItem ? `-Rs. ${amount.toLocaleString()}` : `+Rs. ${amount.toLocaleString()}`}
                        </span>
                        <span className="text-[10px] text-blue-400 font-semibold block hover:underline">
                          View Receipt →
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* FOOTER */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs">
              <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Click any entry to preview complete receipt
              </span>
              <button
                onClick={() => setActiveModal(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Close Window
              </button>
            </div>

          </div>
        </div>
      )}

      {/* FULL TRANSACTION RECEIPT MODAL */}
      {selectedReceiptItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[60] flex items-center justify-center p-4 print:p-0">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl relative text-white">
            <button 
              onClick={() => setSelectedReceiptItem(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center border-b border-slate-800 pb-4 space-y-1.5">
              <div className="flex items-center justify-center gap-3">
                <Receipt className="w-8 h-8 text-emerald-400" />
                <img 
                  src="/shop_location_qr.png" 
                  alt="Shop Location QR" 
                  className="w-10 h-10 rounded-lg bg-white p-0.5 object-contain shadow"
                />
              </div>
              <h3 className="text-lg font-black text-white">Hajji Mohammad Nabi Autos</h3>
              <p className="text-xs text-slate-400">Roznamcha Payment Verification Voucher</p>
              <p className="text-[10px] text-blue-400 font-medium">📍 Shop # 14, Sector 16-B, Main Godhra Stop New Karachi (Scan QR for Location)</p>
              <div className="text-[11px] text-slate-400 font-medium flex items-center justify-center gap-2 pt-0.5">
                <span>📞 <strong className="text-white">03232200325</strong> (EasyPaisa)</span>
                <span>•</span>
                <span>📞 <strong className="text-white">03030246040</strong> (JazzCash)</span>
              </div>
            </div>

            <div className="space-y-3 text-xs bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Transaction Type:</span>
                <span className={`font-bold ${selectedReceiptItem.isExpenseItem ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {selectedReceiptItem.isExpenseItem ? 'Shop Expense (Debit)' : 'Customer Payment (Credit)'}
                </span>
              </div>

              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Name / Particulars:</span>
                <span className="font-bold text-white text-right max-w-[200px] truncate">{selectedReceiptItem.titleName}</span>
              </div>

              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Amount Transacted:</span>
                <span className="font-black text-base text-amber-400">Rs. {selectedReceiptItem.amount?.toLocaleString()}</span>
              </div>

              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Payment Mode / Bank:</span>
                <span className="font-semibold text-purple-400">{selectedReceiptItem.modeTag}</span>
              </div>

              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Date & Time:</span>
                <span className="font-medium text-slate-300">
                  {selectedReceiptItem.createdAt ? new Date(selectedReceiptItem.createdAt).toLocaleString('en-PK') : 'N/A'}
                </span>
              </div>

              {selectedReceiptItem.category && (
                <div className="flex justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Category:</span>
                  <span className="font-medium text-slate-300">{selectedReceiptItem.category}</span>
                </div>
              )}

              {selectedReceiptItem.notes && (
                <div className="pt-1">
                  <span className="text-slate-400 block mb-0.5">Remarks / Notes:</span>
                  <p className="text-slate-200 italic bg-slate-900 p-2 rounded-lg text-[11px]">{selectedReceiptItem.notes}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="flex-1 bg-blue-600 hover:bg-blue-500 font-bold py-2.5 rounded-xl transition cursor-pointer text-xs flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Print Voucher
              </button>
              <button
                onClick={() => setSelectedReceiptItem(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 font-bold py-2.5 rounded-xl transition cursor-pointer text-xs"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}