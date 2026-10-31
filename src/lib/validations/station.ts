/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export const stationFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'رمز المحطة يجب أن لا يقل عن 3 أحرف')
    .max(50, 'رمز المحطة يجب أن لا يتجاوز 50 حرفاً')
    .regex(/^[A-Z0-9_\-]+$/i, 'رمز المحطة يجب أن يحتوي على أحرف إنجليزية وأرقام وشرطات فقط'),
  name: z
    .string()
    .trim()
    .min(3, 'اسم المحطة يجب أن لا يقل عن 3 أحرف')
    .max(255, 'اسم المحطة يجب أن لا يتجاوز 255 حرفاً'),
  type: z.enum(['generation', 'transmission', 'distribution', 'substation', 'solar_hybrid'], {
    message: 'يرجى اختيار نوع صالح للمحطة',
  }),
  region: z.string().trim().min(2, 'يرجى تحديد المنطقة الجغرافية'),
  governorate: z.string().trim().min(2, 'يرجى تحديد المحافظة'),
  address: z.string().trim().min(5, 'يرجى كتابة عنوان دقيق للمحطة'),
  voltage_level_kv: z.coerce
    .number()
    .positive('الجهد التشغيلي يجب أن يكون قيمة موجبة')
    .max(1000, 'الجهد التشغيلي غير منطقي (>1000 ك.ف)'),
  installed_capacity_mw: z.coerce
    .number()
    .positive('القدرة المركبة يجب أن تكون قيمة موجبة')
    .max(10000, 'القدرة المركبة تتجاوز الحد الأقصى المنطقي'),
  status: z.enum(['operational', 'under_maintenance', 'out_of_service', 'temporarily_stopped', 'under_review'], {
    message: 'يرجى اختيار حالة تشغيلية صحيحة',
  }),
  latitude: z.coerce
    .number()
    .min(-90)
    .max(90)
    .optional()
    .or(z.literal('')),
  longitude: z.coerce
    .number()
    .min(-180)
    .max(180)
    .optional()
    .or(z.literal('')),
  description: z.string().max(1000, 'الوصف لا يتجاوز 1000 حرف').optional(),
});

export type StationFormInput = z.infer<typeof stationFormSchema>;

/**
 * Standard mapping for administrative regions based on governorate / city.
 * Supports Egyptian electricity network regions (EETC) as well as existing regional zones.
 * Used for high-level UI filtering and reporting without requiring a non-existent column in stations table.
 */
export const getRegionByGovernorate = (governorate?: string | null): string => {
  if (!governorate || !governorate.trim()) return 'المنطقة الوسطى';
  const gov = governorate.trim();

  // Egyptian Electricity Grid Regions
  // منطقة القاهرة الكبرى
  if (/القاهرة|الجيزة|القليوبية|حلوان|أكتوبر|العاصمة الإدارية/i.test(gov)) {
    return 'منطقة القاهرة';
  }
  // منطقة الإسكندرية وغرب الدلتا
  if (/الإسكندرية|اسكندرية|البحيرة|دمنهور|مطروح|الساحل الشمالي|العلمين/i.test(gov)) {
    return 'منطقة الإسكندرية وغرب الدلتا';
  }
  // منطقة الدلتا
  if (/الدلتا|الغربية|طنطا|المحلة|الدقهلية|المنصورة|الشرقية|الزقازيق|العاشر|المنوفية|شبين|كفر الشيخ|دمياط/i.test(gov)) {
    return 'منطقة الدلتا';
  }
  // منطقة القناة وسيناء
  if (/القناة|السويس|الإسماعيلية|بورسعيد|سيناء|العريش|شرم الشيخ|الطور|البحر الأحمر|الغردقة|الزعفرانة|رأس غارب/i.test(gov)) {
    return 'منطقة القناة وسيناء';
  }
  // منطقة مصر الوسطى
  if (/مصر الوسطى|بني سويف|الكريمات|الفيوم|المنيا|أسيوط/i.test(gov)) {
    return 'منطقة مصر الوسطى';
  }
  // منطقة مصر العليا
  if (/مصر العليا|سوهاج|قنا|الأقصر|اسوان|أسوان|الوادي الجديد|توشكى|السد العالي/i.test(gov)) {
    return 'منطقة مصر العليا';
  }

  // Saudi Arabia Administrative Regions (retained for backward compatibility and testing)
  // المنطقة الشرقية
  if (/الشرقية|الدمام|الخبر|الظهران|الأحساء|الجبيل|القطيف|حفر الباطن|الخفجي|رأس تنورة|بقيق|النعيرية/i.test(gov)) {
    return 'المنطقة الشرقية';
  }
  // المنطقة الغربية (مكة، المدينة، جدة، ينبع، رابغ...)
  if (/الغربية|مكة|جدة|الطائف|رابغ|المدينة|ينبع|العلا|القنفذة|الليث/i.test(gov)) {
    return 'المنطقة الغربية';
  }
  // المنطقة الجنوبية (عسير، جازان، نجران، الباحة، أبها...)
  if (/الجنوبية|عسير|أبها|خميس مشيط|جازان|نجران|الباحة|بيشة|صبيا|محايل|بلجرشي|شرورة/i.test(gov)) {
    return 'المنطقة الجنوبية';
  }
  // المنطقة الشمالية (تبوك، الجوف، سكاكا، حائل، عرعر، طريف، رفحاء...)
  if (/الشمالية|تبوك|الجوف|سكاكا|القريات|حائل|عرعر|طريف|رفحاء|الحدود الشمالية/i.test(gov)) {
    return 'المنطقة الشمالية';
  }
  // المنطقة الوسطى (الرياض، القصيم، الخرج، بريدة، عنيزة...)
  if (/الوسطى|الرياض|الخرج|الدرعية|المجمعة|القصيم|بريدة|عنيزة|الرس|الدوادمي|الزلفي|شقراء/i.test(gov)) {
    return 'المنطقة الوسطى';
  }

  return 'المنطقة الوسطى';
};

/**
 * Strict database columns payload for public.stations in PostgreSQL.
 * postgREST rejects any payload containing non-existent columns (such as 'region').
 */
export interface StationDatabasePayload {
  code?: string;
  name?: string;
  type?: 'generation' | 'transmission' | 'distribution' | 'substation' | 'solar_hybrid';
  organization_id?: string | null;
  region_id?: string | null;
  governorate?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  voltage_level_kv?: number;
  installed_capacity_mw?: number;
  status?: 'operational' | 'under_maintenance' | 'out_of_service' | 'temporarily_stopped' | 'under_review';
  commissioning_date?: string | null;
  description?: string | null;
  updated_at?: string;
}

/**
 * Sanitizes partial station updates, retaining ONLY genuine database columns recognized by public.stations.
 * Strips out virtual / UI fields: 'region', 'organization_name', 'assigned_personnel_count', 'open_faults_count', 'current_load_mw'.
 */
export const toStationDatabasePayload = (
  updates: Record<string, unknown>,
  timestamp?: string
): StationDatabasePayload => {
  const payload: StationDatabasePayload = {};

  if (timestamp) {
    payload.updated_at = timestamp;
  } else if (typeof updates.updated_at === 'string') {
    payload.updated_at = updates.updated_at;
  }

  if (typeof updates.code === 'string') payload.code = updates.code.trim();
  if (typeof updates.name === 'string') payload.name = updates.name.trim();
  if (typeof updates.type === 'string') payload.type = updates.type as StationDatabasePayload['type'];
  if (updates.organization_id !== undefined) {
    payload.organization_id = typeof updates.organization_id === 'string' && updates.organization_id.trim() !== ''
      ? updates.organization_id.trim()
      : null;
  }
  if (updates.region_id !== undefined) {
    payload.region_id = typeof updates.region_id === 'string' && updates.region_id.trim() !== ''
      ? updates.region_id.trim()
      : null;
  }
  if (typeof updates.governorate === 'string') payload.governorate = updates.governorate.trim();
  if (typeof updates.address === 'string') payload.address = updates.address.trim();

  if (updates.latitude !== undefined) {
    const lat = typeof updates.latitude === 'number' ? updates.latitude : parseFloat(String(updates.latitude));
    payload.latitude = !Number.isNaN(lat) ? lat : null;
  }

  if (updates.longitude !== undefined) {
    const lng = typeof updates.longitude === 'number' ? updates.longitude : parseFloat(String(updates.longitude));
    payload.longitude = !Number.isNaN(lng) ? lng : null;
  }

  if (updates.voltage_level_kv !== undefined) {
    const v = typeof updates.voltage_level_kv === 'number' ? updates.voltage_level_kv : parseFloat(String(updates.voltage_level_kv));
    if (!Number.isNaN(v)) payload.voltage_level_kv = v;
  }

  if (updates.installed_capacity_mw !== undefined) {
    const c = typeof updates.installed_capacity_mw === 'number' ? updates.installed_capacity_mw : parseFloat(String(updates.installed_capacity_mw));
    if (!Number.isNaN(c)) payload.installed_capacity_mw = c;
  }

  if (typeof updates.status === 'string') payload.status = updates.status as StationDatabasePayload['status'];
  if (updates.commissioning_date !== undefined) {
    payload.commissioning_date = typeof updates.commissioning_date === 'string' && updates.commissioning_date.trim() !== ''
      ? updates.commissioning_date.trim()
      : null;
  }
  if (updates.description !== undefined) {
    payload.description = typeof updates.description === 'string' ? updates.description : null;
  }

  return payload;
};

