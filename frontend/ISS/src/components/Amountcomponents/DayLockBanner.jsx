import React from 'react';
import { Lock, Unlock, ShieldAlert } from 'lucide-react';

export default function DayLockBanner({ isClosed, closedDetails, userRole, onUnlock }) {
  if (!isClosed) return null;

  return (
    <div className="bg-amber-950/60 border border-amber-500/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200 print:hidden">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30 shrink-0">
          <Lock className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-amber-300 text-sm">DAY OFFICIALLY LOCKED</h4>
            <span className="bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded uppercase">
              Closed
            </span>
          </div>
          <p className="text-xs text-amber-200/80 mt-0.5">
            This day's accounts were locked by <strong className="text-white">{closedDetails?.closedBy?.name || 'Admin'}</strong> on{' '}
            <span>{new Date(closedDetails?.updatedAt || Date.now()).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span>. New entries are restricted.
          </p>
        </div>
      </div>

      {userRole === 'owner' && (
        <button
          onClick={onUnlock}
          className="bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/40 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Unlock className="w-3.5 h-3.5" /> Unlock Day
        </button>
      )}
    </div>
  );
}