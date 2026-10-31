/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Activity, AlertCircle, Gauge, Flame, CheckCircle } from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { InsulationTestType, TestRating } from '../../types/database';
import { Button } from '../ui/Button';

interface CreateInsulationTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStationId?: string;
  defaultAssetId?: string;
}

export const CreateInsulationTestModal: React.FC<CreateInsulationTestModalProps> = ({
  isOpen,
  onClose,
  defaultStationId,
  defaultAssetId,
}) => {
  const { stations, stationAssets, addInsulationTest } = useStations();
  const { currentUser } = useAuth();

  const [stationId, setStationId] = useState<string>(defaultStationId || '');
  const [assetId, setAssetId] = useState<string>(defaultAssetId || '');
  const [testType, setTestType] = useState<InsulationTestType>('insulation_resistance');
  const [testDate, setTestDate] = useState('');
  const [appliedVoltageKv, setAppliedVoltageKv] = useState<number>(5.0);
  const [measuredValue, setMeasuredValue] = useState<number>(4500);
  const [measurementUnit, setMeasurementUnit] = useState<string>('MΩ');
  const [temperatureCelsius, setTemperatureCelsius] = useState<number>(30);
  const [statusRating, setStatusRating] = useState<TestRating>('satisfactory');
  const [remarks, setRemarks] = useState('');
  const [recommendations, setRecommendations] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const activeStn = defaultStationId || (stations.length > 0 ? stations[0].id : '');
      setStationId(activeStn);
      setAssetId(defaultAssetId || '');
      setTestType('insulation_resistance');
      setTestDate(new Date().toISOString().slice(0, 16));
      setAppliedVoltageKv(5.0);
      setMeasuredValue(4500);
      setMeasurementUnit('MΩ');
      setTemperatureCelsius(30);
      setStatusRating('satisfactory');
      setRemarks('قياس عزل الأطوار بالنسبة للأرضي HV-E بعد 60 ثانية، مؤشر الاستقطاب PI طبيعي.');
      setRecommendations('القيمة المقاسة أعلى من الحد الأدنى المعياري (1 MΩ لكل 1 kV)، الحالة سليمة.');
      setFormError(null);
    }
  }, [isOpen, defaultStationId, defaultAssetId, stations]);

  if (!isOpen) return null;

  const availableAssets = stationAssets.filter((a) => a.station_id === stationId);

  // Auto adjust units when test type changes
  const handleTestTypeChange = (type: InsulationTestType) => {
    setTestType(type);
    if (type === 'insulation_resistance') {
      setMeasurementUnit('MΩ');
      setAppliedVoltageKv(5.0);
      setMeasuredValue(4500);
      setRemarks('فحص مقاومة العزل بمولد ميجر 5000 فولت بعد دقيقة واحدة.');
    } else if (type === 'oil_bdv') {
      setMeasurementUnit('kV');
      setAppliedVoltageKv(0);
      setMeasuredValue(62);
      setRemarks('متوسط 6 ومضات قياسية في خلية فحص الزيت القياسية فجوة 2.5 مم.');
    } else if (type === 'sf6_pressure') {
      setMeasurementUnit('bar');
      setAppliedVoltageKv(0);
      setMeasuredValue(6.2);
      setRemarks('قياس ضغط غاز SF6 معوضاً عند درجة حرارة 20°C مئوية.');
    } else if (type === 'contact_resistance') {
      setMeasurementUnit('µΩ');
      setAppliedVoltageKv(0);
      setMeasuredValue(45);
      setRemarks('حقن تيار مستمر 100A لقياس مقاومة تلامس نقاط التوصيل الرئيسية.');
    } else if (type === 'tan_delta') {
      setMeasurementUnit('%');
      setAppliedVoltageKv(10.0);
      setMeasuredValue(0.42);
      setRemarks('معامل الفقد العزلي DDF / Tan Delta عند جهد الاختبار الاسمي.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!stationId) {
      setFormError('يرجى اختيار المحطة أولاً.');
      return;
    }
    if (measuredValue === undefined || isNaN(measuredValue)) {
      setFormError('يرجى إدخال القيمة المقاسة للفحص.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await addInsulationTest({
        station_id: stationId,
        asset_id: assetId ? assetId : undefined,
        test_type: testType,
        tested_by: currentUser?.id || '',
        test_date: new Date(testDate).toISOString(),
        applied_voltage_kv: appliedVoltageKv > 0 ? Number(appliedVoltageKv) : undefined,
        measured_value: Number(measuredValue),
        measurement_unit: measurementUnit,
        temperature_celsius: temperatureCelsius ? Number(temperatureCelsius) : undefined,
        status_rating: statusRating,
        remarks: remarks.trim() ? remarks.trim() : undefined,
        recommendations: recommendations.trim() ? recommendations.trim() : undefined,
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
      aria-labelledby="test-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 id="test-modal-title" className="text-lg font-bold text-white tracking-tight">
                تسجيل فحص العوازل والمعدات (Insulation Diagnostic)
              </h2>
              <p className="text-xs text-slate-400">
                فحص الميجر، نقاء وجهد انهيار زيت المحولات، ضغط غاز SF6، ومقاومة التلامس
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
                المحطة المستهدفة <span className="text-rose-400">*</span>
              </label>
              <select
                value={stationId}
                onChange={(e) => {
                  setStationId(e.target.value);
                  setAssetId('');
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
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
                المعدة أو المحول المفحوص
              </label>
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">-- عام بالمحطة / غير محدد --</option>
                {availableAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.category || a.asset_type_code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Test Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              نوع الفحص التشخيصي <span className="text-rose-400">*</span>
            </label>
            <select
              value={testType}
              onChange={(e) => handleTestTypeChange(e.target.value as InsulationTestType)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
            >
              <option value="insulation_resistance">فحص مقاومة العزل بالميجر (Megger Test - MΩ)</option>
              <option value="oil_bdv">فحص جهد انهيار زيت المحول (Breakdown Voltage - kV)</option>
              <option value="sf6_pressure">فحص ضغط غاز سداسي فلوريد الكبريت SF6 (bar)</option>
              <option value="contact_resistance">فحص مقاومة التلامس لقواطع الدورة (Micro-ohm µΩ)</option>
              <option value="tan_delta">فحص معامل الفقد العزلي (Tan Delta %)</option>
            </select>
          </div>

          {/* Applied Voltage, Measured Value, Unit, Temp */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                جهد الفحص (kV)
              </label>
              <input
                type="number"
                step="0.1"
                value={appliedVoltageKv}
                onChange={(e) => setAppliedVoltageKv(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                placeholder="مثال: 5.0"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                القيمة المقاسة <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                step="any"
                value={measuredValue}
                onChange={(e) => setMeasuredValue(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                الوحدة
              </label>
              <input
                type="text"
                value={measurementUnit}
                onChange={(e) => setMeasurementUnit(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                الحرارة (°C)
              </label>
              <input
                type="number"
                value={temperatureCelsius}
                onChange={(e) => setTemperatureCelsius(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Test Date & Rating */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                تاريخ وتوقيت إجراء الفحص <span className="text-rose-400">*</span>
              </label>
              <input
                type="datetime-local"
                value={testDate}
                onChange={(e) => setTestDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                الحكم والتقييم الفني <span className="text-rose-400">*</span>
              </label>
              <select
                value={statusRating}
                onChange={(e) => setStatusRating(e.target.value as TestRating)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="satisfactory">سليم ومطابق للمواصفات القياسية (Satisfactory)</option>
                <option value="warning">تحذير يتطلب المتابعة وتقريب موعد الفحص (Warning)</option>
                <option value="critical">حرج يتطلب إجراء فوري أو عزل المعدة (Critical)</option>
              </select>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              الملاحظات والنتائج الفنية التفصيلية
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 leading-relaxed"
            />
          </div>

          {/* Recommendations */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              التوصيات والإجراءات التصحيحية المقترحة
            </label>
            <input
              type="text"
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
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
              {isSubmitting ? 'جاري التسجيل...' : 'تسجيل نتائج الفحص'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
