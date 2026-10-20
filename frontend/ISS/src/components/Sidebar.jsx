import React from 'react';
import { Wallet, LayoutDashboard, Users, CreditCard, BookOpen, ShieldAlert, X, Bell, History, Database } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, isOpen, setIsOpen, userRole }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, role: 'all' },
    { id: 'installments', label: 'Installment Sales (Kist)', icon: CreditCard, role: 'all' },
    { id: 'ledger', label: 'Customer Ledger', icon: BookOpen, role: 'all' },
    { id: 'dailycash', label: 'Daily Cash (Roznamcha)', icon: Wallet, role: 'all' },
    { id: 'recovery', label: 'Recovery Center', icon: ShieldAlert, role: 'all' },
    { id: 'notifications', label: 'Alerts & Notices', icon: Bell, role: 'owner' },
    { id: 'users', label: 'Staff Management', icon: Users, role: 'owner' },
    { id: 'auditlogs', label: 'Activity Logs (Audit)', icon: History, role: 'owner' },
    { id: 'backup', label: 'Backup & Recovery', icon: Database, role: 'owner' },
  ];

  return (
    <>
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)} 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
        />
      )}

      <aside className={`fixed top-0 left-0 z-50 h-screen w-64 bg-slate-900 border-r border-slate-800 transition-transform duration-300 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="p-5 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-base shrink-0 shadow-md shadow-blue-900/40">
              H
            </div>
            <div className="leading-tight truncate">
              <span className="font-bold text-sm text-white block truncate">Hajji Mohammad Nabi</span>
              <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider block">Autos Manager</span>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            if (item.role === 'owner' && userRole !== 'owner') return null;
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' 
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* SHOP HELPLINE, PAYMENTS & LOCATION QR */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 text-xs space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Helpline & Payments</span>
            <span className="text-[9px] text-blue-400 font-semibold">New Karachi</span>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] bg-slate-900/90 px-2 py-1 rounded-lg border border-slate-800/80">
              <span className="text-emerald-400 font-bold">EasyPaisa</span>
              <span className="font-mono text-white font-semibold">03232200325</span>
            </div>
            <div className="flex items-center justify-between text-[11px] bg-slate-900/90 px-2 py-1 rounded-lg border border-slate-800/80">
              <span className="text-amber-400 font-bold">JazzCash</span>
              <span className="font-mono text-white font-semibold">03030246040</span>
            </div>
          </div>

          {/* Shop Location QR Widget */}
          <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800/80">
            <img 
              src="/shop_location_qr.png" 
              alt="Shop Location QR" 
              className="w-10 h-10 rounded bg-white p-0.5 object-contain shrink-0 shadow-sm" 
            />
            <div className="leading-tight text-[10px] min-w-0">
              <span className="text-white font-bold block truncate">📍 Shop Location</span>
              <span className="text-slate-400 block text-[9px] truncate" title="Shop # 14, Sector 16-B, Main Godhra Stop New Karachi">Shop # 14, Sec 16-B, Godhra</span>
              <span className="text-blue-400 text-[8.5px] block font-medium">Scan for Google Map</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}