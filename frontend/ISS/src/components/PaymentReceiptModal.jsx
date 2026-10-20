import React from 'react';
import { X, Printer, Send, Store, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { getPromiseMonthsInfo, formatPromiseUrduNote } from '../utils/promiseUtils';

export default function PaymentReceiptModal({ payment, sale, onClose }) {
  if (!payment && !sale) return null;

  // Resolve Customer safely across various object shapes
  const customer = (sale?.customer && typeof sale.customer === 'object')
    ? sale.customer
    : (payment?.customer && typeof payment.customer === 'object')
      ? payment.customer
      : {
          name: sale?.customerName || payment?.customerName || 'Customer',
          customerId: sale?.customerId || payment?.customerId || 'N/A',
          phone: sale?.customerPhone || payment?.customerPhone || 'N/A',
          cnic: sale?.customerCnic || 'N/A',
          address: sale?.customerAddress || sale?.address || 'N/A'
        };

  const customerName = customer.name || customer.fullName || sale?.customerName || 'Customer';
  const customerId = customer.customerId || sale?.customerId || 'N/A';
  const customerPhone = customer.phone || sale?.customerPhone || 'N/A';
  const customerCnic = customer.cnic || sale?.cnic || '';
  const customerAddress = customer.address || sale?.permanentAddress || '';

  const itemName = sale?.itemName || sale?.productName || payment?.itemName || 'Installment Item';
  const itemRegNumber = sale?.registrationNumber || sale?.itemRegNumber || sale?.serialOrImei || '';
  const engineNumber = sale?.engineNumber || '';
  const chassisNumber = sale?.chassisNumber || '';
  const totalAmount = Number(sale?.totalAmount || sale?.grandTotal || 0);
  const monthlyAmount = Number(sale?.monthlyAmount || sale?.monthlyInstallment || 0);

  const amountPaid = Number(payment?.amountPaid ?? payment?.amount ?? 0);
  const remainingBalance = Number(sale?.remainingBalance ?? 0);
  const prevBalance = remainingBalance + amountPaid;

  const paymentDate = payment?.createdAt || payment?.date || Date.now();
  const promiseInfo = getPromiseMonthsInfo(sale, new Date(paymentDate));
  const remainingMonths = promiseInfo.remainingMonths;
  const promiseMonthStr = promiseInfo.promiseMonthStr;
  const dateFormatted = new Date(paymentDate).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const timeFormatted = new Date(paymentDate).toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const receiptNo = payment?._id 
    ? `REC-${String(payment._id).slice(-6).toUpperCase()}` 
    : `REC-${Date.now().toString().slice(-6)}`;

  // Determine if this is an advance booking payment or a regular monthly installment
  const isAdvance = 
    payment?.forMonth?.toLowerCase().includes('advance') || 
    payment?.notes?.toLowerCase().includes('advance') ||
    !payment?.forMonth || 
    payment?.forMonth === '-';

  const paymentTypeLabel = isAdvance ? 'Advance / Booking Payment' : (payment?.forMonth || 'Monthly Installment');
  const paymentMethod = (payment?.paymentMethod || payment?.paymentMode || 'Cash').toUpperCase();

  // WhatsApp Sender with clean, professional template
  const handleWhatsAppSend = () => {
    let rawPhone = customerPhone.replace(/\D/g, '');
    if (rawPhone.startsWith('03')) {
      rawPhone = '92' + rawPhone.slice(1);
    }

    const itemExtraParts = [];
    if (itemRegNumber) itemExtraParts.push(`Reg: ${itemRegNumber}`);
    if (engineNumber) itemExtraParts.push(`Eng: ${engineNumber}`);
    if (chassisNumber) itemExtraParts.push(`Chas: ${chassisNumber}`);
    const itemExtraStr = itemExtraParts.length > 0 ? ` (${itemExtraParts.join(' | ')})` : '';

    const message = 
      `*HAJJI MOHAMMAD NABI AUTOS*\n` +
      `*OFFICIAL PAYMENT RECEIPT*\n` +
      `----------------------------------------\n` +
      `*Receipt No:* ${receiptNo}\n` +
      `*Date:* ${dateFormatted} ${timeFormatted}\n` +
      `*Customer:* ${customerName} (${customerId})\n` +
      `*Phone:* ${customerPhone}\n` +
      `*Item:* ${itemName}${itemExtraStr}\n` +
      `*Payment For:* ${paymentTypeLabel}\n` +
      `*Payment Mode:* ${paymentMethod}\n` +
      (payment?.transactionId ? `*Transaction ID:* ${payment.transactionId}\n` : '') +
      `----------------------------------------\n` +
      `*Amount Paid:* Rs. ${amountPaid.toLocaleString()}\n` +
      `*Remaining Balance:* Rs. ${remainingBalance.toLocaleString()}\n` +
      `----------------------------------------\n` +
      `*` + formatPromiseUrduNote(sale, new Date(paymentDate)) + `*\n` +
      `----------------------------------------\n` +
      (payment?.notes ? `*Remarks:* ${payment.notes}\n` : '') +
      `*Shop Address:* Shop # 14, Sector 16-B, Main Godhra Stop New Karachi\n` +
      `*Online Accounts:*\n` +
      `📲 03232200325 (EasyPaisa)\n` +
      `📲 03030246040 (JazzCash)\n` +
      `_Shukriya aapke bharosay ka!_`;

    window.open(`https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto printable-modal-overlay">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full flex flex-col p-4 sm:p-6 text-white shadow-2xl relative printable-modal-card max-h-[92vh]">
        
        {/* Modal Top Action Bar - Hidden on Print */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">Payment Receipt Voucher</h3>
              <p className="text-[11px] text-slate-400">Ready to print & share</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleWhatsAppSend}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md"
              title="Send to Customer WhatsApp"
            >
              <Send className="w-3.5 h-3.5" /> WhatsApp
            </button>

            <button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md"
              title="Print Receipt (5.84in x 8.27in)"
            >
              <Printer className="w-3.5 h-3.5" /> Print Receipt (5.84" × 8.27")
            </button>

            <button 
              onClick={onClose} 
              className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Area */}
        <div className="flex-1 overflow-y-auto py-3 print:overflow-visible print:py-0">
          
          {/* Printable Receipt Paper Sheet (Optimized for 5.84in x 8.27in) */}
          <div id="receipt-print-area" className="bg-white text-slate-900 p-6 sm:p-7 font-sans shadow-xl space-y-3.5 text-xs max-w-2xl mx-auto border border-slate-200 rounded-2xl">
            
            {/* Header: Shop Branding */}
            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-2">
              <div className="flex-1 pr-2">
                <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
                  HAJJI MOHAMMAD NABI AUTOS
                </h1>
                <p className="text-[11px] text-slate-600 font-semibold mt-0.5">Easy Monthly Installment Solutions</p>
                <div className="text-[10px] text-slate-700 font-medium flex flex-wrap items-center gap-x-2 mt-0.5">
                  <span className="text-blue-700 font-bold">📍 Shop # 14, Sector 16-B, Main Godhra Stop New Karachi</span>
                  <span>•</span>
                  <span>📞 <strong>0323-2200325</strong> (EasyPaisa)</span>
                  <span>•</span>
                  <span>📞 <strong>0303-0246040</strong> (JazzCash)</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                {/* Location QR Code */}
                <div className="text-center p-1 bg-white border border-slate-300 rounded-lg shadow-2xs">
                  <img 
                    src="/shop_location_qr.png" 
                    alt="Shop Location QR" 
                    className="w-12 h-12 object-contain mx-auto rounded"
                  />
                  <span className="text-[8px] font-bold text-slate-700 block leading-tight mt-0.5">
                    📍 Shop Location
                  </span>
                </div>

                <div className="text-right">
                  <span className="bg-slate-900 text-white font-bold text-[9px] px-2.5 py-0.5 rounded uppercase tracking-wider inline-block mb-0.5">
                    OFFICIAL RECEIPT
                  </span>
                  <p className="text-xs font-mono font-bold text-slate-800">{receiptNo}</p>
                  <p className="text-[10px] text-slate-500">{dateFormatted} - {timeFormatted}</p>
                </div>
              </div>
            </div>

            {/* Customer & Item Grid */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-700 text-[11px]">
              <div className="space-y-0.5">
                <span className="text-[9px] font-bold uppercase text-slate-400 block tracking-wider">Customer Details</span>
                <p className="text-xs font-bold text-slate-900">{customerName}</p>
                <p><span className="text-slate-500">Customer ID:</span> <strong className="font-mono text-blue-700">{customerId}</strong></p>
                <p><span className="text-slate-500">Phone:</span> {customerPhone}</p>
                {customerCnic && <p><span className="text-slate-500">CNIC:</span> {customerCnic}</p>}
                {customerAddress && <p className="truncate"><span className="text-slate-500">Address:</span> {customerAddress}</p>}
              </div>

              <div className="space-y-0.5">
                <span className="text-[9px] font-bold uppercase text-slate-400 block tracking-wider">Purchased Item Info</span>
                <p className="text-xs font-bold text-slate-900">{itemName}</p>
                {itemRegNumber && (
                  <p><span className="text-slate-500">Reg No:</span> <strong className="font-mono text-purple-700">{itemRegNumber}</strong></p>
                )}
                {engineNumber && (
                  <p><span className="text-slate-500">Engine No:</span> <strong className="font-mono text-purple-700">{engineNumber}</strong></p>
                )}
                {chassisNumber && (
                  <p><span className="text-slate-500">Chassis No:</span> <strong className="font-mono text-purple-700">{chassisNumber}</strong></p>
                )}
              </div>
            </div>

            {/* Payment Details Table */}
            <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold uppercase text-[9px] border-b border-slate-300">
                  <th className="p-1.5 border-r border-slate-300">Particulars / Month</th>
                  <th className="p-1.5 border-r border-slate-300">Payment Mode</th>
                  <th className="p-1.5 border-r border-slate-300">Previous Balance</th>
                  <th className="p-1.5 text-right">Amount Received</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200 text-slate-800">
                  <td className="p-2 border-r border-slate-200">
                    <strong className="text-slate-900 block text-xs">{paymentTypeLabel}</strong>
                    {payment?.transactionId && (
                      <span className="text-[9px] text-slate-500 font-mono">TRX: {payment.transactionId}</span>
                    )}
                  </td>
                  <td className="p-2 border-r border-slate-200 uppercase font-semibold text-purple-700">
                    {paymentMethod}
                  </td>
                  <td className="p-2 border-r border-slate-200 font-mono text-slate-600">
                    Rs. {prevBalance.toLocaleString()}
                  </td>
                  <td className="p-2 text-right font-black text-emerald-700 text-xs font-mono">
                    Rs. {amountPaid.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Net Remaining Balance Banner */}
            <div className="grid grid-cols-2 gap-2 bg-emerald-50 border border-emerald-300 p-2.5 rounded-xl">
              <div>
                <span className="text-[9px] text-emerald-900 uppercase font-bold block">Current Payment Received</span>
                <span className="text-base font-black text-emerald-700">Rs. {amountPaid.toLocaleString()}</span>
              </div>
              <div className="text-right border-l border-emerald-200 pl-2">
                <span className="text-[9px] text-slate-600 uppercase font-bold block">Net Remaining Balance</span>
                <span className={`text-base font-black ${remainingBalance === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {remainingBalance === 0 ? 'PAID IN FULL (NIL)' : `Rs. ${remainingBalance.toLocaleString()}`}
                </span>
              </div>
            </div>

            {/* Urdu Note on Remaining Installments */}
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-2 text-center shadow-xs">
              <p className="text-xs sm:text-sm font-black text-amber-950 font-sans tracking-wide" dir="rtl">
                {formatPromiseUrduNote(sale, new Date(paymentDate))}
              </p>
            </div>

            {/* Notes if present */}
            {payment?.notes && (
              <p className="text-[10px] text-slate-700 italic bg-slate-50 p-1.5 rounded border border-slate-200">
                <strong className="text-slate-900 not-italic">Note / Remarks:</strong> {payment.notes}
              </p>
            )}

            {/* Signatures & Stamp */}
            <div className="pt-3 grid grid-cols-2 gap-6 text-center text-[10px] text-slate-600">
              <div>
                <div className="border-b border-slate-400 mb-1 w-24 mx-auto"></div>
                <span>Customer Signature</span>
              </div>
              <div>
                <div className="border-b border-slate-400 mb-1 w-24 mx-auto"></div>
                <span className="font-bold text-slate-800">Authorized Stamp & Signature</span>
              </div>
            </div>

            <p className="text-center text-[9px] text-slate-500 pt-1 border-t border-slate-200">
              📍 Shop # 14, Sector 16-B, Main Godhra Stop New Karachi (Scan QR above for map location) • Computer-generated receipt from Hajji Mohammad Nabi Autos
            </p>
          </div>

        </div>

      </div>

      {/* Strict Print CSS for Half A4 (5.84in x 8.27in) Zero-Cut Zero-Overflow */}
      <style>{`
        @media print {
          @page {
            size: 5.84in 8.27in;
            margin: 3.5mm;
          }
          
          *, *:before, *:after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box !important;
          }

          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            width: 5.84in !important;
            max-width: 5.84in !important;
            height: 8.27in !important;
            max-height: 8.27in !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }

          .print\\:hidden, nav, header, aside, button {
            display: none !important;
          }

          .printable-modal-overlay,
          .printable-modal-card {
            position: static !important;
            display: block !important;
            background: #ffffff !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            height: auto !important;
            max-width: 100% !important;
            overflow: visible !important;
            backdrop-filter: none !important;
            inset: auto !important;
            transform: none !important;
          }

          body * {
            visibility: hidden !important;
          }

          #receipt-print-area, #receipt-print-area * {
            visibility: visible !important;
          }

          #receipt-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 5.6in !important;
            margin: 0 auto !important;
            padding: 2.5mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}