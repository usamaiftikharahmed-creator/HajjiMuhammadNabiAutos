import React from 'react';
import { Printer, X, Send, Store, ShieldCheck } from 'lucide-react';
import { getFileUrl } from '../utils/fileUtils';
import { getPromiseMonthsInfo, formatPromiseUrduNote } from '../utils/promiseUtils';

export default function A4ReceiptModal({ saleData, paymentData, onClose }) {
  const handlePrint = () => {
    window.print();
  };

  const cust = saleData?.customer && typeof saleData.customer === 'object' 
    ? saleData.customer 
    : {};

  const customerName = saleData?.extractedName || cust.name || cust.fullName || saleData?.customerName || 'Customer';
  const customerId = saleData?.extractedId || cust.customerId || saleData?.customerId || 'N/A';
  const customerPhone = cust.phone || cust.phoneNumber || saleData?.customerPhone || 'N/A';
  const customerCnic = cust.cnic || saleData?.customerCnic || saleData?.cnic || 'N/A';
  const customerAddress = cust.address || saleData?.permanentAddress || 'N/A';
  const customerPhoto = cust.profilePic || saleData?.profilePic || '';

  const guarantor1Name = cust.guarantorName || saleData?.guarantorName || saleData?.guarantor1Name || 'N/A';
  const guarantor1Phone = cust.guarantorPhone || saleData?.guarantorPhone || saleData?.guarantor1Phone || 'N/A';
  const guarantor2Name = cust.guarantor2Name || saleData?.guarantor2Name || '';
  const guarantor2Phone = cust.guarantor2Phone || saleData?.guarantor2Phone || '';

  const itemName = saleData?.itemName || saleData?.productName || 'Installment Item';
  const itemRegNo = saleData?.registrationNumber || saleData?.itemRegNumber || saleData?.serialOrImei || '';
  const engineNo = saleData?.engineNumber || '';
  const chassisNo = saleData?.chassisNumber || '';

  // Dates & Financials prioritizing Promise commitment (e.g. 24 Months vs 33 months)
  const advanceVal = Number(saleData?.advancePayment ?? saleData?.advanceAmount ?? 0);
  const paymentAmount = paymentData ? Number(paymentData.amountPaid || paymentData.amount || 0) : advanceVal;
  const remainingBal = Number(saleData?.remainingBalance ?? 0);
  const totalVal = Number(saleData?.totalAmount || saleData?.grandTotal || 0);
  const monthlyVal = Number(saleData?.monthlyAmount || saleData?.monthlyInstallment || 0);

  const receiptDate = paymentData?.createdAt ? new Date(paymentData.createdAt) : new Date();
  const promiseInfo = getPromiseMonthsInfo(saleData, receiptDate);
  const totalMonths = promiseInfo.totalMonths;
  const remainingMonths = promiseInfo.remainingMonths;
  const promiseMonthStr = promiseInfo.promiseMonthStr;

  const receiptNo = paymentData?._id 
    ? `REC-${String(paymentData._id).slice(-6).toUpperCase()}` 
    : `INV-${Date.now().toString().slice(-6)}`;

  const todayStr = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });

  // Calculate Next Due Date
  let nextDueDate = saleData?.nextDueDate ? new Date(saleData.nextDueDate) : new Date();
  if (!saleData?.nextDueDate) {
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    nextDueDate.setDate(saleData?.dueDateDay || 5);
  }
  const nextDueDateFormatted = nextDueDate.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });

  // WhatsApp Sender
  const handleWhatsAppSend = () => {
    let rawPhone = customerPhone.replace(/\D/g, '');
    if (rawPhone.startsWith('03')) rawPhone = '92' + rawPhone.slice(1);

    const itemExtraParts = [];
    if (itemRegNo) itemExtraParts.push(`Reg: ${itemRegNo}`);
    if (engineNo) itemExtraParts.push(`Engine: ${engineNo}`);
    if (chassisNo) itemExtraParts.push(`Chassis: ${chassisNo}`);
    const itemExtraStr = itemExtraParts.length > 0 ? ` (${itemExtraParts.join(' | ')})` : '';

    const message = 
      `*HAJJI MOHAMMAD NABI AUTOS*\n` +
      `*INSTALLMENT SALE INVOICE & AGREEMENT*\n` +
      `----------------------------------------\n` +
      `*Invoice No:* ${receiptNo}\n` +
      `*Date:* ${todayStr}\n` +
      `*Customer:* ${customerName} (${customerId})\n` +
      `*Item:* ${itemName}${itemExtraStr}\n` +
      `*Total Price:* Rs. ${totalVal.toLocaleString()}\n` +
      `*Advance Paid:* Rs. ${advanceVal.toLocaleString()}\n` +
      `*Remaining Balance:* Rs. ${remainingBal.toLocaleString()}\n` +
      `*Monthly Installment:* Rs. ${monthlyVal.toLocaleString()} (${totalMonths} Months Plan)\n` +
      (promiseMonthStr ? `*Promise Month (Aakhri Kist):* ${promiseMonthStr}\n` : '') +
      `*Remaining Months:* ${remainingMonths} Months\n` +
      `*Next Due Date:* ${nextDueDateFormatted}\n` +
      `----------------------------------------\n` +
      `*` + formatPromiseUrduNote(saleData, receiptDate) + `*\n` +
      `----------------------------------------\n` +
      `*Shop Address:* Shop # 14, Sector 16-B, Main Godhra Stop New Karachi\n` +
      `*Online Accounts:*\n` +
      `📲 03232200325 (EasyPaisa)\n` +
      `📲 03030246040 (JazzCash)\n` +
      `Shukriya!`;

    window.open(`https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-4 sm:p-6 max-w-4xl w-full flex flex-col gap-4 text-white max-h-[95vh] shadow-2xl">
        
        {/* Screen Top Action Bar */}
        <div className="flex justify-between items-center print:hidden border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Installment Sale Invoice & Agreement</h3>
              <p className="text-xs text-slate-400">Optimized for Half-A4 Paper (5.84" × 8.27")</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleWhatsAppSend}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-md"
            >
              <Send className="w-3.5 h-3.5" /> WhatsApp
            </button>

            <button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-md"
            >
              <Printer className="w-3.5 h-3.5" /> Print Invoice (5.84" × 8.27")
            </button>

            <button 
              onClick={onClose} 
              className="bg-slate-800 text-slate-400 p-1.5 rounded-xl hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Half-A4 Document Sheet */}
        <div className="overflow-y-auto flex-1">
          <div id="a4-print-area" className="bg-white text-slate-900 p-6 sm:p-7 font-sans shadow-2xl rounded-2xl text-xs border border-slate-200 space-y-3.5 max-w-2xl mx-auto">
            
            {/* Header */}
            <div className="border-b-2 border-slate-900 pb-2 flex justify-between items-start">
              <div className="flex-1 pr-2">
                <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                  Hajji Mohammad Nabi Autos
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
                  <span className="bg-slate-900 text-white px-2.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider inline-block mb-0.5">
                    Installment Sale Slip
                  </span>
                  <p className="text-xs font-mono font-bold text-slate-700">{receiptNo}</p>
                  <p className="text-[10px] text-slate-600">Date: {todayStr}</p>
                </div>
              </div>
            </div>

            {/* Customer & Guarantor Details Box */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-700 text-[11px]">
              <div className="flex gap-2.5 items-start">
                {customerPhoto && (
                  <div className="w-12 h-12 rounded-lg border border-slate-300 overflow-hidden shrink-0 bg-white shadow-2xs">
                    <img 
                      src={getFileUrl(customerPhoto)} 
                      alt={customerName} 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                )}
                <div className="space-y-0.5 flex-1 min-w-0">
                  <h4 className="text-[9px] font-bold uppercase text-slate-400 mb-0.5 tracking-wider">Customer Info</h4>
                  <p className="font-bold text-xs text-slate-900 truncate">{customerName}</p>
                  <p><strong>Customer ID:</strong> <span className="font-mono text-blue-700 font-bold">{customerId}</span></p>
                  <p><strong>Phone:</strong> {customerPhone}</p>
                  {customerCnic && <p><strong>CNIC:</strong> {customerCnic}</p>}
                  {customerAddress && <p className="truncate"><strong>Address:</strong> {customerAddress}</p>}
                </div>
              </div>

              <div className="space-y-0.5">
                <h4 className="text-[9px] font-bold uppercase text-slate-400 mb-0.5 tracking-wider">Guarantor / Zameen Info</h4>
                <p className="font-bold text-xs text-slate-900">{guarantor1Name}</p>
                <p><strong>Guarantor 1 Phone:</strong> {guarantor1Phone}</p>
                {guarantor2Name && (
                  <p><strong>Guarantor 2:</strong> {guarantor2Name} ({guarantor2Phone || 'N/A'})</p>
                )}
                {itemRegNo && (
                  <p className="mt-0.5">
                    <strong>Reg / Chassis:</strong> <span className="font-mono bg-yellow-100 px-1 font-bold">{itemRegNo}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Financial Breakdown Table */}
            <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
              <thead>
                <tr className="bg-slate-900 text-white text-[9px] uppercase">
                  <th className="p-1.5 border border-slate-800">Product / Item Name</th>
                  <th className="p-1.5 border border-slate-800 text-right">Total Price</th>
                  <th className="p-1.5 border border-slate-800 text-right">Advance Paid</th>
                  <th className="p-1.5 border border-slate-800 text-right">Remaining Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                <tr>
                  <td className="p-2 border border-slate-300">
                    <strong className="text-xs block text-slate-900">{itemName}</strong>
                    <div className="text-[9px] text-slate-600 font-mono space-y-0.5 mt-0.5">
                      {itemRegNo && <div>Reg: <span className="font-bold text-slate-800">{itemRegNo}</span></div>}
                      {engineNo && <div>Eng: <span className="font-bold text-slate-800">{engineNo}</span></div>}
                      {chassisNo && <div>Chas: <span className="font-bold text-slate-800">{chassisNo}</span></div>}
                    </div>
                  </td>
                  <td className="p-2 border border-slate-300 text-right font-bold text-slate-800">
                    Rs. {totalVal.toLocaleString()}
                  </td>
                  <td className="p-2 border border-slate-300 text-right font-bold text-emerald-700 text-xs">
                    Rs. {paymentAmount.toLocaleString()}
                  </td>
                  <td className="p-2 border border-slate-300 text-right font-bold text-amber-700 text-xs">
                    Rs. {remainingBal.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Next Installment Due Box */}
            <div className="bg-blue-50 border-l-4 border-blue-600 p-2.5 flex justify-between items-center rounded-r-xl">
              <div>
                <p className="text-[9px] font-bold text-blue-900 uppercase">Next Installment Due Date</p>
                <p className="text-sm font-black text-blue-700">
                  {nextDueDateFormatted} (Every {saleData?.dueDateDay || 5}th of Month)
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-600 uppercase">Monthly Installment Amount</p>
                <p className="text-sm font-bold text-slate-900">
                  Rs. {monthlyVal.toLocaleString()} / Month ({totalMonths} Months Plan)
                </p>
                {promiseMonthStr && (
                  <p className="text-[10px] font-bold text-amber-800 font-mono">
                    Promise Target: {promiseMonthStr}
                  </p>
                )}
              </div>
            </div>

            {/* Urdu Note on Remaining Installments */}
            <div className="bg-amber-50 border border-amber-300 p-2 rounded-lg text-center">
              <p className="text-xs sm:text-sm font-black text-amber-950 font-sans tracking-wide" dir="rtl">
                {formatPromiseUrduNote(saleData, receiptDate)}
              </p>
            </div>

            {/* Official Online Transfer Details & Shop Address */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex flex-wrap justify-between items-center text-[10px] text-slate-700">
              <span className="font-bold text-slate-900">📍 Shop # 14, Sector 16-B, Main Godhra Stop New Karachi | Online Accounts:</span>
              <div className="flex items-center gap-3">
                <span>EasyPaisa: <strong className="font-mono text-emerald-800 font-bold">03232200325</strong></span>
                <span>JazzCash: <strong className="font-mono text-amber-800 font-bold">03030246040</strong></span>
              </div>
            </div>

            {/* Terms & Signatures */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-300 text-[9.5px]">
              <div>
                <p className="text-slate-500 leading-tight">
                  * Kist har mahine ki muqarrara tareekh se pehle jama karwayen.<br />
                  * Har kist ki rasid hasil karein aur mahfooz rakhein.<br />
                  <span className="text-blue-800 font-semibold">* Dukaan location k liye upar diya gaya QR code scan karein.</span>
                </p>
              </div>
              <div className="flex justify-between items-end text-center">
                <div>
                  <div className="border-b border-slate-400 w-20 mb-1"></div>
                  <p className="font-bold text-slate-700">Customer Signature</p>
                </div>
                <div>
                  <div className="border-b border-slate-400 w-20 mb-1"></div>
                  <p className="font-bold text-slate-700">Authorized Stamp</p>
                </div>
              </div>
            </div>

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
          .print\\:hidden, button, header, nav, aside {
            display: none !important;
          }
          body * {
            visibility: hidden !important;
          }
          #a4-print-area, #a4-print-area * {
            visibility: visible !important;
          }
          #a4-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 5.6in !important;
            margin: 0 auto !important;
            padding: 2.5mm !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}