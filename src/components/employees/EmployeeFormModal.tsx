/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../../types/database';
import { employeeFormSchema, EmployeeFormInput } from '../../lib/validations/employee';
import { useAuth } from '../../context/AuthContext';
import { useStations } from '../../context/StationContext';
import { canManageRoles } from '../../lib/permissions';
import { Modal } from '../ui/Modal';
import { Input, Select } from '../ui/Input';
import { Button } from '../ui/Button';

interface EmployeeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProfile?: UserProfile | null;
}

export const EmployeeFormModal: React.FC<EmployeeFormModalProps> = ({
  isOpen,
  onClose,
  initialProfile,
}) => {
  const { createEmployeeProfile, updateEmployeeProfile, role, currentUser } = useAuth();
  const { showToast } = useStations();

  const isEditing = Boolean(initialProfile);

  const [formData, setFormData] = useState<Partial<EmployeeFormInput>>({
    employee_number: '',
    full_name: '',
    email: '',
    phone: '',
    role: 'employee',
    department: 'شعبة التشغيل والمحطات',
    job_title: 'مهندس تشغيل موقعي',
    is_active: true,
    assigned_station_ids: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialProfile) {
      setFormData({
        employee_number: initialProfile.employee_number,
        full_name: initialProfile.full_name,
        email: initialProfile.email,
        phone: initialProfile.phone || '',
        role: initialProfile.role,
        department: initialProfile.department || 'إدارة التشغيل',
        job_title: initialProfile.job_title || 'فني تشغيل',
        is_active: initialProfile.is_active,
        assigned_station_ids: initialProfile.assigned_station_ids || [],
      });
    } else {
      setFormData({
        employee_number: '',
        full_name: '',
        email: '',
        phone: '',
        role: 'employee',
        department: 'شعبة التشغيل والمحطات',
        job_title: 'مهندس تشغيل موقعي',
        is_active: true,
        assigned_station_ids: [],
      });
    }
    setErrors({});
    setServerError(null);
  }, [initialProfile, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    // Validate role escalation permission:
    // Admin cannot create or promote to super_admin
    const targetRole = (formData.role as UserRole) || 'employee';
    if (!canManageRoles(role, targetRole)) {
      setServerError('ليس لديك الصلاحية لمنح هذه الرتبة (لا يمكن ترقية أو إنشاء مدير نظام عام).');
      return;
    }

    const result = employeeFormSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing && initialProfile) {
        const res = await updateEmployeeProfile(initialProfile.id, result.data);
        if (!res.success) {
          setServerError(res.error || 'تعذر تحديث بيانات الموظف');
          setIsSubmitting(false);
          return;
        }
        showToast('success', 'تم تحديث بيانات الموظف بنجاح.');
      } else {
        const res = await createEmployeeProfile({
          ...result.data,
          organization_id: currentUser?.organization_id,
          organization_name: currentUser?.organization_name,
        });
        if (!res.success) {
          const errMessage = res.error || 'تعذر إضافة الموظف الجديد';
          setServerError(errMessage);
          if (errMessage.includes('الرقم الوظيفي')) {
            setErrors((prev) => ({ ...prev, employee_number: errMessage }));
          }
          if (errMessage.includes('البريد الإلكتروني')) {
            setErrors((prev) => ({ ...prev, email: errMessage }));
          }
          setIsSubmitting(false);
          return;
        }
        showToast('success', 'تم إنشاء ملف الموظف الجديد بنجاح.');
      }

      setIsSubmitting(false);
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'خطأ غير متوقع');
      setIsSubmitting(false);
    }
  };

  // Available roles to assign based on current user role
  const roleOptions: { value: UserRole; label: string }[] = [
    { value: 'employee', label: 'مهندس / فني تشغيل (Employee)' },
    { value: 'supervisor', label: 'مشرف محطات (Supervisor)' },
  ];

  if (role === 'super_admin') {
    roleOptions.push(
      { value: 'admin', label: 'مدير قطاع تشغيلي (Admin)' },
      { value: 'super_admin', label: 'مدير النظام العام (Super Admin)' }
    );
  } else if (role === 'admin') {
    roleOptions.push({ value: 'admin', label: 'مدير قطاع تشغيلي (Admin)' });
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'تعديل بيانات ملف الموظف' : 'إضافة ملف موظف / مهندس جديد'}
      description="تسجيل البيانات الوظيفية والرتبة الإدارية وتفاصيل الاتصال"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {serverError && (
          <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-lg">
            {serverError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="الرقم الوظيفي"
            placeholder="مثال: EMP-502"
            value={formData.employee_number}
            onChange={(e) => setFormData({ ...formData, employee_number: e.target.value.toUpperCase() })}
            error={errors.employee_number}
            required
            disabled={isEditing}
            helperText="رمز فريد لكل موظف"
          />

          <Input
            label="الاسم الكامل"
            placeholder="مثال: م. سعود المطيري"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            error={errors.full_name}
            required
          />

          <Input
            label="البريد الإلكتروني الرسمي"
            type="email"
            placeholder="saud@psms.gov.sa"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            error={errors.email}
            required
            disabled={isEditing}
          />

          <Input
            label="رقم الهاتف (اختياري)"
            placeholder="+966 50 000 0000"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            error={errors.phone}
          />

          <Select
            label="الرتبة والصلاحية"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
            options={roleOptions}
            error={errors.role}
          />

          <Input
            label="المسمى الوظيفي الرسمي"
            placeholder="مهندس حماية أول"
            value={formData.job_title}
            onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
            error={errors.job_title}
            required
          />
        </div>

        <Input
          label="القسم / الإدارة التابع لها"
          placeholder="إدارة الوقاية والتحكم"
          value={formData.department}
          onChange={(e) => setFormData({ ...formData, department: e.target.value })}
          error={errors.department}
          required
        />

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            إلغاء
          </Button>
          <Button type="submit" size="sm" isLoading={isSubmitting}>
            {isEditing ? 'حفظ التعديلات' : 'إضافة الموظف'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
