import React, { useState, useRef } from 'react';
import { 
  Search, Phone, MapPin, CreditCard, ShieldCheck, 
  ShoppingBag, Printer, FileText, DollarSign, RefreshCw, Send, PlusCircle, Pencil, X, Save, Hash, FileCheck,
  Lock, Unlock, Eye, EyeOff, AlertCircle, CheckCircle2, UserCheck, Calculator,
  FolderPlus, Upload, Trash2, ExternalLink, Paperclip, Plus, Download,
  Camera, User, ZoomIn
} from 'lucide-react';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { getFileUrl, getCustomerInitials } from '../utils/fileUtils';
import { getPromiseMonthsInfo } from '../utils/promiseUtils';
import { compressImage } from '../utils/imageCompressor';

import PaymentReceiptModal from '../components/PaymentReceiptModal';
import OverdueAlert from '../components/OverdueAlert';
import PaymentFilter from '../components/PaymentFilter';
import QuickPaymentModal from '../components/QuickPaymentModal';

export default function CustomerLedger() {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ledgerData, setLedgerData] = useState(null);
  
  // Modals state
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState(null);
  const [showQuickPay, setShowQuickPay] = useState(false);
  const [quickPaySaleId, setQuickPaySaleId] = useState('');
  const [selectedImageForZoom, setSelectedImageForZoom] = useState(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Admin Password Verification Modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);

  // Edit Customer & Sale Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedSaleIdx, setSelectedSaleIdx] = useState(0);
  const [touched, setTouched] = useState({});
  const [editProfilePicFile, setEditProfilePicFile] = useState(null);
  const [editProfilePicPreview, setEditProfilePicPreview] = useState(null);

  const [editFormData, setEditFormData] = useState({
    // Customer Info
    name: '',
    phone: '',
    phone2: '',
    cnic: '',
    address: '',
    guarantorName: '',
    guarantorPhone: '',
    guarantor2Name: '',
    guarantor2Phone: '',

    // Sale Info
    saleId: '',
    itemName: '',          // LOCKED
    totalAmount: 0,        // LOCKED
    advancePayment: 0,     // LOCKED
    remainingBalance: 0,   // DISPLAY
    itemRegNumber: '',     // EDITABLE
    registrationNumber: '',// EDITABLE
    modelYear: '',         // EDITABLE
    engineNumber: '',      // EDITABLE
    chassisNumber: '',     // EDITABLE
    monthlyAmount: '',     // EDITABLE
    dueDateDay: '5',       // EDITABLE
    totalMonths: '',       // EDITABLE
    promiseMonth: '',      // EDITABLE
    promisedMonths: '',    // EDITABLE
    status: 'active',      // EDITABLE
    remarks: ''            // EDITABLE
  });

  // Document Management Modal state
  const [showDocModal, setShowDocModal] = useState(false);
  const [docSaleId, setDocSaleId] = useState('');
  const [newDocList, setNewDocList] = useState([{ title: '', file: null }]);
  const [isUploadingDocs, setIsUploadingDocs] = useState(false);
  const [isDeletingDocId, setIsDeletingDocId] = useState(null);
  const [docFormKey, setDocFormKey] = useState(0);
  const uploadDocFormRef = useRef(null);

  // Filters state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // Flexible Search Handler (Supports Customer ID, Phone, and Reg Number)
  const handleSearch = async (e, overrideQuery) => {
    e?.preventDefault();
    const query = (overrideQuery || searchQuery || ledgerData?.customer?.customerId || ledgerData?.customer?.phone || '').trim();
    if (!query) return;

    setError('');
    setLoading(true);

    let cleaned = query;
    let formattedQuery = cleaned;

    if (/^\d+$/.test(cleaned) && cleaned.length <= 5 && !cleaned.startsWith('03')) {
      formattedQuery = `CUST-${cleaned}`;
    }

    try {
      const res = await API.get(`/installments/ledger/${encodeURIComponent(formattedQuery.toUpperCase())}`);

      if (res.data?.success) {
        setLedgerData(res.data);
      } else {
        setError(res.data?.message || 'Customer or Item record not found');
        setLedgerData(null);
      }
    } catch (err) {
      console.error('Ledger Fetch Error:', err);
      setError(err.response?.data?.message || 'Server error while fetching ledger data');
      setLedgerData(null);
    } finally {
      setLoading(false);
    }
  };

  // STEP 1: Click "Edit Profile" -> Open Password Verification Modal First
  const handleOpenEdit = () => {
    if (!ledgerData?.customer) return;
    setAdminPasswordInput('');
    setPasswordError('');
    setShowPasswordText(false);
    setShowPasswordModal(true);
  };

  // STEP 2: Verify Admin Password with Backend
  const handleVerifyPassword = async (e) => {
    e?.preventDefault();
    if (!adminPasswordInput.trim()) {
      setPasswordError('Admin password enter karein');
      return;
    }

    setIsVerifyingPassword(true);
    setPasswordError('');

    try {
      const res = await API.post('/auth/verify-admin', { password: adminPasswordInput });
      if (res.data?.success) {
        toast.success('Admin Verified! Editing unlocked.');
        setShowPasswordModal(false);
        setAdminPasswordInput('');

        // Populate Edit Form with Current Customer & Sale Details
        const cust = ledgerData.customer;
        const sales = ledgerData.installmentSales || [];
        const primarySale = sales[0] || null;

        setSelectedSaleIdx(0);
        setTouched({});
        setEditProfilePicFile(null);
        setEditProfilePicPreview(cust.profilePic ? getFileUrl(cust.profilePic) : null);
        setEditFormData({
          name: cust.name || '',
          phone: cust.phone || '',
          phone2: cust.phone2 || '',
          cnic: cust.cnic || '',
          address: cust.address || '',
          guarantorName: cust.guarantorName || '',
          guarantorPhone: cust.guarantorPhone || '',
          guarantor2Name: cust.guarantor2Name || '',
          guarantor2Phone: cust.guarantor2Phone || '',

          saleId: primarySale?._id || '',
          itemName: primarySale?.itemName || '',
          totalAmount: primarySale?.totalAmount || 0,
          advancePayment: primarySale?.advancePayment || 0,
          remainingBalance: primarySale?.remainingBalance || 0,
          itemRegNumber: primarySale?.registrationNumber || primarySale?.itemRegNumber || primarySale?.regNumber || '',
          registrationNumber: primarySale?.registrationNumber || primarySale?.itemRegNumber || '',
          modelYear: primarySale?.modelYear || '',
          engineNumber: primarySale?.engineNumber || '',
          chassisNumber: primarySale?.chassisNumber || '',
          monthlyAmount: primarySale?.monthlyAmount || '',
          dueDateDay: primarySale?.dueDateDay || '5',
          totalMonths: primarySale?.totalMonths || '',
          promiseMonth: primarySale?.promiseMonth || '',
          promisedMonths: primarySale?.promisedMonths || '',
          status: primarySale?.status || 'active',
          remarks: primarySale?.remarks || ''
        });

        setShowEditModal(true);
      } else {
        setPasswordError(res.data?.message || 'Ghalat Admin Password!');
      }
    } catch (err) {
      console.error('Password verify error:', err);
      setPasswordError(err.response?.data?.message || 'Ghalat Admin Password! Access Denied.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  // Switch between customer's purchased items inside edit modal
  const handleSelectSaleToEdit = (idx) => {
    setSelectedSaleIdx(idx);
    const sale = ledgerData?.installmentSales?.[idx];
    if (sale) {
      setEditFormData(prev => ({
        ...prev,
        saleId: sale._id,
        itemName: sale.itemName || '',
        totalAmount: sale.totalAmount || 0,
        advancePayment: sale.advancePayment || 0,
        remainingBalance: sale.remainingBalance || 0,
        itemRegNumber: sale.registrationNumber || sale.itemRegNumber || sale.regNumber || '',
        registrationNumber: sale.registrationNumber || sale.itemRegNumber || '',
        modelYear: sale.modelYear || '',
        engineNumber: sale.engineNumber || '',
        chassisNumber: sale.chassisNumber || '',
        monthlyAmount: sale.monthlyAmount || '',
        dueDateDay: sale.dueDateDay || '5',
        totalMonths: sale.totalMonths || '',
        promiseMonth: sale.promiseMonth || '',
        promisedMonths: sale.promisedMonths || '',
        status: sale.status || 'active',
        remarks: sale.remarks || ''
      }));
    }
  };

  // Dedicated Phone Handler for Edit Form (Max 11 digits, numbers only)
  const handleEditPhoneChange = (e) => {
    const { name, value } = e.target;
    const cleanDigits = value.replace(/\D/g, '').slice(0, 11);
    setEditFormData(prev => ({ ...prev, [name]: cleanDigits }));
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  // Dedicated CNIC Handler for Edit Form (Auto-hyphen: 01201-0245126-5, 13 digits)
  const handleEditCnicChange = (e) => {
    const { name, value } = e.target;
    const prevVal = editFormData[name] || '';
    const raw = value.replace(/\D/g, '').slice(0, 13);
    const isDeleting = prevVal.length > value.length;

    let formatted = '';
    if (raw.length <= 5) {
      formatted = raw;
      if (raw.length === 5 && !isDeleting) {
        formatted += '-';
      }
    } else if (raw.length <= 12) {
      formatted = raw.slice(0, 5) + '-' + raw.slice(5);
      if (raw.length === 12 && !isDeleting) {
        formatted += '-';
      }
    } else {
      formatted = raw.slice(0, 5) + '-' + raw.slice(5, 12) + '-' + raw.slice(12, 13);
    }

    setEditFormData(prev => ({ ...prev, [name]: formatted }));
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  // STEP 3: Save Updated Customer & Sale Details
  const handleUpdateCustomerAndSale = async (e) => {
    e.preventDefault();

    // 1. Mandatory customer name validation
    if (!editFormData.name?.trim()) {
      toast.error('Customer Name likhna zaroori hai');
      return;
    }

    // 2. Phone 1 check (strictly 11 digits)
    if (!editFormData.phone || editFormData.phone.length !== 11) {
      toast.error('Mobile Number 1 poora 11 digits ka hona zaroori hai (e.g. 03001234567)');
      setTouched(prev => ({ ...prev, phone: true }));
      return;
    }

    // 3. Phone 2 check (if entered, must be 11 digits)
    if (editFormData.phone2 && editFormData.phone2.length !== 11) {
      toast.error('Mobile Number 2 poora 11 digits hona chahiye');
      setTouched(prev => ({ ...prev, phone2: true }));
      return;
    }

    // 4. CNIC check (13 digits: 01201-0245126-5)
    const cnicDigits = editFormData.cnic.replace(/\D/g, '');
    if (editFormData.cnic && cnicDigits.length !== 13) {
      toast.error('CNIC Number poora 13 digits (e.g. 01201-0245126-5) hona chahiye');
      setTouched(prev => ({ ...prev, cnic: true }));
      return;
    }

    // 5. Guarantor phones check
    if (editFormData.guarantorPhone && editFormData.guarantorPhone.length !== 11) {
      toast.error('Guarantor 1 Phone poora 11 digits hona chahiye');
      setTouched(prev => ({ ...prev, guarantorPhone: true }));
      return;
    }

    if (editFormData.guarantor2Phone && editFormData.guarantor2Phone.length !== 11) {
      toast.error('Guarantor 2 Phone poora 11 digits hona chahiye');
      setTouched(prev => ({ ...prev, guarantor2Phone: true }));
      return;
    }

    setIsUpdating(true);

    try {
      const customerId = ledgerData.customer._id;

      // 1. Update Customer Profile (supports profilePic file)
      const custPayload = new FormData();
      custPayload.append('name', editFormData.name);
      custPayload.append('phone', editFormData.phone);
      custPayload.append('phone2', editFormData.phone2);
      custPayload.append('cnic', editFormData.cnic);
      custPayload.append('address', editFormData.address);
      custPayload.append('guarantorName', editFormData.guarantorName);
      custPayload.append('guarantorPhone', editFormData.guarantorPhone);
      custPayload.append('guarantor2Name', editFormData.guarantor2Name);
      custPayload.append('guarantor2Phone', editFormData.guarantor2Phone);
      if (editProfilePicFile) {
        custPayload.append('profilePic', editProfilePicFile);
      }

      await API.put(`/installments/customers/${customerId}`, custPayload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // 2. If a sale exists, update all sale fields (Fully editable by admin)
      if (editFormData.saleId) {
        await API.put(`/installments/sales/${editFormData.saleId}`, {
          itemName: editFormData.itemName,
          totalAmount: editFormData.totalAmount,
          advancePayment: editFormData.advancePayment,
          itemRegNumber: editFormData.registrationNumber || editFormData.itemRegNumber,
          registrationNumber: editFormData.registrationNumber || editFormData.itemRegNumber,
          modelYear: editFormData.modelYear,
          engineNumber: editFormData.engineNumber,
          chassisNumber: editFormData.chassisNumber,
          monthlyAmount: editFormData.monthlyAmount,
          dueDateDay: editFormData.dueDateDay,
          totalMonths: editFormData.totalMonths,
          promiseMonth: editFormData.promiseMonth,
          promisedMonths: editFormData.promisedMonths,
          status: editFormData.status,
          remarks: editFormData.remarks,
          guarantorName: editFormData.guarantorName,
          guarantorPhone: editFormData.guarantorPhone,
          guarantor2Name: editFormData.guarantor2Name,
          guarantor2Phone: editFormData.guarantor2Phone
        });
      }

      toast.success('Customer aur Khata details kamyabi se update ho gayin!');
      setShowEditModal(false);
      handleSearch();
    } catch (err) {
      console.error('Update error:', err);
      toast.error(err.response?.data?.message || 'Details update karne me masla aaya');
    } finally {
      setIsUpdating(false);
    }
  };

  // Direct Quick Photo Upload from Customer Card
  const handleQuickPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Image file select karein (JPG, PNG, WebP)');
      return;
    }
    const customerId = ledgerData?.customer?._id;
    if (!customerId) return;

    const compressed = await compressImage(file, { maxWidth: 1000, maxHeight: 1000, quality: 0.8 });
    const formData = new FormData();
    formData.append('profilePic', compressed);

    setIsUploadingPhoto(true);
    const toastId = toast.loading('Customer photo update ho rahi hai...');
    try {
      const res = await API.post(`/installments/customers/${customerId}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.success) {
        toast.success('Customer profile photo kamyabi se update ho gayi!', { id: toastId });
        setLedgerData(prev => ({
          ...prev,
          customer: { ...prev.customer, profilePic: res.data.profilePic }
        }));
      } else {
        toast.error(res.data?.message || 'Update karne me masla aaya', { id: toastId });
      }
    } catch (err) {
      console.error('Quick photo upload error:', err);
      toast.error(err.response?.data?.message || 'Photo upload nahi ho saki', { id: toastId });
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  // --- DOCUMENT MANAGEMENT HANDLERS ---
  const handleOpenDocModal = (saleId) => {
    const targetSaleId = saleId || ledgerData?.installmentSales?.[0]?._id;
    if (!targetSaleId) {
      toast.error('Pehle customer record search karein');
      return;
    }
    setDocSaleId(targetSaleId);
    setNewDocList([{ title: '', file: null }]);
    setDocFormKey(prev => prev + 1);
    if (uploadDocFormRef.current) {
      try { uploadDocFormRef.current.reset(); } catch (e) {}
    }
    setShowDocModal(true);
  };

  const handleAddDocRow = () => {
    setNewDocList(prev => [...prev, { title: '', file: null }]);
  };

  const handleRemoveDocRow = (index) => {
    setNewDocList(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleDocChange = async (index, field, value) => {
    const updated = [...newDocList];
    if (field === 'file' && value) {
      updated[index][field] = await compressImage(value);
    } else {
      updated[index][field] = value;
    }
    setNewDocList(updated);
  };

  const handleSelectDocTitleSuggestion = (index, suggestion) => {
    const updated = [...newDocList];
    updated[index].title = suggestion;
    setNewDocList(updated);
  };

  const handleUploadNewDocs = async (e) => {
    e.preventDefault();
    if (isUploadingDocs) return; // Strict lock against rapid double-clicks
    if (!docSaleId) return;

    const validDocs = newDocList.filter(d => d.file !== null);
    if (validDocs.length === 0) {
      toast.error('Kam az kam aik document file select karein');
      return;
    }

    setIsUploadingDocs(true);

    try {
      const formData = new FormData();
      validDocs.forEach((doc, idx) => {
        formData.append('documents', doc.file);
        formData.append(`docTitle_${idx}`, doc.title.trim() || doc.file.name || `Document ${idx + 1}`);
      });

      const res = await API.post(`/installments/sales/${docSaleId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data?.success) {
        toast.success('Document(s) kamyabi se attach ho gaye!');
        
        // 100% Guaranteed Form & File-Input Clearing
        setNewDocList([{ title: '', file: null }]);
        setDocFormKey(prev => prev + 1);
        if (uploadDocFormRef.current) {
          try { uploadDocFormRef.current.reset(); } catch (e) {}
        }

        if (res.data.documents) {
          setLedgerData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              installmentSales: (prev.installmentSales || []).map(s => 
                s._id === docSaleId ? { ...s, documents: res.data.documents } : s
              )
            };
          });
        }
        await handleSearch();
      } else {
        toast.error(res.data?.message || 'Document upload karne me masla aaya');
      }
    } catch (err) {
      console.error('Upload Doc Error:', err);
      toast.error(err.response?.data?.message || 'Server error while uploading document');
    } finally {
      setIsUploadingDocs(false);
    }
  };

  const handleDeleteDoc = async (docId) => {
    if (!docSaleId || !docId) return;
    if (!window.confirm('Kya aap waqai yeh document delete karna chahte hain?')) return;

    setIsDeletingDocId(docId);
    try {
      const res = await API.delete(`/installments/sales/${docSaleId}/documents/${docId}`);
      if (res.data?.success) {
        toast.success('Document delete ho gaya');
        if (res.data.documents) {
          setLedgerData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              installmentSales: (prev.installmentSales || []).map(s => 
                s._id === docSaleId ? { ...s, documents: res.data.documents } : s
              )
            };
          });
        } else {
          setLedgerData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              installmentSales: (prev.installmentSales || []).map(s => 
                s._id === docSaleId ? { ...s, documents: (s.documents || []).filter(d => d._id !== docId) } : s
              )
            };
          });
        }
        await handleSearch();
      } else {
        toast.error(res.data?.message || 'Document delete nahi ho saka');
      }
    } catch (err) {
      console.error('Delete doc error:', err);
      toast.error(err.response?.data?.message || 'Error deleting document');
    } finally {
      setIsDeletingDocId(null);
    }
  };



  const currentDocSale = ledgerData?.installmentSales?.find(s => s._id === docSaleId) || ledgerData?.installmentSales?.[0] || null;

  const calculateTotals = () => {
    if (!ledgerData || !Array.isArray(ledgerData.installmentSales)) return { totalPurchases: 0, totalPaid: 0, totalRemaining: 0 };
    const sales = ledgerData.installmentSales;
    const totalPurchases = sales.reduce((acc, sale) => acc + (sale.totalAmount || 0), 0);
    const totalRemaining = sales.reduce((acc, sale) => acc + (sale.remainingBalance || 0), 0);
    const totalPaid = totalPurchases - totalRemaining;
    return { totalPurchases, totalPaid, totalRemaining };
  };

  const { totalPurchases, totalPaid, totalRemaining } = calculateTotals();

  const handleWhatsAppShare = () => {
    if (!ledgerData) return;
    const { customer } = ledgerData;
    let rawPhone = customer.phone?.replace(/\D/g, '');
    if (rawPhone?.startsWith('03')) rawPhone = '92' + rawPhone.slice(1);

    const message = 
      `*HAJJI MOHAMMAD NABI AUTOS*\n` +
      `*CUSTOMER KHATA & LEDGER STATEMENT*\n` +
      `----------------------------------------\n` +
      `*Customer:* ${customer.name}\n` +
      `*Customer ID:* ${customer.customerId}\n` +
      `*Phone:* ${customer.phone}\n` +
      `----------------------------------------\n` +
      `*Total Purchased Value:* Rs. ${totalPurchases.toLocaleString()}\n` +
      `*Total Recovered / Paid:* Rs. ${totalPaid.toLocaleString()}\n` +
      `*Outstanding Balance:* Rs. ${totalRemaining.toLocaleString()}\n` +
      `----------------------------------------\n` +
      `*Shop Address:* Shop # 14, Sector 16-B, Main Godhra Stop New Karachi\n` +
      `*Online Accounts:*\n` +
      `📲 03232200325 (EasyPaisa)\n` +
      `📲 03030246040 (JazzCash)\n` +
      `Shukriya!`;

    window.open(`https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const filteredPayments = (Array.isArray(ledgerData?.payments) ? ledgerData.payments : []).filter(payment => {
    const payDate = new Date(payment.createdAt);
    if (startDate && payDate < new Date(startDate)) return false;
    if (endDate && payDate > new Date(endDate + 'T23:59:59')) return false;

    const isAdvance = payment.forMonth?.toLowerCase().includes('advance') || payment.notes?.toLowerCase().includes('advance');
    if (filterType === 'ADVANCE' && !isAdvance) return false;
    if (filterType === 'INSTALLMENT' && isAdvance) return false;

    return true;
  }) || [];

  return (
    <div className="space-y-6 text-white p-2 sm:p-4 max-w-7xl mx-auto print:p-0 print:m-0 print:w-full">
      
      {/* SEARCH HEADER */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl print:hidden">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-6 h-6 text-blue-400" />
          <h2 className="text-xl font-bold text-white">Customer Complete Ledger (Khata)</h2>
        </div>
        <p className="text-slate-400 text-xs mb-5">
          Search using Customer ID (e.g. <span className="text-blue-400 font-bold">1002</span>), Phone Number, or <span className="text-blue-400 font-bold">Item Reg No</span>.
        </p>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 max-w-2xl">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID (1002), Phone (0321...), or Reg No (KED-78767)"
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition placeholder:text-slate-600"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search Ledger
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-red-300 text-xs">
            {error}
          </div>
        )}
      </div>

      {ledgerData && (
        <div className="space-y-6 print:space-y-4">

          {/* Printable Official Shop Header (Visible on print) */}
          <div className="hidden print:flex justify-between items-center border-b-2 border-slate-900 pb-3 mb-2">
            <div>
              <h1 className="text-xl font-black text-slate-900 uppercase">Hajji Mohammad Nabi Autos</h1>
              <p className="text-xs text-slate-700 font-semibold mt-0.5">Customer Ledger Statement</p>
              <div className="text-[10px] text-slate-600 flex items-center gap-2 mt-0.5">
                <span>📍 <strong>Shop # 14, Sector 16-B, Main Godhra Stop New Karachi</strong></span>
                <span>•</span>
                <span>📞 <strong>03232200325</strong> (EasyPaisa)</span>
                <span>•</span>
                <span>📞 <strong>03030246040</strong> (JazzCash)</span>
              </div>
            </div>
            <div className="text-center p-1 bg-white border border-slate-300 rounded-lg">
              <img src="/shop_location_qr.png" alt="Shop Location QR" className="w-12 h-12 object-contain mx-auto" />
              <span className="text-[8px] font-bold text-slate-700 block leading-tight mt-0.5">📍 Shop Location</span>
            </div>
          </div>

          {/* OVERDUE WARNING BANNER */}
          <OverdueAlert sales={Array.isArray(ledgerData?.installmentSales) ? ledgerData.installmentSales : []} />

          {/* CUSTOMER PROFILE CARD */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 print:border-gray-300 print:bg-white print:p-4">
            <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
              
              {/* Profile Avatar with Photo & Quick Upload */}
              <div className="relative group shrink-0">
                <div 
                  onClick={() => ledgerData.customer.profilePic && setSelectedImageForZoom(getFileUrl(ledgerData.customer.profilePic))}
                  className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 flex items-center justify-center shadow-xl transition ${
                    ledgerData.customer.profilePic 
                      ? 'border-blue-500/50 bg-slate-950 cursor-pointer hover:border-blue-400 hover:scale-[1.02]' 
                      : 'border-slate-800 bg-gradient-to-br from-blue-950/60 to-slate-900'
                  }`}
                  title={ledgerData.customer.profilePic ? 'Click to view full photo' : 'Tasveer upload karne ke liye camera icon dabayein'}
                >
                  {ledgerData.customer.profilePic ? (
                    <>
                      <img 
                        src={getFileUrl(ledgerData.customer.profilePic)} 
                        alt={ledgerData.customer.name}
                        className="w-full h-full object-cover rounded-2xl" 
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fb = e.currentTarget.parentElement?.querySelector('.avatar-fallback');
                          if (fb) fb.style.display = 'flex';
                        }}
                      />
                      <div className="avatar-fallback hidden flex-col items-center justify-center text-center p-1 w-full h-full">
                        <span className="text-xl sm:text-2xl font-black text-blue-400">
                          {getCustomerInitials(ledgerData.customer.name)}
                        </span>
                        <span className="text-[9px] text-slate-500 font-medium mt-0.5">No Photo</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-1">
                      <span className="text-xl sm:text-2xl font-black text-blue-400">
                        {getCustomerInitials(ledgerData.customer.name)}
                      </span>
                      <span className="text-[9px] text-slate-500 font-medium mt-0.5">No Photo</span>
                    </div>
                  )}
                </div>

                {/* Quick Photo Upload Camera Button */}
                <label 
                  className="absolute -bottom-1 -right-1 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg border-2 border-slate-900 cursor-pointer transition hover:scale-110 print:hidden"
                  title="Customer Photo Upload / Change Karein"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleQuickPhotoUpload} 
                    disabled={isUploadingPhoto}
                  />
                </label>
              </div>

              {/* Customer Details */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="bg-blue-600/20 border border-blue-500/30 text-blue-400 font-black px-3 py-1 rounded-lg text-sm print:border-blue-600 print:text-blue-700">
                    {ledgerData.customer.customerId}
                  </span>
                  <h3 className="text-2xl font-bold text-white print:text-black">{ledgerData.customer.name}</h3>
                </div>
                
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1 print:text-gray-700">
                  <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-500" /> {ledgerData.customer.phone}</span>
                  {ledgerData.customer.phone2 && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-500" /> {ledgerData.customer.phone2}</span>}
                  {ledgerData.customer.cnic && <span className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5 text-slate-500" /> {ledgerData.customer.cnic}</span>}
                  {ledgerData.customer.address && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-500" /> {ledgerData.customer.address}</span>}
                </div>

                {(ledgerData.customer.guarantorName || ledgerData.customer.guarantorPhone || ledgerData.customer.guarantor2Name) && (
                  <div className="mt-3 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-300 flex flex-wrap items-center gap-4 print:bg-gray-50 print:border-gray-300 print:text-black">
                    {ledgerData.customer.guarantorName && (
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        <strong>G1:</strong> {ledgerData.customer.guarantorName} ({ledgerData.customer.guarantorPhone || 'N/A'})
                      </span>
                    )}
                    {ledgerData.customer.guarantor2Name && (
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                        <strong>G2:</strong> {ledgerData.customer.guarantor2Name} ({ledgerData.customer.guarantor2Phone || 'N/A'})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ACTION BUTTONS (NOW INCLUDES "ADD DOCUMENTS") */}
            <div className="flex flex-wrap items-center gap-2.5 print:hidden">
              <button
                onClick={() => {
                  setQuickPaySaleId('');
                  setShowQuickPay(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-emerald-950"
              >
                <PlusCircle className="w-4 h-4" /> Collect Payment
              </button>

              {/* Edit Profile Button -> Triggers Admin Password Check */}
              <button
                onClick={handleOpenEdit}
                className="bg-amber-600 hover:bg-amber-500 text-white px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-amber-950/30"
              >
                <Pencil className="w-4 h-4" /> Edit Profile
              </button>

              {/* ADD DOCUMENTS BUTTON */}
              <button
                onClick={() => handleOpenDocModal(ledgerData.installmentSales?.[0]?._id)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-indigo-950/40"
              >
                <FolderPlus className="w-4 h-4" /> Add Documents
              </button>

              <button
                onClick={handleWhatsAppShare}
                className="bg-green-700 hover:bg-green-600 text-white px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Send className="w-4 h-4" /> WhatsApp
              </button>

              <button
                onClick={() => window.print()}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Printer className="w-4 h-4" /> Print Ledger
              </button>
            </div>
          </div>

          {/* FINANCIAL SUMMARY CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:grid-cols-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1 print:bg-white print:border-gray-300">
              <p className="text-slate-400 text-xs font-medium print:text-gray-600">Total Purchase Value</p>
              <h4 className="text-xl font-bold text-white print:text-black">Rs. {totalPurchases.toLocaleString()}</h4>
              <p className="text-[11px] text-slate-500 print:text-gray-500">{Array.isArray(ledgerData?.installmentSales) ? ledgerData.installmentSales.length : 0} Total Accounts</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1 print:bg-white print:border-gray-300">
              <p className="text-slate-400 text-xs font-medium print:text-gray-600">Total Amount Paid</p>
              <h4 className="text-xl font-bold text-emerald-400 print:text-emerald-700">Rs. {totalPaid.toLocaleString()}</h4>
              <p className="text-[11px] text-slate-500 print:text-gray-500">Advance + Installments</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1 print:bg-white print:border-gray-300">
              <p className="text-slate-400 text-xs font-medium print:text-gray-600">Total Balance Outstanding</p>
              <h4 className="text-xl font-bold text-rose-400 print:text-red-700">Rs. {totalRemaining.toLocaleString()}</h4>
              <p className="text-[11px] text-slate-500 print:text-gray-500">Remaining Amount Due</p>
            </div>
          </div>

          {/* PURCHASED ITEMS */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl print:bg-white print:border-gray-300">
            <h4 className="text-base font-bold text-white flex items-center gap-2 print:text-black">
              <ShoppingBag className="w-5 h-5 text-blue-400" /> Purchased Installment Items
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(Array.isArray(ledgerData?.installmentSales) ? ledgerData.installmentSales : []).map((sale) => {
                const regNo = sale.registrationNumber || sale.itemRegNumber || sale.regNumber || sale.registrationNo || sale.regNo;
                const engineNo = sale.engineNumber;
                const chassisNo = sale.chassisNumber;

                return (
                  <div key={sale._id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 print:bg-gray-50 print:border-gray-300">
                    <div className="flex justify-between items-start">
                      <div>
                        <h5 className="font-bold text-white text-base print:text-black">{sale.itemName}</h5>
                        
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {sale.modelYear && (
                            <p className="text-xs text-purple-400 font-semibold flex items-center gap-1 print:text-purple-800">
                              Model: <span className="bg-purple-950/80 border border-purple-800 text-purple-200 px-2 py-0.5 rounded text-xs font-bold font-mono print:bg-gray-200 print:text-black">{sale.modelYear}</span>
                            </p>
                          )}
                          {regNo && (
                            <p className="text-xs text-blue-400 font-semibold flex items-center gap-1 print:text-blue-800">
                              <Hash className="w-3.5 h-3.5 text-blue-400" /> Reg: <span className="bg-blue-950/80 border border-blue-800 text-blue-200 px-2 py-0.5 rounded text-xs font-bold font-mono print:bg-gray-200 print:text-black">{regNo}</span>
                            </p>
                          )}
                          {engineNo && (
                            <p className="text-xs text-amber-400 font-semibold flex items-center gap-1 print:text-amber-800">
                              Eng: <span className="bg-amber-950/80 border border-amber-800 text-amber-200 px-2 py-0.5 rounded text-xs font-bold font-mono print:bg-gray-200 print:text-black">{engineNo}</span>
                            </p>
                          )}
                          {chassisNo && (
                            <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1 print:text-emerald-800">
                              Chas: <span className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 px-2 py-0.5 rounded text-xs font-bold font-mono print:bg-gray-200 print:text-black">{chassisNo}</span>
                            </p>
                          )}
                          {!regNo && !engineNo && !chassisNo && !sale.modelYear && (
                            <p className="text-xs text-slate-500 font-medium">No Reg/Model/Engine/Chassis</p>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-400 print:text-gray-600 mt-1">
                          Date: {new Date(sale.createdAt).toLocaleDateString('en-PK')}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                          sale.status === 'completed' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {sale.status || 'active'}
                        </span>

                        <div className="flex items-center gap-1.5 print:hidden">
                          {Number(sale.remainingBalance || 0) > 0 && (
                            <button
                              onClick={() => {
                                setQuickPaySaleId(sale._id);
                                setShowQuickPay(true);
                              }}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded-lg text-[10px] font-semibold transition flex items-center gap-1 cursor-pointer shadow-md shadow-emerald-950"
                              title="Collect Payment for this item"
                            >
                              <PlusCircle className="w-3 h-3" /> Wasool Kist
                            </button>
                          )}

                          {/* Add Docs Button for this specific item */}
                          <button
                            onClick={() => handleOpenDocModal(sale._id)}
                            className="bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 hover:text-white px-2 py-1 rounded-lg text-[10px] font-semibold border border-indigo-700/40 transition flex items-center gap-1 cursor-pointer"
                            title="Attach Documents to this item"
                          >
                            <FolderPlus className="w-3 h-3" /> Add Docs
                          </button>

                          <button
                            onClick={() => {
                              const salePayment = ledgerData.payments.find(p => (p.installmentSale?._id || p.installmentSale) === sale._id) || {
                                amountPaid: sale.advancePayment || 0,
                                createdAt: sale.createdAt,
                                forMonth: 'Advance Payment',
                                paymentMethod: 'Cash'
                              };
                              setSelectedPayment(salePayment);
                              setSelectedSaleForReceipt({ ...sale, customer: ledgerData.customer });
                            }}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2 py-1 rounded-lg text-[10px] font-semibold border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                            title="Print Document/Receipt"
                          >
                            <Printer className="w-3 h-3" /> Print
                          </button>
                        </div>
                      </div>
                    </div>

                    {(sale.guarantorName || sale.guarantor2Name) && (
                      <div className="bg-slate-900/60 rounded-lg p-2 text-[11px] text-slate-300 space-y-1 border border-slate-800/80">
                        {sale.guarantorName && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">G1: {sale.guarantorName}</span>
                            <span className="text-slate-500">{sale.guarantorPhone}</span>
                          </div>
                        )}
                        {sale.guarantor2Name && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">G2: {sale.guarantor2Name}</span>
                            <span className="text-slate-500">{sale.guarantor2Phone}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ATTACHED DOCUMENTS & CNIC COPIES WITH CLICKABLE VIEW & DOWNLOAD LINKS */}
                    {(() => {
                      const allDocs = [
                        ...(Array.isArray(sale.documents) ? sale.documents : []),
                        ...(sale.cnicFront ? [{ _id: 'cnicFront', title: 'Customer CNIC (Front)', fileUrl: sale.cnicFront, isCnic: true }] : []),
                        ...(sale.cnicBack ? [{ _id: 'cnicBack', title: 'Customer CNIC (Back)', fileUrl: sale.cnicBack, isCnic: true }] : []),
                        ...(sale.guarantor1CnicFront ? [{ _id: 'g1Front', title: 'Guarantor 1 CNIC (Front)', fileUrl: sale.guarantor1CnicFront, isCnic: true }] : []),
                        ...(sale.guarantor1CnicBack ? [{ _id: 'g1Back', title: 'Guarantor 1 CNIC (Back)', fileUrl: sale.guarantor1CnicBack, isCnic: true }] : []),
                        ...(sale.guarantor2CnicFront ? [{ _id: 'g2Front', title: 'Guarantor 2 CNIC (Front)', fileUrl: sale.guarantor2CnicFront, isCnic: true }] : []),
                        ...(sale.guarantor2CnicBack ? [{ _id: 'g2Back', title: 'Guarantor 2 CNIC (Back)', fileUrl: sale.guarantor2CnicBack, isCnic: true }] : [])
                      ];

                      if (allDocs.length === 0) {
                        return (
                          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 italic print:hidden">
                            <span>Koi document attach nahi hai</span>
                            <button
                              onClick={() => handleOpenDocModal(sale._id)}
                              className="text-indigo-400 hover:text-indigo-300 hover:underline text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <FolderPlus className="w-3 h-3" /> + Attach Document
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider flex items-center gap-1">
                              <FileText className="w-3 h-3 text-indigo-400" /> Attached Documents & CNIC ({allDocs.length}):
                            </span>
                            <button
                              onClick={() => handleOpenDocModal(sale._id)}
                              className="text-[10px] text-indigo-400 hover:text-indigo-200 underline font-medium cursor-pointer print:hidden"
                            >
                              + Manage / Add More
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {allDocs.map((doc) => {
                              const rawUrl = getFileUrl(doc.fileUrl);
                              const downloadUrl = `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}download=1&title=${encodeURIComponent(doc.title || 'document')}`;
                              return (
                                <div
                                  key={doc._id || doc.fileUrl}
                                  className={`inline-flex items-center rounded-lg overflow-hidden shadow-sm transition border ${
                                    doc.isCnic 
                                      ? 'bg-amber-950/50 border-amber-700/60 hover:border-amber-500' 
                                      : 'bg-indigo-950/70 border-indigo-700/60 hover:border-indigo-500'
                                  }`}
                                >
                                  <a
                                    href={rawUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] transition ${
                                      doc.isCnic 
                                        ? 'text-amber-200 hover:text-white hover:bg-amber-800/50' 
                                        : 'text-indigo-200 hover:text-white hover:bg-indigo-800/50'
                                    }`}
                                    title="Click to open/view document"
                                  >
                                    <Paperclip className={`w-3 h-3 shrink-0 ${doc.isCnic ? 'text-amber-400' : 'text-indigo-400'}`} />
                                    <span className="font-medium max-w-[150px] sm:max-w-[220px] truncate">{doc.title || 'Document'}</span>
                                    <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                                  </a>
                                  <a
                                    href={downloadUrl}
                                    download={doc.title || 'document'}
                                    className={`px-2 py-1 border-l transition flex items-center justify-center ${
                                      doc.isCnic 
                                        ? 'bg-amber-900/60 hover:bg-emerald-600 text-amber-300 hover:text-white border-amber-700/50' 
                                        : 'bg-indigo-900/60 hover:bg-emerald-600 text-indigo-300 hover:text-white border-indigo-700/50'
                                    }`}
                                    title="Download to PC"
                                  >
                                    <Download className="w-3 h-3" />
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-900 print:border-gray-300">
                      <div><span className="text-slate-500">Total Price:</span> <span className="font-semibold text-slate-200 print:text-black">Rs. {sale.totalAmount?.toLocaleString()}</span></div>
                      <div><span className="text-slate-500">Advance:</span> <span className="font-semibold text-slate-200 print:text-black">Rs. {sale.advancePayment?.toLocaleString()}</span></div>
                      <div><span className="text-slate-500">Monthly Kist:</span> <span className="font-semibold text-slate-200 print:text-black">Rs. {sale.monthlyAmount?.toLocaleString()} / month</span></div>
                      <div><span className="text-slate-500">Remaining:</span> <span className="font-bold text-rose-400 print:text-red-700">Rs. {sale.remainingBalance?.toLocaleString()}</span></div>
                      {(() => {
                        const pInfo = getPromiseMonthsInfo(sale);
                        return (
                          <>
                            <div>
                              <span className="text-slate-500">Plan / Commitment:</span>{' '}
                              <span className="font-semibold text-amber-400 print:text-black">
                                {pInfo.totalMonths} Months
                                {pInfo.hasPromise && <span className="text-[10px] ml-1 bg-amber-500/10 text-amber-300 px-1 py-0.2 rounded border border-amber-500/20">Promise</span>}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500">Remaining Months:</span>{' '}
                              <span className={`font-bold ${pInfo.isCleared ? 'text-emerald-400' : pInfo.isExpired ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {pInfo.isCleared 
                                  ? 'Cleared' 
                                  : pInfo.isExpired 
                                    ? `Expired (${pInfo.promiseMonthStr})` 
                                    : `${pInfo.remainingMonths} Months Left`}
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TRANSACTION HISTORY WITH FILTER */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl print:bg-white print:border-gray-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h4 className="text-base font-bold text-white flex items-center gap-2 print:text-black">
                <DollarSign className="w-5 h-5 text-emerald-400" /> Transaction & Payment History
              </h4>
            </div>

            <PaymentFilter 
              startDate={startDate} setStartDate={setStartDate}
              endDate={endDate} setEndDate={setEndDate}
              filterType={filterType} setFilterType={setFilterType}
              onReset={() => { setStartDate(''); setEndDate(''); setFilterType('ALL'); }}
            />

            {filteredPayments.length === 0 ? (
              <p className="text-slate-500 text-xs italic py-4">No matching payment records found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider print:bg-gray-100 print:text-black">
                      <th className="p-3">Date</th>
                      <th className="p-3">Payment Type</th>
                      <th className="p-3">Method</th>
                      <th className="p-3">Amount Paid</th>
                      <th className="p-3">Received By</th>
                      <th className="p-3">Notes</th>
                      <th className="p-3 text-right print:hidden">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300 print:divide-gray-300 print:text-black">
                    {filteredPayments.map((payment) => {
                      const isAdvance = payment.forMonth?.toLowerCase().includes('advance') || payment.notes?.toLowerCase().includes('advance');

                      return (
                        <tr key={payment._id} className="hover:bg-slate-800/50 transition">
                          <td className="p-3 font-medium text-slate-200 print:text-black">
                            {new Date(payment.createdAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              isAdvance ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            }`}>
                              {isAdvance ? 'Advance Payment' : (payment.forMonth || 'Monthly Installment')}
                            </span>
                          </td>
                          <td className="p-3 uppercase">{payment.paymentMethod || 'Cash'}</td>
                          <td className="p-3 font-black text-emerald-400 text-sm print:text-emerald-800">
                            Rs. {payment.amountPaid?.toLocaleString()}
                          </td>
                          <td className="p-3 text-slate-400">{payment.receivedBy?.name || 'Staff'}</td>
                          <td className="p-3 text-slate-400 italic">{payment.notes || '-'}</td>
                          <td className="p-3 text-right print:hidden">
                            <button
                              onClick={() => {
                                const matchedSale = ledgerData.installmentSales.find(s => s._id === (payment.installmentSale?._id || payment.installmentSale)) || ledgerData.installmentSales[0];
                                setSelectedPayment(payment);
                                setSelectedSaleForReceipt({ ...matchedSale, customer: ledgerData.customer });
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-semibold border border-slate-700 transition cursor-pointer"
                            >
                              Receipt
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* 1. ADMIN PASSWORD VERIFICATION MODAL */}
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
                  <p className="text-xs text-slate-400">Customer aur sale details edit karne ke liye admin password darj karein</p>
                </div>
              </div>
              <button 
                onClick={() => setShowPasswordModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVerifyPassword} className="space-y-4 pt-1">
              <div>
                <label className="block text-slate-300 text-xs mb-1.5 font-medium">Enter Admin Password *</label>
                <div className="relative">
                  <input
                    type={showPasswordText ? "text" : "password"}
                    autoFocus
                    required
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    placeholder="Enter password..."
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
                  onClick={() => setShowPasswordModal(false)}
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

      {/* 2. COMPREHENSIVE EDIT CUSTOMER & SALE MODAL (LOCKED: ITEM NAME, TOTAL PRICE, ADVANCE) */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl shadow-2xl text-white my-6 max-h-[92vh] flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="flex justify-between items-center p-5 sm:p-6 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-2xl">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-white">Edit Customer & Account Details</h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                      <Unlock className="w-3 h-3" /> Admin Authorized
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Customer profile, item reg number, installments plan aur remarks update karein
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white p-2 transition rounded-xl hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleUpdateCustomerAndSale} className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs flex-1">
              
              {/* SECTION 1: CUSTOMER INFORMATION */}
              <div className="space-y-3 bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800">
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2.5">
                  <UserCheck className="w-4 h-4" /> Customer Personal Details
                </h3>

                {/* Profile Photo in Edit Modal */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div className="relative group shrink-0">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-950 border-2 border-dashed border-amber-500/40 overflow-hidden flex items-center justify-center shadow-md">
                      {editProfilePicPreview ? (
                        <img 
                          src={editProfilePicPreview} 
                          alt="Customer Preview" 
                          className="w-full h-full object-cover rounded-2xl" 
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-500 p-1 text-center">
                          <User className="w-6 h-6 text-slate-600" />
                          <span className="text-[9px] text-slate-500 font-medium">No Photo</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 space-y-1 text-center sm:text-left">
                    <span className="text-xs font-bold text-white flex items-center justify-center sm:justify-start gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-amber-400" /> Customer Profile Picture
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Customer ki photo tabdeel ya upload karne ke liye file select karein.
                    </p>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                      <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition">
                        <Upload className="w-3.5 h-3.5 text-amber-400" />
                        <span>{editProfilePicFile ? 'Tasveer Tabdeel Karein' : 'Select Customer Photo'}</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const compressed = await compressImage(file, { maxWidth: 1000, maxHeight: 1000, quality: 0.8 });
                              setEditProfilePicFile(compressed);
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                setEditProfilePicPreview(ev.target.result);
                              };
                              reader.readAsDataURL(compressed);
                            }
                          }} 
                        />
                      </label>
                      {editProfilePicFile && (
                        <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {editProfilePicFile.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">Customer Name *</label>
                    <input
                      type="text"
                      required
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      placeholder="e.g. Asad"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-blue-500 text-xs"
                    />
                  </div>

                  {/* Phone 1 with 11-digit strict validation */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-slate-300 font-medium">Mobile Number 1 *</label>
                      {editFormData.phone.length === 11 ? (
                        <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> 11/11 OK
                        </span>
                      ) : editFormData.phone.length > 0 ? (
                        <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          {editFormData.phone.length}/11 Digits
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500">11 Digits Req</span>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      name="phone"
                      maxLength={11}
                      value={editFormData.phone}
                      onChange={handleEditPhoneChange}
                      placeholder="03XXXXXXXXX"
                      className={`w-full bg-slate-900 border ${
                        (touched.phone && editFormData.phone.length < 11) || (editFormData.phone.length > 0 && editFormData.phone.length < 11)
                          ? 'border-red-500 focus:border-red-500 bg-red-950/10'
                          : editFormData.phone.length === 11
                          ? 'border-emerald-500/60 focus:border-emerald-500'
                          : 'border-slate-800 focus:border-blue-500'
                      } rounded-xl px-3.5 py-2 text-white outline-none font-mono text-xs`}
                    />
                    {((touched.phone && editFormData.phone.length < 11) || (editFormData.phone.length > 0 && editFormData.phone.length < 11)) && (
                      <p className="text-red-400 text-[10px] mt-1 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        11 digits poore likhein ({editFormData.phone.length}/11)
                      </p>
                    )}
                  </div>

                  {/* Phone 2 with 11-digit validation */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-slate-300 font-medium">Mobile Number 2 (Optional)</label>
                      {editFormData.phone2 && editFormData.phone2.length === 11 ? (
                        <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> 11/11 OK
                        </span>
                      ) : editFormData.phone2 && editFormData.phone2.length > 0 ? (
                        <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          {editFormData.phone2.length}/11 Digits
                        </span>
                      ) : null}
                    </div>
                    <input
                      type="text"
                      name="phone2"
                      maxLength={11}
                      value={editFormData.phone2}
                      onChange={handleEditPhoneChange}
                      placeholder="03XXXXXXXXX"
                      className={`w-full bg-slate-900 border ${
                        editFormData.phone2 && editFormData.phone2.length < 11
                          ? 'border-red-500 focus:border-red-500 bg-red-950/10'
                          : editFormData.phone2 && editFormData.phone2.length === 11
                          ? 'border-emerald-500/60 focus:border-emerald-500'
                          : 'border-slate-800 focus:border-blue-500'
                      } rounded-xl px-3.5 py-2 text-white outline-none font-mono text-xs`}
                    />
                  </div>

                  {/* CNIC with auto-hyphen (01201-0245126-5) */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-slate-300 font-medium">CNIC Number</label>
                      {editFormData.cnic.replace(/\D/g, '').length === 13 ? (
                        <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> 13/13 OK
                        </span>
                      ) : editFormData.cnic.replace(/\D/g, '').length > 0 ? (
                        <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          {editFormData.cnic.replace(/\D/g, '').length}/13 Digits
                        </span>
                      ) : null}
                    </div>
                    <input
                      type="text"
                      name="cnic"
                      maxLength={15}
                      value={editFormData.cnic}
                      onChange={handleEditCnicChange}
                      placeholder="01201-0245126-5"
                      className={`w-full bg-slate-900 border ${
                        editFormData.cnic && editFormData.cnic.replace(/\D/g, '').length !== 13
                          ? 'border-red-500 focus:border-red-500 bg-red-950/10'
                          : editFormData.cnic.replace(/\D/g, '').length === 13
                          ? 'border-emerald-500/60 focus:border-emerald-500'
                          : 'border-slate-800 focus:border-blue-500'
                      } rounded-xl px-3.5 py-2 text-white outline-none font-mono text-xs`}
                    />
                    {editFormData.cnic && editFormData.cnic.replace(/\D/g, '').length !== 13 && (
                      <p className="text-red-400 text-[10px] mt-1 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        CNIC poora 13 digits (e.g. 01201-0245126-5) hona chahiye ({editFormData.cnic.replace(/\D/g, '').length}/13)
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-300 mb-1 font-medium">Permanent Address</label>
                    <input
                      type="text"
                      value={editFormData.address}
                      onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                      placeholder="House & Street Address"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-blue-500 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: GUARANTORS INFORMATION */}
              <div className="space-y-3 bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800">
                <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2.5">
                  <ShieldCheck className="w-4 h-4" /> Guarantors Information (Zameen)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">Guarantor 1 Name</label>
                    <input
                      type="text"
                      value={editFormData.guarantorName}
                      onChange={(e) => setEditFormData({ ...editFormData, guarantorName: e.target.value })}
                      placeholder="Guarantor 1 Full Name"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-purple-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">Guarantor 1 Phone</label>
                    <input
                      type="text"
                      name="guarantorPhone"
                      maxLength={11}
                      value={editFormData.guarantorPhone}
                      onChange={handleEditPhoneChange}
                      placeholder="03XXXXXXXXX"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-purple-500 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">Guarantor 2 Name (Optional)</label>
                    <input
                      type="text"
                      value={editFormData.guarantor2Name}
                      onChange={(e) => setEditFormData({ ...editFormData, guarantor2Name: e.target.value })}
                      placeholder="Guarantor 2 Full Name"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-purple-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">Guarantor 2 Phone (Optional)</label>
                    <input
                      type="text"
                      name="guarantor2Phone"
                      maxLength={11}
                      value={editFormData.guarantor2Phone}
                      onChange={handleEditPhoneChange}
                      placeholder="03XXXXXXXXX"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-purple-500 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: ITEM & INSTALLMENT DETAILS (LOCKED: ITEM NAME, TOTAL PAYMENT, ADVANCE PAYMENT) */}
              {editFormData.saleId && (
                <div className="space-y-3 bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-800 pb-2.5">
                    <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Calculator className="w-4 h-4" /> Item & Installment Details
                    </h3>
                    
                    {/* Multi-sale items switcher if customer has more than 1 sale */}
                    {Array.isArray(ledgerData?.installmentSales) && ledgerData.installmentSales.length > 1 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto">
                        <span className="text-[11px] text-slate-400">Select Item:</span>
                        {(ledgerData.installmentSales || []).map((s, idx) => (
                          <button
                            key={s._id}
                            type="button"
                            onClick={() => handleSelectSaleToEdit(idx)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer ${
                              selectedSaleIdx === idx
                                ? 'bg-amber-600 border-amber-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            {s.itemName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Item Name *</label>
                      <input
                        type="text"
                        required
                        value={editFormData.itemName}
                        onChange={(e) => setEditFormData({ ...editFormData, itemName: e.target.value })}
                        placeholder="e.g. SAZGAR / Honda CD 70"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Total Amount (Rs.) *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={editFormData.totalAmount}
                        onChange={(e) => setEditFormData({ ...editFormData, totalAmount: e.target.value })}
                        placeholder="e.g. 420000"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Advance Payment (Rs.)</label>
                      <input
                        type="number"
                        min="0"
                        value={editFormData.advancePayment}
                        onChange={(e) => setEditFormData({ ...editFormData, advancePayment: e.target.value })}
                        placeholder="0"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Registration No</label>
                      <input
                        type="text"
                        value={editFormData.registrationNumber || editFormData.itemRegNumber}
                        onChange={(e) => setEditFormData({ ...editFormData, registrationNumber: e.target.value, itemRegNumber: e.target.value })}
                        placeholder="e.g. LEA-12-3456"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Model (Year)</label>
                      <input
                        type="text"
                        value={editFormData.modelYear}
                        onChange={(e) => setEditFormData({ ...editFormData, modelYear: e.target.value })}
                        placeholder="e.g. 2024 / 2023"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Engine Number</label>
                      <input
                        type="text"
                        value={editFormData.engineNumber}
                        onChange={(e) => setEditFormData({ ...editFormData, engineNumber: e.target.value })}
                        placeholder="e.g. ENG-892341"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Chassis Number</label>
                      <input
                        type="text"
                        value={editFormData.chassisNumber}
                        onChange={(e) => setEditFormData({ ...editFormData, chassisNumber: e.target.value })}
                        placeholder="e.g. CHS-572910"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Monthly Installment (Rs.)</label>
                      <input
                        type="number"
                        min="1"
                        value={editFormData.monthlyAmount}
                        onChange={(e) => setEditFormData({ ...editFormData, monthlyAmount: e.target.value })}
                        placeholder="e.g. 5000"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Total Duration (Months)</label>
                      <input
                        type="number"
                        min="1"
                        value={editFormData.totalMonths}
                        onChange={(e) => setEditFormData({ ...editFormData, totalMonths: e.target.value })}
                        placeholder="e.g. 12"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">
                        Promise Month / Commitment <span className="text-[10px] text-amber-400 font-bold">(Priority ⭐)</span>
                      </label>
                      <input
                        type="text"
                        value={editFormData.promiseMonth}
                        onChange={(e) => setEditFormData({ ...editFormData, promiseMonth: e.target.value })}
                        placeholder="e.g. October 2028 ya 24"
                        className="w-full bg-slate-900 border border-amber-500/50 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-400 text-xs font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Monthly Due Date Day (1-31)</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={editFormData.dueDateDay}
                        onChange={(e) => setEditFormData({ ...editFormData, dueDateDay: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Account Status</label>
                      <select
                        value={editFormData.status}
                        onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs cursor-pointer"
                      >
                        <option value="active">Active (Ongoing Installments)</option>
                        <option value="completed">Completed (Fully Paid)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Remarks / Notes</label>
                      <input
                        type="text"
                        value={editFormData.remarks}
                        onChange={(e) => setEditFormData({ ...editFormData, remarks: e.target.value })}
                        placeholder="Internal office notes"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-medium transition cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl flex items-center gap-2 transition cursor-pointer disabled:opacity-50 text-xs shadow-lg shadow-amber-950/40"
                >
                  {isUpdating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Saving Changes...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Save All Changes
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 3. ATTACH & MANAGE DOCUMENTS MODAL */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-3xl shadow-2xl text-white my-6 max-h-[92vh] flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="flex justify-between items-center p-5 sm:p-6 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-2xl">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">Attach & Manage Documents</h2>
                  <p className="text-xs text-slate-400">
                    Customer: <span className="text-indigo-400 font-semibold">{ledgerData?.customer?.name}</span> ({ledgerData?.customer?.customerId})
                    {currentDocSale && <> | Item: <span className="text-amber-400 font-semibold">{currentDocSale.itemName}</span></>}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowDocModal(false)}
                className="text-slate-400 hover:text-white p-2 transition rounded-xl hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-xs flex-1">
              
              {/* Item Selector if customer has multiple items */}
              {ledgerData?.installmentSales?.length > 1 && (
                <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2">
                  <span className="text-[11px] font-semibold text-slate-400 block">Select Item to Attach Documents:</span>
                  <div className="flex flex-wrap gap-2">
                    {ledgerData.installmentSales.map((s) => (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => setDocSaleId(s._id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                          docSaleId === s._id
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        {s.itemName} ({s.registrationNumber || s.itemRegNumber || s.engineNumber || 'No Reg'})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION A: EXISTING ATTACHED DOCUMENTS */}
              <div className="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4" /> Already Attached Documents
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    Total: {currentDocSale?.documents?.length || 0} File(s)
                  </span>
                </div>

                {!currentDocSale?.documents || currentDocSale.documents.length === 0 ? (
                  <p className="text-slate-500 italic text-xs py-3 text-center">
                    Abhi tak is item ke sath koi extra document attach nahi kiya gaya. Neeche se naye documents add karein.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {currentDocSale.documents.map((doc) => (
                      <div 
                        key={doc._id} 
                        className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition"
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                            <Paperclip className="w-4 h-4" />
                          </div>
                          <div className="overflow-hidden">
                            <h4 className="text-xs font-semibold text-white truncate" title={doc.title}>
                              {doc.title}
                            </h4>
                            <span className="text-[10px] text-slate-500 font-mono">Uploaded Document</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={getFileUrl(doc.fileUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 rounded-lg transition"
                            title="View Document"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>

                          <a
                            href={`${getFileUrl(doc.fileUrl)}?download=1&title=${encodeURIComponent(doc.title || 'document')}`}
                            download={doc.title || 'document'}
                            className="p-1.5 bg-slate-800 hover:bg-emerald-950/60 text-slate-400 hover:text-emerald-400 rounded-lg transition"
                            title="Download Document"
                          >
                            <Download className="w-4 h-4" />
                          </a>

                          <button
                            type="button"
                            onClick={() => handleDeleteDoc(doc._id)}
                            disabled={isDeletingDocId === doc._id}
                            className="p-1.5 bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 rounded-lg transition cursor-pointer"
                            title="Delete Document"
                          >
                            {isDeletingDocId === doc._id ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-red-400" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* CNIC and Registration documents if present */}
                    {(() => {
                      const cnicDocs = [
                        ...(currentDocSale?.cnicFront ? [{ id: 'cnicFront', title: 'Customer CNIC (Front)', fileUrl: currentDocSale.cnicFront }] : []),
                        ...(currentDocSale?.cnicBack ? [{ id: 'cnicBack', title: 'Customer CNIC (Back)', fileUrl: currentDocSale.cnicBack }] : []),
                        ...(currentDocSale?.guarantor1CnicFront ? [{ id: 'g1Front', title: 'Guarantor 1 CNIC (Front)', fileUrl: currentDocSale.guarantor1CnicFront }] : []),
                        ...(currentDocSale?.guarantor1CnicBack ? [{ id: 'g1Back', title: 'Guarantor 1 CNIC (Back)', fileUrl: currentDocSale.guarantor1CnicBack }] : []),
                        ...(currentDocSale?.guarantor2CnicFront ? [{ id: 'g2Front', title: 'Guarantor 2 CNIC (Front)', fileUrl: currentDocSale.guarantor2CnicFront }] : []),
                        ...(currentDocSale?.guarantor2CnicBack ? [{ id: 'g2Back', title: 'Guarantor 2 CNIC (Back)', fileUrl: currentDocSale.guarantor2CnicBack }] : [])
                      ];
                      if (cnicDocs.length === 0) return null;
                      return (
                        <div className="col-span-full pt-2 border-t border-slate-800 space-y-2">
                          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                            Registration & CNIC Copies ({cnicDocs.length}):
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {cnicDocs.map((cd) => (
                              <div key={cd.id} className="flex items-center justify-between p-2.5 bg-slate-900 border border-amber-800/40 rounded-xl">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <Paperclip className="w-4 h-4 text-amber-400 shrink-0" />
                                  <span className="text-xs font-semibold text-slate-200 truncate">{cd.title}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <a
                                    href={getFileUrl(cd.fileUrl)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg transition"
                                    title="View"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                  <a
                                    href={`${getFileUrl(cd.fileUrl)}?download=1&title=${encodeURIComponent(cd.title)}`}
                                    download={cd.title}
                                    className="p-1.5 bg-slate-800 hover:bg-emerald-950 text-slate-400 hover:text-emerald-400 rounded-lg transition"
                                    title="Download"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* SECTION B: UPLOAD NEW DOCUMENTS */}
              <form 
                ref={uploadDocFormRef}
                key={`doc-form-${docFormKey}`}
                onSubmit={handleUploadNewDocs} 
                className="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4"
              >
                <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                  <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Upload className="w-4 h-4" /> Upload New Documents
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddDocRow}
                    className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Another Row
                  </button>
                </div>

                {/* Quick Title Suggestion Pills */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-medium block">Quick Title Suggestions (Click to fill):</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Agreement Stamp Paper', 
                      'Electricity Bill', 
                      'Salary Slip', 
                      'Bike Registration Paper', 
                      'Bank Cheque Leaf', 
                      'Thumb Affidavit', 
                      'CNIC Copy'
                    ].map((sug, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectDocTitleSuggestion(newDocList.length - 1, sug)}
                        className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 px-2 py-0.5 rounded-lg text-[10px] transition cursor-pointer"
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rows of Document Inputs */}
                <div className="space-y-3 pt-1">
                  {newDocList.map((row, idx) => (
                    <div key={`row-${docFormKey}-${idx}`} className="flex flex-col sm:flex-row items-center gap-2.5 bg-slate-900 p-3 rounded-xl border border-slate-800">
                      <div className="w-full sm:flex-1">
                        <label className="block text-[10px] text-slate-400 mb-1">Document Title *</label>
                        <input
                          type="text"
                          required
                          value={row.title}
                          onChange={(e) => handleDocChange(idx, 'title', e.target.value)}
                          placeholder="e.g. Agreement Stamp Paper, Salary Slip"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white outline-none focus:border-indigo-500 text-xs"
                        />
                      </div>

                      <div className="w-full sm:flex-1">
                        <label className="block text-[10px] text-slate-400 mb-1">Select File (Image / PDF) *</label>
                        <input
                          key={`file-input-${docFormKey}-${idx}`}
                          type="file"
                          required
                          accept="image/*,.pdf"
                          onChange={(e) => handleDocChange(idx, 'file', e.target.files[0])}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1 text-slate-300 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[11px] file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                        />
                      </div>

                      {newDocList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDocRow(idx)}
                          className="self-end sm:self-center p-2 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded-lg transition cursor-pointer mt-1 sm:mt-4"
                          title="Remove row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowDocModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={isUploadingDocs}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-950/40 disabled:opacity-50"
                  >
                    {isUploadingDocs ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" /> Upload & Attach Documents
                      </>
                    )}
                  </button>
                </div>
              </form>

            </div>
          </div>
        </div>
      )}

      {/* QUICK PAYMENT COLLECTION MODAL */}
      {showQuickPay && ledgerData && (
        <QuickPaymentModal
          customer={ledgerData.customer || {}}
          sales={Array.isArray(ledgerData.installmentSales) ? ledgerData.installmentSales : []}
          activeSales={Array.isArray(ledgerData.installmentSales) ? ledgerData.installmentSales : []}
          initialSaleId={quickPaySaleId}
          onClose={() => {
            setShowQuickPay(false);
            setQuickPaySaleId('');
          }}
          onSuccess={() => handleSearch(null, ledgerData?.customer?.customerId || ledgerData?.customer?.phone || searchQuery)}
        />
      )}

      {/* RECEIPT MODAL */}
      {selectedPayment && selectedSaleForReceipt && (
        <PaymentReceiptModal
          payment={selectedPayment}
          sale={selectedSaleForReceipt}
          onClose={() => {
            setSelectedPayment(null);
            setSelectedSaleForReceipt(null);
          }}
        />
      )}

      {/* IMAGE ZOOM LIGHTBOX MODAL */}
      {selectedImageForZoom && (
        <div 
          onClick={() => setSelectedImageForZoom(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-pointer animate-fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="relative max-w-xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-2xl flex flex-col items-center"
          >
            <button 
              onClick={() => setSelectedImageForZoom(null)} 
              className="absolute top-4 right-4 p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition shadow-lg cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
            <img 
              src={selectedImageForZoom} 
              alt="Customer Full Profile" 
              className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl" 
            />
            <div className="flex justify-between items-center w-full px-2 pt-3">
              <span className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-blue-400" /> Customer Profile Picture
              </span>
              <a 
                href={selectedImageForZoom} 
                target="_blank" 
                rel="noreferrer" 
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Full Size Link
              </a>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { size: 5.84in 8.27in; margin: 4mm; }
          *, *:before, *:after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box !important; }
          nav, header, aside, button, .print\\:hidden { display: none !important; }
          body, html, #root { background-color: #ffffff !important; color: #000000 !important; margin: 0 !important; width: 100% !important; font-size: 11px !important; }
          .max-w-7xl { max-width: 100% !important; padding: 0 !important; }
        }
      `}</style>

    </div>
  );
}