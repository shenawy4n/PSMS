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
