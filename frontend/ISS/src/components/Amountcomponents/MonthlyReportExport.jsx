import React, { useState } from 'react';
import { FileSpreadsheet, Download, RefreshCw, X } from 'lucide-react';
import { API_BASE_URL } from '../../api/axios';

export default function MonthlyReportExport({ onClose }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [downloading, setDownloading] = useState(false);

  const handleExportCSV = async () => {
    setDownloading(true);
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const token = userInfo?.token || localStorage.getItem('token');

      // Fetch summary data for selected month
      const res = await fetch(`${API_BASE_URL}/daily-cash/summary?date=${selectedMonth}-01`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Export failed');

      // Build CSV Data
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Roznamcha Daily Report Summary\n";
      csvContent += `Month,${selectedMonth}\n\n`;
      csvContent += "Opening Cash,Total Recovery,Total Expenses,Closing Balance\n";
      csvContent += `${data.openingBalance},${data.totalRecovery},${data.totalExpenses},${data.closingBalance}\n\n`;

      csvContent += "Today's Expenses Breakdown\n";
      csvContent += "Title,Category,Payment Method,Amount (Rs.),Date\n";
      data.expenses?.forEach(exp => {
        csvContent += `"${exp.title}","${exp.category}","${exp.paymentMethod || 'Cash'}",${exp.amount},"${new Date(exp.createdAt).toLocaleDateString('en-PK')}"\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Roznamcha_Report_${selectedMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      onClose();
    } catch (err) {
      alert(err.message || 'Export error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 text-white shadow-2xl">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold flex items-center gap-2 text-emerald-400">
            <FileSpreadsheet className="w-5 h-5" /> Export Roznamcha Excel
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="text-slate-300 block mb-1">Select Month / Year</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            onClick={handleExportCSV}
            disabled={downloading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 mt-2"
          >
            {downloading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download Excel CSV Report
          </button>
        </div>
      </div>
    </div>
  );
}