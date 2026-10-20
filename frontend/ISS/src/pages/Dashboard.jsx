import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import UserManagement from './UserManagement';
import Installments from './Installments';
import CustomerLedger from './CustomerLedger';
import DailyCashManager from './DailyCashManager';
import RecoveryManager from './RecoveryManager';
import NotificationsCenter from './NotificationsCenter';
import AuditLogs from './AuditLogs';
import BackupManager from './BackupManager';
import DashboardOverview from '../components/DashboardOverview';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user } = useAuth();

  // If a staff user ever tries to navigate to an owner-only tab, fallback to dashboard
  const isOwner = user?.role === 'owner';
  const ownerOnlyTabs = ['notifications', 'users', 'auditlogs', 'backup'];

  useEffect(() => {
    if (user && !isOwner && ownerOnlyTabs.includes(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [user, isOwner, activeTab]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen}
        userRole={user?.role}
      />

      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <Navbar 
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
          onNavigateRecovery={() => setActiveTab('recovery')} 
          onNavigateAll={() => setActiveTab('notifications')}
        />

        <main className="flex-1 p-6 sm:p-10">
          {activeTab === 'dashboard' && (
            <DashboardOverview 
              setActiveTab={setActiveTab} 
              userName={user?.name} 
            />
          )}

          {activeTab === 'installments' && <Installments />}
          {activeTab === 'ledger' && <CustomerLedger />}
          {activeTab === 'dailycash' && <DailyCashManager />}
          {activeTab === 'recovery' && <RecoveryManager />}
          {activeTab === 'notifications' && isOwner && <NotificationsCenter setActiveTab={setActiveTab} />}
          {activeTab === 'users' && isOwner && <UserManagement />}
          {activeTab === 'auditlogs' && isOwner && <AuditLogs />}
          {activeTab === 'backup' && isOwner && <BackupManager />}
        </main>
      </div>
    </div>
  );
}