import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bell, AlertCircle, Clock, Calendar, CheckCircle2, 
  Search, RefreshCw, Send, ShieldAlert, Check, 
  RotateCcw, ChevronLeft, ChevronRight, Eye, ExternalLink, MessageSquare
} from 'lucide-react';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { 
  getReadNotificationIds, 
  markNotificationRead, 
  markNotificationUnread, 
  markAllNotificationsRead, 
  markAllNotificationsUnread,
  generateNotificationId 
} from '../utils/notificationStorage';

export default function NotificationsCenter({ setActiveTab }) {
  const [data, setData] = useState({ promiseAlerts: [], todaysDueSales: [] });
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState(getReadNotificationIds());
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'unread', 'read', 'promises', 'dueToday'
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);

  const fetchAlerts = async (showToast = false) => {
    setLoading(true);
    try {
      const res = await API.get('/dashboard/overview');
      if (res.data?.success) {
        setData({
          promiseAlerts: res.data.promiseAlerts || [],
          todaysDueSales: res.data.todaysDueSales || []
        });
        if (showToast) toast.success('Notifications refreshed!');
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();

    const handleReadUpdated = () => {
      setReadIds(getReadNotificationIds());
    };
    window.addEventListener('notifications_read_updated', handleReadUpdated);
    return () => window.removeEventListener('notifications_read_updated', handleReadUpdated);
  }, []);

  // Combine and normalize all notifications
  const allNotifications = useMemo(() => {
    const list = [];
    const safeReadIds = Array.isArray(readIds) ? readIds : [];

    // 1. Promise Alerts
    (data.promiseAlerts || []).forEach((item) => {
      const notifId = generateNotificationId(item, 'promise');
      const isRead = safeReadIds.includes(notifId);
      let dateStr = 'Today';
      let sortDate = new Date();
      if (item.promiseDate) {
        try {
          const d = new Date(item.promiseDate);
          if (!isNaN(d.getTime())) {
            dateStr = d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
            sortDate = d;
          }
        } catch (e) {
          dateStr = 'Today';
        }
      }
      list.push({
        ...item,
        notifId,
        notifType: 'promise',
        isRead,
        typeLabel: item.isDueToday ? 'Promise Today' : 'Promise Expired',
        title: `${item.customerName || 'Customer'} - Payment Promise Reached`,
        amount: Number(item.monthlyAmount || 0),
        dateStr,
        sortDate
      });
    });

    // 2. Today's Due Installments
    (data.todaysDueSales || []).forEach((item) => {
      const notifId = generateNotificationId(item, 'due');
      const isRead = safeReadIds.includes(notifId);
      const custName = item.customerName || item.customer?.name || 'Customer';
      const custId = item.customerId || item.customer?.customerId || 'N/A';
      const custPhone = item.customerPhone || item.customer?.phone || '';
      list.push({
        ...item,
        notifId,
        notifType: 'dueToday',
        isRead,
        customerName: custName,
        customerId: custId,
        customerPhone: custPhone,
        typeLabel: 'Installment Due Today',
        title: `${custName} - Monthly Installment Due`,
        amount: Number(item.monthlyAmount || item.monthlyInstallment || 0),
        dateStr: 'Today',
        sortDate: new Date()
      });
    });

    // Sort: Unread first, then by date
    return list.sort((a, b) => {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      return new Date(b.sortDate) - new Date(a.sortDate);
    });
  }, [data, readIds]);

  // Metrics
  const metrics = useMemo(() => {
    let unreadCount = 0;
    let readCount = 0;
    let promiseCount = 0;
    let dueTodayCount = 0;

    allNotifications.forEach((n) => {
      if (n.isRead) readCount++;
      else unreadCount++;

      if (n.notifType === 'promise') promiseCount++;
      else if (n.notifType === 'dueToday') dueTodayCount++;
    });

    return {
      total: allNotifications.length,
      unreadCount,
      readCount,
      promiseCount,
      dueTodayCount
    };
  }, [allNotifications]);

  // Filtered List
  const filteredNotifications = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return allNotifications.filter((n) => {
      // Search match
      const matchesSearch = !term || 
        (n.customerName || '').toLowerCase().includes(term) ||
        (n.customerId || '').toLowerCase().includes(term) ||
        (n.customerPhone || '').toLowerCase().includes(term) ||
        (n.itemName || '').toLowerCase().includes(term) ||
        (n.remarks || '').toLowerCase().includes(term);

      // Category match
      let matchesCategory = true;
      if (activeFilter === 'unread') matchesCategory = !n.isRead;
      else if (activeFilter === 'read') matchesCategory = n.isRead;
      else if (activeFilter === 'promises') matchesCategory = n.notifType === 'promise';
      else if (activeFilter === 'dueToday') matchesCategory = n.notifType === 'dueToday';

      return matchesSearch && matchesCategory;
    });
  }, [allNotifications, activeFilter, searchTerm]);

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchTerm, itemsPerPage]);

  // Paginated List
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredNotifications.slice(start, start + itemsPerPage);
  }, [filteredNotifications, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredNotifications.length / itemsPerPage) || 1;

  // Toggle Single Notification Read Status
  const handleToggleRead = (item) => {
    if (item.isRead) {
      markNotificationUnread(item.notifId);
      toast.success('Marked as unread');
    } else {
      markNotificationRead(item.notifId);
      toast.success('Marked as read');
    }
  };

  // Bulk Mark All Visible/All as Read
  const handleMarkAllRead = () => {
    const ids = allNotifications.map(n => n.notifId);
    markAllNotificationsRead(ids);
    toast.success('All notifications marked as read!');
  };

  // Bulk Mark All as Unread
  const handleMarkAllUnread = () => {
    const ids = allNotifications.map(n => n.notifId);
    markAllNotificationsUnread(ids);
    toast.success('All notifications marked as unread!');
  };

  // WhatsApp Reminder
  const handleSendWhatsApp = (item) => {
    let rawPhone = (item.customerPhone || '').replace(/\D/g, '');
    if (rawPhone.startsWith('03')) {
      rawPhone = '92' + rawPhone.slice(1);
    }

    const message = item.notifType === 'promise' 
      ? `*وعدہ قسط کی یاددہانی - حاجی محمد نبی آٹوز*\n\nمحترم جناب *${item.customerName}* (${item.customerId})،\nالسلام علیکم!\n\nآپ نے *${item.itemName}* کی قسط کے سلسلے میں *${item.dateStr}* کی تاریخ کا وعدہ فرمایا تھا۔\n*ماہانہ قسط:* Rs. ${item.amount.toLocaleString()}\n\nمہربانی فرما کر اپنی قسط دکان پر جمع کروا دیں یا آن لائن بھیج دیں:\n📲 *03232200325* (ایزی پیسہ - EasyPaisa)\n📲 *03030246040* (جاز کیش - JazzCash)\n\n📍 *دکان کا پتہ:* شاپ نمبر 14، سیکٹر 16-B، مین گودھرا اسٹاپ، نیو کراچی\nشکریہ!`
      : `*آج کی قسط کی یاددہانی - حاجی محمد نبی آٹوز*\n\nمحترم جناب *${item.customerName}* (${item.customerId})،\nالسلام علیکم!\n\nآپ کی *${item.itemName}* کی ماہانہ قسط *Rs. ${item.amount.toLocaleString()}* آج واجب الادا ہے۔\n\nمہربانی فرما کر اپنی قسط دکان پر جمع کروا دیں یا آن لائن بھیج دیں:\n📲 *03232200325* (ایزی پیسہ - EasyPaisa)\n📲 *03030246040* (جاز کیش - JazzCash)\n\n📍 *دکان کا پتہ:* شاپ نمبر 14، سیکٹر 16-B، مین گودھرا اسٹاپ، نیو کراچی\nشکریہ!`;

    window.open(`https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  if (loading && allNotifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-slate-400 text-xs font-semibold">Loading Action Notifications...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white p-2 sm:p-4 max-w-7xl mx-auto">
      
      {/* PAGE HEADER */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Notifications & Action Alerts Center</h2>
              <p className="text-slate-400 text-xs mt-0.5">
                Manage payment promise date alerts, today's due installments, and mark items as read or unread.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => fetchAlerts(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>

          <button
            onClick={handleMarkAllRead}
            disabled={metrics.unreadCount === 0}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-950"
          >
            <Check className="w-3.5 h-3.5" /> Mark All as Read
          </button>

          <button
            onClick={handleMarkAllUnread}
            disabled={metrics.readCount === 0}
            className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Mark All Unread
          </button>
        </div>
      </div>

      {/* 4 SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Alerts */}
        <div 
          onClick={() => setActiveFilter('all')}
          className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition ${activeFilter === 'all' ? 'border-blue-500 bg-blue-950/20' : 'border-slate-800 hover:border-slate-700'}`}
        >
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>Total Alerts</span>
            <Bell className="w-4 h-4 text-blue-400" />
          </div>
          <h3 className="text-2xl font-black text-white mt-1">{metrics.total}</h3>
          <span className="text-[11px] text-blue-400 font-bold block mt-1">Promise + Today's Due</span>
        </div>

        {/* Unread Alerts */}
        <div 
          onClick={() => setActiveFilter('unread')}
          className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition ${activeFilter === 'unread' ? 'border-rose-500 bg-rose-950/20' : 'border-slate-800 hover:border-slate-700'}`}
        >
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>Unread Alerts</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <h3 className="text-2xl font-black text-rose-400 mt-1">{metrics.unreadCount}</h3>
          <span className="text-[11px] text-rose-400/90 font-bold block mt-1">Top bar badge active</span>
        </div>

        {/* Payment Promises Reached */}
        <div 
          onClick={() => setActiveFilter('promises')}
          className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition ${activeFilter === 'promises' ? 'border-purple-500 bg-purple-950/20' : 'border-slate-800 hover:border-slate-700'}`}
        >
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>Promises Reached</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <h3 className="text-2xl font-black text-purple-300 mt-1">{metrics.promiseCount}</h3>
          <span className="text-[11px] text-purple-400 font-bold block mt-1">Expired / Due Promises</span>
        </div>

        {/* Today's Due */}
        <div 
          onClick={() => setActiveFilter('dueToday')}
          className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition ${activeFilter === 'dueToday' ? 'border-amber-500 bg-amber-950/20' : 'border-slate-800 hover:border-slate-700'}`}
        >
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>Installments Due Today</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <h3 className="text-2xl font-black text-amber-400 mt-1">{metrics.dueTodayCount}</h3>
          <span className="text-[11px] text-amber-500/80 font-bold block mt-1">Monthly collection target</span>
        </div>

      </div>

      {/* FILTER BUTTONS & LIVE SEARCH BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${activeFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'}`}
          >
            All ({metrics.total})
          </button>
          
          <button
            onClick={() => setActiveFilter('unread')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${activeFilter === 'unread' ? 'bg-rose-600 text-white' : 'bg-slate-950 text-rose-300 hover:text-white'}`}
          >
            Unread ({metrics.unreadCount})
          </button>
          
          <button
            onClick={() => setActiveFilter('read')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${activeFilter === 'read' ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'}`}
          >
            Read ({metrics.readCount})
          </button>

          <button
            onClick={() => setActiveFilter('promises')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${activeFilter === 'promises' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-purple-300 hover:text-white'}`}
          >
            Promises ({metrics.promiseCount})
          </button>

          <button
            onClick={() => setActiveFilter('dueToday')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${activeFilter === 'dueToday' ? 'bg-amber-600 text-white' : 'bg-slate-950 text-amber-300 hover:text-white'}`}
          >
            Due Today ({metrics.dueTodayCount})
          </button>
        </div>

        {/* Live Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search Name, Phone, Remarks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
          />
        </div>

      </div>

      {/* NOTIFICATIONS LIST CONTAINER */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto opacity-70" />
            <h4 className="text-base font-bold text-white">No Matching Notifications!</h4>
            <p className="text-xs text-slate-400">All alerts are up to date or marked as read in this view.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-800/80">
              {paginatedList.map((item) => (
                <div 
                  key={item.notifId} 
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition ${
                    item.isRead 
                      ? 'bg-slate-950/40 opacity-70 hover:opacity-100' 
                      : 'bg-slate-900/90 hover:bg-slate-850 border-l-4 border-l-rose-500'
                  }`}
                >
                  
                  {/* Left: Content */}
                  <div className="space-y-1.5 max-w-2xl min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Type Badge */}
                      <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 ${
                        item.notifType === 'promise' 
                          ? 'bg-rose-950 text-rose-300 border border-rose-700/60' 
                          : 'bg-blue-950 text-blue-300 border border-blue-700/60'
                      }`}>
                        {item.notifType === 'promise' ? <Clock className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                        {item.typeLabel}
                      </span>

                      {/* Customer ID */}
                      <span className="font-mono text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                        {item.customerId}
                      </span>

                      {/* Read / Unread Status Badge */}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        item.isRead 
                          ? 'bg-slate-800 text-slate-400' 
                          : 'bg-rose-600/20 text-rose-300 border border-rose-500/40 animate-pulse'
                      }`}>
                        {item.isRead ? '✓ Read' : '● Unread'}
                      </span>
                    </div>

                    {/* Customer & Item Title */}
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h4 className="text-sm font-bold text-white">
                        {item.customerName}
                      </h4>
                      <span className="text-xs text-slate-400">
                        ({item.customerPhone || 'No Phone'}) • Item: <strong className="text-slate-200">{item.itemName}</strong>
                        {(item.registrationNumber || item.itemRegNumber || item.engineNumber) && (
                          <span className="text-slate-400 font-mono text-[11px] ml-1">
                            ({item.registrationNumber || item.itemRegNumber || item.engineNumber})
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Amount & Date */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>
                        Monthly Installment: <strong className="text-amber-400 font-bold">Rs. {item.amount.toLocaleString()}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Promised / Target Date: <strong className="text-slate-200">{item.dateStr}</strong>
                      </span>
                    </div>

                    {/* Call Remarks */}
                    {item.remarks && (
                      <p className="text-xs text-slate-300 italic bg-slate-950 p-2.5 rounded-xl border border-slate-800 max-w-xl">
                        "{item.remarks}"
                      </p>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-wrap sm:flex-col items-end gap-2 shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                    
                    {/* Toggle Read/Unread Button */}
                    <button
                      onClick={() => handleToggleRead(item)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer w-full sm:w-auto justify-center ${
                        item.isRead 
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700' 
                          : 'bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40'
                      }`}
                      title={item.isRead ? 'Mark as Unread' : 'Mark as Read'}
                    >
                      {item.isRead ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" /> Mark Unread
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" /> Mark Read
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {/* WhatsApp Reminder */}
                      <button
                        onClick={() => handleSendWhatsApp(item)}
                        className="bg-green-700 hover:bg-green-600 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 transition cursor-pointer shadow-md shadow-green-950 flex-1 sm:flex-none justify-center"
                      >
                        <Send className="w-3.5 h-3.5" /> WhatsApp
                      </button>

                      {/* Go to Recovery Center */}
                      {setActiveTab && (
                        <button
                          onClick={() => setActiveTab('recovery')}
                          className="bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex-1 sm:flex-none justify-center"
                        >
                          Recovery Center →
                        </button>
                      )}
                    </div>

                  </div>

                </div>
              ))}
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
                  <option value={5}>5</option>
                  <option value={8}>8</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                </select>
                <span>Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredNotifications.length)} to {Math.min(currentPage * itemsPerPage, filteredNotifications.length)} of {filteredNotifications.length} Entries</span>
              </div>

              {/* Prev / Next Page Buttons */}
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="font-bold text-slate-300 px-2">
                  Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong>
                </span>

                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          </>
        )}
      </div>

    </div>
  );
}
