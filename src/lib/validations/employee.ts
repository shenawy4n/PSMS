/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export const employeeFormSchema = z.object({
  employee_number: z
    .string()
    .trim()
    .min(3, 'الرقم الوظيفي يجب أن لا يقل عن 3 رموز')
    .max(50, 'الرقم الوظيفي يجب أن لا يتجاوز 50 رمزاً'),
  full_name: z
    .string()
    .trim()
    .min(3, 'الاسم الكامل يجب أن يتكون من 3 أحرف على الأقل')
    .max(255, 'الاسم طويل جداً'),
  email: z
    .string()
    .trim()
    .email('يرجى إدخال بريد إلكتروني رسمي صالح'),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9\s\-()]{7,25}$/, 'يرجى إدخال رقم هاتف صحيح')
    .optional()
    .or(z.literal('')),
  role: z.enum(['super_admin', 'admin', 'supervisor', 'employee'], {
    message: 'يرجى اختيار صلاحية صحيحة',
  }),
  department: z.string().trim().min(2, 'يرجى تحديد القسم / الإدارة'),
  job_title: z.string().trim().min(2, 'يرجى إدخال المسمى الوظيفي'),
  assigned_station_ids: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
});

export type EmployeeFormInput = z.infer<typeof employeeFormSchema>;

export const readingFormSchema = z.object({
  station_id: z.string().min(1, 'يرجى اختيار المحطة'),
  voltage_kv: z.coerce.number().positive('قيمة الجهد يجب أن تكون موجبة'),
  active_power_mw: z.coerce.number().min(0, 'الحمل الفعال لا يمكن أن يكون سالباً'),
  reactive_power_mvar: z.coerce.number().optional(),
  frequency_hz: z.coerce
    .number()
    .min(45, 'التردد خارج النطاق المقبول (< 45 هرتز)')
    .max(55, 'التردد خارج النطاق المقبول (> 55 هرتز)'),
  power_factor: z.coerce
    .number()
    .min(0.5, 'معامل القدرة منخفض جداً')
    .max(1.0, 'معامل القدرة الأقصى هو 1.0'),
  transformer_temp_celsius: z.coerce.number().min(-10).max(150).optional(),
  sf6_gas_pressure_bar: z.coerce.number().min(0).max(15).optional(),
  is_anomaly: z.boolean().default(false),
  anomaly_notes: z.string().optional(),
});

export type ReadingFormInput = z.infer<typeof readingFormSchema>;

export const faultReportSchema = z.object({
  station_id: z.string().min(1, 'يرجى تحديد المحطة'),
  asset_id: z.string().optional(),
  title: z.string().trim().min(4, 'عنوان البلاغ يجب أن لا يقل عن 4 أحرف'),
  description: z.string().trim().min(10, 'يرجى كتابة تفاصيل وافية عن العطل والظروف التشغيلية'),
  severity: z.enum(['low', 'medium', 'high', 'critical'], {
    message: 'يرجى تحديد درجة خطورة العطل',
  }),
  assigned_technician_id: z.string().optional(),
});

export type FaultReportInput = z.infer<typeof faultReportSchema>;
