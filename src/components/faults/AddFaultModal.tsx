/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { faultReportSchema } from '../../lib/validations/employee';
import { FaultSeverity } from '../../types/database';
import { Modal } from '../ui/Modal';
import { Input, Select } from '../ui/Input';
import { Button } from '../ui/Button';

interface AddFaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStationId?: string;
}

export const AddFaultModal: React.FC<AddFaultModalProps> = ({
  isOpen,
  onClose,
  defaultStationId,
}) => {
  const { stations, addFaultReport, stationAssets } = useStations();
  const { currentUser } = useAuth();

  const [stationId, setStationId] = useState<string>(defaultStationId || stations[0]?.id || '');
  const [assetId, setAssetId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<FaultSeverity>('medium');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableAssets = stationAssets.filter((a) => a.station_id === stationId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const payload = {
      station_id: stationId,
      asset_id: assetId || undefined,
      title,
      description,
      severity,
    };

    const result = faultReportSchema.safeParse(payload);
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
    const selectedAsset = availableAssets.find((a) => a.id === assetId);

    await addFaultReport({
      station_id: stationId,
      station_name: selectedStn?.name,
      station_code: selectedStn?.code,
      asset_id: assetId || undefined,
      asset_name: selectedAsset?.name,
      reported_by: currentUser?.id || '',
      reporter_name: currentUser?.full_name || 'فني تشغيل',
      title,
      description,
      severity,
      status: 'open',
      occurred_at: new Date().toISOString(),
    });

    setIsSubmitting(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="تسجيل بلاغ عطل أو حادث تشغيلي"
      description="الإبلاغ الفوري عن أعطال القواطع، المحولات، أو التذبذبات الكهربائية"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="المحطة المتأثرة"
          value={stationId}
          onChange={(e) => {
            setStationId(e.target.value);
            setAssetId('');
          }}
          options={stations.map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }))}
          error={errors.station_id}
        />

        {availableAssets.length > 0 && (
          <Select
            label="المعدة المتأثرة (اختياري)"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            options={[
              { value: '', label: 'بلاغ عام بالمحطة / غير محدد بمعدة' },
              ...availableAssets.map((a) => ({ value: a.id, label: `${a.name} (${a.serial_number})` })),
            ]}
          />
        )}

        <Input
          label="عنوان البلاغ"
          placeholder="مثال: تسرب زيت خفيف عند صمام محول التوزيع الثاني"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          required
        />

        <Select
          label="درجة الخطورة والتأثير التشغيلي"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as FaultSeverity)}
          options={[
            { value: 'low', label: 'منخفضة (لا تؤثر على استمرارية التغذية)' },
            { value: 'medium', label: 'متوسطة (تتطلب متابعة وصيانة مجدولة)' },
            { value: 'high', label: 'مرتفعة (احتمالية خروج معدة أو فقد موثوقية)' },
            { value: 'critical', label: 'حرجة جداً (فصل فوري أو خطر على السلامة)' },
          ]}
          error={errors.severity}
        />

        <div className="text-right">
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            التفاصيل والمشاهدات الموقعية <span className="text-rose-400">*</span>
          </label>
          <textarea
            rows={4}
            className={`w-full px-3 py-2 text-xs bg-slate-950 border rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 ${
              errors.description ? 'border-rose-500' : 'border-slate-800'
            }`}
            placeholder="يرجى توضيح وقت الملاحظة، إشارات الحماية، والقراءات المصاحبة..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {errors.description && <p className="text-xs text-rose-400 mt-1">{errors.description}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            إلغاء
          </Button>
          <Button type="submit" variant="danger" size="sm" isLoading={isSubmitting}>
            إرسال البلاغ لمركز التحكم
          </Button>
        </div>
      </form>
    </Modal>
  );
};
