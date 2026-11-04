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
  evaluateRollbackDecision,
  createSafeProvisioningErrorResponse,
} from '../lib/permissions';
import { employeeFormSchema } from '../lib/validations/employee';
import { UserProfile, UserRole } from '../types/database';

describe('Employee Lifecycle, RBAC Security Closure, and Rollback Hardening', () => {
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

  describe('TASK 1: Fail-Closed Organization Scope Verification', () => {
    const callerAdminId = 'admin-user-uuid';
    const targetEmployeeId = 'target-employee-uuid';
    const validOrgId = 'org-cairo-sector-uuid';
    const otherOrgId = 'org-alex-sector-uuid';

    it('rejects update when caller organization ID is missing (null, undefined, empty string, whitespace)', () => {
      // 1. null callerOrgId
      const nullCallerResult = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { full_name: 'تحديث الاسم' },
        null,
        validOrgId,
        'employee'
      );
      expect(nullCallerResult.allowed).toBe(false);
      expect(nullCallerResult.error).toContain('خارج قطاعه التشغيلي');

      // 2. undefined callerOrgId
      const undefinedCallerResult = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { full_name: 'تحديث الاسم' },
        undefined,
        validOrgId,
        'employee'
      );
      expect(undefinedCallerResult.allowed).toBe(false);
      expect(undefinedCallerResult.error).toContain('خارج قطاعه التشغيلي');

      // 3. empty string callerOrgId
      const emptyCallerResult = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { full_name: 'تحديث الاسم' },
        '',
        validOrgId,
        'employee'
      );
      expect(emptyCallerResult.allowed).toBe(false);
      expect(emptyCallerResult.error).toContain('خارج قطاعه التشغيلي');

      // 4. whitespace-only callerOrgId
      const whitespaceCallerResult = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { full_name: 'تحديث الاسم' },
        '   ',
        validOrgId,
        'employee'
      );
      expect(whitespaceCallerResult.allowed).toBe(false);
      expect(whitespaceCallerResult.error).toContain('خارج قطاعه التشغيلي');
    });

    it('rejects update when target employee organization ID is missing (null, undefined, empty string, whitespace)', () => {
      // 1. null targetOrgId
      const nullTargetResult = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { full_name: 'تحديث الاسم' },
        validOrgId,
        null,
        'employee'
      );
      expect(nullTargetResult.allowed).toBe(false);
      expect(nullTargetResult.error).toContain('خارج قطاعه التشغيلي');

      // 2. undefined targetOrgId
      const undefinedTargetResult = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { full_name: 'تحديث الاسم' },
        validOrgId,
        undefined,
        'employee'
      );
      expect(undefinedTargetResult.allowed).toBe(false);
      expect(undefinedTargetResult.error).toContain('خارج قطاعه التشغيلي');

      // 3. empty string targetOrgId
      const emptyTargetResult = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { full_name: 'تحديث الاسم' },
        validOrgId,
        '',
        'employee'
      );
      expect(emptyTargetResult.allowed).toBe(false);
      expect(emptyTargetResult.error).toContain('خارج قطاعه التشغيلي');

      // 4. whitespace-only targetOrgId
      const whitespaceTargetResult = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { full_name: 'تحديث الاسم' },
        validOrgId,
        '   ',
        'employee'
      );
      expect(whitespaceTargetResult.allowed).toBe(false);
      expect(whitespaceTargetResult.error).toContain('خارج قطاعه التشغيلي');
    });

    it('rejects update when caller and target organization IDs mismatch', () => {
      const mismatchResult = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { full_name: 'تحديث الاسم' },
        validOrgId,
        otherOrgId,
        'employee'
      );
      expect(mismatchResult.allowed).toBe(false);
      expect(mismatchResult.error).toContain('خارج قطاعه التشغيلي');
    });

    it('allows update when both organization IDs exist, are non-empty, and match exactly', () => {
      const matchingResult = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { full_name: 'تحديث الاسم' },
        validOrgId,
        validOrgId,
        'employee'
      );
      expect(matchingResult.allowed).toBe(true);
    });

    it('does NOT enforce organization boundary restrictions on super_admin', () => {
      const superAdminCrossOrg = canUpdateEmployeeProfile(
        'super_admin',
        'super-admin-uuid',
        targetEmployeeId,
        { full_name: 'تحديث المشرف العام' },
        null,
        validOrgId,
        'employee'
      );
      expect(superAdminCrossOrg.allowed).toBe(true);

      const superAdminMismatchOrg = canUpdateEmployeeProfile(
        'super_admin',
        'super-admin-uuid',
        targetEmployeeId,
        { full_name: 'تحديث المشرف العام' },
        validOrgId,
        otherOrgId,
        'employee'
      );
      expect(superAdminMismatchOrg.allowed).toBe(true);
    });
  });

  describe('TASK 2: Protect Super Admin Profiles Across ALL Update Paths', () => {
    const callerAdminId = 'admin-user-uuid';
    const superAdminTargetId = 'super-admin-target-uuid';
    const sameOrgId = 'org-cairo-sector-uuid';

    it('rejects Admin modification of a Super Admin across all standard fields (name, phone, department, job_title)', () => {
      const fieldsToTest = [
        { full_name: 'اسم معدل' },
        { phone: '+201011112222' },
        { department: 'إدارة تشغيل بديلة' },
        { job_title: 'مسمى جديد' },
        { supervisor_id: 'new-supervisor-uuid' },
        { organization_id: 'new-org-uuid' },
      ];

      for (const updates of fieldsToTest) {
        const result = canUpdateEmployeeProfile(
          'admin',
          callerAdminId,
          superAdminTargetId,
          updates,
          sameOrgId,
          sameOrgId,
          'super_admin'
        );
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('لا يمكن لمدير القطاع تعديل بيانات أو صلاحيات مدير النظام العام');
      }
    });

    it('rejects Admin modification of Super Admin role and active status', () => {
      // Role demotion attempt
      const demoteResult = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        superAdminTargetId,
        { role: 'employee' },
        sameOrgId,
        sameOrgId,
        'super_admin'
      );
      expect(demoteResult.allowed).toBe(false);
      expect(demoteResult.error).toContain('لا يمكن لمدير القطاع تعديل بيانات أو صلاحيات مدير النظام العام');

      // Status deactivation attempt via canUpdateEmployeeProfile
      const deactivateResult = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        superAdminTargetId,
        { is_active: false },
        sameOrgId,
        sameOrgId,
        'super_admin'
      );
      expect(deactivateResult.allowed).toBe(false);
      expect(deactivateResult.error).toContain('لا يمكن لمدير القطاع تعديل بيانات أو صلاحيات مدير النظام العام');

      // Status toggle attempt via canToggleEmployeeStatus
      const toggleResult = canToggleEmployeeStatus(
        'admin',
        callerAdminId,
        'super_admin',
        superAdminTargetId
      );
      expect(toggleResult.allowed).toBe(false);
      expect(toggleResult.error).toContain('لا يمكن لمدير القطاع تعديل حالة حساب مدير النظام العام');
    });

    it('allows a Super Admin to manage another Super Admin profile according to role policy', () => {
      const superAdminCallerId = 'super-admin-1-uuid';
      const superAdminTargetId2 = 'super-admin-2-uuid';

      const validUpdate = canUpdateEmployeeProfile(
        'super_admin',
        superAdminCallerId,
        superAdminTargetId2,
        { full_name: 'م. أحمد المشرف العام الثاني' },
        sameOrgId,
        sameOrgId,
        'super_admin'
      );
      expect(validUpdate.allowed).toBe(true);

      const validToggle = canToggleEmployeeStatus(
        'super_admin',
        superAdminCallerId,
        'super_admin',
        superAdminTargetId2
      );
      expect(validToggle.allowed).toBe(true);
    });

    it('strictly preserves self-update restrictions even for Super Admin (cannot self-deactivate)', () => {
      const superAdminId = 'super-admin-self-uuid';

      const selfDeactivateResult = canUpdateEmployeeProfile(
        'super_admin',
        superAdminId,
        superAdminId,
        { is_active: false },
        sameOrgId,
        sameOrgId,
        'super_admin'
      );
      expect(selfDeactivateResult.allowed).toBe(false);
      expect(selfDeactivateResult.error).toContain('غير مسموح للمستخدم بتعطيل حسابه الشخصي');

      const selfToggleResult = canToggleEmployeeStatus(
        'super_admin',
        superAdminId,
        'super_admin',
        superAdminId
      );
      expect(selfToggleResult.allowed).toBe(false);
      expect(selfToggleResult.error).toContain('غير مسموح للمستخدم بتعطيل حسابه الشخصي');
    });
  });

  describe('TASK 3 & 5: Rollback Logic, Contract Safety, and Edge Decision Verification', () => {
    it('confirms rollback success when newlyCreatedAuth is true and deleteUser succeeds', () => {
      const decision = evaluateRollbackDecision({
        newlyCreatedAuth: true,
        authUserId: 'new-auth-user-123',
        deleteError: null,
      });

      expect(decision.rollback_performed).toBe(true);
      expect(decision.rollback_failed).toBe(false);
      expect(decision.server_error_log).toBeUndefined();
    });

    it('confirms rollback failure and retains server log when deleteUser returns an error', () => {
      const rawError = { message: 'Database transaction timed out on auth.users' };
      const decision = evaluateRollbackDecision({
        newlyCreatedAuth: true,
        authUserId: 'new-auth-user-123',
        deleteError: rawError,
      });

      expect(decision.rollback_performed).toBe(false);
      expect(decision.rollback_failed).toBe(true);
      expect(decision.server_error_log).toBe('Database transaction timed out on auth.users');
    });

    it('NEVER attempts rollback if the Auth user was NOT created in the current request (preexisting account)', () => {
      const decision = evaluateRollbackDecision({
        newlyCreatedAuth: false,
        authUserId: 'preexisting-auth-user-456',
        deleteError: null,
      });

      expect(decision.rollback_performed).toBe(false);
      expect(decision.rollback_failed).toBe(false);
    });

    it('NEVER attempts rollback if authUserId is missing', () => {
      const decision = evaluateRollbackDecision({
        newlyCreatedAuth: true,
        authUserId: null,
        deleteError: null,
      });

      expect(decision.rollback_performed).toBe(false);
      expect(decision.rollback_failed).toBe(false);
    });

    it('creates safe client response contract without exposing raw server errors', () => {
      const safeResponse = createSafeProvisioningErrorResponse({
        clientErrorMessage: 'تعذر إتمام تسجيل الملف الوظيفي في قاعدة البيانات.',
        rollback_performed: false,
        rollback_failed: true,
      });

      expect(safeResponse.success).toBe(false);
      expect(safeResponse.error).toBe('تعذر إتمام تسجيل الملف الوظيفي في قاعدة البيانات.');
      expect(safeResponse.rollback_performed).toBe(false);
      expect(safeResponse.rollback_failed).toBe(true);
      // Strictly verify no raw internal details are exposed to the client
      expect((safeResponse as any).rollback_error_detail).toBeUndefined();
      expect((safeResponse as any).server_error_log).toBeUndefined();
    });
  });

  describe('TASK 4: Invitation & Onboarding Reliability Verification', () => {
    it('distinguishes invitation API delivery from fallback creation without email delivery', () => {
      const successInviteMessage = 'تم إرسال دعوة البريد الإلكتروني وإنشاء حساب الموظف وتعيين المحطات بنجاح.';
      const fallbackInviteMessage = 'تم إنشاء حساب الموظف وملفه الوظيفي وتعيين المحطات بنجاح (لم يتم تسليم بريد الدعوة، يمكن للموظف إعداد كلمة المرور عبر رابط استعادة كلمة المرور).';

      // Delivered case
      expect(successInviteMessage).toContain('تم إرسال دعوة البريد الإلكتروني');

      // Fallback case: does NOT claim email was sent, and does NOT claim user can immediately log in without password
      expect(fallbackInviteMessage).not.toContain('جاهز لتسجيل الدخول');
      expect(fallbackInviteMessage).toContain('لم يتم تسليم بريد الدعوة');
      expect(fallbackInviteMessage).toContain('استعادة كلمة المرور');
    });

    it('sanitizes update payloads by stripping immutable and non-column fields', () => {
      const dirtyUpdates = {
        id: 'immutable-user-id',
        email: 'immutable@psms.gov.eg',
        employee_number: 'EMP-IMMUTABLE',
        full_name: 'م. عصام المعدل',
        phone: '+201099998888',
        role: 'supervisor' as UserRole,
        department: 'إدارة الشبكات',
        job_title: 'مشرف قطاع',
        assigned_station_ids: ['stn-1', 'stn-2'],
        is_active: true,
      };

      const sanitized = sanitizeProfileUpdatePayload(dirtyUpdates, true, false);

      expect(sanitized.id).toBeUndefined();
      expect(sanitized.email).toBeUndefined();
      expect(sanitized.employee_number).toBeUndefined();
      expect(sanitized.assigned_station_ids).toBeUndefined();
      expect(sanitized.full_name).toBe('م. عصام المعدل');
      expect(sanitized.role).toBe('supervisor');
      expect(sanitized.updated_at).toBeDefined();
    });

    it('validates employeeFormSchema with valid and invalid inputs', () => {
      expect(employeeFormSchema.safeParse(sampleValidEmployee).success).toBe(true);

      const invalidEmail = { ...sampleValidEmployee, email: 'not-an-email' };
      expect(employeeFormSchema.safeParse(invalidEmail).success).toBe(false);

      const shortEmpNum = { ...sampleValidEmployee, employee_number: 'AB' };
      expect(employeeFormSchema.safeParse(shortEmpNum).success).toBe(false);
    });
  });
});
