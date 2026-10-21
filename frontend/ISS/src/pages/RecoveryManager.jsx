import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldAlert, AlertTriangle, Clock, Search, Send, 
  RefreshCw, Phone, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight,
  MessageSquare, Calendar, Handshake, BellRing, Filter, DollarSign, ListFilter
} from 'lucide-react';
import ViewDetailsModal from '../components/ViewDetailsModal';
import RecoveryFollowUpModal from '../components/RecoveryFollowUpModal';
import PayKistModal from '../components/PayKistModal';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { calculateInstallmentPlan } from '../utils/installmentSchedule';
import { getFileUrl, getCustomerInitials } from '../utils/fileUtils';

// Module-level cache for Instant Switching without re-fetching API
let memorySalesCache = null;
try {
  const cached = sessionStorage.getItem('iss_recovery_sales');
  if (cached) memorySalesCache = JSON.parse(cached);
} catch (e) {}

export default function RecoveryManager() {
  const [salesList, setSalesList] = useState(memorySalesCache || []);
  const [loading, setLoading] = useState(!memorySalesCache);
  const [fetchError, setFetchError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Category Tabs: 'all', 'overdue', 'critical', 'defaulters', 'promised', 'expired'
  const [filterCategory, setFilterCategory] = useState('all'); 
  
  // Pending Kists Filter: 'ALL', '1', '2', '3', '4_PLUS'
  const [pendingInstallmentsFilter, setPendingInstallmentsFilter] = useState('ALL');

  const [selectedSaleForView, setSelectedSaleForView] = useState(null);
  const [selectedSaleForFollowUp, setSelectedSaleForFollowUp] = useState(null);
  const [selectedSaleForPayment, setSelectedSaleForPayment] = useState(null);

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // High Performance Fetch with Stale-While-Revalidate (Instant Display)
  const fetchSales = async (forceRefresh = false) => {
    // If not forcing refresh and we have cache, display it immediately in 0ms!
    if (!forceRefresh && memorySalesCache && memorySalesCache.length > 0) {
      setSalesList(memorySalesCache);
      setLoading(false);
    } else if (!memorySalesCache) {
      setLoading(true);
    }

    setFetchError('');
    try {
      const res = await API.get('/installments/sales');
      const salesData = res.data?.sales || (Array.isArray(res.data) ? res.data : []);
      
      memorySalesCache = salesData; // Save in memory cache
      try {
        sessionStorage.setItem('iss_recovery_sales', JSON.stringify(salesData));
      } catch (e) {}
      setSalesList(salesData);
    } catch (err) {
      console.error('Failed to fetch sales for recovery:', err);
      const errMsg = err.response?.data?.message || err.message || 'Failed to load recovery data';
      if (!memorySalesCache || memorySalesCache.length === 0) {
        setFetchError(errMsg);
        toast.error(errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  // Process and Filter Overdue Accounts with accurate month-by-month calculation
  const processedData = useMemo(() => {
    if (!salesList || salesList.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdues = [];

    for (let i = 0; i < salesList.length; i++) {
      const sale = salesList[i];
      if (sale.status === 'completed' || sale.remainingBalance <= 0) continue;

      // 1. Calculate sequential plan & missed installments count
      const plan = calculateInstallmentPlan(sale);
      const missedCount = plan?.missedInstallmentsCount || 0;
      const missedMonths = plan?.missedMonths || [];
      const totalMissedAmount = plan?.totalMissedAmount || 0;
      const oldestPendingMonth = plan?.oldestPendingMonth || null;

      const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
      const dueDay = sale.dueDateDay || saleDate.getDate();

      let nextDue;
      if (sale.nextDueDate) {
        nextDue = new Date(sale.nextDueDate);
      } else {
        const nextDueMonth = saleDate.getMonth() + 1;
        const nextDueYear = saleDate.getFullYear();
        nextDue = new Date(nextDueYear, nextDueMonth, dueDay);
      }

      nextDue.setHours(0, 0, 0, 0);

      const diffTime = today.getTime() - nextDue.getTime();
      const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      // SMART PROMISE DATE EVALUATION
      let isPromiseActive = false;
      let isPromiseExpired = false;
      let promiseDateStr = null;

      if (sale.promiseDate) {
        const pDate = new Date(sale.promiseDate);
        pDate.setHours(0, 0, 0, 0);
        promiseDateStr = pDate.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
        
        if (pDate > today) {
          isPromiseActive = true;
        } else {
          isPromiseExpired = true;
        }
      }

      // Process if missedCount > 0 OR daysOverdue > 0 OR currently tracked by promise
      if (missedCount > 0 || daysOverdue > 0 || isPromiseActive || isPromiseExpired) {
        let category = 'overdue';

        if (isPromiseActive) {
          category = 'promised';
        } else if (daysOverdue > 30 || missedCount >= 2) {
          category = 'defaulters';
        } else if (daysOverdue > 15 || missedCount === 1) {
          category = 'critical';
        }

        const customerObj = typeof sale.customer === 'object' ? sale.customer : {};
        const customerName = customerObj.name || customerObj.fullName || sale.customerName || 'Customer';
        const customerId = customerObj.customerId || sale.customerId || 'N/A';
        const customerPhone = customerObj.phone || sale.customerPhone || '';
        const itemName = sale.itemName || '';

        overdues.push({
          ...sale,
          plan,
          missedCount,
          missedMonths,
          totalMissedAmount: totalMissedAmount > 0 ? totalMissedAmount : (sale.monthlyAmount || 0),
          oldestPendingMonth,
          daysOverdue: Math.max(0, daysOverdue),
          category,
          isPromiseActive,
          isPromiseExpired,
          promiseDateStr,
          followUps: sale.followUps || [],
          remarks: sale.remarks || '',
          dueDateStr: nextDue.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }),
          customerName,
          customerId,
          customerPhone,
          customerProfilePic: sale.profilePic || customerObj.profilePic || '',
          guarantorName: sale.guarantorName || customerObj.guarantorName || 'N/A',
          guarantorPhone: sale.guarantorPhone || customerObj.guarantorPhone || 'N/A',
          searchString: `${customerName} ${customerId} ${customerPhone} ${itemName} ${sale.registrationNumber || ''} ${sale.itemRegNumber || ''} ${sale.engineNumber || ''} ${sale.chassisNumber || ''} ${sale.remarks || ''}`.toLowerCase()
        });
      }
    }

    return overdues.sort((a, b) => b.missedCount - a.missedCount || b.daysOverdue - a.daysOverdue);
  }, [salesList]);

  // Category Counters & Metrics
  const metrics = useMemo(() => {
    let overdueCount = 0;
    let criticalCount = 0;
    let defaulterCount = 0;
    let promisedCount = 0;
    let promiseExpiredCount = 0;
    let totalActionableAmount = 0;

    let oneMissed = 0;
    let twoMissed = 0;
    let threeMissed = 0;
    let fourPlusMissed = 0;

    for (let i = 0; i < processedData.length; i++) {
      const item = processedData[i];
      if (item.isPromiseActive) {
        promisedCount++;
      } else {
        if (item.category === 'overdue') overdueCount++;
        else if (item.category === 'critical') criticalCount++;
        else if (item.category === 'defaulters') defaulterCount++;
        
        totalActionableAmount += (item.monthlyAmount || 0);
      }

      if (item.isPromiseExpired) {
        promiseExpiredCount++;
      }

      if (item.missedCount === 1) oneMissed++;
      else if (item.missedCount === 2) twoMissed++;
      else if (item.missedCount === 3) threeMissed++;
      else if (item.missedCount >= 4) fourPlusMissed++;
    }

    const activeOverdueCount = overdueCount + criticalCount + defaulterCount;

    return { 
      activeOverdueCount, 
      overdueCount, 
      criticalCount, 
      defaulterCount, 
      promisedCount, 
      promiseExpiredCount,
      totalAmount: totalActionableAmount, 
      totalCount: processedData.length,
      oneMissed,
      twoMissed,
      threeMissed,
      fourPlusMissed
    };
  }, [processedData]);

  // Filtered List based on Search, Category Tab, and Missed Kists Filter
  const filteredList = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return processedData.filter(item => {
      const matchesSearch = !term || item.searchString.includes(term);
      let matchesCat = false;
      
      if (filterCategory === 'all') {
        matchesCat = item.category !== 'promised';
      } else if (filterCategory === 'promised') {
        matchesCat = item.isPromiseActive;
      } else if (filterCategory === 'expired') {
        matchesCat = item.isPromiseExpired;
      } else {
        matchesCat = item.category === filterCategory;
      }

      let matchesPending = true;
      if (pendingInstallmentsFilter === '1') {
        matchesPending = item.missedCount === 1;
      } else if (pendingInstallmentsFilter === '2') {
        matchesPending = item.missedCount === 2;
      } else if (pendingInstallmentsFilter === '3') {
        matchesPending = item.missedCount === 3;
      } else if (pendingInstallmentsFilter === '4_PLUS') {
        matchesPending = item.missedCount >= 4;
      }

      return matchesSearch && matchesCat && matchesPending;
    });
  }, [processedData, searchTerm, filterCategory, pendingInstallmentsFilter]);

  // Reset Page to 1 when Filters or Search Change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategory, pendingInstallmentsFilter, itemsPerPage]);

  // Paginated Sliced Data
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredList.slice(start, start + itemsPerPage);
  }, [filteredList, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredList.length / itemsPerPage) || 1;

  // 1-Click WhatsApp Reminder Sender
  const handleSendWhatsAppReminder = (item) => {
    let rawPhone = item.customerPhone?.replace(/\D/g, '') || '';
    if (rawPhone.startsWith('03')) {
      rawPhone = '92' + rawPhone.slice(1);
    }

    const missedDetailStr = item.missedMonths?.length > 0 
      ? `\n*Missing Installments:* ${item.missedMonths.map(m => m.monthKey + (m.status === 'SHORT' ? ` (Rs. ${m.remainingAmount} Baqi)` : '')).join(', ')}`
      : '';

    const message = 
      `*PAYMENT REMINDER - HAJJI MOHAMMAD NABI AUTOS*\n\n` +
      `Dear *${item.customerName}* (${item.customerId}),\n\n` +
      `Aap ki *${item.itemName}* ki monthly installment overdue ho chuki hai.${missedDetailStr}\n` +
      `*Total Overdue Amount:* Rs. ${item.totalMissedAmount.toLocaleString()}\n` +
      `*Monthly Target:* Rs. ${item.monthlyAmount?.toLocaleString()}\n` +
      `*Remaining Total Balance:* Rs. ${item.remainingBalance?.toLocaleString()}\n\n` +
      `Meharbani karke foran dukan par tashreef layein ya online send karein:\n` +
      `📲 *03232200325* (EasyPaisa)\n` +
      `📲 *03030246040* (JazzCash)\n\n` +
      `*Shop Address:* Shop # 14, Sector 16-B, Main Godhra Stop New Karachi\n` +
      `Shukriya!`;

    window.open(`https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // Follow-up save callback
  const handleFollowUpSaved = (updatedSale) => {
    const updated = salesList.map(s => s._id === updatedSale._id ? { ...s, ...updatedSale } : s);
    setSalesList(updated);
    memorySalesCache = updated;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-slate-400 text-xs font-semibold">Loading Installments and Recovery Data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white p-2 sm:p-4 max-w-7xl mx-auto">
      
      {/* PAGE HEADER */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
            <h2 className="text-xl font-bold text-white">Recovery & Missed Installments Manager</h2>
          </div>
          <p className="text-slate-400 text-xs mt-1">
            2, 3 ya zyada missing installments wale customers ko filter karein, oldest kist wasool karein aur WhatsApp alerts bhejein.
          </p>
        </div>

        <button
          onClick={() => fetchSales(true)}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Refresh Data
        </button>
      </div>

      {fetchError && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span><strong>API Connection Error:</strong> {fetchError}</span>
        </div>
      )}

      {/* METRIC STATS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* Total Actionable */}
        <div 
          onClick={() => { setFilterCategory('all'); setPendingInstallmentsFilter('ALL'); }}
          className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition ${filterCategory === 'all' && pendingInstallmentsFilter === 'ALL' ? 'border-blue-500 bg-blue-950/20' : 'border-slate-800 hover:border-slate-700'}`}
        >
          <div className="flex justify-between items-center">
            <p className="text-slate-400 text-xs font-medium">Actionable Overdues</p>
            <BellRing className="w-4 h-4 text-blue-400" />
          </div>
          <h4 className="text-2xl font-black text-white mt-1">{metrics.activeOverdueCount} Accounts</h4>
          <span className="text-[11px] text-blue-400 font-bold mt-1 block">Rs. {metrics.totalAmount.toLocaleString()} Overdue</span>
        </div>

        {/* 1 Installment Missed */}
        <div 
          onClick={() => setPendingInstallmentsFilter('1')}
          className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition ${pendingInstallmentsFilter === '1' ? 'border-amber-500 bg-amber-950/25 shadow-lg shadow-amber-950/30' : 'border-slate-800 hover:border-slate-700'}`}
        >
          <div className="flex justify-between items-center">
            <p className="text-slate-400 text-xs font-medium">1 Kist Missed</p>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <h4 className="text-2xl font-black text-amber-400 mt-1">{metrics.oneMissed} Cases</h4>
          <span className="text-[10px] text-amber-500/80">Standard Overdue Warning</span>
        </div>

        {/* 2 Installments Missed */}
        <div 
          onClick={() => setPendingInstallmentsFilter('2')}
          className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition ${pendingInstallmentsFilter === '2' ? 'border-orange-500 bg-orange-950/25 shadow-lg shadow-orange-950/30' : 'border-slate-800 hover:border-slate-700'}`}
        >
          <div className="flex justify-between items-center">
            <p className="text-slate-400 text-xs font-medium">2 Kists Missed</p>
            <AlertTriangle className="w-4 h-4 text-orange-400" />
          </div>
          <h4 className="text-2xl font-black text-orange-400 mt-1">{metrics.twoMissed} Cases</h4>
          <span className="text-[10px] text-orange-400 font-semibold">Immediate Follow-up</span>
        </div>

        {/* 3 Installments Missed */}
        <div 
          onClick={() => setPendingInstallmentsFilter('3')}
          className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition ${pendingInstallmentsFilter === '3' ? 'border-rose-500 bg-rose-950/25 shadow-lg shadow-rose-950/30' : 'border-slate-800 hover:border-slate-700'}`}
        >
          <div className="flex justify-between items-center">
            <p className="text-slate-400 text-xs font-medium">3 Kists Missed</p>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <h4 className="text-2xl font-black text-rose-500 mt-1">{metrics.threeMissed} Defaulters</h4>
          <span className="text-[10px] text-rose-400 font-bold">Guarantor Call Needed</span>
        </div>

        {/* 4+ Installments Missed */}
        <div 
          onClick={() => setPendingInstallmentsFilter('4_PLUS')}
          className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition ${pendingInstallmentsFilter === '4_PLUS' ? 'border-red-600 bg-red-950/30 shadow-lg shadow-red-950/40' : 'border-slate-800 hover:border-slate-700'}`}
        >
          <div className="flex justify-between items-center">
            <p className="text-slate-400 text-xs font-medium">4+ Kists Missed</p>
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </div>
          <h4 className="text-2xl font-black text-red-400 mt-1">{metrics.fourPlusMissed} Critical</h4>
          <span className="text-[10px] text-red-300 font-bold">Severe Default Action</span>
        </div>

      </div>

      {/* FILTER & SEARCH PANEL */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5 shadow-lg">
        
        {/* Row 1: Delay Status Tabs & Live Search */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${filterCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'}`}
            >
              All Overdues ({metrics.activeOverdueCount})
            </button>
            
            <button
              onClick={() => setFilterCategory('overdue')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${filterCategory === 'overdue' ? 'bg-amber-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'}`}
            >
              1-15D Late ({metrics.overdueCount})
            </button>
            
            <button
              onClick={() => setFilterCategory('critical')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${filterCategory === 'critical' ? 'bg-orange-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'}`}
            >
              16-30D Late ({metrics.criticalCount})
            </button>
            
            <button
              onClick={() => setFilterCategory('defaulters')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${filterCategory === 'defaulters' ? 'bg-rose-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'}`}
            >
              30D+ Defaulters ({metrics.defaulterCount})
            </button>

            <button
              onClick={() => setFilterCategory('promised')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${filterCategory === 'promised' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-purple-300 hover:text-white'}`}
            >
              🤝 On Hold ({metrics.promisedCount})
            </button>

            {metrics.promiseExpiredCount > 0 && (
              <button
                onClick={() => setFilterCategory('expired')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${filterCategory === 'expired' ? 'bg-red-700 text-white' : 'bg-red-950/60 text-red-300 border border-red-800 hover:text-white'}`}
              >
                🚨 Promise Expired ({metrics.promiseExpiredCount})
              </button>
            )}
          </div>

          {/* Live Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search Name, Phone, Item, Eng/Reg..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-rose-500 font-medium"
            />
          </div>
        </div>

        {/* Row 2: Dedicated Pending Installments Filter (1, 2, 3, 4+ Kists Missed) */}
        <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-800/80">
          <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 mr-1">
            <ListFilter className="w-3.5 h-3.5" /> Pending Kist Filter:
          </span>

          <button
            onClick={() => setPendingInstallmentsFilter('ALL')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${pendingInstallmentsFilter === 'ALL' ? 'bg-amber-500 text-slate-950 font-black shadow-md' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'}`}
          >
            All Pending ({processedData.length})
          </button>

          <button
            onClick={() => setPendingInstallmentsFilter('1')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${pendingInstallmentsFilter === '1' ? 'bg-amber-500 text-slate-950 font-black shadow-md' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'}`}
          >
            1 Kist Missed ({metrics.oneMissed})
          </button>

          <button
            onClick={() => setPendingInstallmentsFilter('2')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${pendingInstallmentsFilter === '2' ? 'bg-orange-500 text-white font-black shadow-md' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'}`}
          >
            2 Kists Missed ({metrics.twoMissed})
          </button>

          <button
            onClick={() => setPendingInstallmentsFilter('3')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${pendingInstallmentsFilter === '3' ? 'bg-rose-600 text-white font-black shadow-md' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'}`}
          >
            3 Kists Missed ({metrics.threeMissed})
          </button>

          <button
            onClick={() => setPendingInstallmentsFilter('4_PLUS')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${pendingInstallmentsFilter === '4_PLUS' ? 'bg-red-600 text-white font-black shadow-md' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'}`}
          >
            4+ Kists Missed ({metrics.fourPlusMissed})
          </button>
        </div>

      </div>

      {/* RECOVERY TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {filteredList.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h4 className="text-base font-bold text-white">No Matching Accounts Found!</h4>
            <p className="text-xs text-slate-400">All customer accounts in this filter view are up-to-date or on hold.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase font-semibold">
                    <th className="p-3.5">Customer Details</th>
                    <th className="p-3.5">Guarantor Info</th>
                    <th className="p-3.5">Item & Missed Kists</th>
                    <th className="p-3.5">Monthly Target</th>
                    <th className="p-3.5">Overdue Status & Remarks</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {paginatedList.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-800/40 transition">
                      
                      {/* Customer Info */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center shadow-xs relative">
                            {item.customerProfilePic ? (
                              <>
                                <img 
                                  src={getFileUrl(item.customerProfilePic)} 
                                  alt={item.customerName} 
                                  className="w-full h-full object-cover rounded-xl"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    const fb = e.currentTarget.parentElement?.querySelector('.avatar-fallback');
                                    if (fb) fb.style.display = 'flex';
                                  }}
                                />
                                <span className="avatar-fallback text-[11px] font-bold text-blue-400 hidden items-center justify-center w-full h-full">
                                  {getCustomerInitials(item.customerName)}
                                </span>
                              </>
                            ) : (
                              <span className="text-[11px] font-bold text-blue-400">
                                {getCustomerInitials(item.customerName)}
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="font-mono text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 inline-block mb-0.5">
                              {item.customerId}
                            </span>
                            <strong className="block text-white font-bold text-xs">{item.customerName}</strong>
                            <span className="text-slate-400 text-[10px] flex items-center gap-1 mt-0.5">
                              <Phone className="w-2.5 h-2.5 text-slate-500" /> {item.customerPhone || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Guarantor Info */}
                      <td className="p-3.5">
                        <strong className="block text-slate-200 font-semibold">{item.guarantorName}</strong>
                        <span className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-purple-400" /> {item.guarantorPhone}
                        </span>
                      </td>

                      {/* Item & Missed Kists Details */}
                      <td className="p-3.5 max-w-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-white font-bold text-sm tracking-tight">{item.itemName}</strong>
                          {(item.registrationNumber || item.itemRegNumber) && (
                            <span className="bg-sky-500/10 border border-sky-500/30 text-sky-400 px-2 py-0.5 rounded text-[10px] font-mono font-semibold">
                              Reg: {item.registrationNumber || item.itemRegNumber}
                            </span>
                          )}
                        </div>
                        
                        {(item.engineNumber || item.chassisNumber) && (
                          <div className="flex flex-wrap gap-1.5 text-[10px] mt-1 font-mono">
                            {item.engineNumber && (
                              <span className="text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                                Eng: <span className="text-slate-300">{item.engineNumber}</span>
                              </span>
                            )}
                            {item.chassisNumber && (
                              <span className="text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                                Chas: <span className="text-slate-300">{item.chassisNumber}</span>
                              </span>
                            )}
                          </div>
                        )}

                        {/* Missed Kist Badge & Breakdown Cardlet */}
                        {item.missedCount > 0 ? (
                          <div className="mt-2 p-2 rounded-lg bg-slate-900/90 border border-slate-800/90 shadow-sm space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                                item.missedCount === 1
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  : item.missedCount === 2
                                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/35'
                                  : item.missedCount === 3
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : 'bg-red-500/25 text-red-200 border border-red-500/50 animate-pulse'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  item.missedCount === 1 ? 'bg-amber-400' : item.missedCount === 2 ? 'bg-orange-400' : 'bg-red-400'
                                }`} />
                                {item.missedCount} Kist {item.missedCount > 1 ? 'Missed' : 'Missed'}
                              </span>

                              <div className="text-right">
                                <span className="text-[11px] font-extrabold text-amber-400 font-mono">
                                  Rs. {item.totalMissedAmount.toLocaleString()}
                                </span>
                                <span className="text-[9px] text-slate-400 block -mt-0.5">Baqi Kist</span>
                              </div>
                            </div>

                            {/* Clean Chips for Missed Months */}
                            {item.missedMonths?.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-800/80">
                                {item.missedMonths.map((m, idx) => (
                                  <span 
                                    key={idx} 
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                                      m.status === 'SHORT'
                                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-semibold'
                                        : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                                    }`}
                                  >
                                    {m.monthKey} {m.status === 'SHORT' ? `(Rs. ${m.remainingAmount.toLocaleString()} Baqi)` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-1.5 text-[11px] text-slate-400">
                            Baqi Balance: <span className="text-emerald-400 font-semibold">Rs. {item.remainingBalance?.toLocaleString()}</span>
                          </div>
                        )}
                      </td>

                      {/* Monthly Target */}
                      <td className="p-3.5">
                        <span className="font-bold text-blue-400 text-sm block">
                          Rs. {item.monthlyAmount?.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Due: {item.dueDateStr}
                        </span>
                      </td>

                      {/* Overdue Status & Remarks History */}
                      <td className="p-3.5 max-w-xs">
                        <div className="space-y-1.5">
                          
                          {/* Promise Active (On Hold) */}
                          {item.isPromiseActive && (
                            <span className="bg-purple-950 text-purple-300 border border-purple-600 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase inline-flex items-center gap-1 shadow-sm">
                              <Handshake className="w-3.5 h-3.5 text-purple-400" /> Promised: {item.promiseDateStr} (On Hold)
                            </span>
                          )}

                          {/* Promise Expired (Action Pending) */}
                          {item.isPromiseExpired && (
                            <span className="bg-rose-950 text-rose-300 border border-rose-600 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase inline-flex items-center gap-1 animate-pulse">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Promise Expired ({item.promiseDateStr})!
                            </span>
                          )}

                          {/* Standard Overdue Badges */}
                          {!item.isPromiseActive && (
                            <div>
                              {item.category === 'defaulters' && (
                                <span className="bg-rose-950 text-rose-300 border border-rose-600 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase inline-flex items-center gap-1">
                                  <ShieldAlert className="w-3 h-3 text-rose-400" /> {item.daysOverdue} Days Late (Defaulter)
                                </span>
                              )}
                              {item.category === 'critical' && (
                                <span className="bg-orange-950 text-orange-300 border border-orange-600 px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase inline-flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-orange-400" /> {item.daysOverdue} Days Late
                                </span>
                              )}
                              {item.category === 'overdue' && (
                                <span className="bg-amber-950 text-amber-300 border border-amber-600 px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-amber-400" /> {item.daysOverdue} Days Late
                                </span>
                              )}
                            </div>
                          )}

                          {/* Latest Remarks & Follow-up History */}
                          <div className="text-[11px] text-slate-300 italic line-clamp-2 bg-slate-950/80 p-1.5 rounded-lg border border-slate-800/80">
                            {item.remarks ? (
                              <span>"{item.remarks}"</span>
                            ) : (
                              <span className="text-slate-500">No remarks logged yet.</span>
                            )}
                            {item.followUps?.length > 0 && (
                              <span className="text-purple-400 font-semibold block text-[10px] not-italic mt-0.5">
                                • {item.followUps.length} Call(s) logged
                              </span>
                            )}
                          </div>

                        </div>
                      </td>

                      {/* Action Column */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          
                          {/* Wasool (Receive Payment) Button */}
                          <button
                            onClick={() => setSelectedSaleForPayment(item)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1 transition cursor-pointer shadow-md shadow-emerald-950"
                            title="Kist Wasool Karein (Pay Installment)"
                          >
                            <DollarSign className="w-3.5 h-3.5" /> Wasool
                          </button>

                          {/* Remarks / Follow-up Button */}
                          <button
                            onClick={() => setSelectedSaleForFollowUp(item)}
                            className="bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/40 px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-sm"
                            title="Add Call Remarks & Set Promise Date"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                            Remarks {item.followUps?.length > 0 ? `(${item.followUps.length})` : ''}
                          </button>

                          {/* WhatsApp Reminder */}
                          <button
                            onClick={() => handleSendWhatsAppReminder(item)}
                            className="bg-green-700 hover:bg-green-600 text-white font-bold px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1 transition cursor-pointer shadow-md shadow-green-950"
                            title="Send WhatsApp Reminder"
                          >
                            <Send className="w-3 h-3" /> WhatsApp
                          </button>

                          {/* View Khata */}
                          <button
                            onClick={() => setSelectedSaleForView(item)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer"
                            title="View Full Khata Details"
                          >
                            Khata
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* PAGINATION CONTROLS BAR */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs">
              
              {/* Rows Per Page Dropdown */}
              <div className="flex items-center gap-2 text-slate-400">
                <span>Per Page:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-800 text-white font-bold rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={40}>40</option>
                  <option value={50}>50</option>
                </select>
                <span>Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredList.length)} to {Math.min(currentPage * itemsPerPage, filteredList.length)} of {filteredList.length} Entries</span>
              </div>

              {/* Prev / Next Page Buttons */}
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-semibold text-slate-300 px-2">Page {currentPage} of {totalPages}</span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          </>
        )}
      </div>

      {/* PAY KIST MODAL */}
      {selectedSaleForPayment && (
        <PayKistModal
          selectedSale={selectedSaleForPayment}
          onClose={() => setSelectedSaleForPayment(null)}
          onSuccess={() => {
            fetchSales(true);
          }}
        />
      )}

      {/* REMARKS & FOLLOW-UP FORM MODAL */}
      {selectedSaleForFollowUp && (
        <RecoveryFollowUpModal
          sale={selectedSaleForFollowUp}
          onClose={() => setSelectedSaleForFollowUp(null)}
          onSaved={handleFollowUpSaved}
        />
      )}

      {/* VIEW KHATA DETAILS MODAL */}
      {selectedSaleForView && (
        <ViewDetailsModal
          selectedSale={selectedSaleForView}
          onClose={() => setSelectedSaleForView(null)}
          onRefresh={() => fetchSales(true)}
        />
      )}

    </div>
  );
}