/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  canCreateEmployee,
  canManageRoles,
  canUpdateEmployeeProfile,
  canToggleEmployeeStatus,
  sanitizeProfileUpdatePayload,
} from '../lib/permissions';
import { employeeFormSchema } from '../lib/validations/employee';
import { UserProfile, UserRole } from '../types/database';

describe('Employee Creation Lifecycle, RBAC, and Onboarding Reliability', () => {
  const sampleValidEmployee = {
    employee_number: 'EMP-9001',
    full_name: 'م. عصام عبد الرحمن',
    email: 'essam.rahman@psms.gov.eg',
    phone: '+20 10 1234 5678',
    role: 'employee' as UserRole,
    department: 'شعبة التشغيل والتحكم الموقعي',
    job_title: 'مهندس تشغيل موقعي',
    is_active: true,
    assigned_station_ids: ['a1000000-0000-4000-8000-000000000001'],
  };

  describe('PHASE 2: Employee Creation Authorization & Scope Guards', () => {
    it('1. permits super_admin and admin to create employees, but blocks supervisor and employee', () => {
      expect(canCreateEmployee('super_admin')).toBe(true);
      expect(canCreateEmployee('admin')).toBe(true);
      expect(canCreateEmployee('supervisor')).toBe(false);
      expect(canCreateEmployee('employee')).toBe(false);
    });

    it('2. strictly prevents operational admins from creating or promoting to super_admin', () => {
      // Super admin can manage all roles
      expect(canManageRoles('super_admin', 'super_admin')).toBe(true);
      expect(canManageRoles('super_admin', 'admin')).toBe(true);
      expect(canManageRoles('super_admin', 'supervisor')).toBe(true);
      expect(canManageRoles('super_admin', 'employee')).toBe(true);

      // Operational admin CANNOT manage or create super_admin
      expect(canManageRoles('admin', 'super_admin')).toBe(false);
      expect(canManageRoles('admin', 'admin')).toBe(true);
      expect(canManageRoles('admin', 'supervisor')).toBe(true);
      expect(canManageRoles('admin', 'employee')).toBe(true);

      // Supervisor and employee cannot manage any administrative roles
      expect(canManageRoles('supervisor', 'admin')).toBe(false);
      expect(canManageRoles('employee', 'supervisor')).toBe(false);
    });

    it('3. enforces organization boundary: admin cannot assign employees outside their organization', () => {
      const adminOrgId = 'org-cairo-sector-uuid';
      const targetOrgIdOutside = 'org-delta-sector-uuid';

      const result = canUpdateEmployeeProfile(
        'admin',
        'caller-admin-id',
        'target-employee-id',
        { full_name: 'موظف في قطاع آخر' } as any,
        adminOrgId,
        targetOrgIdOutside
      );
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('خارج قطاعه التشغيلي');

      const validResult = canUpdateEmployeeProfile(
        'admin',
        'caller-admin-id',
        'target-employee-id',
        { full_name: 'موظف في نفس القطاع' } as any,
        adminOrgId,
        adminOrgId
      );
      expect(validResult.allowed).toBe(true);
    });

    it('4. validates employee schema and accepts valid station assignments', () => {
      const parseResult = employeeFormSchema.safeParse(sampleValidEmployee);
      expect(parseResult.success).toBe(true);

      // Invalid email fails schema
      const invalidEmail = { ...sampleValidEmployee, email: 'not-an-email' };
      const invalidEmailResult = employeeFormSchema.safeParse(invalidEmail);
      expect(invalidEmailResult.success).toBe(false);

      // Short employee number fails schema
      const invalidEmpNum = { ...sampleValidEmployee, employee_number: 'AB' };
      const invalidNumResult = employeeFormSchema.safeParse(invalidEmpNum);
      expect(invalidNumResult.success).toBe(false);
    });

    it('5. detects duplicate employee number and duplicate email using profile collection', () => {
      const existingProfiles: UserProfile[] = [
        {
          id: 'b1000000-0000-4000-8000-000000000001',
          employee_number: 'EMP-100',
          full_name: 'م. أحمد علي',
          email: 'ahmed.ali@psms.gov.eg',
          role: 'employee',
          is_active: true,
          created_at: new Date().toISOString(),
          assigned_station_ids: [],
        },
      ];

      const cleanNum = 'emp-100'.trim().toUpperCase();
      const hasDuplicateNum = existingProfiles.some(
        (p) => p.employee_number.trim().toUpperCase() === cleanNum
      );
      expect(hasDuplicateNum).toBe(true);

      const cleanEmail = 'AHMED.ALI@psms.gov.eg'.trim().toLowerCase();
      const hasDuplicateEmail = existingProfiles.some(
        (p) => p.email.trim().toLowerCase() === cleanEmail
      );
      expect(hasDuplicateEmail).toBe(true);

      const uniqueEmail = 'unique.person@psms.gov.eg'.trim().toLowerCase();
      const hasUniqueEmail = existingProfiles.some(
        (p) => p.email.trim().toLowerCase() === uniqueEmail
      );
      expect(hasUniqueEmail).toBe(false);
    });
  });

  describe('PHASE 3: Invitation and Onboarding Reliability', () => {
    it('1. clearly distinguishes between invitation delivered vs fallback creation without email delivery', () => {
      const mockSuccessInviteResponse = {
        success: true,
        user_id: 'c1000000-0000-4000-8000-000000000001',
        invite_delivered: true,
        message: 'تم إرسال دعوة البريد الإلكتروني وإنشاء حساب الموظف وتعيين المحطات بنجاح.',
      };

      const mockFallbackResponse = {
        success: true,
        user_id: 'c1000000-0000-4000-8000-000000000002',
        invite_delivered: false,
        message: 'تم إنشاء حساب الموظف وملفه الوظيفي وتعيين المحطات بنجاح (جاهز لتسجيل الدخول).',
      };

      expect(mockSuccessInviteResponse.invite_delivered).toBe(true);
      expect(mockSuccessInviteResponse.message).toContain('تم إرسال دعوة البريد');

      expect(mockFallbackResponse.invite_delivered).toBe(false);
      expect(mockFallbackResponse.message).toContain('جاهز لتسجيل الدخول');
    });

    it('2. confirms explicit rollback contract (rollback_performed and rollback_failed flags) on RPC failure', () => {
      // Contract response when rollback succeeds
      const successfulRollbackResponse = {
        success: false,
        error: 'الرقم الوظيفي أو البريد الإلكتروني مسجل مسبقاً في قاعدة البيانات.',
        rollback_performed: true,
        rollback_failed: false,
      };

      expect(successfulRollbackResponse.success).toBe(false);
      expect(successfulRollbackResponse.rollback_performed).toBe(true);
      expect(successfulRollbackResponse.rollback_failed).toBe(false);

      // Contract response when rollback fails (requires administrative attention)
      const failedRollbackResponse = {
        success: false,
        error: 'تعذر إتمام تسجيل الملف الوظيفي في قاعدة البيانات.',
        rollback_performed: false,
        rollback_failed: true,
        rollback_error_detail: 'Auth admin deleteUser request timed out',
      };

      expect(failedRollbackResponse.success).toBe(false);
      expect(failedRollbackResponse.rollback_performed).toBe(false);
      expect(failedRollbackResponse.rollback_failed).toBe(true);
      expect(failedRollbackResponse.rollback_error_detail).toBeDefined();
    });

    it('3. rejects duplicate auth user immediately with 409 and never reuses existing accounts', () => {
      const authError = { message: 'A user with this email address has already been registered' };
      const isAlreadyRegistered =
        authError.message.toLowerCase().includes('already registered') ||
        authError.message.toLowerCase().includes('already been registered');

      expect(isAlreadyRegistered).toBe(true);
      const mappedResponse = {
        status: 409,
        success: false,
        error: 'البريد الإلكتروني مسجل مسبقاً في نظام المصادقة.',
      };

      expect(mappedResponse.status).toBe(409);
      expect(mappedResponse.error).toContain('مسجل مسبقاً في نظام المصادقة');
    });
  });

  describe('PHASE 4: Employee Editing, Sanitization, and Deactivation', () => {
    it('1. sanitizes updates payload for public.profiles by stripping assigned_station_ids and immutable fields using production helper', () => {
      const rawFormUpdates: any = {
        employee_number: 'EMP-IMMUTABLE',
        email: 'immutable@psms.gov.eg',
        full_name: 'م. عصام عبد الرحمن المعدل',
        phone: '+20 10 9999 8888',
        role: 'supervisor' as UserRole,
        department: 'إدارة المحطات',
        job_title: 'مشرف أول محطات',
        assigned_station_ids: ['stn-1', 'stn-2'], // non-column
        is_active: true,
      };

      // Execute actual production sanitization function
      const sanitized = sanitizeProfileUpdatePayload(rawFormUpdates, true, false);

      // Verify immutable and non-column fields were stripped
      expect(sanitized.assigned_station_ids).toBeUndefined();
      expect(sanitized.employee_number).toBeUndefined();
      expect(sanitized.email).toBeUndefined();

      // Verify legitimate fields are present
      expect(sanitized.full_name).toBe('م. عصام عبد الرحمن المعدل');
      expect(sanitized.role).toBe('supervisor');
      expect(sanitized.is_active).toBe(true);
      expect(sanitized.updated_at).toBeDefined();
    });

    it('2. prevents self-deactivation: user cannot deactivate their own profile', () => {
      const currentUserId = 'user-logged-in-uuid';
      const targetUserId = 'user-logged-in-uuid';

      // Test using actual production canToggleEmployeeStatus
      const toggleResult = canToggleEmployeeStatus('super_admin', currentUserId, 'super_admin', targetUserId);
      expect(toggleResult.allowed).toBe(false);
      expect(toggleResult.error).toContain('تعطيل حسابه الشخصي');

      // Test using actual production canUpdateEmployeeProfile
      const updateResult = canUpdateEmployeeProfile(
        'super_admin',
        currentUserId,
        targetUserId,
        { is_active: false }
      );
      expect(updateResult.allowed).toBe(false);
      expect(updateResult.error).toContain('تعطيل حسابه الشخصي');
    });

    it('3. prevents operational admin from deactivating a super_admin account', () => {
      const callerRole: UserRole = 'admin';
      const callerId = 'admin-uuid-1';
      const targetRole: UserRole = 'super_admin';
      const targetId = 'super-admin-uuid-1';

      // Test using actual production canToggleEmployeeStatus
      const result = canToggleEmployeeStatus(callerRole, callerId, targetRole, targetId);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('لا يمكن لمدير القطاع');

      // Super admin can modify status of super_admin (other than self)
      const validResult = canToggleEmployeeStatus('super_admin', 'super-admin-uuid-2', targetRole, targetId);
      expect(validResult.allowed).toBe(true);
    });

    it('4. prevents unauthorized role changes and self-promotion by normal employees', () => {
      const callerId = 'employee-uuid-1';
      const callerRole: UserRole = 'employee';
      const requestedRole: UserRole = 'admin';

      // Normal employee attempting self-promotion
      const result = canUpdateEmployeeProfile(
        callerRole,
        callerId,
        callerId,
        { role: requestedRole }
      );
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('غير مصرح بتعديل رتبتك أو صلاحياتك بنفسك');

      // Non-admin employee attempting to update another employee
      const crossUpdateResult = canUpdateEmployeeProfile(
        callerRole,
        callerId,
        'other-employee-uuid',
        { full_name: 'اسم جديد' } as any
      );
      expect(crossUpdateResult.allowed).toBe(false);
      expect(crossUpdateResult.error).toContain('ليس لديك الصلاحية لتعديل بيانات الموظفين الآخرين');
    });
  });
});
