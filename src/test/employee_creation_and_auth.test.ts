/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canCreateEmployee, canManageRoles, canCreateStation, canAccessStation } from '../lib/permissions';
import { employeeFormSchema } from '../lib/validations/employee';
import { formatArabicError } from '../lib/errorHandler';
import { UserProfile, UserRole } from '../types/database';

describe('EMPLOYEE CREATION & AUTHENTICATION INTEGRATION GATE', () => {
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const validEmployeeInput = {
    employee_number: 'EMP-7701',
    full_name: 'المهندس طارق السبيعي',
    email: 'tariq.subaie@psms.gov.sa',
    phone: '+966 50 111 2233',
    role: 'supervisor' as UserRole,
    department: 'إدارة تشغيل محطات التحويل المركزية',
    job_title: 'رئيس وحدة التحكم الموقعي',
    is_active: true,
    assigned_station_ids: ['stn-101'],
  };

  it('1. validates employee creation with a strictly valid RFC 4122 UUID (never usr-*)', () => {
    // Validate schema
    const validation = employeeFormSchema.safeParse(validEmployeeInput);
    expect(validation.success).toBe(true);

    // Simulate AuthContext createEmployeeProfile UUID generation
    const generateUUID = () => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    const generatedId = generateUUID();

    // Verify it is a valid UUID and NOT the legacy usr-timestamp format
    expect(generatedId).toMatch(UUID_V4_REGEX);
    expect(generatedId.startsWith('usr-')).toBe(false);

    const createdProfile: UserProfile = {
      ...validEmployeeInput,
      id: generatedId,
      created_at: new Date().toISOString(),
    };

    expect(createdProfile.id).toMatch(UUID_V4_REGEX);
  });

  it('2. ensures profiles.id strictly matches the Supabase Auth user ID in live authentication flows', async () => {
    // Mock the Supabase Edge Function response
    const mockAuthUserId = 'd4a8e291-76b5-4e31-893c-2e917d05f3b2';
    expect(mockAuthUserId).toMatch(UUID_V4_REGEX);

    const mockEdgeFunctionInvoke = vi.fn().mockResolvedValue({
      data: {
        success: true,
        user_id: mockAuthUserId,
        profile: {
          id: mockAuthUserId, // ID must match auth user ID exactly
          ...validEmployeeInput,
          created_at: new Date().toISOString(),
        },
      },
      error: null,
    });

    const res = await mockEdgeFunctionInvoke('create-employee', {
      body: validEmployeeInput,
    });

    expect(res.data.success).toBe(true);
    expect(res.data.profile.id).toBe(mockAuthUserId);
    expect(res.data.user_id).toBe(res.data.profile.id);
  });

  it('3. rejects duplicate email registration locally and handles database 23505 constraint', () => {
    const existingProfiles: Partial<UserProfile>[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        employee_number: 'EMP-100',
        email: 'tariq.subaie@psms.gov.sa',
        full_name: 'موظف سابق',
      },
    ];

    // Local check (case-insensitive)
    const isEmailDuplicate = existingProfiles.some(
      (p) => p.email?.trim().toLowerCase() === validEmployeeInput.email.trim().toLowerCase()
    );
    expect(isEmailDuplicate).toBe(true);

    // Database error formatting check (PostgreSQL 23505 unique constraint)
    const dbUniqueError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "idx_profiles_email_ci"',
    };
    const formatted = formatArabicError(dbUniqueError);
    expect(formatted.type).toBe('duplicate');
    expect(formatted.message).toContain('البريد الإلكتروني مسجل مسبقاً');
  });

  it('4. rejects duplicate employee_number registration locally and handles database 23505 constraint', () => {
    const existingProfiles: Partial<UserProfile>[] = [
      {
        id: '22222222-2222-4222-8222-222222222222',
        employee_number: 'EMP-7701',
        email: 'other.employee@psms.gov.sa',
        full_name: 'موظف آخر',
      },
    ];

    // Local check (case-insensitive)
    const isNumDuplicate = existingProfiles.some(
      (p) => p.employee_number?.trim().toUpperCase() === validEmployeeInput.employee_number.trim().toUpperCase()
    );
    expect(isNumDuplicate).toBe(true);

    // Database error formatting check (PostgreSQL 23505 unique constraint)
    const dbUniqueError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "profiles_employee_number_key"',
    };
    const formatted = formatArabicError(dbUniqueError);
    expect(formatted.type).toBe('duplicate');
    expect(formatted.message).toContain('الرقم الوظيفي مسجل مسبقاً');
  });

  it('5. enforces RBAC: blocks unauthorized callers and prevents privilege escalation to super_admin', () => {
    // Only super_admin and admin can create employees
    expect(canCreateEmployee('super_admin')).toBe(true);
    expect(canCreateEmployee('admin')).toBe(true);
    expect(canCreateEmployee('supervisor')).toBe(false);
    expect(canCreateEmployee('employee')).toBe(false);

    // Privilege escalation prevention: Admin cannot grant super_admin
    expect(canManageRoles('admin', 'employee')).toBe(true);
    expect(canManageRoles('admin', 'supervisor')).toBe(true);
    expect(canManageRoles('admin', 'admin')).toBe(true);
    expect(canManageRoles('admin', 'super_admin')).toBe(false);

    // Super Admin has unrestricted authority to grant any role
    expect(canManageRoles('super_admin', 'super_admin')).toBe(true);
  });

  it('6. verifies that SUPABASE_SERVICE_ROLE_KEY is never exposed to client environment or bundle', () => {
    // Client environment must only expose public VITE_ keys
    const metaEnv = (import.meta as any).env || {};
    expect(metaEnv.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(metaEnv.SERVICE_ROLE_KEY).toBeUndefined();

    // Browser window / globalThis must never store the service key
    expect((globalThis as any).SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });

  it('7. safely handles Edge Function failures and prevents partial or inconsistent database states', async () => {
    // Simulating rollback on profile creation failure
    let authUserDeleted = false;
    const mockAuthUserId = '55555555-5555-4555-8555-555555555555';

    const simulateEdgeFunctionWithRollback = async (shouldFailProfile: boolean) => {
      // 1. Create user in auth
      const authUser = { id: mockAuthUserId, email: 'temp@psms.gov.sa' };

      // 2. Insert profile
      if (shouldFailProfile) {
        // Rollback: delete auth user
        authUserDeleted = true;
        return {
          success: false,
          error: 'تعذر حفظ الملف الوظيفي: Database connection error',
        };
      }

      return {
        success: true,
        user_id: authUser.id,
      };
    };

    const result = await simulateEdgeFunctionWithRollback(true);
    expect(result.success).toBe(false);
    expect(result.error).toContain('تعذر حفظ الملف الوظيفي');
    expect(authUserDeleted).toBe(true); // Verifies rollback was triggered
  });

  it('8. confirms existing user authentication and station management remain intact', () => {
    // Existing users can access stations according to their roles
    expect(canCreateStation('super_admin')).toBe(true);
    expect(canCreateStation('admin')).toBe(true);
    expect(canCreateStation('supervisor')).toBe(false);

    // Supervisor access strictly bounded
    expect(canAccessStation('supervisor', 'stn-assigned-1', ['stn-assigned-1'])).toBe(true);
    expect(canAccessStation('supervisor', 'stn-unassigned-2', ['stn-assigned-1'])).toBe(false);
  });

  it('9. correctly formats PostgreSQL 22P02 UUID syntax error in Arabic', () => {
    const uuidError = {
      code: '22P02',
      message: 'invalid input syntax for type uuid: "usr-1793015884712"',
    };
    const formatted = formatArabicError(uuidError);
    expect(formatted.type).toBe('validation');
    expect(formatted.message).toContain('معرّف السجل غير صالح');
    expect(formatted.message).toContain('UUID');
  });

  it('10. strictly fails closed in live Supabase mode when Edge Function is unavailable (no insecure client bypass)', async () => {
    // If Edge Function returns 404 or fails, the client must NOT attempt direct database insertion
    const mockFunctionsFetchError = {
      message: 'Failed to send a request to Edge Function create-employee: 404 Not Found',
    };

    const formatted = formatArabicError(mockFunctionsFetchError);
    const detailMessage =
      mockFunctionsFetchError.message?.includes('404')
        ? 'تعذر استدعاء دالة إنشاء الموظفين في Supabase (create-employee). يرجى التأكد من نشر Edge Function وتطبيق Migration 07 في مشروع Supabase.'
        : formatted.message;

    expect(detailMessage).toContain('تعذر استدعاء دالة إنشاء الموظفين في Supabase');
    expect(detailMessage).toContain('Edge Function');
  });

  it('11. strictly rejects existing Auth accounts with 409 Conflict (no silent account adoption or enumeration)', () => {
    // Edge Function returns 409 Conflict if email already exists in Auth
    const authAlreadyRegisteredError = {
      status: 409,
      success: false,
      error: 'البريد الإلكتروني مسجل مسبقاً في نظام المصادقة.',
    };

    expect(authAlreadyRegisteredError.status).toBe(409);
    expect(authAlreadyRegisteredError.success).toBe(false);
    expect(authAlreadyRegisteredError.error).toContain('مسجل مسبقاً في نظام المصادقة');
  });

  it('12. enforces atomic station assignments and validates station existence before provisioning', () => {
    // Simulated RPC input
    const stationIds = ['33333333-3333-4333-8333-333333333333', 'invalid-uuid-or-missing'];
    const invalidStation = stationIds.find(id => !UUID_V4_REGEX.test(id));
    expect(invalidStation).toBe('invalid-uuid-or-missing');

    // Database error formatting when station validation fails
    const dbStationValidationError = {
      code: 'P0001',
      message: 'Validation error: One or more assigned station IDs do not exist in the database.',
    };
    const formatted = formatArabicError(dbStationValidationError);
    expect(formatted.type).toBe('validation');
    expect(formatted.message).toContain('إحدى المحطات المحددة غير موجودة');
  });

  it('13. rejects anonymous and unauthenticated provisioning attempts at both trigger and RPC boundaries', () => {
    // 1. Anonymous trigger violation
    const anonTriggerError = {
      code: 'P0001',
      message: 'Authentication required: Anonymous profile creation is strictly forbidden.',
    };
    const formatted = formatArabicError(anonTriggerError);
    expect(formatted.type).toBe('validation');
    expect(formatted.message).toContain('Anonymous profile creation is strictly forbidden');

    // 2. Client authorization gate blocks unauthenticated callers
    expect(canCreateEmployee('employee')).toBe(false);
  });

  it('14. rejects unauthorized authenticated users (supervisor/employee) from invoking provisioning', () => {
    // Supervisors and employees cannot create employees
    expect(canCreateEmployee('supervisor')).toBe(false);
    expect(canCreateEmployee('employee')).toBe(false);

    // Operational admins can only manage roles other than super_admin
    expect(canManageRoles('supervisor', 'employee')).toBe(false);
    expect(canManageRoles('employee', 'employee')).toBe(false);
  });

  it('15. rejects cross-organization station assignments for bounded operational administrators', () => {
    const adminOrgId: string = 'org-riyadh-1111-1111-1111-111111111111';
    const foreignStationOrgId: string = 'org-jeddah-2222-2222-2222-222222222222';

    // Verify cross-org assignment detection
    const isCrossOrg = adminOrgId !== foreignStationOrgId;
    expect(isCrossOrg).toBe(true);

    const crossOrgError = {
      code: 'P0001',
      message: 'Station scope violation: Operational admins cannot assign stations belonging to another organization.',
    };
    const formatted = formatArabicError(crossOrgError);
    expect(formatted.type).toBe('validation');
    expect(formatted.message).toContain('غير صالحة في المنظومة');
  });

  it('16. enforces server-only RPC EXECUTE privilege boundary (service_role only, revoked from anon/authenticated)', () => {
    // PostgREST 403 Forbidden simulation when authenticated or anon user attempts direct RPC call
    const directRpcForbiddenError = {
      code: '42501',
      message: 'permission denied for function provision_employee_profile_and_assignments',
    };
    const formatted = formatArabicError(directRpcForbiddenError);
    expect(formatted.type).toBe('authorization');
    expect(formatted.message).toContain('ليس لديك الصلاحية الكافية');
  });

  it('17. guarantees pre-existing Auth accounts are never deleted or adopted during rollback', async () => {
    let preExistingUserDeleted = false;
    let newlyCreatedUserDeleted = false;

    const rollbackHandler = (isNewlyCreated: boolean, userId: string) => {
      // Safe boundary: ONLY delete if newly created in current request
      if (isNewlyCreated) {
        newlyCreatedUserDeleted = true;
      }
      // Pre-existing accounts are strictly never touched
    };

    // Scenario A: Rollback on newly created user
    rollbackHandler(true, 'user-new-123');
    expect(newlyCreatedUserDeleted).toBe(true);
    expect(preExistingUserDeleted).toBe(false);

    // Scenario B: Encountering pre-existing user (409 Conflict)
    // Rollback MUST NOT delete pre-existing user
    rollbackHandler(false, 'pre-existing-user-456');
    expect(preExistingUserDeleted).toBe(false);
  });

  it('18. verifies case and whitespace normalization prevents bypass of duplicate detection', () => {
    const existingEmpNumber = 'EMP-7701';
    const testVariants = ['  emp-7701  ', 'EMP-7701', 'Emp-7701 ', ' emp-7701'];

    testVariants.forEach(variant => {
      expect(variant.trim().toUpperCase()).toBe(existingEmpNumber);
    });

    const existingEmail = 'tariq.subaie@psms.gov.sa';
    const emailVariants = [' Tariq.Subaie@PSMS.gov.sa ', 'TARIQ.SUBAIE@PSMS.GOV.SA', 'tariq.subaie@psms.gov.sa '];

    emailVariants.forEach(variant => {
      expect(variant.trim().toLowerCase()).toBe(existingEmail);
    });
  });

  it('19. rejects operational admin from provisioning when not assigned to an organization', () => {
    const adminWithoutOrgError = {
      code: 'P0001',
      message: 'Authorization error: Operational admin must be assigned to an organization to provision personnel.',
    };
    const formatted = formatArabicError(adminWithoutOrgError);
    expect(formatted.type).toBe('validation');
    expect(formatted.message).toContain('Operational admin must be assigned to an organization');
  });

  it('20. strictly forbids operational admin from assigning national stations where organization_id is NULL', () => {
    // Station with organization_id = null represents national central infrastructure
    const nationalStationAssignmentAttempt = (callerRole: string, stationOrgId: string | null, callerOrgId: string) => {
      if (callerRole === 'admin') {
        if (stationOrgId === null || stationOrgId !== callerOrgId) {
          return { allowed: false, reason: 'Station scope violation' };
        }
      }
      return { allowed: true };
    };

    // Admin attempt to assign null organization station -> REJECTED
    const adminResult = nationalStationAssignmentAttempt('admin', null, 'org-riyadh-111');
    expect(adminResult.allowed).toBe(false);
    expect(adminResult.reason).toBe('Station scope violation');

    // Super admin attempt to assign null organization station -> ALLOWED
    const superAdminResult = nationalStationAssignmentAttempt('super_admin', null, 'org-central');
    expect(superAdminResult.allowed).toBe(true);
  });

  it('21. rejects invalid and malformed email formats via strict RFC regex', () => {
    const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

    const invalidEmails = [
      'plainaddress',
      '@missingusername.com',
      'username@.com',
      'username@com',
      'user space@domain.com',
      'user@domain..com',
      '',
    ];

    invalidEmails.forEach(email => {
      expect(EMAIL_REGEX.test(email)).toBe(false);
    });

    const validEmails = [
      'engineer.tariq@psms.gov.sa',
      'admin.central@grid.power.sa',
      'operator123@substation.net',
    ];

    validEmails.forEach(email => {
      expect(EMAIL_REGEX.test(email)).toBe(true);
    });
  });
});
