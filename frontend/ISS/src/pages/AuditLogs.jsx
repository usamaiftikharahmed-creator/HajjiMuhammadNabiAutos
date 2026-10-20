import React, { useState, useEffect } from 'react';
import { 
  History, Search, Filter, Calendar, User, ShieldAlert, 
  RefreshCw, CheckCircle2, AlertCircle, Clock, Trash2,
  ChevronLeft, ChevronRight, Download, FileText, ArrowRight
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeDateQuickFilter, setActiveDateQuickFilter] = useState('all');

  const setQuickDate = (type) => {
    setActiveDateQuickFilter(type);
    const today = new Date();
    const formatYMD = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (type === 'today') {
      const dStr = formatYMD(today);
      setStartDate(dStr);
      setEndDate(dStr);
    } else if (type === 'yesterday') {
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      const dStr = formatYMD(y);
      setStartDate(dStr);
      setEndDate(dStr);
    } else if (type === 'this_week') {
      const first = new Date(today);
      first.setDate(today.getDate() - today.getDay());
      setStartDate(formatYMD(first));
      setEndDate(formatYMD(today));
    } else if (type === 'this_month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(formatYMD(first));
      setEndDate(formatYMD(today));
    } else {
      setStartDate('');
      setEndDate('');
    }
    setPage(1);
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      const params = new URLSearchParams({
        page,
        limit,
        ...(searchTerm && { search: searchTerm }),
        ...(selectedModule !== 'all' && { module: selectedModule }),
        ...(selectedAction !== 'all' && { action: selectedAction }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate })
      });

      const res = await fetch(`/api/logs?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLogs(data.logs || []);
        setTotalPages(data.totalPages || 1);
        setTotalLogs(data.total || 0);
      } else {
        toast.error(data.message || 'Failed to load activity logs');
      }
    } catch (err) {
      toast.error('Network error loading logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      const res = await fetch('/api/logs/stats', {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStats(data.stats);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchLogs();
  }, [page, limit, selectedModule, selectedAction, startDate, endDate]);

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedModule('all');
    setSelectedAction('all');
    setStartDate('');
    setEndDate('');
    setActiveDateQuickFilter('all');
    setPage(1);
  };

  const getActionBadge = (action) => {
    if (action.includes('PAYMENT')) {
      return { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', label: 'Payment' };
    }
    if (action.includes('SALE')) {
      return { bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30', label: 'Sale / Kist' };
    }
    if (action.includes('EXPENSE')) {
      return action.includes('DELETE') 
        ? { bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30', label: 'Expense Del' }
        : { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: 'Expense Add' };
    }
    if (action.includes('DAY') || action.includes('CLOSE')) {
      return { bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30', label: 'Day Lock' };
    }
    if (action.includes('BACKUP') || action.includes('RESTORE')) {
      return action.includes('RESTORE')
        ? { bg: 'bg-rose-500/20 text-rose-300 border-rose-500', label: '1-Click Restore' }
        : { bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30', label: 'Backup' };
    }
    if (action.includes('LOGIN') || action.includes('USER')) {
      return { bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30', label: 'User / Auth' };
    }
    return { bg: 'bg-slate-800 text-slate-300 border-slate-700', label: action };
  };

  return (
    <div className="space-y-6 text-white max-w-7xl mx-auto">
      
      {/* HEADER */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-blue-500/10 rounded-2xl text-blue-400 border border-blue-500/20">
                <History className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  System Activity & Audit Logs
                  <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Live Tracking Active
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Har user, entry, wasooli, kharcha aur system tabdeeli ki mukammal live monitoring.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchLogs(); fetchStats(); }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Logs
            </button>
          </div>
        </div>

        {/* STATS OVERVIEW CARDS */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5">
              <p className="text-[11px] text-slate-400">Total Entries Logged</p>
              <h4 className="text-xl font-bold text-white mt-1">{stats.totalLogs?.toLocaleString()}</h4>
              <span className="text-[10px] text-slate-500">All-time tracked</span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5">
              <p className="text-[11px] text-slate-400">Today's Activities</p>
              <h4 className="text-xl font-bold text-emerald-400 mt-1">{stats.todayLogs?.toLocaleString()}</h4>
              <span className="text-[10px] text-emerald-500/80">Recorded today</span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5">
              <p className="text-[11px] text-slate-400">Active Module</p>
              <h4 className="text-base font-bold text-blue-400 mt-1 truncate">
                {stats.moduleBreakdown?.[0]?._id || 'Installments'}
              </h4>
              <span className="text-[10px] text-slate-500">Most active actions</span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5">
              <p className="text-[11px] text-slate-400">Security & Integrity</p>
              <h4 className="text-base font-bold text-amber-400 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Tamper Proof
              </h4>
              <span className="text-[10px] text-slate-500">Permanent record</span>
            </div>
          </div>
        )}
      </div>

      {/* FILTER CONTROLS BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        {/* QUICK DATE FILTERS */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1 mr-1">
            <Calendar className="w-3.5 h-3.5 text-blue-400" /> Filter Date:
          </span>
          {[
            { id: 'all', label: 'All Time' },
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'this_week', label: 'This Week' },
            { id: 'this_month', label: 'This Month' },
          ].map((df) => (
            <button
              key={df.id}
              type="button"
              onClick={() => setQuickDate(df.id)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
                activeDateQuickFilter === df.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              {df.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
          {/* SEARCH */}
          <div className="relative lg:col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search customer, user, item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* MODULE SELECT */}
          <div>
            <select
              value={selectedModule}
              onChange={(e) => { setSelectedModule(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none"
            >
              <option value="all">📁 All Categories / Modules</option>
              <option value="Installments">Installments / Sales</option>
              <option value="Payments">Payments / Recovery</option>
              <option value="Expenses">Expenses</option>
              <option value="DailyCash">Daily Cash / Roznamcha</option>
              <option value="Backup">Backup & Recovery</option>
              <option value="Auth">User Authentication</option>
              <option value="Staff">Staff Management</option>
            </select>
          </div>

          {/* ACTION SELECT */}
          <div>
            <select
              value={selectedAction}
              onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none"
            >
              <option value="all">⚡ All Actions</option>
              <option value="RECORD_PAYMENT">Payment Received</option>
              <option value="CREATE_SALE">New Sale Created</option>
              <option value="ADD_EXPENSE">Expense Added</option>
              <option value="UPDATE_PROMISE_DATE">Recovery Promise</option>
              <option value="CREATE_BACKUP">Backup Created</option>
              <option value="RESTORE_BACKUP">Database Restored</option>
              <option value="LOGIN">User Login</option>
            </select>
          </div>

          {/* DATE FROM */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
            <span className="text-[10px] text-slate-400">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setActiveDateQuickFilter('custom'); setPage(1); }}
              className="bg-transparent text-white font-medium focus:outline-none w-full text-xs"
            />
          </div>

          {/* DATE TO */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
            <span className="text-[10px] text-slate-400">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setActiveDateQuickFilter('custom'); setPage(1); }}
              className="bg-transparent text-white font-medium focus:outline-none w-full text-xs"
            />
          </div>
        </form>

        <div className="flex flex-wrap justify-between items-center gap-2 pt-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px]">
              Showing <strong className="text-white">{logs.length > 0 ? (page - 1) * limit + 1 : 0}</strong> - <strong className="text-white">{Math.min(page * limit, totalLogs)}</strong> of <strong className="text-white">{totalLogs}</strong> logs
            </span>
            <div className="flex items-center gap-1 ml-3 text-slate-400 text-[11px]">
              <span>Per page:</span>
              <select
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-0.5 text-white focus:outline-none cursor-pointer text-xs"
              >
                <option value={5}>5 per page (Default)</option>
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
              </select>
            </div>
          </div>

          {(searchTerm || selectedModule !== 'all' || selectedAction !== 'all' || startDate || endDate || activeDateQuickFilter !== 'all') && (
            <button
              onClick={resetFilters}
              className="text-blue-400 hover:underline font-medium text-[11px] cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* LOGS LIST TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 space-y-2">
            <History className="w-12 h-12 text-slate-600 mx-auto opacity-40" />
            <p className="text-slate-400 text-sm font-semibold">Koi Activity Log record nahi mila.</p>
            <p className="text-slate-500 text-xs">Aap filter tabdeel karke dobara check kar sakty hain.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase font-semibold text-[10px]">
                  <th className="p-4">Timestamp & IP</th>
                  <th className="p-4">User / Author</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">Activity Description</th>
                  <th className="p-4">Module</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {logs.map((log) => {
                  const badge = getActionBadge(log.action);
                  const logDate = new Date(log.createdAt);
                  const dateFormatted = logDate.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
                  const timeFormatted = logDate.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                  return (
                    <tr key={log._id} className="hover:bg-slate-800/30 transition">
                      {/* TIMESTAMP */}
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-white font-medium">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{timeFormatted}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5">{dateFormatted}</span>
                        <span className="text-[9px] text-slate-500 font-mono block">{log.ipAddress || '127.0.0.1'}</span>
                      </td>

                      {/* USER */}
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 text-xs">
                            {log.userName?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div>
                            <span className="font-bold text-white block text-xs">{log.userName || 'Admin'}</span>
                            <span className="text-[10px] text-blue-400 uppercase font-semibold">{log.userRole || 'owner'}</span>
                          </div>
                        </div>
                      </td>

                      {/* ACTION BADGE */}
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border ${badge.bg}`}>
                          {badge.label}
                        </span>
                      </td>

                      {/* DETAILS */}
                      <td className="p-4">
                        <p className="text-white text-xs leading-relaxed max-w-xl font-medium">
                          {log.details}
                        </p>
                        {log.targetName && (
                          <span className="inline-block mt-1 text-[10px] bg-slate-800/60 border border-slate-700/60 text-slate-300 px-2 py-0.5 rounded-md">
                            Target: <strong className="text-slate-200">{log.targetName}</strong>
                          </span>
                        )}
                      </td>

                      {/* MODULE */}
                      <td className="p-4 whitespace-nowrap">
                        <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg text-[10px] font-semibold border border-slate-700/80">
                          {log.module}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION BAR */}
        {totalLogs > 0 && (
          <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap justify-between items-center gap-3 text-xs">
            <span className="text-slate-400">
              Showing <strong className="text-white">{(page - 1) * limit + 1}</strong> - <strong className="text-white">{Math.min(page * limit, totalLogs)}</strong> of <strong className="text-white">{totalLogs}</strong> logs
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(1)}
                disabled={page <= 1}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 disabled:opacity-40 cursor-pointer text-xs font-semibold"
                title="First Page"
              >
                « First
              </button>

              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 disabled:opacity-40 cursor-pointer"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Numbered Page Buttons */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pNum = i + 1;
                if (totalPages > 5 && page > 3) {
                  pNum = page - 2 + i;
                  if (pNum > totalPages) pNum = totalPages - (4 - i);
                }
                return (
                  <button
                    key={pNum}
                    onClick={() => setPage(pNum)}
                    className={`w-7 h-7 rounded-lg font-bold text-xs transition cursor-pointer flex items-center justify-center ${
                      page === pNum
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {pNum}
                  </button>
                );
              })}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 disabled:opacity-40 cursor-pointer"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 disabled:opacity-40 cursor-pointer text-xs font-semibold"
                title="Last Page"
              >
                Last »
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
