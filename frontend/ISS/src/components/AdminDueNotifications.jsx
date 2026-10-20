import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bell, AlertCircle, Clock, Calendar, Check, RotateCcw, 
  ChevronLeft, ChevronRight, CheckCircle2, ExternalLink
} from 'lucide-react';
import API from '../api/axios';
import { 
  getReadNotificationIds, 
  markNotificationRead, 
  markNotificationUnread, 
  markAllNotificationsRead, 
  generateNotificationId 
} from '../utils/notificationStorage';

export default function AdminDueNotifications({ onNavigateRecovery, onNavigateAll }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('promises'); // 'promises' | 'dueToday'
  const [data, setData] = useState({ promiseAlerts: [], todaysDueSales: [] });
  const [readIds, setReadIds] = useState(getReadNotificationIds());
  const [dropdownPage, setDropdownPage] = useState(1);
  const ITEMS_PER_PAGE = 3; // Strict 3 items per page inside dropdown

  const fetchAlerts = async () => {
    try {
      const res = await API.get('/dashboard/overview');
      if (res.data?.success) {
        setData({
          promiseAlerts: res.data.promiseAlerts || [],
          todaysDueSales: res.data.todaysDueSales || []
        });
      }
    } catch (err) {
      console.error('Failed to fetch navbar alerts:', err);
    }
  };

  useEffect(() => {
    fetchAlerts();

    const handleReadSync = () => {
      setReadIds(getReadNotificationIds());
    };
    window.addEventListener('notifications_read_updated', handleReadSync);
    const interval = setInterval(fetchAlerts, 60000);

    return () => {
      window.removeEventListener('notifications_read_updated', handleReadSync);
      clearInterval(interval);
    };
  }, []);

  // Reset dropdown page when tab changes
  useEffect(() => {
    setDropdownPage(1);
  }, [activeTab]);

  // Process Promise Alerts with read status
  const processedPromises = useMemo(() => {
    const safeReadIds = Array.isArray(readIds) ? readIds : [];
    return (data.promiseAlerts || []).map((item) => {
      const notifId = generateNotificationId(item, 'promise');
      let dateStr = 'Today';
      if (item.promiseDate) {
        try {
          const d = new Date(item.promiseDate);
          if (!isNaN(d.getTime())) {
            dateStr = d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
          }
        } catch (e) {
          dateStr = 'Today';
        }
      }
      return {
        ...item,
        notifId,
        notifType: 'promise',
        isRead: safeReadIds.includes(notifId),
        dateStr
      };
    });
  }, [data.promiseAlerts, readIds]);

  // Process Due Today with read status
  const processedDueToday = useMemo(() => {
    const safeReadIds = Array.isArray(readIds) ? readIds : [];
    return (data.todaysDueSales || []).map((item) => {
      const notifId = generateNotificationId(item, 'due');
      const custName = item.customerName || item.customer?.name || 'Customer';
      const custId = item.customerId || item.customer?.customerId || 'N/A';
      return {
        ...item,
        notifId,
        notifType: 'dueToday',
        customerName: custName,
        customerId: custId,
        isRead: safeReadIds.includes(notifId),
        amount: Number(item.monthlyAmount || item.monthlyInstallment || 0)
      };
    });
  }, [data.todaysDueSales, readIds]);

  // Active items based on selected tab
  const activeList = activeTab === 'promises' ? processedPromises : processedDueToday;

  // Unread counts (Only unread items increment the top bar badge count!)
  const unreadPromises = processedPromises.filter(p => !p.isRead).length;
  const unreadDueToday = processedDueToday.filter(d => !d.isRead).length;
  const totalUnreadCount = unreadPromises + unreadDueToday;

  // Paginated 3 items for dropdown
  const totalPages = Math.ceil(activeList.length / ITEMS_PER_PAGE) || 1;
  const paginatedDropdownItems = activeList.slice(
    (dropdownPage - 1) * ITEMS_PER_PAGE, 
    dropdownPage * ITEMS_PER_PAGE
  );

  // Toggle single item
  const handleToggleItem = (item) => {
    if (item.isRead) {
      markNotificationUnread(item.notifId);
    } else {
      markNotificationRead(item.notifId);
    }
  };

  // Mark all active tab as read
  const handleMarkAllTabRead = () => {
    const ids = activeList.map(item => item.notifId);
    markAllNotificationsRead(ids);
  };

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 hover:text-white transition cursor-pointer flex items-center justify-center"
        title="Admin Notifications"
      >
        <Bell className="w-5 h-5" />
        
        {/* Unread Count Badge: When 0, completely disappears */}
        {totalUnreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white font-black text-[10px] min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center animate-pulse border-2 border-slate-950 shadow-md">
            {totalUnreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown Modal */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-84 sm:w-[420px] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl z-50 p-4 space-y-3 text-white animate-in fade-in duration-150">
          
          {/* Header */}
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-rose-500/20 text-rose-400">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Daily Admin Action Alerts</h4>
                <p className="text-[10px] text-slate-400">
                  {totalUnreadCount > 0 ? (
                    <span className="text-rose-400 font-bold">{totalUnreadCount} Unread alerts pending</span>
                  ) : (
                    <span className="text-emerald-400 font-bold">All alerts are read!</span>
                  )}
                </p>
              </div>
            </div>

            {/* Quick Mark All Read */}
            {activeList.some(item => !item.isRead) && (
              <button
                onClick={handleMarkAllTabRead}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 bg-emerald-950/60 border border-emerald-800/60 px-2 py-1 rounded-lg transition cursor-pointer"
              >
                <Check className="w-3 h-3" /> Mark Read
              </button>
            )}
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('promises')}
              className={`flex-1 py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                activeTab === 'promises' 
                  ? 'bg-purple-600 text-white shadow' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> Promises ({processedPromises.length})
              {unreadPromises > 0 && (
                <span className="ml-1 bg-rose-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-black">
                  {unreadPromises}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('dueToday')}
              className={`flex-1 py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                activeTab === 'dueToday' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Due Today ({processedDueToday.length})
              {unreadDueToday > 0 && (
                <span className="ml-1 bg-rose-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-black">
                  {unreadDueToday}
                </span>
              )}
            </button>
          </div>

          {/* List Content (Strictly 3 items per view) */}
          <div className="space-y-2 text-xs">
            {activeList.length === 0 ? (
              <div className="text-center py-8 text-slate-500 space-y-1">
                <CheckCircle2 className="w-8 h-8 text-emerald-500/50 mx-auto mb-1" />
                <p className="font-medium text-slate-400">No active alerts!</p>
                <p className="text-[10px]">Everything is up-to-date.</p>
              </div>
            ) : (
              paginatedDropdownItems.map((item) => (
                <div 
                  key={item.notifId}
                  className={`p-3 rounded-2xl border transition space-y-1.5 ${
                    item.isRead
                      ? 'bg-slate-950/40 border-slate-800/80 opacity-70'
                      : activeTab === 'promises'
                      ? 'bg-rose-950/25 border-rose-800/50 border-l-4 border-l-rose-500'
                      : 'bg-blue-950/25 border-blue-800/50 border-l-4 border-l-blue-500'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <strong className="block text-white font-bold text-xs truncate">
                        {item.customerName} <span className="font-mono text-[10px] text-blue-400 font-normal">({item.customerId})</span>
                      </strong>
                      <span className="text-[11px] text-slate-300">
                        {item.itemName}
                        {(item.registrationNumber || item.itemRegNumber || item.engineNumber) && (
                          <span className="text-slate-400 font-mono text-[10px] ml-1">
                            ({item.registrationNumber || item.itemRegNumber || item.engineNumber})
                          </span>
                        )}
                        {' '}• Kist: <strong className="text-amber-400">Rs. {Number(item.amount || item.monthlyAmount || 0).toLocaleString()}</strong>
                      </span>
                    </div>

                    {/* Mark Read/Unread Pill Button */}
                    <button
                      onClick={() => handleToggleItem(item)}
                      className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer ${
                        item.isRead
                          ? 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                          : 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600 hover:text-white'
                      }`}
                      title={item.isRead ? 'Mark as Unread' : 'Mark as Read'}
                    >
                      {item.isRead ? (
                        <>
                          <RotateCcw className="w-2.5 h-2.5" /> Unread
                        </>
                      ) : (
                        <>
                          <Check className="w-2.5 h-2.5" /> Read
                        </>
                      )}
                    </button>
                  </div>

                  {/* Promise Date / Due Date */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      Target: <strong className="text-slate-200">{item.dateStr || 'Today'}</strong>
                    </span>
                    <span className={`text-[10px] font-semibold ${item.isRead ? 'text-slate-500' : 'text-rose-400'}`}>
                      {item.isRead ? '● Read' : '● Action Pending'}
                    </span>
                  </div>

                  {/* Remarks preview if any */}
                  {item.remarks && (
                    <p className="text-[10px] text-slate-300 italic bg-slate-950/70 p-1.5 rounded-lg border border-slate-800/80 truncate">
                      "{item.remarks}"
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* DROPDOWN PAGINATION BAR (3 per page) */}
          {activeList.length > ITEMS_PER_PAGE && (
            <div className="flex justify-between items-center px-1 pt-1 border-t border-slate-800/80 text-[11px] text-slate-400">
              <span>
                Showing {(dropdownPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(dropdownPage * ITEMS_PER_PAGE, activeList.length)} of {activeList.length}
              </span>

              <div className="flex items-center gap-1">
                <button
                  disabled={dropdownPage === 1}
                  onClick={() => setDropdownPage(p => Math.max(p - 1, 1))}
                  className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-bold text-slate-300 px-1.5">
                  {dropdownPage} / {totalPages}
                </span>
                <button
                  disabled={dropdownPage >= totalPages}
                  onClick={() => setDropdownPage(p => Math.min(p + 1, totalPages))}
                  className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Footer Actions: "View All" & "Open Recovery" */}
          <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs gap-2">
            <button
              onClick={() => {
                setIsOpen(false);
                if (onNavigateAll) onNavigateAll();
              }}
              className="bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer"
            >
              View All Notifications →
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                if (onNavigateRecovery) onNavigateRecovery();
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer"
            >
              Recovery Center
            </button>
          </div>

        </div>
      )}
    </div>
  );
}