import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, Wallet, CreditCard, DollarSign, Plus, 
  Search, Send, Calendar, ArrowUpRight, BookOpen, 
  ShieldAlert, RefreshCw, Store, CheckCircle2, History, Database,
  Lock, Unlock, Eye, EyeOff, AlertCircle, X,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import API from '../api/axios';
import toast from 'react-hot-toast';
import ViewDetailsModal from './ViewDetailsModal';

export default function DashboardOverview({ setActiveTab, userName }) {
  // Zero-delay instant load: initialize data from sessionStorage if available
  const [data, setData] = useState(() => {
    try {
      const saved = sessionStorage.getItem('iss_dashboard_cache');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return parsed && typeof parsed === 'object' && parsed.success ? parsed : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      const saved = sessionStorage.getItem('iss_dashboard_cache');
      if (!saved) return true;
      const parsed = JSON.parse(saved);
      return !(parsed && typeof parsed === 'object' && parsed.success);
    } catch {
      return true;
    }
  });
  const [selectedSaleForView, setSelectedSaleForView] = useState(null);

  // Financial Stats Masking & Password Protection State
  const [isFinancialsUnlocked, setIsFinancialsUnlocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Today's Due Installments Pagination & Search State
  const [dueSearchQuery, setDueSearchQuery] = useState('');
  const [dueItemsPerPage, setDueItemsPerPage] = useState(5);
  const [dueCurrentPage, setDueCurrentPage] = useState(1);

  const fetchOverview = async (forceSpinner = false) => {
    if (forceSpinner || !data) {
      setLoading(true);
    }
    try {
      const res = await API.get('/dashboard/overview');
      if (res.data?.success) {
        setData(res.data);
        try {
          sessionStorage.setItem('iss_dashboard_cache', JSON.stringify(res.data));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error("Dashboard overview fetch error:", err);
      // Fallback empty data if fetch fails so screen is never blank
      if (!data) {
        setData({
          success: true,
          stats: {
            totalSalesCapital: 0,
            activeMarketOutstanding: 0,
            collectedThisMonth: 0,
            activeAccountsCount: 0,
            todaysDueCount: 0,
            todaysExpectedAmount: 0
          },
          todaysDueSales: [],
          promiseAlerts: []
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleSendWhatsApp = (sale) => {
    const cust = sale.customer && typeof sale.customer === 'object' ? sale.customer : {};
    
    const customerName = 
      cust.name || 
      cust.fullName || 
      cust.customerName || 
      sale.customerName || 
      sale.applicantName || 
      'Customer';

    const customerId = 
      cust.customerId || 
      cust.id || 
      cust.code || 
      sale.customerId || 
      '';

    const rawPhone = (
      cust.phone || 
      cust.phoneNumber || 
      cust.mobile || 
      sale.phone || 
      sale.customerPhone || 
      ''
    ).replace(/\D/g, '');

    let formattedPhone = rawPhone;
    if (formattedPhone.startsWith('03')) {
      formattedPhone = '92' + formattedPhone.slice(1);
    }

    const monthlyVal = Number(sale.monthlyAmount || sale.monthlyInstallment || 0);
    const remainingVal = Number(sale.remainingBalance || 0);

    const regParts = [];
    if (sale.registrationNumber || sale.itemRegNumber) regParts.push(`Reg: ${sale.registrationNumber || sale.itemRegNumber}`);
    if (sale.engineNumber) regParts.push(`Eng: ${sale.engineNumber}`);
    if (sale.chassisNumber) regParts.push(`Chas: ${sale.chassisNumber}`);
    const regStr = regParts.length > 0 ? ` (${regParts.join(' | ')})` : '';

    const message = 
      `*TODAY'S INSTALLMENT DUE REMINDER - HAJJI MOHAMMAD NABI AUTOS*\n\n` +
      `Dear *${customerName}* (${customerId}),\n\n` +
      `Your monthly installment for *${sale.itemName || sale.productName || 'Item'}*${regStr} of *Rs. ${monthlyVal.toLocaleString()}* is due today.\n\n` +
      `Kindly deposit your installment at our store today or via online transfer:\n` +
      `📲 *03232200325* (EasyPaisa)\n` +
      `📲 *03030246040* (JazzCash)\n\n` +
      `*Remaining Balance:* Rs. ${remainingVal.toLocaleString()}\n\n` +
      `*Shop Address:* Shop # 14, Sector 16-B, Main Godhra Stop New Karachi\n` +
      `Thank you!`;

    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleVerifyAdminPassword = async (e) => {
    if (e) e.preventDefault();
    if (!adminPasswordInput.trim()) {
      setPasswordError('Admin password darj karein');
      return;
    }

    setIsVerifyingPassword(true);
    setPasswordError('');

    try {
      const res = await API.post('/auth/verify-admin', { password: adminPasswordInput });
      if (res.data?.success) {
        toast.success('Admin Verified! Financial figures unlocked.');
        setIsFinancialsUnlocked(true);
        setShowPasswordModal(false);
        setAdminPasswordInput('');
      } else {
        setPasswordError(res.data?.message || 'Incorrect Admin Password!');
        toast.error(res.data?.message || 'Incorrect Admin Password!');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Incorrect Admin Password!';
      setPasswordError(msg);
      toast.error(msg);
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  // Multi-Backend Safety Data Extraction
  const rawStats = (data && typeof data === 'object') ? (data.stats || data.data?.stats || data.data || data) : {};
  
  const stats = {
    totalSalesCapital: Number(rawStats?.totalSalesCapital || rawStats?.totalSales || 0) || 0,
    activeMarketOutstanding: Number(rawStats?.activeMarketOutstanding || rawStats?.activeOutstandings || 0) || 0,
    activeAccountsCount: Number(rawStats?.activeAccountsCount || rawStats?.activeCount || 0) || 0,
    collectedThisMonth: Number(rawStats?.collectedThisMonth || rawStats?.monthlyCollection || 0) || 0,
    todaysDueCount: Number(rawStats?.todaysDueCount || rawStats?.todayDueCount || 0) || 0,
    todaysExpectedAmount: Number(rawStats?.todaysExpectedAmount || rawStats?.todayDueTarget || 0) || 0,
  };

  const todaysDueSales = Array.isArray(data?.todaysDueSales)
    ? data.todaysDueSales
    : Array.isArray(data?.data?.todaysDueSales)
    ? data.data.todaysDueSales
    : Array.isArray(data?.dueSales)
    ? data.dueSales
    : [];

  // Reset to first page when search query or page size changes
  useEffect(() => {
    setDueCurrentPage(1);
  }, [dueSearchQuery, dueItemsPerPage]);

  // Filtered list based on search bar
  const filteredDueSales = useMemo(() => {
    if (!todaysDueSales || !Array.isArray(todaysDueSales)) return [];
    if (!dueSearchQuery.trim()) return todaysDueSales;

    const q = dueSearchQuery.toLowerCase().trim();
    return todaysDueSales.filter((sale) => {
      if (!sale || typeof sale !== 'object') return false;
      const cust = sale.customer && typeof sale.customer === 'object' ? sale.customer : {};
      const customerName = (
        cust.name || 
        cust.fullName || 
        cust.customerName || 
        sale.customerName || 
        sale.applicantName || 
        sale.name || 
        ''
      ).toLowerCase();
      const customerId = (
        cust.customerId || 
        cust.id || 
        cust.code || 
        sale.customerId || 
        ''
      ).toLowerCase();
      const customerPhone = (
        cust.phone || 
        cust.phoneNumber || 
        cust.mobile || 
        sale.phone || 
        sale.customerPhone || 
        ''
      ).toLowerCase();
      const itemName = (sale.itemName || sale.productName || '').toLowerCase();
      const reg = (sale.registrationNumber || sale.itemRegNumber || '').toLowerCase();
      const eng = (sale.engineNumber || '').toLowerCase();
      const chas = (sale.chassisNumber || '').toLowerCase();

      return (
        customerName.includes(q) ||
        customerId.includes(q) ||
        customerPhone.includes(q) ||
        itemName.includes(q) ||
        reg.includes(q) ||
        eng.includes(q) ||
        chas.includes(q)
      );
    });
  }, [todaysDueSales, dueSearchQuery]);

  const dueTotalPages = Math.max(1, Math.ceil((filteredDueSales?.length || 0) / (dueItemsPerPage || 5)));
  const validDuePage = Math.min(Math.max(1, dueCurrentPage || 1), dueTotalPages);

  const paginatedDueSales = useMemo(() => {
    if (!Array.isArray(filteredDueSales)) return [];
    const size = dueItemsPerPage || 5;
    const start = (validDuePage - 1) * size;
    return filteredDueSales.slice(start, start + size);
  }, [filteredDueSales, validDuePage, dueItemsPerPage]);

  return (
    <div className="space-y-6 text-white max-w-7xl mx-auto">
      
      {/* 1. WELCOME HEADER BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold shrink-0">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-bold text-white">Hajji Mohammad Nabi Autos</h2>
              <div className="flex items-center gap-2 text-[11px] bg-slate-800/90 border border-slate-700 px-2.5 py-0.5 rounded-lg text-slate-300">
                <span className="text-emerald-400 font-bold">EasyPaisa:</span>
                <span className="font-mono text-white font-semibold">03232200325</span>
                <span className="text-slate-600">•</span>
                <span className="text-amber-400 font-bold">JazzCash:</span>
                <span className="font-mono text-white font-semibold">03030246040</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 mt-1.5 text-xs">
              <p className="text-slate-400">Welcome back, <strong className="text-blue-400">{userName || 'Owner'}</strong> | System Executive Dashboard</p>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded-lg text-slate-300">
                <img 
                  src="/shop_location_qr.png" 
                  alt="Shop QR" 
                  className="w-4 h-4 rounded bg-white p-0.5 object-contain"
                />
                <span className="text-[11px] font-medium">📍 Shop # 14, Sector 16-B, Main Godhra Stop New Karachi <span className="text-blue-400 text-[10px]">(Scan QR for Location)</span></span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* SENSITIVE STATS EYE TOGGLE BUTTON */}
          <button
            type="button"
            onClick={() => {
              if (isFinancialsUnlocked) {
                setIsFinancialsUnlocked(false);
                toast('مالیاتی تفصیلات چھپا دی گئیں (Figures hidden)', { icon: '🔒' });
              } else {
                setPasswordError('');
                setAdminPasswordInput('');
                setShowPasswordModal(true);
              }
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer border shadow-sm ${
              isFinancialsUnlocked
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/50'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
            title={isFinancialsUnlocked ? 'Click to hide figures' : 'Click to view figures (Admin Password Required)'}
          >
            {isFinancialsUnlocked ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-emerald-400" />
                <span>Hide Figures</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-amber-400" />
                <span>Show Figures</span>
              </>
            )}
          </button>

          <button
            onClick={() => fetchOverview(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} /> Live Sync
          </button>
        </div>
      </div>

      {/* 2. LIVE BUSINESS STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* CARD 1: Total Sales Capital (PROTECTED) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2 relative overflow-hidden group">
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>Total Sales Capital</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (isFinancialsUnlocked) {
                    setIsFinancialsUnlocked(false);
                  } else {
                    setPasswordError('');
                    setAdminPasswordInput('');
                    setShowPasswordModal(true);
                  }
                }}
                className={`p-1 rounded-lg transition cursor-pointer ${
                  isFinancialsUnlocked ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-slate-500 hover:text-amber-400 hover:bg-slate-800'
                }`}
                title={isFinancialsUnlocked ? 'Click to hide' : 'Click to view (Admin Password Required)'}
              >
                {isFinancialsUnlocked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <ArrowUpRight className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          {isFinancialsUnlocked ? (
            <h3 className="text-2xl font-black text-white">Rs. {stats.totalSalesCapital.toLocaleString()}</h3>
          ) : (
            <div 
              onClick={() => {
                setPasswordError('');
                setAdminPasswordInput('');
                setShowPasswordModal(true);
              }}
              className="flex items-center gap-2 cursor-pointer select-none py-0.5"
              title="Click to view with Admin Password"
            >
              <h3 className="text-2xl font-black tracking-widest text-slate-500 hover:text-slate-300 font-mono transition">
                Rs. ••••••••
              </h3>
              <span className="text-[10px] bg-slate-800 text-slate-400 hover:text-amber-300 px-2 py-0.5 rounded-full border border-slate-700 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> Locked
              </span>
            </div>
          )}
          <p className="text-[11px] text-slate-500">Cumulative sale volume created</p>
        </div>

        {/* CARD 2: Active Market Outstandings (PROTECTED) */}
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 space-y-2 relative overflow-hidden bg-amber-950/10 group">
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>Active Market Outstandings</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (isFinancialsUnlocked) {
                    setIsFinancialsUnlocked(false);
                  } else {
                    setPasswordError('');
                    setAdminPasswordInput('');
                    setShowPasswordModal(true);
                  }
                }}
                className={`p-1 rounded-lg transition cursor-pointer ${
                  isFinancialsUnlocked ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-slate-500 hover:text-amber-400 hover:bg-slate-800'
                }`}
                title={isFinancialsUnlocked ? 'Click to hide' : 'Click to view (Admin Password Required)'}
              >
                {isFinancialsUnlocked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <CreditCard className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          {isFinancialsUnlocked ? (
            <h3 className="text-2xl font-black text-amber-400">Rs. {stats.activeMarketOutstanding.toLocaleString()}</h3>
          ) : (
            <div 
              onClick={() => {
                setPasswordError('');
                setAdminPasswordInput('');
                setShowPasswordModal(true);
              }}
              className="flex items-center gap-2 cursor-pointer select-none py-0.5"
              title="Click to view with Admin Password"
            >
              <h3 className="text-2xl font-black tracking-widest text-slate-500 hover:text-amber-300 font-mono transition">
                Rs. ••••••••
              </h3>
              <span className="text-[10px] bg-slate-800 text-slate-400 hover:text-amber-300 px-2 py-0.5 rounded-full border border-slate-700 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> Locked
              </span>
            </div>
          )}
          <p className="text-[11px] text-amber-500/80 font-bold">{stats.activeAccountsCount} Active Installment Accounts</p>
        </div>

        {/* CARD 3: Cash Collected This Month (PROTECTED) */}
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 space-y-2 relative overflow-hidden bg-emerald-950/10 group">
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>Cash Collected This Month</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (isFinancialsUnlocked) {
                    setIsFinancialsUnlocked(false);
                  } else {
                    setPasswordError('');
                    setAdminPasswordInput('');
                    setShowPasswordModal(true);
                  }
                }}
                className={`p-1 rounded-lg transition cursor-pointer ${
                  isFinancialsUnlocked ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-slate-500 hover:text-emerald-400 hover:bg-slate-800'
                }`}
                title={isFinancialsUnlocked ? 'Click to hide' : 'Click to view (Admin Password Required)'}
              >
                {isFinancialsUnlocked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          {isFinancialsUnlocked ? (
            <h3 className="text-2xl font-black text-emerald-400">Rs. {stats.collectedThisMonth.toLocaleString()}</h3>
          ) : (
            <div 
              onClick={() => {
                setPasswordError('');
                setAdminPasswordInput('');
                setShowPasswordModal(true);
              }}
              className="flex items-center gap-2 cursor-pointer select-none py-0.5"
              title="Click to view with Admin Password"
            >
              <h3 className="text-2xl font-black tracking-widest text-slate-500 hover:text-emerald-300 font-mono transition">
                Rs. ••••••••
              </h3>
              <span className="text-[10px] bg-slate-800 text-slate-400 hover:text-emerald-300 px-2 py-0.5 rounded-full border border-slate-700 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> Locked
              </span>
            </div>
          )}
          <p className="text-[11px] text-emerald-500/80 font-bold">Total recoveries in current month</p>
        </div>

        {/* CARD 4: Today's Due Recoveries (PROTECTED) */}
        <div className="bg-slate-900 border border-purple-500/30 rounded-2xl p-5 space-y-2 relative overflow-hidden bg-purple-950/10 group">
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>Today's Due Recoveries</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (isFinancialsUnlocked) {
                    setIsFinancialsUnlocked(false);
                  } else {
                    setPasswordError('');
                    setAdminPasswordInput('');
                    setShowPasswordModal(true);
                  }
                }}
                className={`p-1 rounded-lg transition cursor-pointer ${
                  isFinancialsUnlocked ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-slate-500 hover:text-purple-400 hover:bg-slate-800'
                }`}
                title={isFinancialsUnlocked ? 'Click to hide' : 'Click to view (Admin Password Required)'}
              >
                {isFinancialsUnlocked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <Calendar className="w-4 h-4 text-purple-400" />
            </div>
          </div>
          {isFinancialsUnlocked ? (
            <>
              <h3 className="text-2xl font-black text-purple-300">
                {stats.todaysDueCount} {stats.todaysDueCount === 1 ? 'Installment' : 'Installments'}
              </h3>
              <p className="text-[11px] text-purple-400 font-bold">Expected Target: Rs. {stats.todaysExpectedAmount.toLocaleString()}</p>
            </>
          ) : (
            <div 
              onClick={() => {
                setPasswordError('');
                setAdminPasswordInput('');
                setShowPasswordModal(true);
              }}
              className="cursor-pointer select-none space-y-1"
              title="Click to view with Admin Password"
            >
              <div className="flex items-center gap-2 py-0.5">
                <h3 className="text-2xl font-black tracking-widest text-slate-500 hover:text-purple-300 font-mono transition">
                  •• Installments
                </h3>
                <span className="text-[10px] bg-slate-800 text-slate-400 hover:text-purple-300 px-2 py-0.5 rounded-full border border-slate-700 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Locked
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-bold">
                Expected Target: <span className="font-mono tracking-wider">Rs. ••••••••</span>
              </p>
            </div>
          )}
        </div>

      </div>

      {/* 3. QUICK ACTION HUB */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quick Action Shortcuts Hub</h3>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => setActiveTab('installments')}
            className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 p-3.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> New Installment Sale
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-3.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-purple-400" /> Search Customer Khata
          </button>

          <button
            onClick={() => setActiveTab('dailycash')}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-3.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Wallet className="w-4 h-4 text-emerald-400" /> Daily Cash (Roznamcha)
          </button>

          <button
            onClick={() => setActiveTab('recovery')}
            className="bg-rose-950/40 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 p-3.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4 text-rose-400" /> Recovery & Defaulters
          </button>

          <button
            onClick={() => setActiveTab('auditlogs')}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-3.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <History className="w-4 h-4 text-cyan-400" /> Activity Logs (Audit)
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className="bg-emerald-950/40 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 p-3.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Database className="w-4 h-4 text-emerald-400" /> 10 PM Backup & Restore
          </button>
        </div>
      </div>

      {/* 4. TODAY'S DUE INSTALLMENTS WIDGET */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-400" /> Today's Due Installments Widget ({new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">List of customers whose monthly installment is due today.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-purple-500/10 text-purple-400 border border-purple-500/30 px-3 py-1 rounded-lg text-xs font-bold">
              Target: {isFinancialsUnlocked ? `Rs. ${stats.todaysExpectedAmount.toLocaleString()}` : 'Rs. ••••••••'}
            </span>
          </div>
        </div>

        {/* SEARCH BAR & ROWS PER PAGE CONTROLS */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={dueSearchQuery}
              onChange={(e) => setDueSearchQuery(e.target.value)}
              placeholder="Search by Customer Name, ID, Phone, Item, Reg #..."
              className="w-full bg-slate-900 border border-slate-750 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
            />
            {dueSearchQuery && (
              <button
                type="button"
                onClick={() => setDueSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-slate-800 transition cursor-pointer"
                title="Clear Search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Rows per page selector: 5, 10, 15, 20, All */}
          <div className="flex items-center justify-between md:justify-end gap-2 text-xs">
            <span className="text-slate-400 font-medium whitespace-nowrap">Show:</span>
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              {[5, 10, 15, 20].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setDueItemsPerPage(size)}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                    dueItemsPerPage === size
                      ? 'bg-purple-600 text-white shadow-sm shadow-purple-900'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {size}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDueItemsPerPage(todaysDueSales.length > 0 ? todaysDueSales.length : 1000)}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                  dueItemsPerPage > 20
                    ? 'bg-purple-600 text-white shadow-sm shadow-purple-900'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                All
              </button>
            </div>
          </div>
        </div>

        {todaysDueSales.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h4 className="text-sm font-bold text-white">No Installments Due Today!</h4>
            <p className="text-xs text-slate-500">No monthly installments are scheduled for payment today.</p>
          </div>
        ) : filteredDueSales.length === 0 ? (
          <div className="text-center py-10 space-y-3 bg-slate-950/40 rounded-xl border border-slate-800">
            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
            <div>
              <h4 className="text-sm font-bold text-white">No matching records found</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                No customer matching "{dueSearchQuery}" found in today's due list.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDueSearchQuery('')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition font-medium cursor-pointer"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase font-semibold">
                    <th className="p-3">Customer ID & Name</th>
                    <th className="p-3">Item Name</th>
                    <th className="p-3">Monthly Installment</th>
                    <th className="p-3">Remaining Balance</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {paginatedDueSales.map((sale) => {
                    const cust = sale.customer && typeof sale.customer === 'object' ? sale.customer : {};
                    
                    const customerName = 
                      cust.name || 
                      cust.fullName || 
                      cust.customerName || 
                      sale.customerName || 
                      sale.applicantName || 
                      sale.name || 
                      'Customer';

                    const customerId = 
                      cust.customerId || 
                      cust.id || 
                      cust.code || 
                      sale.customerId || 
                      'N/A';

                    const customerPhone = 
                      cust.phone || 
                      cust.phoneNumber || 
                      cust.mobile || 
                      sale.phone || 
                      sale.customerPhone || 
                      '';

                    const monthlyVal = Number(sale.monthlyAmount || sale.monthlyInstallment || 0);
                    const remainingVal = Number(sale.remainingBalance || 0);

                    return (
                      <tr key={sale._id || Math.random()} className="hover:bg-slate-800/40">
                        <td className="p-3">
                          <span className="font-mono text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 inline-block mb-0.5">
                            {customerId}
                          </span>
                          <strong className="block text-white font-bold">{customerName}</strong>
                          <span className="text-slate-400 text-[11px]">{customerPhone}</span>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold text-slate-200 block">{sale.itemName || sale.productName || 'N/A'}</span>
                          {(sale.registrationNumber || sale.itemRegNumber || sale.engineNumber || sale.chassisNumber) && (
                            <div className="flex flex-wrap gap-1 text-[10px] mt-0.5 font-mono">
                              {(sale.registrationNumber || sale.itemRegNumber) && (
                                <span className="bg-blue-950/60 border border-blue-900 text-blue-300 px-1.5 py-0.5 rounded">
                                  Reg: {sale.registrationNumber || sale.itemRegNumber}
                                </span>
                              )}
                              {sale.engineNumber && (
                                <span className="bg-amber-950/60 border border-amber-900 text-amber-300 px-1.5 py-0.5 rounded">
                                  Eng: {sale.engineNumber}
                                </span>
                              )}
                              {sale.chassisNumber && (
                                <span className="bg-emerald-950/60 border border-emerald-900 text-emerald-300 px-1.5 py-0.5 rounded">
                                  Chas: {sale.chassisNumber}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-bold text-blue-400 text-sm">Rs. {monthlyVal.toLocaleString()}</td>
                        <td className="p-3 font-bold text-amber-400">Rs. {remainingVal.toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleSendWhatsApp(sale)}
                              className="bg-green-700/20 hover:bg-green-600 text-green-400 hover:text-white border border-green-500/30 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                            >
                              <Send className="w-3.5 h-3.5" /> Reminder
                            </button>

                            <button
                              onClick={() => setSelectedSaleForView(sale)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                            >
                              <DollarSign className="w-3.5 h-3.5" /> Receive Payment
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* PAGINATION CONTROLS */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs">
              <div className="text-slate-400">
                Showing <strong className="text-white">{(validDuePage - 1) * dueItemsPerPage + 1}</strong> to <strong className="text-white">{Math.min(validDuePage * dueItemsPerPage, filteredDueSales.length)}</strong> of <strong className="text-white">{filteredDueSales.length}</strong> Entries
                {filteredDueSales.length !== todaysDueSales.length && (
                  <span className="text-purple-400 font-semibold ml-1.5">(filtered from {todaysDueSales.length} total)</span>
                )}
              </div>

              {dueTotalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  {/* First page button */}
                  <button
                    type="button"
                    onClick={() => setDueCurrentPage(1)}
                    disabled={validDuePage === 1}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                    title="First Page"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>

                  {/* Previous button */}
                  <button
                    type="button"
                    onClick={() => setDueCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={validDuePage === 1}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer flex items-center gap-1 font-medium"
                  >
                    <ChevronLeft className="w-4 h-4" /> Prev
                  </button>

                  {/* Numbered Page Buttons */}
                  {Array.from({ length: dueTotalPages }, (_, i) => i + 1)
                    .filter((p) => {
                      if (dueTotalPages <= 5) return true;
                      if (p === 1 || p === dueTotalPages) return true;
                      return Math.abs(p - validDuePage) <= 1;
                    })
                    .map((p, idx, arr) => {
                      const showEllipsisBefore = idx > 0 && p - arr[idx - 1] > 1;
                      return (
                        <React.Fragment key={p}>
                          {showEllipsisBefore && (
                            <span className="px-1 text-slate-600">...</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setDueCurrentPage(p)}
                            className={`w-7 h-7 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center ${
                              validDuePage === p
                                ? 'bg-purple-600 text-white shadow-md shadow-purple-900'
                                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      );
                    })}

                  {/* Next button */}
                  <button
                    type="button"
                    onClick={() => setDueCurrentPage((p) => Math.min(dueTotalPages, p + 1))}
                    disabled={validDuePage === dueTotalPages}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer flex items-center gap-1 font-medium"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Last page button */}
                  <button
                    type="button"
                    onClick={() => setDueCurrentPage(dueTotalPages)}
                    disabled={validDuePage === dueTotalPages}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                    title="Last Page"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedSaleForView && (
        <ViewDetailsModal
          selectedSale={selectedSaleForView}
          onClose={() => setSelectedSaleForView(null)}
          onRefresh={fetchOverview}
        />
      )}

      {/* ADMIN PASSWORD VERIFICATION MODAL */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl p-6 text-white space-y-4">
            
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                  <Lock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Admin Password Required</h3>
                  <p className="text-xs text-slate-400">
                    حساس کاروباری اعداد و شمار دیکھنے کے لیے ایڈمن پاس ورڈ درج کریں
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordError('');
                  setAdminPasswordInput('');
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVerifyAdminPassword} className="space-y-4 pt-1">
              <div>
                <label className="block text-slate-300 text-xs mb-1.5 font-medium">
                  Enter Admin Password / ایڈمن پاس ورڈ *
                </label>
                <div className="relative">
                  <input
                    type={showPasswordText ? "text" : "password"}
                    autoFocus
                    required
                    value={adminPasswordInput}
                    onChange={(e) => {
                      setAdminPasswordInput(e.target.value);
                      if (passwordError) setPasswordError('');
                    }}
                    placeholder="Enter admin password..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-10 py-2.5 text-white text-sm outline-none focus:border-amber-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                
                {passwordError && (
                  <p className="text-red-400 text-xs mt-2 font-medium flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {passwordError}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordError('');
                    setAdminPasswordInput('');
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifyingPassword}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-amber-950/40 disabled:opacity-50"
                >
                  {isVerifyingPassword ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Verifying...
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4" /> Verify & Unlock
                    </>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}