import { useState, useEffect } from 'react';
import API from '../api/axios';
import { Menu, LogOut, ShieldCheck, Cloud, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AdminDueNotifications from './AdminDueNotifications';

export default function Navbar({ onToggleSidebar, onNavigateRecovery, onNavigateAll }) {
  const { user, logout } = useAuth();
  const [systemStatus, setSystemStatus] = useState({ mode: 'offline', statusMessage: 'Offline Mode (Local Drive Active)' });

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { data } = await API.get('/system-status');
        if (data?.success) {
          setSystemStatus({
            mode: data.mode,
            statusMessage: data.statusMessage
          });
        }
      } catch (e) {
        setSystemStatus({
          mode: 'offline',
          statusMessage: 'Offline Mode (Local Drive Active - 100% Safe)'
        });
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 flex justify-between items-center sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button 
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>
        
        {/* Live Cloud & Google Drive Sync Badge */}
        {systemStatus.mode === 'online' ? (
          <span className="flex items-center gap-1.5 text-xs border border-emerald-500/30 bg-emerald-950/40 text-emerald-400 px-3 py-1 rounded-full font-medium shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <Cloud className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Google Drive & Cloud Synced</span>
            <span className="sm:hidden">Online</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs border border-amber-500/30 bg-amber-950/40 text-amber-400 px-3 py-1 rounded-full font-medium shadow-sm" title="System operates 100% offline. Local drive files will auto-upload when internet reconnects.">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Offline Mode (Local Drive Active)</span>
            <span className="sm:hidden">Offline (Safe)</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Real-time Admin Action Alerts (Promises + Due Today - Owner Only) */}
        {user?.role === 'owner' && (
          <AdminDueNotifications onNavigateRecovery={onNavigateRecovery} onNavigateAll={onNavigateAll} />
        )}

        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-400" />
          <div className="text-right">
            <p className="text-sm font-semibold text-white leading-tight">{user?.name}</p>
            <span className="text-[10px] text-blue-400 uppercase tracking-wider font-bold">
              {user?.role}
            </span>
          </div>
        </div>

        <button
          onClick={logout}
          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" /> Logout
        </button>
      </div>
    </header>
  );
}