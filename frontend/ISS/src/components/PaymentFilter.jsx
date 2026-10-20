import React from 'react';
import { Filter, RotateCcw, Calendar } from 'lucide-react';

export default function PaymentFilter({ 
  startDate, setStartDate, 
  endDate, setEndDate, 
  filterType, setFilterType, 
  onReset 
}) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
      <div className="flex items-center gap-2 text-slate-400">
        <Filter className="w-4 h-4 text-blue-400" />
        <span className="font-medium text-slate-300">Filter Payments:</span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Date From */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-transparent text-slate-200 focus:outline-none text-xs"
          />
        </div>

        <span className="text-slate-600">to</span>

        {/* Date To */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-transparent text-slate-200 focus:outline-none text-xs"
          />
        </div>

        {/* Payment Type */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-slate-900 border border-slate-800 text-slate-300 px-2.5 py-1.5 rounded-lg focus:outline-none"
        >
          <option value="ALL">All Types</option>
          <option value="ADVANCE">Advance Only</option>
          <option value="INSTALLMENT">Installments Only</option>
        </select>

        {/* Reset Filter Button */}
        {(startDate || endDate || filterType !== 'ALL') && (
          <button
            onClick={onReset}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>
    </div>
  );
}