import { useState, useMemo } from 'react';
import { X, User, Package, History, DollarSign, Printer, Send, ExternalLink, Camera, Download, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import PaymentReceiptModal from './PaymentReceiptModal';
import A4ReceiptModal from './A4ReceiptModal';
import { calculateInstallmentPlan } from '../utils/installmentSchedule';
import { getFileUrl, getCustomerInitials } from '../utils/fileUtils';
import { getPromiseMonthsInfo } from '../utils/promiseUtils';
import PayKistModal from './PayKistModal';

export default function ViewDetailsModal({ selectedSale, onClose, onRefresh, onOpenPayModal }) {
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showA4Modal, setShowA4Modal] = useState(false);
  const [zoomImg, setZoomImg] = useState(null);
  const [downloadingPhoto, setDownloadingPhoto] = useState(false);

  const handleDownloadPhoto = async (e) => {
    if (e) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }
    if (!zoomImg) return;
    setDownloadingPhoto(true);
    const photoName = `${getCustomerField(selectedSale?.customer, 'name') || 'Customer'}_Photo`;
    try {
      const targetUrl = `${zoomImg}${zoomImg.includes('?') ? '&' : '?'}download=1&title=${encodeURIComponent(photoName)}`;
      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      let ext = '.jpg';
      let mimeType = blob.type || 'image/jpeg';
      try {
        const headerBuf = await blob.slice(0, 16).arrayBuffer();
        const bytes = new Uint8Array(headerBuf);
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
          ext = '.png';
          mimeType = 'image/png';
        } else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                   bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
          ext = '.webp';
          mimeType = 'image/webp';
        } else if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
          ext = '.pdf';
          mimeType = 'application/pdf';
        } else if (blob.type === 'image/png') {
          ext = '.png';
        } else if (blob.type === 'image/webp') {
          ext = '.webp';
        }
      } catch (e) {}

      const finalName = `${photoName}${ext}`;

      const typedBlob = new Blob([blob], { type: mimeType });
      const blobUrl = window.URL.createObjectURL(typedBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = finalName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
      toast.success(`"${finalName}" download ho gaya!`);
    } catch (err) {
      window.open(`${zoomImg}${zoomImg.includes('?') ? '&' : '?'}download=1&title=${encodeURIComponent(photoName)}`, '_blank');
    } finally {
      setDownloadingPhoto(false);
    }
  };

  const handleOpenPay = () => {
    if (typeof onOpenPayModal === 'function') {
      onOpenPayModal();
    } else {
      setShowPayModal(true);
    }
  };

  const plan = useMemo(() => {
    return calculateInstallmentPlan(selectedSale);
  }, [selectedSale]);

  const promiseInfo = useMemo(() => {
    return getPromiseMonthsInfo(selectedSale);
  }, [selectedSale]);

  if (!selectedSale) return null;

  // Safe Customer Field Extractor
  const getCustomerField = (customer, field) => {
    if (!customer) return 'N/A';
    if (typeof customer === 'object') return customer[field] || 'N/A';
    return customer;
  };

  // 🛡️ BULLETPROOF GUARANTOR EXTRACTION (Checks All Possible Nested Fields)
  const getGuarantorDetails = () => {
    const val = (v) => (v && typeof v === 'string' && v.trim() !== '' ? v : null);

    const customerObj = typeof selectedSale.customer === 'object' ? selectedSale.customer : {};
    const guarantorObj = 
      (typeof selectedSale.guarantor === 'object' && selectedSale.guarantor) || 
      (typeof customerObj.guarantor === 'object' && customerObj.guarantor) || 
      (typeof selectedSale.guarantorDetails === 'object' && selectedSale.guarantorDetails) || 
      (typeof customerObj.guarantorDetails === 'object' && customerObj.guarantorDetails) || {};

    const name = 
      val(selectedSale.guarantorName) ||
      val(selectedSale.guarantor_name) ||
      val(customerObj.guarantorName) ||
      val(customerObj.guarantor_name) ||
      val(guarantorObj.name) ||
      val(guarantorObj.guarantorName) ||
      val(guarantorObj.fullName) ||
      (typeof selectedSale.guarantor === 'string' ? selectedSale.guarantor : null) ||
      (typeof customerObj.guarantor === 'string' ? customerObj.guarantor : null) ||
      'N/A';

    const phone = 
      val(selectedSale.guarantorPhone) ||
      val(selectedSale.guarantor_phone) ||
      val(customerObj.guarantorPhone) ||
      val(customerObj.guarantor_phone) ||
      val(guarantorObj.phone) ||
      val(guarantorObj.guarantorPhone) ||
      val(guarantorObj.mobile) ||
      val(guarantorObj.contact) ||
      'N/A';

    return { name, phone };
  };

  const guarantor = getGuarantorDetails();

  const customerObj = typeof selectedSale.customer === 'object' 
    ? selectedSale.customer 
    : { 
        name: getCustomerField(selectedSale.customer, 'name'), 
        customerId: getCustomerField(selectedSale.customer, 'customerId'),
        phone: getCustomerField(selectedSale.customer, 'phone')
      };

  // Direct WhatsApp Receipt Link with Toasts
  const handleDirectWhatsApp = (payment) => {
    let rawPhone = customerObj.phone?.replace(/\D/g, '') || '';
    
    if (!rawPhone) {
      toast.error('Customer phone number is missing!');
      return;
    }

    if (rawPhone.startsWith('03')) {
      rawPhone = '92' + rawPhone.slice(1);
    }

    const isAdvance = 
      payment.forMonth?.toLowerCase().includes('advance') || 
      payment.notes?.toLowerCase().includes('advance') ||
      !payment.forMonth || payment.forMonth === '-';

    const paymentTypeLabel = isAdvance ? 'Advance Payment' : (payment.forMonth || 'Monthly Installment');

    const regDetails = [
      (selectedSale.registrationNumber || selectedSale.itemRegNumber) ? `Reg: ${selectedSale.registrationNumber || selectedSale.itemRegNumber}` : null,
      selectedSale.engineNumber ? `Eng: ${selectedSale.engineNumber}` : null,
      selectedSale.chassisNumber ? `Chas: ${selectedSale.chassisNumber}` : null
    ].filter(Boolean).join(' | ');

    const itemDisplayName = `${selectedSale.itemName}${regDetails ? ` (${regDetails})` : ''}`;

    const message = 
      `*PAYMENT RECEIPT - HAJJI MOHAMMAD NABI AUTOS*\n\n` +
      `*Customer:* ${customerObj.name || 'N/A'} (${customerObj.customerId || ''})\n` +
      `*Item:* ${itemDisplayName}\n` +
      `*Payment Type:* ${paymentTypeLabel}\n` +
      `*Amount Paid:* Rs. ${Number(payment.amountPaid || 0).toLocaleString()}\n` +
      `*Payment Method:* ${(payment.paymentMethod || 'CASH').toUpperCase()}\n` +
      `----------------------------\n` +
      `*Remaining Balance:* Rs. ${Number(selectedSale.remainingBalance || 0).toLocaleString()}\n` +
      `----------------------------\n` +
      `*Shop Address:* Shop # 14, Sector 16-B, Main Godhra Stop New Karachi\n` +
      `*Online Accounts:*\n` +
      `📲 03232200325 (EasyPaisa)\n` +
      `📲 03030246040 (JazzCash)\n` +
      `Thank you for your payment!`;

    window.open(`https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`, '_blank');
    toast.success('WhatsApp Receipt Link Opened!');
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto space-y-6 text-white">
          
          {/* Header */}
          <div className="flex justify-between items-start border-b border-slate-800 pb-4">
            <div>
              <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-md border border-blue-500/30">
                {getCustomerField(selectedSale.customer, 'customerId')}
              </span>
              <h3 className="text-xl font-bold text-white mt-2">
                {getCustomerField(selectedSale.customer, 'name')} - Installment Account Details
              </h3>
            </div>
            
            <div className="flex items-center gap-2">
              {Number(selectedSale.remainingBalance || 0) > 0 && (
                <button
                  onClick={handleOpenPay}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-950"
                  title="Receive Installment Payment"
                >
                  <DollarSign className="w-3.5 h-3.5" /> Kist Wasool
                </button>
              )}
              <button
                onClick={() => setShowA4Modal(true)}
                className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="View & Print Official Half-A4 (5.84x8.27) Agreement Invoice"
              >
                <Printer className="w-3.5 h-3.5" /> Invoice Slip
              </button>
              <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Customer & Guarantor Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Customer Info</span>
                {(selectedSale.profilePic || (typeof selectedSale.customer === 'object' && selectedSale.customer?.profilePic)) && (
                  <span className="text-[10px] text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    Photo Attached
                  </span>
                )}
              </div>
              <div className="flex items-start gap-3.5 pt-1">
                {/* Profile Picture Thumbnail */}
                <div 
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-slate-900 border overflow-hidden shrink-0 flex items-center justify-center shadow-md transition ${
                    (selectedSale.profilePic || (typeof selectedSale.customer === 'object' && selectedSale.customer?.profilePic))
                      ? 'border-blue-500/40 cursor-pointer hover:border-blue-400 hover:scale-105'
                      : 'border-slate-800'
                  }`}
                  onClick={() => {
                    const p = selectedSale.profilePic || (typeof selectedSale.customer === 'object' && selectedSale.customer?.profilePic);
                    if (p) setZoomImg(getFileUrl(p));
                  }}
                  title={
                    (selectedSale.profilePic || (typeof selectedSale.customer === 'object' && selectedSale.customer?.profilePic))
                      ? 'Click to view full photo'
                      : 'No Photo'
                  }
                >
                  {(selectedSale.profilePic || (typeof selectedSale.customer === 'object' && selectedSale.customer?.profilePic)) ? (
                    <>
                      <img 
                        src={getFileUrl(selectedSale.profilePic || selectedSale.customer.profilePic)} 
                        alt="Customer" 
                        className="w-full h-full object-cover rounded-xl"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fb = e.currentTarget.parentElement?.querySelector('.avatar-fallback');
                          if (fb) fb.style.display = 'flex';
                        }}
                      />
                      <span className="avatar-fallback text-sm font-bold text-blue-400 hidden items-center justify-center w-full h-full">
                        {getCustomerInitials(getCustomerField(selectedSale.customer, 'name'))}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-bold text-blue-400">
                      {getCustomerInitials(getCustomerField(selectedSale.customer, 'name'))}
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-300 space-y-1 flex-1">
                  <p><strong>Name:</strong> {getCustomerField(selectedSale.customer, 'name')}</p>
                  <p><strong>Phone:</strong> {getCustomerField(selectedSale.customer, 'phone')}</p>
                  <p><strong>CNIC:</strong> {getCustomerField(selectedSale.customer, 'cnic') || 'N/A'}</p>
                  <p><strong>Address:</strong> {getCustomerField(selectedSale.customer, 'address') || 'N/A'}</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> Guarantor Info
              </div>
              <div className="text-xs text-slate-300 space-y-1">
                <p><strong>Name:</strong> {guarantor.name}</p>
                <p><strong>Phone:</strong> {guarantor.phone}</p>
              </div>
            </div>
          </div>

          {/* Purchase Summary */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1 border-b border-slate-800 pb-2">
              <Package className="w-3.5 h-3.5" /> Purchase & Payment Summary
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Item Purchased</span>
                <span className="text-white font-bold text-sm block">{selectedSale.itemName}</span>
                {(selectedSale.modelYear || selectedSale.registrationNumber || selectedSale.itemRegNumber || selectedSale.engineNumber || selectedSale.chassisNumber) && (
                  <div className="mt-1 space-y-0.5 text-[11px]">
                    {selectedSale.modelYear && (
                      <p className="text-purple-300 font-mono">Model (Year): <strong>{selectedSale.modelYear}</strong></p>
                    )}
                    {(selectedSale.registrationNumber || selectedSale.itemRegNumber) && (
                      <p className="text-blue-300 font-mono">Reg: <strong>{selectedSale.registrationNumber || selectedSale.itemRegNumber}</strong></p>
                    )}
                    {selectedSale.engineNumber && (
                      <p className="text-amber-300 font-mono">Eng: <strong>{selectedSale.engineNumber}</strong></p>
                    )}
                    {selectedSale.chassisNumber && (
                      <p className="text-emerald-300 font-mono">Chas: <strong>{selectedSale.chassisNumber}</strong></p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <span className="text-slate-400 block">Total Amount</span>
                <span className="text-white font-semibold">Rs. {Number(selectedSale.totalAmount || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Advance Paid</span>
                <span className="text-emerald-400 font-semibold">Rs. {Number(selectedSale.advancePayment || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Remaining Balance</span>
                <span className="text-amber-400 font-bold text-sm">Rs. {Number(selectedSale.remainingBalance || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Monthly Installment</span>
                <span className="text-blue-400 font-semibold">Rs. {Number(selectedSale.monthlyAmount || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Duration / Plan</span>
                <span className="text-slate-300 font-semibold">
                  {promiseInfo.totalMonths} Months Plan
                  {promiseInfo.hasPromise && <span className="text-[10px] text-amber-400 ml-1.5 font-bold bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/30">Promise</span>}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Remaining Months</span>
                <span className="text-emerald-400 font-bold">
                  {promiseInfo.remainingMonths} Months Left
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Monthly Due Day</span>
                <span className="text-slate-300">Every {selectedSale.dueDateDay || 10}th</span>
              </div>
              <div>
                <span className="text-slate-400 block">Purchase Date</span>
                <span className="text-slate-300">{selectedSale.createdAt ? new Date(selectedSale.createdAt).toLocaleDateString('en-PK') : '-'}</span>
              </div>
              {(promiseInfo.promiseMonthStr || selectedSale.promiseMonth) && (
                <div>
                  <span className="text-slate-400 block">Promise Commitment (Aakhri Kist)</span>
                  <span className="text-amber-400 font-bold">{promiseInfo.promiseMonthStr || selectedSale.promiseMonth}</span>
                </div>
              )}
              {plan?.missedInstallmentsCount > 0 && (
                <div className="sm:col-span-2 bg-rose-950/40 border border-rose-800/60 rounded-xl p-2.5">
                  <span className="text-rose-400 font-bold block text-xs">
                    ⚠️ {plan.missedInstallmentsCount} Kist Overdue (Pending Amount: Rs. {Number(plan.totalMissedAmount || 0).toLocaleString()})
                  </span>
                  <span className="text-slate-300 text-[11px] block mt-0.5">
                    Oldest Pending: <strong>{plan.oldestPendingMonth?.monthKey || 'N/A'}</strong> (Baqi: Rs. {Number(plan.oldestPendingMonth?.remainingAmount || 0).toLocaleString()})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Ledger Table */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
              <History className="w-3.5 h-3.5 text-blue-400" /> Payment History Ledger
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/50">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Payment Type / Month</th>
                    <th className="py-2.5 px-3">Amount Paid</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3">TRX ID</th>
                    <th className="py-2.5 px-3">Notes</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-slate-300">
                  {selectedSale.payments && selectedSale.payments.length > 0 ? (
                    selectedSale.payments.map((pay, idx) => {
                      const isAdvance = 
                        pay.forMonth?.toLowerCase().includes('advance') || 
                        pay.notes?.toLowerCase().includes('advance') ||
                        !pay.forMonth || pay.forMonth === '-';

                      const payDate = pay.createdAt || pay.paymentDate;

                      return (
                        <tr key={pay._id || idx} className="hover:bg-slate-900/30">
                          <td className="py-2 px-3">{payDate ? new Date(payDate).toLocaleDateString('en-PK') : '-'}</td>
                          <td className="py-2 px-3 font-medium">
                            {isAdvance ? (
                              <span className="text-blue-400 font-bold bg-blue-500/10 px-2.5 py-0.5 rounded border border-blue-500/20 inline-block whitespace-nowrap">
                                Advance
                              </span>
                            ) : (
                              <span className="text-purple-400 font-bold bg-purple-500/10 px-2.5 py-0.5 rounded border border-purple-500/20 inline-block whitespace-nowrap">
                                {pay.forMonth}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-bold text-emerald-400">Rs. {Number(pay.amountPaid || 0).toLocaleString()}</td>
                          <td className="py-2 px-3 capitalize">{pay.paymentMethod || 'cash'}</td>
                          <td className="py-2 px-3 font-mono text-slate-400">{pay.transactionId || '-'}</td>
                          <td className="py-2 px-3 text-slate-400">{pay.notes || '-'}</td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedPaymentForReceipt(pay);
                                  toast.success('Opening Receipt Preview...');
                                }}
                                className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 px-2 py-1 rounded-lg text-[11px] font-medium transition inline-flex items-center gap-1 cursor-pointer"
                                title="View / Print Invoice"
                              >
                                <Printer className="w-3 h-3" /> Invoice
                              </button>

                              <button
                                onClick={() => handleDirectWhatsApp(pay)}
                                className="bg-green-700/20 hover:bg-green-600 text-green-400 hover:text-white border border-green-500/30 px-2 py-1 rounded-lg text-[11px] font-medium transition inline-flex items-center gap-1 cursor-pointer"
                                title="Send WhatsApp Receipt"
                              >
                                <Send className="w-3 h-3" /> WhatsApp
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="7" className="text-center text-slate-500 py-6">
                        No monthly installment payments recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-between items-center pt-2 border-t border-slate-800">
            <button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-4 py-2 rounded-xl text-xs transition cursor-pointer">
              Close
            </button>

            {Number(selectedSale.remainingBalance || 0) > 0 && (
              <button 
                onClick={handleOpenPay} 
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950"
              >
                <DollarSign className="w-4 h-4" /> Receive Installment Payment
              </button>
            )}
          </div>

        </div>
      </div>

      {selectedPaymentForReceipt && (
        <PaymentReceiptModal
          payment={selectedPaymentForReceipt}
          sale={selectedSale}
          onClose={() => setSelectedPaymentForReceipt(null)}
        />
      )}

      {showPayModal && (
        <PayKistModal
          selectedSale={selectedSale}
          onClose={() => setShowPayModal(false)}
          onSuccess={() => {
            setShowPayModal(false);
            toast.success('Installment payment received successfully!');
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {showA4Modal && (
        <A4ReceiptModal
          saleData={selectedSale}
          onClose={() => setShowA4Modal(false)}
        />
      )}

      {zoomImg && (
        <div 
          onClick={() => setZoomImg(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-pointer animate-fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="relative max-w-xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-2xl flex flex-col items-center"
          >
            <button 
              onClick={() => setZoomImg(null)} 
              className="absolute top-4 right-4 p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition shadow-lg cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
            <img 
              src={zoomImg} 
              alt="Customer Full Profile" 
              className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl" 
            />
            <div className="flex justify-between items-center w-full px-2 pt-3">
              <span className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-blue-400" /> Customer Profile Picture
              </span>
              <div className="flex items-center gap-2.5">
                <button 
                  type="button"
                  onClick={handleDownloadPhoto}
                  disabled={downloadingPhoto}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold transition cursor-pointer shadow-sm"
                  title="Download Photo in Original Format"
                >
                  {downloadingPhoto ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Download
                </button>
                <a 
                  href={zoomImg} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Full Size Link
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}