/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Station, StationStatus, StationType } from '../../types/database';
import { stationFormSchema, StationFormInput, getRegionByGovernorate } from '../../lib/validations/station';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { isSupabaseConfigured, getSupabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Input, Select } from '../ui/Input';
import { Button } from '../ui/Button';

interface StationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStation?: Station | null;
}

interface OrganizationOption {
  id: string;
  name: string;
  code: string;
}

export const StationFormModal: React.FC<StationFormModalProps> = ({
  isOpen,
  onClose,
  initialStation,
}) => {
  const { addStation, updateStation } = useStations();
  const { currentUser } = useAuth();

  const isEditing = Boolean(initialStation);

  const [formData, setFormData] = useState<Partial<StationFormInput>>({
    code: '',
    name: '',
    type: 'transmission',
    region: 'المنطقة الوسطى',
    governorate: 'الرياض',
    address: '',
    voltage_level_kv: 132,
    installed_capacity_mw: 100,
    status: 'operational',
    description: '',
    latitude: undefined,
    longitude: undefined,
  });

  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [isLoadingOrgs, setIsLoadingOrgs] = useState<boolean>(false);
  const [orgLoadError, setOrgLoadError] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch organizations from Supabase
  const loadOrganizations = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setOrganizations([]);
      setSelectedOrgId('');
      setOrgLoadError(null);
      return;
    }
    const client = getSupabase();
    if (!client) {
      setOrgLoadError('تعذر تهيئة اتصال قاعدة البيانات للتحقق من المؤسسات.');
      return;
    }

    setIsLoadingOrgs(true);
    setOrgLoadError(null);
    try {
      const { data, error, status } = await client
        .from('organizations')
        .select('id, name, code')
        .order('name', { ascending: true });

      if (error) {
        if (status === 403 || error.code === '42501') {
          setOrgLoadError('لا تتوفر صلاحية قراءة المؤسسات (قيود RLS). سيتم تسجيل المحطة مباشرة في المنظومة المركزية.');
        } else {
          setOrgLoadError(`تعذر استرجاع قائمة المؤسسات من قاعدة البيانات (${error.message}).`);
        }
        setOrganizations([]);
      } else if (!data || data.length === 0) {
        // In the centralized architecture, having no organizations in the database is a valid state.
        // Stations default cleanly to the central system with organization_id = null.
        setOrgLoadError(null);
        setOrganizations([]);
      } else {
        setOrgLoadError(null);
        setOrganizations(data);
        setSelectedOrgId((prev) => {
          if (prev && data.some((org) => org.id === prev)) {
            return prev;
          }
          return ''; // Default to centralized system
        });
      }
    } catch (err) {
      setOrgLoadError(err instanceof Error ? err.message : 'حدث خطأ في الاتصال أثناء تحميل المؤسسات.');
      setOrganizations([]);
    } finally {
      setIsLoadingOrgs(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadOrganizations();
    }
  }, [isOpen, loadOrganizations]);

  useEffect(() => {
    if (initialStation) {
      setFormData({
        code: initialStation.code,
        name: initialStation.name,
        type: initialStation.type,
        region: initialStation.region || getRegionByGovernorate(initialStation.governorate),
        governorate: initialStation.governorate,
        address: initialStation.address,
        voltage_level_kv: initialStation.voltage_level_kv,
        installed_capacity_mw: initialStation.installed_capacity_mw,
        status: initialStation.status,
        description: initialStation.description || '',
        latitude: initialStation.latitude,
        longitude: initialStation.longitude,
      });
      setSelectedOrgId(initialStation.organization_id || '');
    } else {
      setFormData({
        code: '',
        name: '',
        type: 'transmission',
        region: 'المنطقة الوسطى',
        governorate: 'الرياض',
        address: '',
        voltage_level_kv: 132,
        installed_capacity_mw: 100,
        status: 'operational',
        description: '',
      });
      // For Super Admin: use existing selection if valid, otherwise empty string (centralized system)
      if (currentUser?.role === 'super_admin') {
        setSelectedOrgId((prev) => (organizations.some((o) => o.id === prev) ? prev : ''));
      } else {
        setSelectedOrgId(currentUser?.organization_id || '');
      }
    }
    setErrors({});
    setServerError(null);
  }, [initialStation, isOpen, currentUser, organizations]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrors({});
    setServerError(null);

    // Validate using Zod schema
    const result = stationFormSchema.safeParse(formData);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const fieldName = issue.path[0] as string;
        fieldErrors[fieldName] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Determine target organization ID optionally (centralized architecture allows null for central system)
    const targetOrgId = selectedOrgId ? selectedOrgId : (currentUser?.organization_id || null);

    const matchedOrg = targetOrgId ? organizations.find((o) => o.id === targetOrgId) : undefined;
    const orgName = matchedOrg
      ? matchedOrg.name
      : (currentUser?.organization_name || 'المنظومة المركزية لمحطات الطاقة');

    setIsSubmitting(true);

    try {
      const cleanData = {
        ...result.data,
        latitude: typeof result.data.latitude === 'number' ? result.data.latitude : undefined,
        longitude: typeof result.data.longitude === 'number' ? result.data.longitude : undefined,
      };

      if (isEditing && initialStation) {
        const updatePayload: Partial<Station> = {
          ...cleanData,
          ...(currentUser?.role === 'super_admin' ? { organization_id: targetOrgId } : {}),
        };
        const res = await updateStation(initialStation.id, updatePayload);
        if (!res.success) {
          setServerError(res.error || 'حدث خطأ أثناء تحديث بيانات المحطة');
          return;
        }
      } else {
        const res = await addStation({
          ...(cleanData as Omit<Station, 'id' | 'created_at' | 'updated_at'>),
          organization_id: targetOrgId,
          organization_name: orgName,
          current_load_mw: 0,
        });

        if (!res.success) {
          const errorMsg = res.error || 'حدث خطأ أثناء حفظ المحطة';
          setServerError(errorMsg);
          if (errorMsg.includes('رمز المحطة')) {
            setErrors((prev) => ({ ...prev, code: errorMsg }));
          }
          return;
        }
      }

      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'تعديل بيانات المحطة الكهربائية' : 'إضافة محطة كهرباء جديدة'}
      description="يرجى تعبئة المواصفات الفنية والبيانات الجغرافية بدقة وفقاً لمعايير الشبكة"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {serverError && (
          <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-lg">
            {serverError}
          </div>
        )}

        {orgLoadError && (
          <div className="p-3 bg-amber-950/60 border border-amber-800 text-amber-300 text-xs rounded-lg">
            {orgLoadError}
          </div>
        )}

        {/* Organization Selection for Super Admin */}
        {currentUser?.role === 'super_admin' ? (
          <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg">
            <Select
              label="الشركة أو القطاع التشغيلي (اختياري)"
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              options={[
                { value: '', label: 'المنظومة المركزية الموحدة (بدون مؤسسة فرعية)' },
                ...organizations.map((org) => ({
                  value: org.id,
                  label: `${org.name} (${org.code})`,
                })),
              ]}
              disabled={isLoadingOrgs}
              helperText="يمكن إسناد المحطة لقطاع محدد أو إبقاؤها تابعة مباشرة للمنظومة المركزية الموحدة"
            />
          </div>
        ) : (
          <div className="p-2.5 bg-slate-900/60 border border-slate-800 rounded-lg text-xs text-slate-400 flex items-center justify-between">
            <span>القطاع التشغيلي التابع لحسابك:</span>
            <span className="font-semibold text-slate-200">
              {currentUser?.organization_name || 'المنظومة المركزية لمحطات الطاقة'}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="رمز المحطة الفني (Station Code)"
            placeholder="مثال: STN-132-N01"
            value={formData.code ?? ''}
            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            error={errors.code}
            required
            disabled={isEditing || isSubmitting}
            helperText="أحرف إنجليزية وأرقام وشرطات فقط، فريد في النظام"
          />

          <Input
            label="اسم المحطة الرسمي الكامل"
            placeholder="مثال: محطة تحويل شمال الرياض 132/33 ك.ف"
            value={formData.name ?? ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={errors.name}
            required
            disabled={isSubmitting}
          />

          <Select
            label="تصنيف ونوع المحطة"
            value={formData.type ?? 'transmission'}
            onChange={(e) => setFormData({ ...formData, type: e.target.value as StationType })}
            options={[
              { value: 'transmission', label: 'محطة نقل وتحويل (Transmission Substation)' },
              { value: 'distribution', label: 'محطة توزيع رئيسية (Distribution Substation)' },
              { value: 'generation', label: 'محطة توليد كهرباء (Power Generation Plant)' },
              { value: 'substation', label: 'محطة تحويل فرعية (Substation)' },
              { value: 'solar_hybrid', label: 'محطة طاقة شمسية هجينة (Renewable Hybrid)' },
            ]}
            error={errors.type}
            disabled={isSubmitting}
          />

          <Select
            label="الحالة التشغيلية"
            value={formData.status ?? 'operational'}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as StationStatus })}
            options={[
              { value: 'operational', label: 'تشغيلية (Operational)' },
              { value: 'under_maintenance', label: 'تحت الصيانة (Under Maintenance)' },
              { value: 'out_of_service', label: 'خارج الخدمة (Out of Service)' },
              { value: 'temporarily_stopped', label: 'متوقفة مؤقتاً (Temporarily Stopped)' },
              { value: 'under_review', label: 'قيد المراجعة الفنية (Under Review)' },
            ]}
            error={errors.status}
            disabled={isSubmitting}
          />

          <Input
            label="الجهد التشغيلي الاسمي (كيلوفولت kV)"
            type="number"
            step="0.1"
            value={formData.voltage_level_kv ?? ''}
            onChange={(e) => setFormData({ ...formData, voltage_level_kv: Number(e.target.value) })}
            error={errors.voltage_level_kv}
            required
            disabled={isSubmitting}
            helperText="الجهد مثل: 11, 33, 110, 132, 380, 400 kV"
          />

          <Input
            label="القدرة المركبة التصميمية (ميجاواط MW)"
            type="number"
            step="1"
            value={formData.installed_capacity_mw ?? ''}
            onChange={(e) => setFormData({ ...formData, installed_capacity_mw: Number(e.target.value) })}
            error={errors.installed_capacity_mw}
            required
            disabled={isSubmitting}
          />

          <Input
            label="المنطقة الجغرافية"
            placeholder="مثال: المنطقة الوسطى"
            value={formData.region ?? ''}
            onChange={(e) => setFormData({ ...formData, region: e.target.value })}
            error={errors.region}
            required
            disabled={isSubmitting}
          />

          <Input
            label="المحافظة / المدينة"
            placeholder="مثال: الرياض"
            value={formData.governorate ?? ''}
            onChange={(e) => setFormData({ ...formData, governorate: e.target.value })}
            error={errors.governorate}
            required
            disabled={isSubmitting}
          />
        </div>

        <Input
          label="العنوان والموقع التفصيلي"
          placeholder="مثال: طريق الملك فهد، مجمع المحطات 14"
          value={formData.address ?? ''}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          error={errors.address}
          required
          disabled={isSubmitting}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="خط العرض (Latitude - اختياري)"
            type="number"
            step="0.0001"
            placeholder="24.7136"
            value={formData.latitude ?? ''}
            onChange={(e) => setFormData({ ...formData, latitude: e.target.value ? Number(e.target.value) : undefined })}
            error={errors.latitude}
            disabled={isSubmitting}
          />
          <Input
            label="خط الطول (Longitude - اختياري)"
            type="number"
            step="0.0001"
            placeholder="46.6753"
            value={formData.longitude ?? ''}
            onChange={(e) => setFormData({ ...formData, longitude: e.target.value ? Number(e.target.value) : undefined })}
            error={errors.longitude}
            disabled={isSubmitting}
          />
        </div>

        <div className="text-right">
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            الوصف والملاحظات الفنية
          </label>
          <textarea
            rows={3}
            className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            placeholder="المحولات الرئيسية، خطوط الربط، وملاحظات المشغل..."
            value={formData.description ?? ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            disabled={isSubmitting}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            إلغاء
          </Button>
          <Button
            type="submit"
            size="sm"
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            {isEditing ? 'حفظ التعديلات' : 'إضافة المحطة'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
