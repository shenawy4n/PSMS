/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, CheckSquare, Square, AlertTriangle, Clock, Zap } from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { PTWWorkType, PTWStatus } from '../../types/database';
import { Button } from '../ui/Button';

interface CreatePTWModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStationId?: string;
  defaultOrderId?: string;
}

export const CreatePTWModal: React.FC<CreatePTWModalProps> = ({
  isOpen,
  onClose,
  defaultStationId,
  defaultOrderId,
}) => {
  const { stations, maintenanceOrders, addPermitToWork } = useStations();
  const { currentUser } = useAuth();

  const [stationId, setStationId] = useState<string>(defaultStationId || '');
  const [orderId, setOrderId] = useState<string>(defaultOrderId || '');
  const [title, setTitle] = useState('');
  const [workType, setWorkType] = useState<PTWWorkType>('electrical_isolation');
  const [voltageLevelKv, setVoltageLevelKv] = useState<number>(132);
  const [equipmentIsolated, setEquipmentIsolated] = useState('');

  // Electrical Safety Checklist
  const [lotoApplied, setLotoApplied] = useState(false);
  const [groundingApplied, setGroundingApplied] = useState(false);
  const [zeroVoltageVerified, setZeroVoltageVerified] = useState(false);

  const [safetyPrecautions, setSafetyPrecautions] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [notes, setNotes] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const activeStn = defaultStationId || (stations.length > 0 ? stations[0].id : '');
      setStationId(activeStn);
      setOrderId(defaultOrderId || '');

      const linkedOrder = maintenanceOrders.find((m) => m.id === defaultOrderId);
      if (linkedOrder) {
        setTitle(`تصريح عمل: ${linkedOrder.title}`);
        setStationId(linkedOrder.station_id);
      } else {
        setTitle('');
      }

      setWorkType('electrical_isolation');
      setVoltageLevelKv(132);
      setEquipmentIsolated('');
      setLotoApplied(false);
      setGroundingApplied(false);
      setZeroVoltageVerified(false);
      setSafetyPrecautions(
        'ارتداء بدلة القوس الكهربائي (Arc Flash 40 cal/cm²)، خوذة أمان مع شيلد واقي، حذاء عازل للمحطات، وتثبيت بطاقات التحذير وعوازل الأمان.'
      );

      const now = new Date();
      now.setMinutes(0, 0, 0);
      const startStr = now.toISOString().slice(0, 16);
      now.setHours(now.getHours() + 8);
      const endStr = now.toISOString().slice(0, 16);
      setValidFrom(startStr);
      setValidTo(endStr);
      setNotes('');
      setFormError(null);
    }
  }, [isOpen, defaultStationId, defaultOrderId, stations, maintenanceOrders]);

  if (!isOpen) return null;

  const stationOrders = maintenanceOrders.filter((m) => !stationId || m.station_id === stationId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!stationId) {
      setFormError('يرجى اختيار المحطة أولاً.');
      return;
    }
    if (!title.trim()) {
      setFormError('يرجى كتابة عنوان ووصف للتصريح.');
      return;
    }
    if (!equipmentIsolated.trim()) {
      setFormError('يرجى تحديد معدات وقواطع العزل بوضوح لضمان أمان العاملين.');
      return;
    }
    if (!validFrom || !validTo) {
      setFormError('يرجى تحديد فترة سريان التصريح.');
      return;
    }
    if (new Date(validTo) <= new Date(validFrom)) {
      setFormError('نهاية سريان التصريح يجب أن تكون بعد بداية السريان.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await addPermitToWork({
        station_id: stationId,
        order_id: orderId || undefined,
        title: title.trim(),
        work_type: workType,
        status: 'submitted', // submitted for safety officer approval
        voltage_level_kv: Number(voltageLevelKv) || undefined,
        equipment_isolated: equipmentIsolated.trim(),
        loto_applied: lotoApplied,
        grounding_applied: groundingApplied,
        zero_voltage_verified: zeroVoltageVerified,
        safety_precautions: safetyPrecautions.trim(),
        valid_from: new Date(validFrom).toISOString(),
        valid_to: new Date(validTo).toISOString(),
        requested_by: currentUser?.id || '',
        notes: notes.trim() || undefined,
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
      aria-labelledby="ptw-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 id="ptw-modal-title" className="text-lg font-bold text-white tracking-tight">
                إصدار تصريح عمل وسلامة كهربائية (PTW / LOTO)
              </h2>
              <p className="text-xs text-slate-400">
                تصريح عزل الجهد والتأريض وقفل الدوائر لضمان سلامة الفرق الفنية بالموقع
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
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Station and Order */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                المحطة المستهدفة <span className="text-rose-400">*</span>
              </label>
              <select
                value={stationId}
                onChange={(e) => {
                  setStationId(e.target.value);
                  setOrderId('');
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                required
              >
                <option value="">-- اختار المحطة --</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                ربط بأمر صيانة (اختياري)
              </label>
              <select
                value={orderId}
                onChange={(e) => {
                  setOrderId(e.target.value);
                  const ord = stationOrders.find((m) => m.id === e.target.value);
                  if (ord && !title) {
                    setTitle(`تصريح عزل لأمر الصيانة: ${ord.title}`);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">-- تصريح مستقل / لا يوجد أمر مرتبط --</option>
                {stationOrders.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.order_code}] {m.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              موضوع وتفاصيل العمل المرخص <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="اكتب موضوع وتفاصيل العمل (مثال: عزل وتأريض قاطع 220 ك.ف لأعمال الفحص الدوري)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              required
            />
          </div>

          {/* Work Type and Voltage Level */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                تصنيف طبيعة العمل والسلامة <span className="text-rose-400">*</span>
              </label>
              <select
                value={workType}
                onChange={(e) => setWorkType(e.target.value as PTWWorkType)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="electrical_isolation">عزل كهربائي وفصل دوائر وقواطع</option>
                <option value="hot_work">أعمال حرارية / لحام وقطع</option>
                <option value="height_work">العمل على ارتفاعات وأبراج المحطة</option>
                <option value="confined_space">دخول أماكن مغلقة وخنادق كابلات</option>
                <option value="general">صيانة ميكانيكية وعامة</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                مستوى الجهد التشغيلي للمنطقة (كيلوفولت kV)
              </label>
              <input
                type="number"
                value={voltageLevelKv}
                onChange={(e) => setVoltageLevelKv(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                placeholder="مثال: 11, 22, 66, 220, 500"
              />
            </div>
          </div>

          {/* Equipment Isolated */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              معدات وقواطع وسكاكين العزل المستهدفة بالتأمين <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={2}
              value={equipmentIsolated}
              onChange={(e) => setEquipmentIsolated(e.target.value)}
              placeholder="اكتب أرقام القواطع وسكاكين العزل المفصولة، مثل: قاطع الدورة CB-220-02 وسكاكين العزل DS-220-02A و DS-220-02B"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 leading-relaxed"
              required
            />
          </div>

          {/* Electrical Safety Checklist */}
          <div className="p-4 bg-slate-950/80 border border-amber-900/40 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300 pb-2 border-b border-slate-800">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>قائمة التحقق الإلزامية للسلامة الكهربائية الميدانية</span>
            </div>

            <div className="space-y-2 text-xs text-slate-300">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lotoApplied}
                  onChange={(e) => setLotoApplied(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500/20 bg-slate-900"
                />
                <div>
                  <span className="font-semibold text-white">إجراءات القفل والوسم (LOTO):</span> تم تركيب أقفال الأمان
                  وبطاقات التحذير على أذرع ومفاتيح تشغيل القواطع وسكاكين الفصل لمنع إعادة التوصيل العرضي.
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={groundingApplied}
                  onChange={(e) => setGroundingApplied(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500/20 bg-slate-900"
                />
                <div>
                  <span className="font-semibold text-white">التأريض الميداني المؤقت (Earth Grounding):</span> تم توصيل كابلات
                  التأريض المعتمدة على جميع أطوار المعدة المعزولة لتفريغ أي شحنات مستحثة.
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={zeroVoltageVerified}
                  onChange={(e) => setZeroVoltageVerified(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500/20 bg-slate-900"
                />
                <div>
                  <span className="font-semibold text-white">فحص انعدام الجهد (Voltage-Free Test):</span> تم استخدام عصا
                  الكشف على الجهد ومعايرتها للتأكد القطعي من خلو الدائرة من أي فرق جهد كهربائي.
                </div>
              </label>
            </div>
          </div>

          {/* Safety Precautions & PPE */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              احتياطات ومعدات الوقاية الشخصية (PPE)
            </label>
            <input
              type="text"
              value={safetyPrecautions}
              onChange={(e) => setSafetyPrecautions(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Validity Period */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                تاريخ ووقت بدء السريان <span className="text-rose-400">*</span>
              </label>
              <input
                type="datetime-local"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                تاريخ ووقت انتهاء الصلاحية <span className="text-rose-400">*</span>
              </label>
              <input
                type="datetime-local"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              ملاحظات وتنسيق إضافي
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: يمنع تمديد الأسلاك بدون حضور مراقب السلامة"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
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
              {isSubmitting ? 'جاري رفع التصريح...' : 'رفع التصريح للاعتماد الفني'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
