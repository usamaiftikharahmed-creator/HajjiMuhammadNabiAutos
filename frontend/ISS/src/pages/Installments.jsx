import { useState, useEffect, useMemo } from 'react';
import API from '../api/axios';
import { 
  PlusCircle, 
  CreditCard, 
  AlertCircle, 
  RefreshCw, 
  Eye, 
  Search, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  X 
} from 'lucide-react';
import ViewDetailsModal from '../components/ViewDetailsModal';
import PayKistModal from '../components/PayKistModal';
import AddInstallmentModal from '../components/AddInstallmentModal';
import toast from 'react-hot-toast';
import { getFileUrl, getCustomerInitials } from '../utils/fileUtils';

// Module-level Cache: Page switch karne par dobara API hit aur loading nahi aayegi
let memoryInstallmentsCache = null;

export default function Installments() {
  const [sales, setSales] = useState(memoryInstallmentsCache || []);
  const [loading, setLoading] = useState(!memoryInstallmentsCache);
  const [fetchError, setFetchError] = useState('');
  
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);

  // Fetch or Load from In-Memory Cache
  const loadSales = async (forceRefresh = false) => {
    // Agar cache me data mojood hai aur manual refresh nahi maanga to instantly loading skip karo
    if (!forceRefresh && memoryInstallmentsCache && memoryInstallmentsCache.length > 0) {
      setSales(memoryInstallmentsCache);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError('');
    try {
      const res = await API.get('/installments/sales');
      const salesData = res.data?.sales || (Array.isArray(res.data) ? res.data : []);
      
      memoryInstallmentsCache = salesData; // Update global memory cache
      setSales(salesData);
      
      if (selectedSale) {
        const updated = salesData.find(s => s._id === selectedSale._id);
        if (updated) setSelectedSale(updated);
      }

      if (forceRefresh) {
        toast.success('Sales data refreshed!');
      }
    } catch (err) {
      console.error('Failed to fetch sales:', err);
      const errMsg = err.response?.data?.message || err.message || 'Server connection failed';
      setFetchError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, []);

  // Helper for extracting customer values
  const getCustomerField = (customer, field) => {
    if (!customer) return 'N/A';
    if (typeof customer === 'object') return customer[field] || 'N/A';
    return customer;
  };

  // OPTIMIZATION 1: Pre-index search strings & timestamps to avoid heavy loop overhead on typing
  const processedSales = useMemo(() => {
    return sales.map((item) => {
      const custObj = typeof item.customer === 'object' ? item.customer : {};
      const custId = custObj.customerId || '';
      const custName = custObj.name || '';
      const custPhone = custObj.phone || '';
      const itemName = item.itemName || '';

      const searchString = `${custId} ${custName} ${custPhone} ${itemName} ${item.registrationNumber || ''} ${item.itemRegNumber || ''} ${item.engineNumber || ''} ${item.chassisNumber || ''}`.toLowerCase();
      const createdAtTime = item.createdAt ? new Date(item.createdAt).getTime() : 0;

      return {
        ...item,
        custObj,
        searchString,
        createdAtTime
      };
    });
  }, [sales]);

  // OPTIMIZATION 2: Lightning-Fast Filtering via useMemo
  const filteredSales = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    
    // Parse filter dates once outside loop
    const startTime = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : null;
    const endTime = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;

    return processedSales.filter((item) => {
      // 1. Live Search Index Match
      if (search && !item.searchString.includes(search)) {
        return false;
      }

      // 2. Fast Date Range Comparison using numeric timestamps
      if (startTime && item.createdAtTime < startTime) return false;
      if (endTime && item.createdAtTime > endTime) return false;

      return true;
    });
  }, [processedSales, searchTerm, startDate, endDate]);

  // Reset to page 1 whenever filters or itemsPerPage change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate, itemsPerPage]);

  // OPTIMIZATION 3: Pagination Slicing
  const totalItems = filteredSales.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentSales = useMemo(() => {
    return filteredSales.slice(indexOfFirstItem, indexOfLastItem);
  }, [filteredSales, indexOfFirstItem, indexOfLastItem]);

  const resetFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          @page { size: 5.84in 8.27in; margin: 4mm; }
          *, *:before, *:after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box !important; }
          body * { visibility: hidden; }
          #invoice-a4-wrapper, #invoice-a4-wrapper * { visibility: visible; }
          #invoice-a4-wrapper {
            position: absolute; left: 0; top: 0; width: 100%;
            background: #ffffff !important; color: #000000 !important;
            padding: 4mm; font-family: Arial, sans-serif;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-blue-400" /> Installment Sales (Kist System)
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage customer installment accounts & monthly payments.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => loadSales(true)} 
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2.5 rounded-xl text-sm transition cursor-pointer" 
            title="Refresh Table Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setShowAddModal(true)} 
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-900/30"
          >
            <PlusCircle className="w-4 h-4" /> New Installment Sale
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        
        {/* Controls Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <h2 className="text-lg font-semibold text-white shrink-0">
            All Active & Completed Accounts
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search ID, Name, Item..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 text-white text-xs rounded-xl pl-9 pr-3 py-2 outline-none transition"
              />
            </div>

            {/* Date Range Filters */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-slate-200 outline-none cursor-pointer"
                title="Start Date"
              />
              <span className="text-slate-600">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-slate-200 outline-none cursor-pointer"
                title="End Date"
              />
            </div>

            {/* Per Page Selector */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-300">
              <span className="text-slate-400">Show:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="bg-transparent text-blue-400 font-bold outline-none cursor-pointer"
              >
                <option value={15} className="bg-slate-900 text-white">15</option>
                <option value={20} className="bg-slate-900 text-white">20</option>
                <option value={30} className="bg-slate-900 text-white">30</option>
                <option value={40} className="bg-slate-900 text-white">40</option>
                <option value={50} className="bg-slate-900 text-white">50</option>
              </select>
            </div>

            {/* Reset Filters */}
            {(searchTerm || startDate || endDate) && (
              <button
                onClick={resetFilters}
                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 p-2 rounded-xl text-xs transition cursor-pointer"
                title="Clear Filters"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {fetchError && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span><strong>API Error:</strong> {fetchError}</span>
          </div>
        )}

        {loading ? (
          <div className="text-center text-slate-400 py-12 flex justify-center items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-400" /> Fetching accounts...
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-4">Customer ID</th>
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-4">Total Amount</th>
                    <th className="py-3 px-4">Remaining</th>
                    <th className="py-3 px-4">Monthly Installment</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {currentSales.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="text-center text-slate-500 py-12">
                        No installment accounts match your search/filters.
                      </td>
                    </tr>
                  ) : (
                    currentSales.map((item) => (
                      <tr key={item._id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-4 font-mono text-blue-400 font-bold">
                          {getCustomerField(item.customer, 'customerId')}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center shadow-xs relative">
                              {(item.profilePic || (typeof item.customer === 'object' && item.customer?.profilePic)) ? (
                                <>
                                  <img 
                                    src={getFileUrl(item.profilePic || item.customer.profilePic)} 
                                    alt="Customer" 
                                    className="w-full h-full object-cover rounded-xl"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const fb = e.currentTarget.parentElement?.querySelector('.avatar-fallback');
                                      if (fb) fb.style.display = 'flex';
                                    }}
                                  />
                                  <span className="avatar-fallback text-[11px] font-bold text-blue-400 hidden items-center justify-center w-full h-full">
                                    {getCustomerInitials(getCustomerField(item.customer, 'name'))}
                                  </span>
                                </>
                              ) : (
                                <span className="text-[11px] font-bold text-blue-400">
                                  {getCustomerInitials(getCustomerField(item.customer, 'name'))}
                                </span>
                              )}
                            </div>
                            <div>
                              <span className="font-semibold text-white block text-sm leading-tight">
                                {getCustomerField(item.customer, 'name')}
                              </span>
                              <span className="text-xs text-slate-500 font-mono">{getCustomerField(item.customer, 'phone')}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          <span className="font-medium text-white block">{item.itemName}</span>
                          {(item.modelYear || item.registrationNumber || item.itemRegNumber || item.engineNumber || item.chassisNumber) && (
                            <div className="flex flex-wrap gap-1 text-[10px] mt-0.5 font-mono">
                              {item.modelYear && (
                                <span className="bg-purple-950/60 border border-purple-900 text-purple-300 px-1.5 py-0.5 rounded">
                                  Model: {item.modelYear}
                                </span>
                              )}
                              {(item.registrationNumber || item.itemRegNumber) && (
                                <span className="bg-blue-950/60 border border-blue-900 text-blue-300 px-1.5 py-0.5 rounded">
                                  Reg: {item.registrationNumber || item.itemRegNumber}
                                </span>
                              )}
                              {item.engineNumber && (
                                <span className="bg-amber-950/60 border border-amber-900 text-amber-300 px-1.5 py-0.5 rounded">
                                  Eng: {item.engineNumber}
                                </span>
                              )}
                              {item.chassisNumber && (
                                <span className="bg-emerald-950/60 border border-emerald-900 text-emerald-300 px-1.5 py-0.5 rounded">
                                  Chas: {item.chassisNumber}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">Rs. {item.totalAmount?.toLocaleString()}</td>
                        <td className="py-3.5 px-4 font-semibold text-amber-400">Rs. {item.remainingBalance?.toLocaleString()}</td>
                        <td className="py-3.5 px-4 text-slate-300">Rs. {item.monthlyAmount?.toLocaleString()}</td>
                        <td className="py-3.5 px-4 text-slate-400">Every {item.dueDateDay}th</td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-0.5 text-xs rounded-full uppercase font-bold ${item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'}`}>
                            {item.status || 'active'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => { setSelectedSale(item); setShowDetailModal(true); }}
                            className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ml-auto cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> View Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalItems > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 mt-4 border-t border-slate-800 text-xs text-slate-400">
                <div>
                  Showing <span className="text-white font-semibold">{indexOfFirstItem + 1}</span> to{' '}
                  <span className="text-white font-semibold">{Math.min(indexOfLastItem, totalItems)}</span> of{' '}
                  <span className="text-white font-semibold">{totalItems}</span> entries
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="px-3 py-1 bg-slate-950 border border-slate-800 rounded-xl text-slate-200">
                    Page <span className="text-blue-400 font-bold">{currentPage}</span> of {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sub Components Modals */}
      {showDetailModal && (
        <ViewDetailsModal
          selectedSale={selectedSale}
          onClose={() => setShowDetailModal(false)}
          onRefresh={() => loadSales(true)}
          onOpenPayModal={() => {
            setShowDetailModal(false);
            setShowPayModal(true);
          }}
        />
      )}

      {showPayModal && (
        <PayKistModal
          selectedSale={selectedSale}
          onClose={() => setShowPayModal(false)}
          onSuccess={() => {
            toast.success('Installment payment recorded!');
            loadSales(true);
          }}
        />
      )}

      {showAddModal && (
        <AddInstallmentModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            toast.success('New installment account created successfully!');
            loadSales(true);
          }}
        />
      )}
    </div>
  );
}