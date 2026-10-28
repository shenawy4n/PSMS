/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Wrench, AlertCircle, Calendar, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { MaintenanceType, TaskPriority, MaintenanceStatus } from '../../types/database';
import { Button } from '../ui/Button';

interface CreateMaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStationId?: string;
}

export const CreateMaintenanceModal: React.FC<CreateMaintenanceModalProps> = ({
  isOpen,
  onClose,
  defaultStationId,
}) => {
  const { stations, stationAssets, faultReports, addMaintenanceOrder } = useStations();
  const { currentUser, allProfiles } = useAuth();

  const [stationId, setStationId] = useState<string>(defaultStationId || '');
  const [assetId, setAssetId] = useState<string>('');
  const [faultReportId, setFaultReportId] = useState<string>('');
  const [maintenanceType, setMaintenanceType] = useState<MaintenanceType>('preventive');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [status, setStatus] = useState<MaintenanceStatus>('scheduled');
  const [title, setTitle] = useState('');
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [scheduledEnd, setScheduledEnd] = useState('');
  const [leadTechnicianId, setLeadTechnicianId] = useState('');
  const [safetyClearanceNumber, setSafetyClearanceNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const activeStn = defaultStationId || (stations.length > 0 ? stations[0].id : '');
      setStationId(activeStn);
      setAssetId('');
      setFaultReportId('');
      setMaintenanceType('preventive');
      setPriority('medium');
      setStatus('scheduled');
      setTitle('');
      setScopeOfWork('');
      // Default dates: tomorrow to +3 days
      const now = new Date();
      now.setDate(now.getDate() + 1);
      const startStr = now.toISOString().slice(0, 16);
      now.setDate(now.getDate() + 2);
      const endStr = now.toISOString().slice(0, 16);
      setScheduledStart(startStr);
      setScheduledEnd(endStr);
      setLeadTechnicianId(currentUser?.id || '');
      setSafetyClearanceNumber('');
      setNotes('');
      setFormError(null);
    }
  }, [isOpen, defaultStationId, stations, currentUser]);

  if (!isOpen) return null;

  // Filter assets by selected station
  const availableAssets = stationAssets.filter((a) => a.station_id === stationId);
  const availableFaults = faultReports.filter(
    (f) => f.station_id === stationId && f.status !== 'closed' && f.status !== 'resolved'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!stationId || stationId.trim() === '') {
      setFormError('يرجى اختيار المحطة التابع لها أمر الصيانة.');
      return;
    }
    if (!title.trim()) {
      setFormError('يرجى كتابة عنوان واضح لأمر الصيانة.');
      return;
    }
    if (!scopeOfWork.trim()) {
      setFormError('يرجى تحديد نطاق العمل والإجراءات الفنية المطلوبة.');
      return;
    }
    if (!scheduledStart || !scheduledEnd) {
      setFormError('يرجى تحديد الفترة الزمنية المجدولة للصيانة.');
      return;
    }
    if (new Date(scheduledEnd) < new Date(scheduledStart)) {
      setFormError('تاريخ نهاية الصيانة المجدولة يجب أن يكون بعد تاريخ البدء.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await addMaintenanceOrder({
        station_id: stationId,
        asset_id: assetId ? assetId : undefined,
        fault_report_id: faultReportId ? faultReportId : undefined,
        maintenance_type: maintenanceType,
        priority,
        status,
        title: title.trim(),
        scope_of_work: scopeOfWork.trim(),
        scheduled_start: new Date(scheduledStart).toISOString(),
        scheduled_end: new Date(scheduledEnd).toISOString(),
        lead_technician_id: leadTechnicianId ? leadTechnicianId : undefined,
        safety_clearance_number: safetyClearanceNumber.trim() ? safetyClearanceNumber.trim() : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
      });

      if (result.success) {
        onClose();
      } else if (result.error) {
        setFormError(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 id="modal-title" className="text-lg font-bold text-white tracking-tight">
                إصدار أمر صيانة جديد (Work Order)
              </h2>
              <p className="text-xs text-slate-400">
                جدولة أعمال الصيانة الوقائية أو التصحيحية وربطها بالمحطات والمعدات الفنية
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {formError && (
          <div className="mx-6 mt-4 p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Station and Asset */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                المحطة الكهربائية <span className="text-rose-400">*</span>
              </label>
              <select
                value={stationId}
                onChange={(e) => {
                  setStationId(e.target.value);
                  setAssetId('');
                  setFaultReportId('');
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                required
              >
                <option value="">-- اختر المحطة --</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                المعدة أو المحول المستهدف
              </label>
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">-- عام في المحطة / غير محدد --</option>
                {availableAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.category || a.asset_type_code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fault report link */}
          {availableFaults.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                ربط ببلاغ عطل قائم (اختياري)
              </label>
              <select
                value={faultReportId}
                onChange={(e) => {
                  setFaultReportId(e.target.value);
                  const flt = availableFaults.find((f) => f.id === e.target.value);
                  if (flt) {
                    if (!title) setTitle(`معالجة عطل: ${flt.title}`);
                    if (!scopeOfWork) setScopeOfWork(`فحص وإصلاح: ${flt.description}`);
                    if (flt.asset_id) setAssetId(flt.asset_id);
                    setMaintenanceType('corrective');
                    setPriority(flt.severity === 'critical' ? 'urgent' : flt.severity === 'high' ? 'high' : 'medium');
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-300 focus:outline-none focus:border-amber-500"
              >
                <option value="">-- لا يوجد ربط ببلاغ --</option>
                {availableFaults.map((f) => (
                  <option key={f.id} value={f.id}>
                    [{f.report_code}] {f.title} ({f.severity})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Type & Priority */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                نوع الصيانة <span className="text-rose-400">*</span>
              </label>
              <select
                value={maintenanceType}
                onChange={(e) => setMaintenanceType(e.target.value as MaintenanceType)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="preventive">صيانة وقائية دورية</option>
                <option value="corrective">صيانة تصحيحية</option>
                <option value="emergency">صيانة طارئة</option>
                <option value="overhaul">عمرة شاملة للمعدة</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                مستوى الأولوية <span className="text-rose-400">*</span>
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="low">منخفضة</option>
                <option value="medium">متوسطة</option>
                <option value="high">عالية</option>
                <option value="urgent">حرجة / فورية</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                الحالة المبدئية
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MaintenanceStatus)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="scheduled">مجدول</option>
                <option value="in_progress">قيد التنفيذ الميداني</option>
                <option value="pending_parts">معلق لقطع الغيار</option>
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              عنوان أمر الصيانة <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: فحص دوري واختبار مقاومة العزل لقاطع الدورة 132 ك.ف"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          {/* Scope of Work */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              نطاق العمل والإجراءات الفنية <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              value={scopeOfWork}
              onChange={(e) => setScopeOfWork(e.target.value)}
              placeholder="صف بالتفصيل خطوات العمل، متطلبات الفصل والعزل، والاختبارات المطلوبة قبل الإرجاع للخدمة..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 leading-relaxed"
              required
            />
          </div>

          {/* Scheduled Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                تاريخ وبدء العمل المجدول <span className="text-rose-400">*</span>
              </label>
              <input
                type="datetime-local"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                تاريخ انتهاء العمل المتوقع <span className="text-rose-400">*</span>
              </label>
              <input
                type="datetime-local"
                value={scheduledEnd}
                onChange={(e) => setScheduledEnd(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
          </div>

          {/* Technician & PTW Clearance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                الفني أو المهندس المسؤول
              </label>
              <select
                value={leadTechnicianId}
                onChange={(e) => setLeadTechnicianId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">-- اختر الفني المسؤول --</option>
                {allProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.job_title || p.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                رقم تصريح السلامة وعزل الجهد (PTW / LOTO)
              </label>
              <input
                type="text"
                value={safetyClearanceNumber}
                onChange={(e) => setSafetyClearanceNumber(e.target.value)}
                placeholder="مثال: PTW-2026-001 أو يترك للإصدار لاحقاً"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              ملاحظات وتنسيق مركز التحكم (LCC / SCADA)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: التنسيق مع مركز التحكم الإقليمي قبل بدء المناورة وفصل القاطع"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'جاري الإصدار والحفظ...' : 'إصدار أمر الصيانة'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
