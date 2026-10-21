import React, { useState } from 'react';
import { 
  X, Plus, Calculator, UserCheck, ShieldCheck, 
  FileText, RefreshCw, AlertCircle, Trash2, CheckCircle2, Calendar,
  Camera, User, Upload, Image as ImageIcon
} from 'lucide-react';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { compressImage } from '../utils/imageCompressor';

export default function AddInstallmentModal({ onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({});
  const [calculationSource, setCalculationSource] = useState('totalMonths'); // 'totalMonths' | 'monthlyKist'

  const [formData, setFormData] = useState({
    bookingDate: new Date().toISOString().split('T')[0],
    customerName: '',
    phone1: '',
    phone2: '',
    cnic: '',
    permanentAddress: '',
    guarantor1Name: '',
    guarantor1Phone: '',
    guarantor2Name: '',
    guarantor2Phone: '',
    itemName: '',
    itemRegNumber: '', // Optional Field (synced)
    registrationNumber: '', // Optional Field
    engineNumber: '', // Optional Field
    chassisNumber: '', // Optional Field
    totalAmount: '',
    advancePayment: '0',
    monthlyKist: '',
    totalMonths: '',
    promiseMonth: '',
    promisedMonths: '',
    dueDateDay: '5',
    paymentMode: 'Cash'
  });

  const [files, setFiles] = useState({
    profilePic: null,
    cnicFront: null,
    cnicBack: null,
    guarantor1CnicFront: null,
    guarantor1CnicBack: null,
    guarantor2CnicFront: null,
    guarantor2CnicBack: null
  });

  const [profilePicPreview, setProfilePicPreview] = useState(null);

  const handleProfilePicChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Customer picture image file honi chahiye (JPG, PNG, WebP)');
        return;
      }
      try {
        // Automatically compress customer photo before preview and upload
        const compressed = await compressImage(file, { maxWidth: 1000, maxHeight: 1000, quality: 0.82 });
        setFiles(prev => ({ ...prev, profilePic: compressed }));
        const reader = new FileReader();
        reader.onload = (event) => {
          setProfilePicPreview(event.target.result);
        };
        reader.onerror = () => {
          toast.error('Tasveer load karne mein masla pesh aya');
        };
        reader.readAsDataURL(compressed);
        toast.success('Customer picture select & optimize ho gayi!');
      } catch (err) {
        console.error('Profile pic compression error:', err);
        setFiles(prev => ({ ...prev, profilePic: file }));
      }
    }
  };

  const handleRemoveProfilePic = () => {
    setFiles(prev => ({ ...prev, profilePic: null }));
    setProfilePicPreview(null);
  };

  const [extraDocs, setExtraDocs] = useState([]);

  // Focus & Blur Handlers: Keep track of user interaction for instant validation feedback
  const handleFocus = (e) => {
    const { name } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  // Dedicated Phone Handler:
  // 1. Strictly restricts to digits (0-9).
  // 2. Max 11 characters - impossible to type 12th digit.
  const handlePhoneChange = (e) => {
    const { name, value } = e.target;
    const cleanDigits = value.replace(/\D/g, '').slice(0, 11);
    setFormData(prev => ({ ...prev, [name]: cleanDigits }));
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  // Dedicated CNIC Handler:
  // Format: 01201-0245126-5 (Total 13 digits, 15 chars with hyphens)
  // - 5 digits -> auto '-'
  // - next 7 digits -> auto '-'
  // - 1 digit
  // - Smooth backspace support so user is never stuck
  const handleCnicChange = (e) => {
    const { name, value } = e.target;
    const prevVal = formData[name] || '';
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

    setFormData(prev => ({ ...prev, [name]: formatted }));
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  // CNIC Helper
  const cnicRawDigits = (formData.cnic || '').replace(/\D/g, '');
  const isCnicComplete = cnicRawDigits.length === 13;

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const getPromiseMonthFromMonths = (months) => {
    const m = parseInt(months, 10);
    if (!m || m <= 0) return '';
    const d = new Date();
    d.setMonth(d.getMonth() + m);
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  };

  const getMonthsFromPromiseMonth = (val) => {
    if (!val) return null;
    const trimmed = String(val).trim().toLowerCase();
    const ymMatch = trimmed.match(/^(\d{4})-(\d{1,2})$/);
    let targetYear, targetMonth;
    if (ymMatch) {
      targetYear = parseInt(ymMatch[1], 10);
      targetMonth = parseInt(ymMatch[2], 10) - 1;
    } else {
      let foundMonth = -1;
      const shortMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      for (let i = 0; i < shortMonths.length; i++) {
        if (trimmed.includes(shortMonths[i])) {
          foundMonth = i;
          break;
        }
      }
      if (foundMonth === -1) return null;
      const yearMatch = trimmed.match(/(20\d\d|\d{2})/);
      let foundYear = new Date().getFullYear();
      if (yearMatch) {
        const y = parseInt(yearMatch[1], 10);
        foundYear = y < 100 ? 2000 + y : y;
      }
      targetMonth = foundMonth;
      targetYear = foundYear;
    }

    const now = new Date();
    const diff = (targetYear - now.getFullYear()) * 12 + (targetMonth - now.getMonth());
    return {
      diff: diff > 0 ? diff : 1,
      formattedMonth: `${MONTH_NAMES[targetMonth]} ${targetYear}`
    };
  };

  // Bi-directional Auto Calculation & Synchronization for Item & Kist:
  // 1. Enter totalMonths -> auto-calculates monthlyKist (keeps promiseMonth independent)
  // 2. Enter monthlyKist -> auto-calculates totalMonths (e.g. 33 months, keeps promiseMonth independent)
  // 3. Change totalAmount / advancePayment -> auto-updates dependent fields
  const handleAmountChange = (field, value) => {
    const updated = { ...formData, [field]: value };
    const total = parseFloat(field === 'totalAmount' ? value : updated.totalAmount) || 0;
    const advance = parseFloat(field === 'advancePayment' ? value : updated.advancePayment) || 0;
    const remaining = Math.max(0, total - advance);

    if (field === 'totalMonths') {
      setCalculationSource('totalMonths');
      const months = parseFloat(value);
      if (months > 0 && remaining > 0) {
        updated.monthlyKist = Math.ceil(remaining / months).toString();
      } else if (!value) {
        updated.monthlyKist = '';
      }
    } else if (field === 'monthlyKist') {
      setCalculationSource('monthlyKist');
      const kist = parseFloat(value);
      if (kist > 0 && remaining > 0) {
        updated.totalMonths = Math.ceil(remaining / kist).toString();
      } else if (!value) {
        updated.totalMonths = '';
      }
    } else if (field === 'totalAmount' || field === 'advancePayment') {
      if (calculationSource === 'monthlyKist' && updated.monthlyKist && parseFloat(updated.monthlyKist) > 0) {
        const kist = parseFloat(updated.monthlyKist);
        updated.totalMonths = remaining > 0 ? Math.ceil(remaining / kist).toString() : '';
      } else if (updated.totalMonths && parseFloat(updated.totalMonths) > 0) {
        const months = parseFloat(updated.totalMonths);
        updated.monthlyKist = remaining > 0 ? Math.ceil(remaining / months).toString() : '';
      } else if (updated.monthlyKist && parseFloat(updated.monthlyKist) > 0) {
        const kist = parseFloat(updated.monthlyKist);
        updated.totalMonths = remaining > 0 ? Math.ceil(remaining / kist).toString() : '';
      }
    }

    setFormData(updated);
  };

  // Promise Month Handler: Customer's explicit commitment (e.g. 24 Months / October 2028).
  // Strictly does NOT overwrite monthlyKist (e.g. Rs. 20,000 remains untouched).
  const handlePromiseMonthChange = (val) => {
    if (!val) {
      setFormData(prev => ({ ...prev, promiseMonth: '', promisedMonths: '' }));
      return;
    }

    // Check if input is direct number of months, e.g. "24" or "24 months"
    const digitsOnlyMatch = String(val).trim().match(/^(\d{1,3})\s*(?:months?|mahiny?|mah)?(?:\s+plan)?$/i);
    if (digitsOnlyMatch) {
      const explicitMonths = parseInt(digitsOnlyMatch[1], 10);
      const formatted = getPromiseMonthFromMonths(explicitMonths);
      setFormData(prev => ({
        ...prev,
        promiseMonth: formatted || val,
        promisedMonths: explicitMonths.toString()
      }));
      return;
    }

    const res = getMonthsFromPromiseMonth(val);
    if (res) {
      setFormData(prev => ({
        ...prev,
        promiseMonth: res.formattedMonth,
        promisedMonths: res.diff.toString()
      }));
    } else {
      setFormData(prev => ({ ...prev, promiseMonth: val }));
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (['totalAmount', 'advancePayment', 'monthlyKist', 'totalMonths'].includes(name)) {
      handleAmountChange(name, value);
    } else if (name === 'promiseMonth') {
      handlePromiseMonthChange(value);
    } else if (name === 'registrationNumber') {
      setFormData(prev => ({ ...prev, registrationNumber: value, itemRegNumber: value }));
    } else if (name === 'itemRegNumber') {
      setFormData(prev => ({ ...prev, registrationNumber: value, itemRegNumber: value }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = async (e) => {
    const { name, files: selectedFiles } = e.target;
    if (selectedFiles && selectedFiles[0]) {
      const rawFile = selectedFiles[0];
      try {
        // Compress document if it's an image, while preserving clear readability
        const compressed = await compressImage(rawFile, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
        setFiles(prev => ({ ...prev, [name]: compressed }));
      } catch (err) {
        setFiles(prev => ({ ...prev, [name]: rawFile }));
      }
    }
  };

  const handleAddExtraDoc = () => {
    setExtraDocs(prev => [...prev, { title: '', file: null }]);
  };

  const handleExtraDocChange = async (index, field, value) => {
    let finalValue = value;
    if (field === 'file' && value && value instanceof File) {
      try {
        finalValue = await compressImage(value, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
      } catch (err) {
        finalValue = value;
      }
    }
    setExtraDocs(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], [field]: finalValue };
      }
      return updated;
    });
  };

  const handleRemoveExtraDoc = (index) => {
    setExtraDocs(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 1. Mandatory Name Validation
    if (!formData.customerName?.trim()) {
      toast.error('Customer Name likhna zaroori hai');
      return;
    }

    // 2. Customer Phone 1 Check (Must be strictly 11 digits)
    if (!formData.phone1 || formData.phone1.length !== 11) {
      toast.error('Customer Phone 1 poora 11 digits ka hona zaroori hai (e.g. 03001234567)');
      setTouched(prev => ({ ...prev, phone1: true }));
      return;
    }

    // 3. Customer Phone 2 Check (If entered, must be strictly 11 digits)
    if (formData.phone2 && formData.phone2.length !== 11) {
      toast.error('Phone 2 poora 11 digits ka hona zaroori hai (ya khali chor dein)');
      setTouched(prev => ({ ...prev, phone2: true }));
      return;
    }

    // 4. CNIC Check (13 digits formatted 01201-0245126-5)
    if (!isCnicComplete) {
      toast.error('CNIC Number poora 13 digits (e.g. 01201-0245126-5) hona zaroori hai');
      setTouched(prev => ({ ...prev, cnic: true }));
      return;
    }

    // 5. Item & Plan Checks
    if (!formData.itemName?.trim()) {
      toast.error('Item Name likhna zaroori hai');
      return;
    }

    const totalAmt = parseFloat(formData.totalAmount) || 0;
    if (totalAmt <= 0) {
      toast.error('Total Amount 0 se zyada honi chahiye');
      return;
    }

    const months = parseFloat(formData.totalMonths) || 0;
    if (months <= 0) {
      toast.error('Total Months (Installment Duration) likhein');
      return;
    }

    const kist = parseFloat(formData.monthlyKist) || 0;
    if (kist <= 0) {
      toast.error('Monthly Installment amount likhein');
      return;
    }

    // 6. Guarantor Phone Checks (If filled, must be 11 digits)
    if (formData.guarantor1Phone && formData.guarantor1Phone.length !== 11) {
      toast.error('Guarantor 1 Phone poora 11 digits ka hona chahiye');
      setTouched(prev => ({ ...prev, guarantor1Phone: true }));
      return;
    }

    if (formData.guarantor2Phone && formData.guarantor2Phone.length !== 11) {
      toast.error('Guarantor 2 Phone poora 11 digits ka hona chahiye');
      setTouched(prev => ({ ...prev, guarantor2Phone: true }));
      return;
    }

    setLoading(true);

    try {
      const submitData = new FormData();
      
      // Append text fields with dual-compatibility keys
      Object.keys(formData).forEach(key => {
        submitData.append(key, formData[key]);
      });

      // Explicit backward-compatible aliases for backend
      submitData.append('name', formData.customerName);
      submitData.append('phone', formData.phone1);
      submitData.append('address', formData.permanentAddress);
      submitData.append('guarantorName', formData.guarantor1Name);
      submitData.append('guarantorPhone', formData.guarantor1Phone);
      submitData.append('monthlyAmount', formData.monthlyKist);
      submitData.append('paymentMethod', formData.paymentMode);
      submitData.append('saleDate', formData.bookingDate);

      // Append fixed CNIC files
      Object.keys(files).forEach(key => {
        if (files[key]) submitData.append(key, files[key]);
      });

      // Append dynamic extra documents
      extraDocs.forEach((doc, idx) => {
        if (doc.file) {
          submitData.append('documents', doc.file);
          submitData.append(`docTitle_${idx}`, doc.title || `Attachment ${idx + 1}`);
        }
      });

      const res = await API.post('/installments/sales', submitData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data?.success) {
        toast.success(`Naya installment account (${res.data.customerId || 'CUST'}) kamyabi se create ho gaya!`);
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.data?.message || 'Account banana me masla aaya.');
      }
    } catch (err) {
      console.error('Submit error:', err);
      toast.error(err.response?.data?.message || 'Server connection error');
    } finally {
      setLoading(false);
    }
  };

  const remainingBalance = Math.max(0, (parseFloat(formData.totalAmount) || 0) - (parseFloat(formData.advancePayment) || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl shadow-2xl text-white my-6 max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 sm:p-6 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-2xl">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Create Installment Sale</h2>
              <p className="text-xs text-slate-400">Customer profile, item details & installment plan</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs flex-1">
          
          {/* 1. CUSTOMER INFORMATION */}
          <div className="space-y-4 bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2.5">
              <UserCheck className="w-4 h-4" /> Customer Information
            </h3>

            {/* Customer Profile Picture Uploader with Live Preview */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl">
              <div className="relative group shrink-0">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-950 border-2 border-dashed border-blue-500/40 overflow-hidden flex items-center justify-center shadow-lg transition group-hover:border-blue-400">
                  {profilePicPreview ? (
                    <img 
                      src={profilePicPreview} 
                      alt="Customer Preview" 
                      className="w-full h-full object-cover rounded-2xl" 
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500 p-2 text-center">
                      <User className="w-8 h-8 text-slate-600 mb-1" />
                      <span className="text-[10px] leading-tight font-medium text-slate-400">Tasveer / Photo</span>
                    </div>
                  )}
                </div>
                {profilePicPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveProfilePic}
                    className="absolute -top-1.5 -right-1.5 p-1 bg-red-600 hover:bg-red-500 text-white rounded-full shadow-md transition cursor-pointer"
                    title="Tasveer hatayein"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-1.5 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-blue-400" /> Customer Profile Picture / Photo
                  </span>
                  <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 font-medium">
                    Profile Photo
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Naye customer ki profile pic upload karein taake customer profile, ledger statement aur recovery mai dikhe.
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                  <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white font-medium px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{files.profilePic ? 'Tasveer Tabdeel Karein' : 'Select Customer Photo'}</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleProfilePicChange} 
                    />
                  </label>
                  {files.profilePic && (
                    <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {files.profilePic.name}
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
                  name="customerName"
                  value={formData.customerName}
                  onChange={handleInputChange}
                  placeholder="e.g. Manzoor"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-blue-500 text-xs"
                />
              </div>

              {/* Phone 1 with 11-digit strict validation & live indicator */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-300 font-medium">Phone Number 1 *</label>
                  {formData.phone1.length === 11 ? (
                    <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> 11/11 OK
                    </span>
                  ) : formData.phone1.length > 0 ? (
                    <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      {formData.phone1.length}/11 Digits
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-slate-500">11 Digits Req</span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  name="phone1"
                  maxLength={11}
                  value={formData.phone1}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  onChange={handlePhoneChange}
                  placeholder="03XXXXXXXXX"
                  className={`w-full bg-slate-900 border ${
                    (touched.phone1 && formData.phone1.length < 11) || (formData.phone1.length > 0 && formData.phone1.length < 11)
                      ? 'border-red-500 focus:border-red-500 bg-red-950/10' 
                      : formData.phone1.length === 11
                      ? 'border-emerald-500/60 focus:border-emerald-500'
                      : 'border-slate-800 focus:border-blue-500'
                  } rounded-xl px-3.5 py-2 text-white outline-none font-mono text-xs`}
                />
                {((touched.phone1 && formData.phone1.length < 11) || (formData.phone1.length > 0 && formData.phone1.length < 11)) && (
                  <p className="text-red-400 text-[10px] mt-1 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    11 digits se pehle chhor nahi saktay ({formData.phone1.length}/11)
                  </p>
                )}
              </div>

              {/* Phone 2 with 11-digit strict validation */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-300 font-medium">Phone Number 2 (Optional)</label>
                  {formData.phone2.length === 11 ? (
                    <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> 11/11 OK
                    </span>
                  ) : formData.phone2.length > 0 ? (
                    <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      {formData.phone2.length}/11 Digits
                    </span>
                  ) : null}
                </div>
                <input
                  type="text"
                  name="phone2"
                  maxLength={11}
                  value={formData.phone2}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  onChange={handlePhoneChange}
                  placeholder="03XXXXXXXXX"
                  className={`w-full bg-slate-900 border ${
                    formData.phone2 && formData.phone2.length < 11 
                      ? 'border-red-500 focus:border-red-500 bg-red-950/10' 
                      : formData.phone2 && formData.phone2.length === 11
                      ? 'border-emerald-500/60 focus:border-emerald-500'
                      : 'border-slate-800 focus:border-blue-500'
                  } rounded-xl px-3.5 py-2 text-white outline-none font-mono text-xs`}
                />
                {formData.phone2 && formData.phone2.length < 11 && (
                  <p className="text-red-400 text-[10px] mt-1 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    Phone 2 poora 11 digits hona chahiye ({formData.phone2.length}/11)
                  </p>
                )}
              </div>

              {/* CNIC Number with auto-hyphen (01201-0245126-5) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-300 font-medium">CNIC Number *</label>
                  {isCnicComplete ? (
                    <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> 13/13 OK
                    </span>
                  ) : cnicRawDigits.length > 0 ? (
                    <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      {cnicRawDigits.length}/13 Digits
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-slate-500">13 Digits</span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  name="cnic"
                  maxLength={15}
                  value={formData.cnic}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  onChange={handleCnicChange}
                  placeholder="01201-0245126-5"
                  className={`w-full bg-slate-900 border ${
                    (touched.cnic && !isCnicComplete) || (cnicRawDigits.length > 0 && !isCnicComplete)
                      ? 'border-red-500 focus:border-red-500 bg-red-950/10' 
                      : isCnicComplete
                      ? 'border-emerald-500/60 focus:border-emerald-500'
                      : 'border-slate-800 focus:border-blue-500'
                  } rounded-xl px-3.5 py-2 text-white outline-none font-mono text-xs`}
                />
                {((touched.cnic && !isCnicComplete) || (cnicRawDigits.length > 0 && !isCnicComplete)) && (
                  <p className="text-red-400 text-[10px] mt-1 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    CNIC poora 13 digits (e.g. 01201-0245126-5) format me likhein ({cnicRawDigits.length}/13)
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-300 mb-1 font-medium">Permanent Address *</label>
                <input
                  type="text"
                  required
                  name="permanentAddress"
                  value={formData.permanentAddress}
                  onChange={handleInputChange}
                  placeholder="Full House & Mohalla Address"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-blue-500 text-xs"
                />
              </div>
            </div>

            {/* Customer Documents (Profile Photo & CNIC Copies) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400">Customer Profile Photo</label>
                  {files.profilePic && (
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Selected
                    </span>
                  )}
                </div>
                <input 
                  type="file" 
                  accept="image/*" 
                  name="profilePic" 
                  onChange={handleProfilePicChange} 
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-1.5 text-slate-300 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer" 
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Customer CNIC Front Image *</label>
                <input 
                  type="file" 
                  accept="image/*,.pdf" 
                  name="cnicFront" 
                  onChange={handleFileChange} 
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-1.5 text-slate-300 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 cursor-pointer" 
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Customer CNIC Back Image *</label>
                <input 
                  type="file" 
                  accept="image/*,.pdf" 
                  name="cnicBack" 
                  onChange={handleFileChange} 
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-1.5 text-slate-300 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 cursor-pointer" 
                />
              </div>
            </div>
          </div>

          {/* 2. ITEM & BI-DIRECTIONAL INSTALLMENT CALCULATION */}
          <div className="space-y-3 bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calculator className="w-4 h-4" /> Item & Installment Plan (Auto-Sync)
              </h3>
              <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-medium">
                ⚡ Months ya Kist likhein, doosra khud calculate hoga
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
              <div>
                <label className="block text-slate-300 mb-1 font-medium flex items-center justify-between">
                  <span>Booking / Sale Date *</span>
                  <span className="text-[10px] text-amber-400 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Purani / Aaj Ki</span>
                </label>
                <input
                  type="date"
                  required
                  name="bookingDate"
                  value={formData.bookingDate}
                  onChange={handleInputChange}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Item Name *</label>
                <input
                  type="text"
                  required
                  name="itemName"
                  value={formData.itemName}
                  onChange={handleInputChange}
                  placeholder="e.g. Honda CD 70 / Super Power / Fridge"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">
                  Registration No <span className="text-[10px] text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="registrationNumber"
                  value={formData.registrationNumber}
                  onChange={handleInputChange}
                  placeholder="e.g. LEA-12-3456"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">
                  Engine Number <span className="text-[10px] text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="engineNumber"
                  value={formData.engineNumber}
                  onChange={handleInputChange}
                  placeholder="e.g. ENG-892341"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">
                  Chassis Number <span className="text-[10px] text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="chassisNumber"
                  value={formData.chassisNumber}
                  onChange={handleInputChange}
                  placeholder="e.g. CHS-572910"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Total Amount (Rs.) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  name="totalAmount"
                  value={formData.totalAmount}
                  onChange={handleInputChange}
                  placeholder="e.g. 150000"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Advance Payment (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  name="advancePayment"
                  value={formData.advancePayment}
                  onChange={handleInputChange}
                  placeholder="0"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Remaining Financed Balance</label>
                <div className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3.5 py-2 font-black text-amber-400 font-mono text-sm">
                  Rs. {remainingBalance.toLocaleString()}
                </div>
              </div>

              {/* Monthly Kist Input (Syncs Total Months) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-300 font-medium">Monthly Installment (Rs.) *</label>
                  {calculationSource === 'totalMonths' && formData.monthlyKist && (
                    <span className="text-[10px] text-amber-400 font-mono">⚡ Auto-calculated</span>
                  )}
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  name="monthlyKist"
                  value={formData.monthlyKist}
                  onChange={handleInputChange}
                  placeholder="e.g. 10000"
                  className="w-full bg-slate-900 border border-amber-500/50 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-400 text-xs font-mono font-bold"
                />
              </div>

              {/* Total Months Input (Syncs Monthly Kist) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-300 font-medium">Total Duration (Months) *</label>
                  {calculationSource === 'monthlyKist' && formData.totalMonths && (
                    <span className="text-[10px] text-amber-400 font-mono">⚡ Auto-calculated</span>
                  )}
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  name="totalMonths"
                  value={formData.totalMonths}
                  onChange={handleInputChange}
                  placeholder="e.g. 12"
                  className="w-full bg-slate-900 border border-amber-500/50 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-400 text-xs font-mono font-bold"
                />
              </div>

              {/* Promise Month Input (Customer's Commitment - Top Priority for Invoices) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-300 font-medium">
                    Promise Month <span className="text-[10px] text-amber-400 font-bold">(Invoices Priority ⭐)</span>
                  </label>
                  {formData.promiseMonth && (
                    <span className="text-[10px] text-amber-400 font-mono font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                      ⭐ {formData.promisedMonths ? `${formData.promisedMonths} Mahiny` : 'Target'}
                    </span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    name="promiseMonth"
                    value={formData.promiseMonth}
                    onChange={handleInputChange}
                    placeholder="e.g. October 2028 ya 24"
                    className="w-full bg-slate-900 border border-amber-500/50 rounded-xl pl-3.5 pr-10 py-2 text-white outline-none focus:border-amber-400 text-xs font-mono font-bold"
                  />
                  <label 
                    title="Calendar se Mahina aur Saal chunein"
                    className="absolute right-2.5 flex items-center justify-center cursor-pointer text-slate-400 hover:text-amber-400 transition"
                  >
                    <Calendar className="w-4 h-4 pointer-events-none" />
                    <input
                      type="month"
                      onChange={(e) => {
                        if (e.target.value) {
                          handlePromiseMonthChange(e.target.value);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </label>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 Invoices aur receipts par yehi promise commitment show hoga (bina kist badlay).
                </p>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Due Date Day (Monthly)</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  name="dueDateDay"
                  value={formData.dueDateDay}
                  onChange={handleInputChange}
                  placeholder="5"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Payment Mode (Advance)</label>
                <select
                  name="paymentMode"
                  value={formData.paymentMode}
                  onChange={handleInputChange}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-amber-500 text-xs cursor-pointer"
                >
                  <option value="Cash">Cash (Counter Gullay)</option>
                  <option value="Bank Transfer">Bank Transfer (Raast / IBFT)</option>
                  <option value="EasyPaisa">EasyPaisa</option>
                  <option value="JazzCash">JazzCash</option>
                </select>
              </div>
            </div>
          </div>

          {/* 3. GUARANTORS INFORMATION */}
          <div className="space-y-3 bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2.5">
              <ShieldCheck className="w-4 h-4" /> Guarantors Information (Zameen)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              <div>
                <label className="block text-slate-300 mb-1">Guarantor 1 Name *</label>
                <input 
                  type="text" 
                  name="guarantor1Name" 
                  value={formData.guarantor1Name} 
                  onChange={handleInputChange} 
                  placeholder="Guarantor 1 Full Name" 
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-emerald-500 text-xs" 
                />
              </div>

              {/* Guarantor 1 Phone with 11-digit strict validation */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-300">Guarantor 1 Phone *</label>
                  {formData.guarantor1Phone.length === 11 ? (
                    <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> 11/11 OK
                    </span>
                  ) : formData.guarantor1Phone.length > 0 ? (
                    <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      {formData.guarantor1Phone.length}/11 Digits
                    </span>
                  ) : null}
                </div>
                <input
                  type="text"
                  name="guarantor1Phone"
                  maxLength={11}
                  value={formData.guarantor1Phone}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  onChange={handlePhoneChange}
                  placeholder="03XXXXXXXXX"
                  className={`w-full bg-slate-900 border ${
                    formData.guarantor1Phone && formData.guarantor1Phone.length < 11 
                      ? 'border-red-500 focus:border-red-500 bg-red-950/10' 
                      : formData.guarantor1Phone && formData.guarantor1Phone.length === 11
                      ? 'border-emerald-500/60 focus:border-emerald-500'
                      : 'border-slate-800 focus:border-emerald-500'
                  } rounded-xl px-3.5 py-2 text-white outline-none font-mono text-xs`}
                />
                {formData.guarantor1Phone && formData.guarantor1Phone.length < 11 && (
                  <p className="text-red-400 text-[10px] mt-1 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    Guarantor 1 Phone poora 11 digits hona chahiye ({formData.guarantor1Phone.length}/11)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Guarantor 1 CNIC Front *</label>
                <input type="file" accept="image/*,.pdf" name="guarantor1CnicFront" onChange={handleFileChange} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-1 text-slate-300 text-xs file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[11px] file:bg-slate-800 file:text-slate-300" />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Guarantor 1 CNIC Back *</label>
                <input type="file" accept="image/*,.pdf" name="guarantor1CnicBack" onChange={handleFileChange} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-1 text-slate-300 text-xs file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[11px] file:bg-slate-800 file:text-slate-300" />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Guarantor 2 Name (Optional)</label>
                <input 
                  type="text" 
                  name="guarantor2Name" 
                  value={formData.guarantor2Name} 
                  onChange={handleInputChange} 
                  placeholder="Guarantor 2 Full Name" 
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-emerald-500 text-xs" 
                />
              </div>

              {/* Guarantor 2 Phone with 11-digit strict validation */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-300">Guarantor 2 Phone (Optional)</label>
                  {formData.guarantor2Phone.length === 11 ? (
                    <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> 11/11 OK
                    </span>
                  ) : formData.guarantor2Phone.length > 0 ? (
                    <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      {formData.guarantor2Phone.length}/11 Digits
                    </span>
                  ) : null}
                </div>
                <input
                  type="text"
                  name="guarantor2Phone"
                  maxLength={11}
                  value={formData.guarantor2Phone}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  onChange={handlePhoneChange}
                  placeholder="03XXXXXXXXX"
                  className={`w-full bg-slate-900 border ${
                    formData.guarantor2Phone && formData.guarantor2Phone.length < 11 
                      ? 'border-red-500 focus:border-red-500 bg-red-950/10' 
                      : formData.guarantor2Phone && formData.guarantor2Phone.length === 11
                      ? 'border-emerald-500/60 focus:border-emerald-500'
                      : 'border-slate-800 focus:border-emerald-500'
                  } rounded-xl px-3.5 py-2 text-white outline-none font-mono text-xs`}
                />
                {formData.guarantor2Phone && formData.guarantor2Phone.length < 11 && (
                  <p className="text-red-400 text-[10px] mt-1 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    Guarantor 2 Phone poora 11 digits hona chahiye ({formData.guarantor2Phone.length}/11)
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 4. EXTRA ATTACHMENT DOCUMENTS */}
          <div className="space-y-3 bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> Additional Item / Agreement Documents
              </h3>
              <button
                type="button"
                onClick={handleAddExtraDoc}
                className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Document
              </button>
            </div>

            {extraDocs.length === 0 ? (
              <p className="text-slate-500 italic text-[11px] py-1">No extra attachment documents added yet.</p>
            ) : (
              <div className="space-y-2.5">
                {extraDocs.map((doc, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row items-center gap-2 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <input
                      type="text"
                      placeholder="Doc Title (e.g. Agreement, Electricity Bill)"
                      value={doc.title}
                      onChange={(e) => handleExtraDocChange(idx, 'title', e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white outline-none text-xs"
                    />
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => handleExtraDocChange(idx, 'file', e.target.files[0])}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-1 text-slate-300 text-xs file:mr-2 file:py-0.5 file:px-2 file:rounded-md file:border-0 file:text-[11px] file:bg-slate-800 file:text-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveExtraDoc(idx)}
                      className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Action Buttons */}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition cursor-pointer text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl flex items-center gap-2 transition cursor-pointer disabled:opacity-50 text-xs shadow-lg shadow-blue-900/30"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Creating Account...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Create Installment Account
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}