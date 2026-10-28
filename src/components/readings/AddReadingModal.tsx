/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { readingFormSchema } from '../../lib/validations/employee';
import { Modal } from '../ui/Modal';
import { Input, Select } from '../ui/Input';
import { Button } from '../ui/Button';

interface AddReadingModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStationId?: string;
}

export const AddReadingModal: React.FC<AddReadingModalProps> = ({
  isOpen,
  onClose,
  defaultStationId,
}) => {
  const { stations, addReading } = useStations();
  const { currentUser } = useAuth();

  const [stationId, setStationId] = useState<string>('');
  const [voltage, setVoltage] = useState<string>('132.0');
  const [loadMW, setLoadMW] = useState<string>('85.4');
  const [reactiveMVAR, setReactiveMVAR] = useState<string>('15.2');
  const [frequency, setFrequency] = useState<string>('50.00');
  const [powerFactor, setPowerFactor] = useState<string>('0.98');
  const [temp, setTemp] = useState<string>('52.0');
  const [gasPressure, setGasPressure] = useState<string>('6.2');
  const [isAnomaly, setIsAnomaly] = useState<boolean>(false);
  const [anomalyNotes, setAnomalyNotes] = useState<string>('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Synchronize stationId reliably whenever the modal opens, or when defaultStationId or stations change
  useEffect(() => {
    if (isOpen) {
      if (defaultStationId && stations.some((s) => s.id === defaultStationId)) {
        setStationId(defaultStationId);
      } else if (stations.length > 0) {
        setStationId((prev) => (stations.some((s) => s.id === prev) ? prev : stations[0].id));
      } else {
        setStationId('');
      }
      setErrors({});
    }
  }, [isOpen, defaultStationId, stations]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (stations.length === 0) {
      setErrors({ form: 'لا توجد محطات متاحة أو مصرح لك بالوصول إليها حالياً. يرجى مراجعة إدارة المنظومة للتأكد من صلاحيات حسابك ومحطاتك المسندة.' });
      return;
    }

    const payload = {
      station_id: stationId,
      voltage_kv: Number(voltage),
      active_power_mw: Number(loadMW),
      reactive_power_mvar: reactiveMVAR ? Number(reactiveMVAR) : undefined,
      frequency_hz: Number(frequency),
      power_factor: Number(powerFactor),
      transformer_temp_celsius: temp ? Number(temp) : undefined,
      sf6_gas_pressure_bar: gasPressure ? Number(gasPressure) : undefined,
      is_anomaly: isAnomaly,
      anomaly_notes: anomalyNotes,
    };

    const result = readingFormSchema.safeParse(payload);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    const selectedStn = stations.find((s) => s.id === stationId);

    const res = await addReading({
      ...payload,
      station_code: selectedStn?.code,
      station_name: selectedStn?.name,
      recorded_by: currentUser?.id || '',
      recorder_name: currentUser?.full_name || 'فني تشغيل',
      reading_timestamp: new Date().toISOString(),
    });

    setIsSubmitting(false);

    if (!res.success) {
      setErrors({ form: res.error || 'تعذر تسجيل القراءة في قاعدة البيانات' });
      return;
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="تسجيل قراءة تشغيلية جديدة"
      description="إدخال القياسات اللحظية لجهد المحطة، الأحمال، والبارامترات الكهروحرارية"
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.form && (
          <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-lg">
            {errors.form}
          </div>
        )}

        {stations.length === 0 ? (
          <div className="p-3 bg-amber-950/60 border border-amber-800 text-amber-300 text-xs rounded-lg">
            تنبيه: لا توجد أي محطات مصرح لحسابك بالوصول إليها حالياً. لا يمكن تسجيل قراءة عداد دون محطة مسندة.
          </div>
        ) : (
          <Select
            label="المحطة المستهدفة"
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            options={stations.map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }))}
            error={errors.station_id}
            required
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="الجهد الكهربائي (kV)"
            type="number"
            step="0.01"
            value={voltage}
            onChange={(e) => setVoltage(e.target.value)}
            error={errors.voltage_kv}
            required
          />

          <Input
            label="الحمل الفعال (Active MW)"
            type="number"
            step="0.1"
            value={loadMW}
            onChange={(e) => setLoadMW(e.target.value)}
            error={errors.active_power_mw}
            required
          />

          <Input
            label="الحمل غير الفعال (Reactive MVAR)"
            type="number"
            step="0.1"
            value={reactiveMVAR}
            onChange={(e) => setReactiveMVAR(e.target.value)}
            error={errors.reactive_power_mvar}
          />

          <Input
            label="التردد الشبكي (Hz)"
            type="number"
            step="0.01"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            error={errors.frequency_hz}
            required
            helperText="النطاق المعتمد 49.8 - 50.2 Hz"
          />

          <Input
            label="معامل القدرة (Power Factor)"
            type="number"
            step="0.001"
            value={powerFactor}
            onChange={(e) => setPowerFactor(e.target.value)}
            error={errors.power_factor}
            required
          />

          <Input
            label="حرارة زيت المحول (°C)"
            type="number"
            step="0.1"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            error={errors.transformer_temp_celsius}
          />

          <Input
            label="ضغط غاز SF6 (bar)"
            type="number"
            step="0.1"
            value={gasPressure}
            onChange={(e) => setGasPressure(e.target.value)}
            error={errors.sf6_gas_pressure_bar}
            helperText="القيمة الطبيعية بين 5.8 و 6.5 بار"
          />

          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="anomaly-check"
              checked={isAnomaly}
              onChange={(e) => setIsAnomaly(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
            />
            <label htmlFor="anomaly-check" className="text-xs font-medium text-slate-300">
              تسجيل كقراءة شاذة / تنبيه تشغيلي
            </label>
          </div>
        </div>

        {isAnomaly && (
          <Input
            label="ملاحظات الحالة الشاذة"
            placeholder="سبب التذبذب أو الارتفاع..."
            value={anomalyNotes}
            onChange={(e) => setAnomalyNotes(e.target.value)}
          />
        )}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            إلغاء
          </Button>
          <Button
            type="submit"
            size="sm"
            isLoading={isSubmitting}
            disabled={stations.length === 0}
          >
            حفظ واعتماد القراءة
          </Button>
        </div>
      </form>
    </Modal>
  );
};
