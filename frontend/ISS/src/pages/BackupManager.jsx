import React, { useState, useEffect, useMemo } from 'react';
import { 
  Database, Cloud, HardDrive, Download, Upload, RefreshCw, 
  CheckCircle2, AlertTriangle, ShieldCheck, Clock, Mail, 
  FolderCheck, Trash2, KeyRound, X, FileJson, ArrowRight,
  Search, Filter, Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Layers, SlidersHorizontal
} from 'lucide-react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../api/axios';

export default function BackupManager() {
  const [backups, setBackups] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Pagination state (default: 5 records per page)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeDateQuickFilter, setActiveDateQuickFilter] = useState('all');

  // Email & Setting state
  const [backupEmail, setBackupEmail] = useState('hajjimuhammadnabi@gmail.com');
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [customDrivePath, setCustomDrivePath] = useState('');
  const [syncingLive, setSyncingLive] = useState(false);

  // Restore Modal State
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [restoring, setRestoring] = useState(false);

  // File Upload Restore
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadingRestore, setUploadingRestore] = useState(false);

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
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setStartDate('');
    setEndDate('');
    setActiveDateQuickFilter('all');
    setCurrentPage(1);
  };

  const filteredBackups = useMemo(() => {
    return backups.filter((b) => {
      // 1. Search Query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchName = b.fileName?.toLowerCase().includes(q);
        const matchFolder = b.folderDate?.toLowerCase().includes(q);
        const matchTrigger = b.triggeredBy?.toLowerCase().includes(q);
        if (!matchName && !matchFolder && !matchTrigger) return false;
      }

      // 2. Category / Type Filter
      if (selectedCategory !== 'all') {
        const trig = (b.triggeredBy || '').toLowerCase();
        if (selectedCategory === 'auto' && !trig.includes('auto') && !trig.includes('schedule')) {
          return false;
        }
        if (selectedCategory === 'manual' && !trig.includes('manual') && !trig.includes('dashboard')) {
          return false;
        }
        if (selectedCategory === 'restore' && !trig.includes('restore') && !trig.includes('snapshot')) {
          return false;
        }
        if (selectedCategory === 'upload' && !trig.includes('upload') && !trig.includes('external')) {
          return false;
        }
      }

      // 3. Date Filter (folderDate is YYYY-MM-DD format)
      const bDateStr = b.folderDate || (b.createdAt ? b.createdAt.substring(0, 10) : '');
      if (startDate && bDateStr < startDate) return false;
      if (endDate && bDateStr > endDate) return false;

      return true;
    });
  }, [backups, searchTerm, selectedCategory, startDate, endDate]);

  const totalFiltered = filteredBackups.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / itemsPerPage));

  const paginatedBackups = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredBackups.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredBackups, currentPage, itemsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      const res = await fetch(`${API_BASE_URL}/backup/list`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setBackups(data.backups || []);
        if (data.settings) {
          setSettings(data.settings);
          setBackupEmail(data.settings.backupEmail || 'hajjimuhammadnabi@gmail.com');
          setAutoBackupEnabled(data.settings.autoBackupEnabled ?? true);
          setCustomDrivePath(data.settings.customDrivePath || '');
        }
      } else {
        toast.error(data.message || 'Failed to load backups');
      }
    } catch (err) {
      toast.error('Network error loading backups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      const res = await fetch(`${API_BASE_URL}/backup/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Database backup created and saved in date folder!');
        fetchBackups();
      } else {
        toast.error(data.message || 'Backup creation failed');
      }
    } catch (err) {
      toast.error('Error creating backup');
    } finally {
      setCreating(false);
    }
  };

  const handleSyncLiveJson = async () => {
    setSyncingLive(true);
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      const res = await fetch(`${API_BASE_URL}/backup/sync-live-json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Live JSON Database Mirrored! ${data.counts?.customers || 0} Customers & ${data.counts?.installmentSales || 0} Sales saved.`);
        fetchBackups();
      } else {
        toast.error(data.message || 'Live JSON sync failed');
      }
    } catch (err) {
      toast.error('Network error syncing live JSON');
    } finally {
      setSyncingLive(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      const res = await fetch(`${API_BASE_URL}/backup/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include',
        body: JSON.stringify({
          backupEmail,
          autoBackupEnabled,
          customDrivePath
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Backup & Drive settings updated!');
        setSettings(data.settings);
      } else {
        toast.error(data.message || 'Failed to update settings');
      }
    } catch (err) {
      toast.error('Error updating settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!selectedBackupForRestore) return;
    if (!adminPassword) {
      toast.error('Please enter admin password to confirm restore');
      return;
    }

    setRestoring(true);
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      // First verify admin password
      const verifyRes = await fetch(`${API_BASE_URL}/auth/verify-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include',
        body: JSON.stringify({ password: adminPassword })
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        toast.error(verifyData.message || 'Incorrect Admin Password!');
        setRestoring(false);
        return;
      }

      // Execute 1-Click Restore
      const res = await fetch(`${API_BASE_URL}/backup/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include',
        body: JSON.stringify({ backupId: selectedBackupForRestore.id })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('System successfully restored from backup!');
        setSelectedBackupForRestore(null);
        setAdminPassword('');
        fetchBackups();
      } else {
        toast.error(data.message || 'Restore failed');
      }
    } catch (err) {
      toast.error(err.message || 'Error executing restore');
    } finally {
      setRestoring(false);
    }
  };

  const handleUploadRestore = async (e) => {
    e.preventDefault();
    if (!uploadedFile) {
      toast.error('Please select a .json backup file');
      return;
    }

    const confirmUpload = window.confirm(
      'Kya aap waqai is external backup file se pura system data restore karna chahte hain?'
    );
    if (!confirmUpload) return;

    setUploadingRestore(true);
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      const formData = new FormData();
      formData.append('backupFile', uploadedFile);

      const res = await fetch(`${API_BASE_URL}/backup/upload-restore`, {
        method: 'POST',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include',
        body: formData
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('External backup file se data kamyabi se restore ho gaya!');
        setUploadedFile(null);
        fetchBackups();
      } else {
        toast.error(data.message || 'Restore failed');
      }
    } catch (err) {
      toast.error('Error during file restore');
    } finally {
      setUploadingRestore(false);
    }
  };

  const handleDeleteBackup = async (folderDate, fileName) => {
    if (!window.confirm(`Are you sure you want to delete backup "${fileName}"?`)) return;

    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      const res = await fetch(`${API_BASE_URL}/backup/${folderDate}/${fileName}`, {
        method: 'DELETE',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Backup deleted');
        fetchBackups();
      } else {
        toast.error(data.message || 'Delete failed');
      }
    } catch (err) {
      toast.error('Error deleting backup');
    }
  };

  const handleDownload = (folderDate, fileName) => {
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    const token = userInfo?.token || localStorage.getItem('token');
    window.open(`/api/backup/download/${folderDate}/${fileName}`, '_blank');
  };

  return (
    <div className="space-y-6 text-white max-w-7xl mx-auto">
      
      {/* HEADER BANNER */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20">
              <Database className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-white">Database Backup & Disaster Recovery</h2>
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Auto 10:00 PM Active
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Har raat 10 baje automated backup ban kar date-wise folder mai save hota hai. 1-Click se restore karne ki sahulat.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSyncLiveJson}
              disabled={syncingLive}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-blue-950 disabled:opacity-50"
            >
              {syncingLive ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
              ⚡ Sync Live JSON Files
            </button>
            <button
              onClick={handleCreateBackup}
              disabled={creating}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-950 disabled:opacity-50"
            >
              {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
              ⚡ Create Backup Now
            </button>
          </div>
        </div>

        {/* STATUS PILLS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase block">Nightly Auto Schedule</span>
              <span className="text-sm font-bold text-white">Everyday at 10:00 PM</span>
              <span className="text-[10px] text-emerald-400 block mt-0.5">Auto-Cron Active</span>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase block">200GB Google Drive Sync</span>
              <span className="text-xs font-bold text-white truncate max-w-[190px] block" title={backupEmail}>
                {backupEmail || 'hajjimuhammadnabi@gmail.com'}
              </span>
              <span className="text-[10px] text-emerald-400 block mt-0.5">Live JSON & Backups Ready</span>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/10 rounded-xl text-purple-400">
              <FolderCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase block">Main Cloud Folder</span>
              <span className="text-xs font-bold text-white">Haji Muhammad Nabi Autos</span>
              <span className="text-[10px] text-purple-400 block mt-0.5">/data/ & /backup/ subfolders</span>
            </div>
          </div>
        </div>
      </div>

      {/* TWO COLUMNS: SETTINGS & DIRECT UPLOAD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* SETTINGS CARD */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-bold text-white">200GB Google Drive & Email Sync</h3>
          </div>
          <p className="text-xs text-slate-400">
            Aapki 200GB Google Storage email jis par rozana 10 PM backup sync hota hai.
          </p>

          <form onSubmit={handleSaveSettings} className="space-y-3.5 text-xs">
            <div>
              <label className="text-slate-300 block mb-1 font-medium">Google Account Email (200GB Storage)</label>
              <input
                type="email"
                value={backupEmail}
                onChange={(e) => setBackupEmail(e.target.value)}
                placeholder="hajjimuhammadnabi@gmail.com"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-slate-300 block mb-1 font-medium">Custom Google Drive Path (Optional)</label>
              <input
                type="text"
                value={customDrivePath}
                onChange={(e) => setCustomDrivePath(e.target.value)}
                placeholder="e.g. G:\My Drive\Haji Muhammad Nabi Autos"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 text-[11px]"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                Agar aapne Google Drive for Desktop install kiya hai to us drive ka path enter karein.
              </span>
            </div>

            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-medium">Automated 10 PM Nightly Backup</span>
                <input
                  type="checkbox"
                  checked={autoBackupEnabled}
                  onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Rozana rat 10:00 baje server mukammal backup banata hai aur missed hone par startup par automatic catch-up backup banata hai.
              </p>
            </div>

            <div className="p-3 bg-blue-950/20 border border-blue-500/20 rounded-2xl text-[11px] text-blue-300 space-y-1">
              <span className="font-bold flex items-center gap-1 text-blue-400">📁 Folder & Data Organization:</span>
              <p className="text-slate-400">
                Data direct <code className="text-emerald-400 bg-slate-950 px-1 py-0.5 rounded font-mono text-[10px]">Haji Muhammad Nabi Autos</code> folder mein JSON format mein save hota hai:
              </p>
              <ul className="text-slate-400 list-disc list-inside space-y-0.5 text-[10px] pt-1">
                <li><strong className="text-slate-200">/data/</strong>: Tamam customers, sales, payments ki live JSON files.</li>
                <li><strong className="text-slate-200">/backup/</strong>: Date-wise automated JSON backups.</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
            >
              {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Save Settings'}
            </button>
          </form>
        </div>

        {/* UPLOAD & RESTORE EXTERNAL BACKUP FILE */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Upload & Restore External Backup (.JSON)</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Agar aapne Google Drive ya computer se pehle se koi backup download kiya hua hai to yahan select karke 1-Click mai restore kar sakty hain.
            </p>

            <form onSubmit={handleUploadRestore} className="mt-4 space-y-3">
              <div className="border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950 rounded-2xl p-5 text-center cursor-pointer relative transition">
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => setUploadedFile(e.target.files[0])}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <FileJson className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                {uploadedFile ? (
                  <div>
                    <span className="text-xs font-bold text-emerald-400 block">{uploadedFile.name}</span>
                    <span className="text-[10px] text-slate-500">{(uploadedFile.size / 1024).toFixed(1)} KB</span>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs font-medium text-slate-300 block">Click or Drag & Drop Backup .JSON File</span>
                    <span className="text-[10px] text-slate-500">Select any saved backup file to restore</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!uploadedFile || uploadingRestore}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 text-xs disabled:opacity-40"
              >
                {uploadingRestore ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Restore From Selected File
              </button>
            </form>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-2 text-[11px] text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Kisi bhi restore action se pehle system automatic pre-restore safety snapshot banata hai.</span>
          </div>
        </div>

      </div>

      {/* STORED DATE-WISE BACKUPS LIST (1-CLICK RESTORE & PAGINATED) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        
        {/* HEADER & COUNTS */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800/80 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FolderCheck className="w-5 h-5 text-emerald-400" /> Date-Wise Stored Backups Archive
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Folder structure: <code className="text-slate-300 bg-slate-950 px-2 py-0.5 rounded text-[11px]">Haji Muhammad Nabi Autos / backup / YYYY-MM-DD /</code>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-3 py-1.5 rounded-xl">
              Showing: <strong className="text-white">{filteredBackups.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - {Math.min(currentPage * itemsPerPage, totalFiltered)}</strong> of <strong className="text-white">{totalFiltered}</strong>
            </span>
            <span className="text-xs font-semibold text-slate-400 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700/60">
              Total Archive: <strong className="text-white">{backups.length}</strong>
            </span>
          </div>
        </div>

        {/* COMPREHENSIVE FILTER TOOLBAR */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3.5">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            
            {/* SEARCH INPUT */}
            <div className="md:col-span-5 relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search backup file name, folder date, trigger..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* CATEGORY / TYPE DROPDOWN */}
            <div className="md:col-span-4 relative">
              <Filter className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition cursor-pointer"
              >
                <option value="all">📂 All Categories / Types</option>
                <option value="auto">⏰ Automated 10:00 PM Backups</option>
                <option value="manual">👤 Manual Admin Backups</option>
                <option value="restore">🛡️ Pre-Restore Safety Snapshots</option>
                <option value="upload">📤 Uploaded / External Backups</option>
              </select>
            </div>

            {/* PER PAGE SELECTOR (DEFAULT 5 AS REQUESTED) */}
            <div className="md:col-span-3 relative">
              <Layers className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition cursor-pointer font-medium"
              >
                <option value="5">⚡ 5 records per page</option>
                <option value="10">📄 10 records per page</option>
                <option value="20">📄 20 records per page</option>
                <option value="50">📄 50 records per page</option>
                <option value="9999">📑 All records</option>
              </select>
            </div>

          </div>

          {/* DATE FILTERS (QUICK PILLS + CUSTOM PICKERS) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-900">
            {/* Quick Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-semibold mr-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-400" /> Date:
              </span>
              {[
                { id: 'all', label: 'All Dates' },
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'this_week', label: 'This Week' },
                { id: 'this_month', label: 'This Month' }
              ].map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setQuickDate(btn.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                    activeDateQuickFilter === btn.id
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-900'
                      : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-500 text-[11px]">From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setActiveDateQuickFilter('custom');
                    setCurrentPage(1);
                  }}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-500 text-[11px]">To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setActiveDateQuickFilter('custom');
                    setCurrentPage(1);
                  }}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                />
              </div>

              {(searchTerm || selectedCategory !== 'all' || startDate || endDate || activeDateQuickFilter !== 'all') && (
                <button
                  onClick={resetFilters}
                  className="px-2.5 py-1 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition cursor-pointer flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Reset Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* BACKUP LIST CONTENT */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-16 space-y-2 border border-slate-800 rounded-2xl bg-slate-950/50">
            <Database className="w-12 h-12 text-slate-600 mx-auto opacity-40" />
            <p className="text-slate-400 text-sm font-semibold">Abhi koi backup file mojoood nahi hai.</p>
            <p className="text-slate-500 text-xs">Upar diye gaye "Create Backup Now" button par click karke naya backup banayein.</p>
          </div>
        ) : paginatedBackups.length === 0 ? (
          <div className="text-center py-14 space-y-3 border border-slate-800 rounded-2xl bg-slate-950/50">
            <Filter className="w-10 h-10 text-slate-500 mx-auto opacity-50" />
            <p className="text-slate-300 text-sm font-semibold">Aapke filter criteria ke mutabiq koi backup nahi mila.</p>
            <p className="text-slate-500 text-xs">Search query ya date range tabdeel karein ya filters reset karein.</p>
            <button
              onClick={resetFilters}
              className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> All Filters Reset Karein
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedBackups.map((b) => {
              const bDate = new Date(b.createdAt);
              const dateFormatted = bDate.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
              const timeFormatted = bDate.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });

              const isAuto = b.triggeredBy?.toLowerCase().includes('auto') || b.triggeredBy?.toLowerCase().includes('schedule');
              const isRestore = b.triggeredBy?.toLowerCase().includes('restore') || b.triggeredBy?.toLowerCase().includes('snapshot');

              return (
                <div 
                  key={b.id}
                  className="bg-slate-950 border border-slate-800/80 hover:border-slate-700 rounded-2xl p-4 transition flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`p-2.5 rounded-2xl shrink-0 ${
                      isAuto 
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                        : isRestore 
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      <FileJson className="w-6 h-6" />
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/50 font-bold px-2 py-0.5 rounded-md text-[11px]">
                          Folder: {b.folderDate}
                        </span>
                        <h4 className="text-xs font-bold text-white truncate max-w-sm group-hover:text-blue-400 transition">
                          {b.fileName}
                        </h4>
                        <span className="text-[10px] text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                          {b.sizeFormatted}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span>Created: <strong className="text-slate-300">{dateFormatted} at {timeFormatted}</strong></span>
                        <span>•</span>
                        <span className={`font-medium ${
                          isAuto ? 'text-blue-400' : isRestore ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {b.triggeredBy}
                        </span>
                      </div>

                      {/* RECORD COUNTS PREVIEW */}
                      {b.counts && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] pt-1">
                          <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                            Cust: <strong className="text-white">{b.counts.customers ?? 0}</strong>
                          </span>
                          <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                            Sales: <strong className="text-white">{b.counts.installmentSales ?? 0}</strong>
                          </span>
                          <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                            Payments: <strong className="text-emerald-400">{b.counts.payments ?? 0}</strong>
                          </span>
                          <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                            Expenses: <strong className="text-rose-400">{b.counts.expenses ?? 0}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {/* 1-CLICK RESTORE BUTTON */}
                    <button
                      onClick={() => {
                        setSelectedBackupForRestore(b);
                        setAdminPassword('');
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-950"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> ⚡ 1-Click Restore
                    </button>

                    {/* DOWNLOAD TO DRIVE / PC */}
                    <button
                      onClick={() => handleDownload(b.folderDate, b.fileName)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                      title="Download file to computer or Google Drive"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>

                    {/* DELETE */}
                    <button
                      onClick={() => handleDeleteBackup(b.folderDate, b.fileName)}
                      className="p-2 text-slate-500 hover:text-rose-400 bg-slate-900 hover:bg-slate-800 rounded-xl transition cursor-pointer"
                      title="Delete Backup"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* BOTTOM PAGINATION BAR */}
        {!loading && totalFiltered > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800 text-xs">
            <div className="text-slate-400">
              Showing <strong className="text-white">{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong className="text-white">{Math.min(currentPage * itemsPerPage, totalFiltered)}</strong> of <strong className="text-white">{totalFiltered}</strong> backups
              {totalFiltered !== backups.length && (
                <span className="text-slate-500 ml-1.5">(filtered from {backups.length} total)</span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* First Page */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                title="First Page"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>

              {/* Prev Page */}
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer flex items-center gap-1 font-medium"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>

              {/* Numbered Page Buttons */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => {
                  if (totalPages <= 5) return true;
                  if (p === 1 || p === totalPages) return true;
                  return Math.abs(p - currentPage) <= 1;
                })
                .map((p, idx, arr) => {
                  const showEllipsisBefore = idx > 0 && p - arr[idx - 1] > 1;
                  return (
                    <React.Fragment key={p}>
                      {showEllipsisBefore && (
                        <span className="px-1 text-slate-600">...</span>
                      )}
                      <button
                        onClick={() => setCurrentPage(p)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center ${
                          currentPage === p
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-900'
                            : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  );
                })}

              {/* Next Page */}
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer flex items-center gap-1 font-medium"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>

              {/* Last Page */}
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                title="Last Page"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* SAFETY 1-CLICK RESTORE MODAL */}
      {selectedBackupForRestore && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl relative text-white">
            <button
              onClick={() => setSelectedBackupForRestore(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center space-y-1 border-b border-slate-800 pb-3">
              <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/30">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">1-Click Database Restore</h3>
              <p className="text-xs text-slate-400">
                System ko is date ke backup state par wapis recover karein.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Backup Folder:</span>
                <span className="font-bold text-emerald-400">{selectedBackupForRestore.folderDate}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">File Name:</span>
                <span className="font-mono text-white text-right truncate max-w-[200px]">
                  {selectedBackupForRestore.fileName}
                </span>
              </div>
              {selectedBackupForRestore.counts && (
                <div className="text-[11px] text-slate-300 pt-1">
                  Restore honge: <strong>{selectedBackupForRestore.counts.customers} Customers</strong>, <strong>{selectedBackupForRestore.counts.installmentSales} Sales</strong>, <strong>{selectedBackupForRestore.counts.payments} Payments</strong>.
                </div>
              )}
            </div>

            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-[11px] text-blue-300">
              ℹ️ Restore shuru hone se pehle system automatic safety snapshot banaye ga taake purana data bhi mehfooz rahe.
            </div>

            {/* ADMIN PASSWORD CONFIRMATION */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                Enter Admin / Owner Password to Confirm:
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="password"
                  placeholder="Enter your login password..."
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleExecuteRestore}
                disabled={restoring || !adminPassword}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl transition cursor-pointer text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {restoring ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Confirm 1-Click Restore
              </button>
              <button
                onClick={() => setSelectedBackupForRestore(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 font-bold py-2.5 rounded-xl transition cursor-pointer text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
