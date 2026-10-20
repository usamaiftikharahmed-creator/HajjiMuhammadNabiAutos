import { Menu, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AdminDueNotifications from './AdminDueNotifications';

export default function Navbar({ onToggleSidebar, onNavigateRecovery, onNavigateAll }) {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 flex justify-between items-center sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button 
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-slate-400 text-xs hidden sm:inline-block border border-slate-800 bg-slate-950 px-3 py-1 rounded-full">
          Secure HTTP-Only Session
        </span>
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