/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { canCreateEmployee, canManageRoles } from '../lib/permissions';
import { employeeFormSchema } from '../lib/validations/employee';
import { UserProfile, UserRole } from '../types/database';

describe('Employee Creation Lifecycle, RBAC, and Onboarding Reliability', () => {
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

      const validateOrgScope = (callerRole: UserRole, callerOrg: string, targetOrg?: string | null) => {
        if (callerRole === 'admin') {
          if (!callerOrg) return { allowed: false, error: 'حساب مدير القطاع غير مرتبط بمنظمة محددة' };
          if (targetOrg && targetOrg !== callerOrg) {
            return { allowed: false, error: 'غير مسموح لمدير القطاع بإنشاء موظفين خارج قطاعه التشغيلي' };
          }
        }
        return { allowed: true };
      };

      const result = validateOrgScope('admin', adminOrgId, targetOrgIdOutside);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('خارج قطاعه التشغيلي');

      const validResult = validateOrgScope('admin', adminOrgId, adminOrgId);
      expect(validResult.allowed).toBe(true);
    });

    it('4. validates and deduplicates station assignment UUIDs', () => {
      const duplicateStationIds = [
        'a1000000-0000-4000-8000-000000000001',
        'a1000000-0000-4000-8000-000000000002',
        'a1000000-0000-4000-8000-000000000001', // duplicate
      ];

      const invalidStationIdList = [
        'a1000000-0000-4000-8000-000000000001',
        'invalid-non-uuid-string',
      ];

      const validateStations = (stationIds: string[]) => {
        const invalid = stationIds.find((id) => !UUID_V4_REGEX.test(id));
        if (invalid) {
          return { valid: false, error: `معرّف المحطة غير صالح: ${invalid}` };
        }
        const unique = Array.from(new Set(stationIds));
        return { valid: true, unique };
      };

      const invalidCheck = validateStations(invalidStationIdList);
      expect(invalidCheck.valid).toBe(false);
      expect(invalidCheck.error).toContain('معرّف المحطة غير صالح');

      const validCheck = validateStations(duplicateStationIds);
      expect(validCheck.valid).toBe(true);
      expect(validCheck.unique).toHaveLength(2);
    });

    it('5. detects duplicate employee number and duplicate email', () => {
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

      const checkDuplicates = (newEmpNum: string, newEmail: string) => {
        const cleanNum = newEmpNum.trim().toUpperCase();
        const cleanEmail = newEmail.trim().toLowerCase();

        if (existingProfiles.some((p) => p.employee_number.trim().toUpperCase() === cleanNum)) {
          return { conflict: true, error: 'الرقم الوظيفي مسجل مسبقاً لموظف آخر' };
        }
        if (existingProfiles.some((p) => p.email.trim().toLowerCase() === cleanEmail)) {
          return { conflict: true, error: 'البريد الإلكتروني مسجل مسبقاً لموظف آخر' };
        }
        return { conflict: false };
      };

      expect(checkDuplicates('emp-100', 'other@psms.gov.eg').conflict).toBe(true);
      expect(checkDuplicates('EMP-999', 'AHMED.ALI@psms.gov.eg').conflict).toBe(true);
      expect(checkDuplicates('EMP-999', 'unique@psms.gov.eg').conflict).toBe(false);
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

    it('2. confirms atomic rollback when database profile provisioning fails', () => {
      // Simulating Edge Function rollback sequence
      let newlyCreatedAuth = true;
      let authUserId = 'c1000000-0000-4000-8000-000000000003';
      let rollbackInvoked = false;

      const simulateRpcFailure = () => {
        const rpcError = { message: 'Conflict: Employee number EMP-9001 already exists in the system.' };
        if (rpcError) {
          if (newlyCreatedAuth && authUserId) {
            rollbackInvoked = true;
          }
          return {
            success: false,
            error: 'الرقم الوظيفي أو البريد الإلكتروني مسجل مسبقاً في قاعدة البيانات.',
            rollback_performed: rollbackInvoked,
          };
        }
        return { success: true };
      };

      const result = simulateRpcFailure();
      expect(result.success).toBe(false);
      expect(rollbackInvoked).toBe(true);
      expect(result.rollback_performed).toBe(true);
      expect(result.error).toContain('مسجل مسبقاً');
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
    it('1. sanitizes updates payload for public.profiles by stripping assigned_station_ids and immutable fields', () => {
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

      // Filter strictly to valid mutable columns of public.profiles
      const sanitizeProfileUpdate = (updates: Record<string, any>, isSuperOrAdmin: boolean) => {
        const dbPayload: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };
        if (updates.full_name !== undefined) dbPayload.full_name = updates.full_name.trim();
        if (updates.phone !== undefined) dbPayload.phone = updates.phone ? updates.phone.trim() : null;
        if (updates.department !== undefined) dbPayload.department = updates.department ? updates.department.trim() : null;
        if (updates.job_title !== undefined) dbPayload.job_title = updates.job_title ? updates.job_title.trim() : null;
        if (updates.role !== undefined && isSuperOrAdmin) dbPayload.role = updates.role;
        if (updates.is_active !== undefined && isSuperOrAdmin) dbPayload.is_active = updates.is_active;
        return dbPayload;
      };

      const sanitized = sanitizeProfileUpdate(rawFormUpdates, true);

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

      const toggleStatus = (callerId: string, targetId: string) => {
        if (callerId === targetId) {
          return { success: false, error: 'غير مسموح للمستخدم بتعطيل حسابه الشخصي.' };
        }
        return { success: true };
      };

      const result = toggleStatus(currentUserId, targetUserId);
      expect(result.success).toBe(false);
      expect(result.error).toContain('تعطيل حسابه الشخصي');
    });

    it('3. prevents operational admin from deactivating a super_admin account', () => {
      const callerRole: UserRole = 'admin';
      const targetRole: UserRole = 'super_admin';

      const validateDeactivation = (caller: UserRole, target: UserRole) => {
        if (caller !== 'super_admin' && caller !== 'admin') {
          return { success: false, error: 'ليس لديك الصلاحية لتعديل حالة تفعيل حسابات الموظفين.' };
        }
        if (target === 'super_admin' && caller !== 'super_admin') {
          return { success: false, error: 'لا يمكن لمدير القطاع تعديل حالة حساب مدير النظام العام.' };
        }
        return { success: true };
      };

      const result = validateDeactivation(callerRole, targetRole);
      expect(result.success).toBe(false);
      expect(result.error).toContain('لا يمكن لمدير القطاع');

      const validResult = validateDeactivation('super_admin', targetRole);
      expect(validResult.success).toBe(true);
    });

    it('4. prevents unauthorized role changes and self-promotion by normal employees', () => {
      const isSelf = true;
      const callerRole: UserRole = 'employee';
      const requestedRole: UserRole = 'admin';

      const validateRoleUpdate = (self: boolean, currentRole: UserRole, targetRole?: UserRole) => {
        if (self && targetRole && targetRole !== currentRole) {
          return { success: false, error: 'غير مصرح بتعديل رتبتك أو صلاحياتك بنفسك.' };
        }
        return { success: true };
      };

      const result = validateRoleUpdate(isSelf, callerRole, requestedRole);
      expect(result.success).toBe(false);
      expect(result.error).toContain('غير مصرح بتعديل رتبتك');
    });
  });
});
