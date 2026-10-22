import React, { useState } from 'react';
import { 
  X, Calendar, MessageSquare, Clock, CheckCircle2, 
  User, ShieldAlert, History, AlertTriangle, Send, Phone
} from 'lucide-react';
import API from '../api/axios';
import toast from 'react-hot-toast';

export default function RecoveryFollowUpModal({ sale, onClose, onSaved }) {
  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [followUpDate, setFollowUpDate] = useState(getTodayStr());
  const [promiseDate, setPromiseDate] = useState('');
  const [callStatus, setCallStatus] = useState('CALLED - PAYMENT PROMISED');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  if (!sale) return null;

  const customerObj = typeof sale.customer === 'object' ? sale.customer : {};
  const customerName = sale.customerName || customerObj.name || customerObj.fullName || 'Customer';
  const customerId = sale.customerId || customerObj.customerId || 'N/A';
  const customerPhone = sale.customerPhone || customerObj.phone || 'N/A';
  const itemName = sale.itemName || 'Item';
  const remainingBalance = Number(sale.remainingBalance || 0);
  const monthlyAmount = Number(sale.monthlyAmount || 0);
  const followUpsList = Array.isArray(sale.followUps) ? sale.followUps : [];

  const handleSave = async (e) => {
    e.preventDefault();
    if (!promiseDate && !remarks.trim()) {
      toast.error('Please enter at least Promise Date or Remarks');
      return;
    }

    setSaving(true);
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const res = await API.put(`/installments/sales/${sale._id}/promise`, {
        followUpDate,
        promiseDate: promiseDate || null,
        callStatus,
        remarks: remarks.trim(),
        addedByName: userInfo?.name || 'Admin'
      });

      if (res.data?.success) {
        toast.success(
          promiseDate 
            ? `Follow-up saved! Customer on hold until ${promiseDate}` 
            : 'Follow-up remarks saved successfully!'
        );
        if (onSaved) {
          onSaved(res.data.sale);
        }
        onClose();
      } else {
        toast.error(res.data?.message || 'Failed to save follow-up');
      }
    } catch (err) {
      console.error('Follow-up save error:', err);
      toast.error(err.response?.data?.message || err.message || 'Error saving follow-up');
    } finally {
      setSaving(false);
    }
  };

  const getCallStatusBadge = (status) => {
    switch (status) {
      case 'CALLED - PAYMENT PROMISED':
        return 'bg-emerald-950 text-emerald-300 border-emerald-700/60';
      case 'RESCHEDULED':
        return 'bg-purple-950 text-purple-300 border-purple-700/60';
      case 'PAYMENT RECEIVED':
        return 'bg-cyan-950 text-cyan-300 border-cyan-700/60';
      case 'NO RESPONSE / NOT REACHABLE':
        return 'bg-amber-950 text-amber-300 border-amber-700/60';
      case 'CUSTOMER REFUSED':
        return 'bg-rose-950 text-rose-300 border-rose-700/60';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">

        {/* MODAL HEADER */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/90 flex justify-between items-start gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                {customerId}
              </span>
              <h3 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
                <MessageSquare className="w-4 h-4 text-purple-400" />
                <span>Recovery Remarks & Promise Register</span>
                <span className="text-purple-300 font-semibold text-sm">/ کال ریمارکس اور وعدہ رجسٹر</span>
              </h3>
            </div>
            <p className="text-xs text-slate-400 flex flex-wrap items-center gap-1">
              Customer: <strong className="text-white">{customerName}</strong> ({customerPhone}) | Product: <strong className="text-amber-400">{itemName}</strong>
              {(sale.registrationNumber || sale.itemRegNumber) && <span className="bg-blue-950/60 border border-blue-900 text-blue-300 px-1 rounded text-[10px] font-mono">Reg: {sale.registrationNumber || sale.itemRegNumber}</span>}
              {sale.engineNumber && <span className="bg-amber-950/60 border border-amber-900 text-amber-300 px-1 rounded text-[10px] font-mono">Eng: {sale.engineNumber}</span>}
              {sale.chassisNumber && <span className="bg-emerald-950/60 border border-emerald-900 text-emerald-300 px-1 rounded text-[10px] font-mono">Chas: {sale.chassisNumber}</span>}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-full transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-xs">

          {/* INFO SUMMARY BAR */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-2xl bg-slate-950 border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-400 block">Monthly Kist</span>
              <strong className="text-blue-400 font-bold text-sm">Rs. {monthlyAmount.toLocaleString()}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">Remaining</span>
              <strong className="text-amber-400 font-bold text-sm">Rs. {remainingBalance.toLocaleString()}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">Overdue Days</span>
              <strong className="text-rose-400 font-bold text-sm">{sale.daysOverdue || 0} Days</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">Current Status</span>
              <span className={`inline-block px-2 py-0.5 rounded font-bold text-[10px] ${sale.category === 'promised'
                  ? 'bg-purple-950 text-purple-300 border border-purple-600'
                  : 'bg-rose-950 text-rose-300 border border-rose-600'
                }`}>
                {sale.category === 'promised' ? 'On Promise Hold' : 'In Defaulters'}
              </span>
            </div>
          </div>

          {/* SECTION 1: PREVIOUS FOLLOW-UP CALLS HISTORY */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-purple-400" /> Follow-up Call History ({followUpsList.length} Recorded)
            </h4>

            {followUpsList.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center text-slate-500">
                Pehlay koi follow-up call record nahi hai. Niche pehla follow-up aur promise date add karein.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                {[...followUpsList].reverse().map((f, idx) => {
                  const fNum = followUpsList.length - idx;
                  const fDateStr = f.followUpDate ? new Date(f.followUpDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
                  const pDateStr = f.promiseDate ? new Date(f.promiseDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No Promise Date';

                  return (
                    <div
                      key={f._id || idx}
                      className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/90 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-md font-bold text-[10px]">
                            Follow-up #{fNum}
                          </span>
                          <span className="text-slate-400 text-[11px] flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" /> Called on: <strong className="text-slate-200">{fDateStr}</strong>
                          </span>
                        </div>

                        {f.promiseDate ? (
                          <span className="bg-emerald-950 text-emerald-300 border border-emerald-700/60 px-2 py-0.5 rounded-md font-bold text-[10px] flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Promised for: {pDateStr}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">No Promise Date</span>
                        )}
                      </div>

                      <p className="text-slate-200 text-xs mt-1 leading-relaxed">
                        {f.remarks || 'No remarks entered.'}
                      </p>

                      <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-800/40">
                        <span className={`px-2 py-0.5 rounded-md font-semibold border ${getCallStatusBadge(f.callStatus || 'CALLED - PAYMENT PROMISED')}`}>
                          {f.callStatus || 'CALLED - PAYMENT PROMISED'}
                        </span>
                        <span>
                          Recorded by: <strong className="text-slate-300">{f.addedByName || 'Admin'}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 2: ADD NEW FOLLOW-UP FORM */}
          <form onSubmit={handleSave} className="space-y-4 pt-3 border-t border-slate-800">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span>Record New Follow-up & Promise</span>
              <span className="text-emerald-300 font-semibold">/ نیا فالو اپ اور وعدہ درج کریں</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Call Status Option */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-emerald-400" /> Call Status / کال کی صورتحال:
                </label>
                <select
                  value={callStatus}
                  onChange={(e) => setCallStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-2.5 py-2 text-white focus:outline-none text-xs cursor-pointer"
                >
                  <option value="CALLED - PAYMENT PROMISED">CALLED - PAYMENT PROMISED (ادائیگی کا وعدہ)</option>
                  <option value="PENDING CALL">PENDING CALL (کال کرنا باقی ہے)</option>
                  <option value="RESCHEDULED">RESCHEDULED (دوبارہ وقت دیا گیا)</option>
                  <option value="PAYMENT RECEIVED">PAYMENT RECEIVED (ادائیگی وصول ہوگئی)</option>
                  <option value="NO RESPONSE / NOT REACHABLE">NO RESPONSE / NOT REACHABLE (کال بند یا نو رسپانس)</option>
                  <option value="CUSTOMER REFUSED">CUSTOMER REFUSED (کسٹمر نے انکار کیا)</option>
                </select>
              </div>

              {/* Follow-up Call Date */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" /> Follow-up Call Date / کال کی تاریخ:
                </label>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-white focus:outline-none text-xs font-mono"
                />
              </div>

              {/* Promised Payment Date */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" /> Promised Date / وعدہ تاریخ:
                </label>
                <input
                  type="date"
                  value={promiseDate}
                  onChange={(e) => setPromiseDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-white focus:outline-none text-xs font-mono"
                />
              </div>
            </div>

            {/* Helper Notice about Defaulter Suspension */}
            <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-800/40 text-purple-200 text-[11px] flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span>
                <strong>Smart Defaulter Logic:</strong> Jab aap Promise Date set karein gay to ye customer us date tak <strong>Defaulters list se hat jayega</strong>. Jaisi hi Promise Date aayegi, system Admin ko alert notification dega k payment pending hai.
              </span>
            </div>

            {/* Remarks / Conversation Notes */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                <MessageSquare className="w-3 h-3 text-blue-400" /> Call Remarks / Conversation Note / بات چیت کے ریمارکس:
              </label>
              <textarea
                rows={3}
                placeholder="Customer se kya baat hui? (e.g. Call ki thi, customer ne kaha k salary aane par 2 din baad payment karega... / ریمارکس لکھیں)"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-white focus:outline-none text-xs leading-relaxed"
                required
              />
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition cursor-pointer text-xs"
              >
                Cancel / منسوخ
              </button>

              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-purple-950 disabled:opacity-50 text-xs"
              >
                {saving ? 'Saving / محفوظ ہو رہا ہے...' : 'Save Follow-up & Promise / وعدہ اور ریمارکس محفوظ کریں'}
              </button>
            </div>
          </form>

        </div>

      </div>
    </div>
  );
}
