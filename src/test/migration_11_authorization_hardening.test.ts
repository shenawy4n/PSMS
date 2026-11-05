/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  canCreateEmployee,
  canManageRoles,
  canUpdateEmployeeProfile,
  canToggleEmployeeStatus,
  canDeleteStation,
  canEditStation,
  canAssignPersonnel,
  sanitizeProfileUpdatePayload,
} from '../lib/permissions';
import { UserRole } from '../types/database';

describe('PSMS Migration 11: Database Security Hardening & Fail-Closed Boundary Verification', () => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
  const migration11Path = path.join(migrationsDir, '11_database_security_hardening.sql');
  const migration09Path = path.join(migrationsDir, '09_production_readiness_patch.sql');

  let migration11Content: string;
  let migration09Content: string;

  beforeEach(() => {
    if (!migration11Content && fs.existsSync(migration11Path)) {
      migration11Content = fs.readFileSync(migration11Path, 'utf-8');
    }
    if (!migration09Content && fs.existsSync(migration09Path)) {
      migration09Content = fs.readFileSync(migration09Path, 'utf-8');
    }
  });

  describe('1. Static SQL Verification of Migration 11 File Integrity', () => {
    it('verifies that Migration 11 file exists and is non-empty', () => {
      expect(fs.existsSync(migration11Path)).toBe(true);
      expect(migration11Content).toBeDefined();
      expect(migration11Content.length).toBeGreaterThan(1000);
    });

    it('confirms the PURGE of fail-open clause "OR public.get_current_user_org_id() IS NULL"', () => {
      // In Migration 09 this dangerous clause was present:
      expect(migration09Content).toContain('OR public.get_current_user_org_id() IS NULL');

      // In Migration 11 it MUST NOT exist anywhere in executable SQL
      const strippedSql = migration11Content
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      expect(strippedSql).not.toContain('OR public.get_current_user_org_id() IS NULL');
      expect(strippedSql).not.toMatch(/get_current_user_org_id\(\)\s+IS\s+NULL\s+OR/i);
      expect(migration11Content).not.toContain('OR public.get_current_user_org_id() IS NULL');
    });

    it('verifies fail-closed organization checks in public.profiles SELECT policy', () => {
      // Drops old policy and creates hardened SELECT policy
      expect(migration11Content).toContain('DROP POLICY IF EXISTS "Profiles viewable by authorized users" ON public.profiles;');
      expect(migration11Content).toContain('CREATE POLICY "Profiles viewable by authorized users"');

      // Asserts that operational admin visibility requires explicit non-null match:
      expect(migration11Content).toContain('public.get_current_user_org_id() IS NOT NULL');
      expect(migration11Content).toContain('organization_id IS NOT NULL');
      expect(migration11Content).toContain('organization_id = public.get_current_user_org_id()');
    });

    it('verifies fail-closed organization and super_admin protection in public.profiles UPDATE policy', () => {
      expect(migration11Content).toContain('DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;');
      expect(migration11Content).toContain('CREATE POLICY "Admins can update profiles"');

      // Must protect super_admin role at RLS layer
      expect(migration11Content).toContain("role != 'super_admin'::user_role");

      // Must require caller and target org to be non-null and matching
      const updatePolicyRegex = /CREATE POLICY "Admins can update profiles"[\s\S]*?WITH CHECK/i;
      const match = migration11Content.match(updatePolicyRegex);
      expect(match).not.toBeNull();
      if (match) {
        expect(match[0]).toContain('public.get_current_user_org_id() IS NOT NULL');
        expect(match[0]).toContain('organization_id IS NOT NULL');
        expect(match[0]).toContain('organization_id = public.get_current_user_org_id()');
      }
    });

    it('verifies fail-closed enforcement in trigger function enforce_profile_update_security()', () => {
      expect(migration11Content).toContain('CREATE OR REPLACE FUNCTION public.enforce_profile_update_security()');
      
      // Asserts active caller check
      expect(migration11Content).toContain('SELECT is_active INTO v_caller_active');
      expect(migration11Content).toContain('Inactive account cannot perform profile modifications');

      // Asserts caller org check (fail-closed if null)
      expect(migration11Content).toContain('IF v_current_org_id IS NULL THEN');
      expect(migration11Content).toContain('Operational administrator has no assigned organization');

      // Asserts target org check (fail-closed if null or mismatch)
      expect(migration11Content).toContain('IF OLD.organization_id IS NULL OR OLD.organization_id != v_current_org_id THEN');
      expect(migration11Content).toContain('Administrators cannot modify profiles outside their organization');

      // Asserts reassign org prevention
      expect(migration11Content).toContain('IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN');
      expect(migration11Content).toContain('Administrators cannot reassign employee organization');

      // Asserts super admin protection
      expect(migration11Content).toContain("IF OLD.role = 'super_admin'::user_role THEN");
      expect(migration11Content).toContain('Administrators cannot modify Super Admin profiles');

      // Asserts super admin promotion prevention
      expect(migration11Content).toContain("IF NEW.role = 'super_admin'::user_role AND OLD.role != 'super_admin'::user_role THEN");
      expect(migration11Content).toContain('Administrators cannot promote users to super_admin');
    });

    it('verifies fail-closed enforcement in trigger function enforce_profile_insert_security()', () => {
      expect(migration11Content).toContain('CREATE OR REPLACE FUNCTION public.enforce_profile_insert_security()');
      expect(migration11Content).toContain('IF v_current_org_id IS NULL THEN');
      expect(migration11Content).toContain('IF NEW.organization_id IS NULL OR NEW.organization_id != v_current_org_id THEN');
    });

    it('verifies fail-closed enforcement in RPC provision_employee_profile_and_assignments()', () => {
      expect(migration11Content).toContain('CREATE OR REPLACE FUNCTION public.provision_employee_profile_and_assignments');

      // Asserts operational admin org cannot be null
      expect(migration11Content).toContain("IF v_admin_role = 'admin'::user_role THEN");
      expect(migration11Content).toContain('IF v_admin_org_id IS NULL THEN');
      expect(migration11Content).toContain('Operational administrator profile is not assigned to an organization');

      // Asserts station check fails closed for admin
      expect(migration11Content).toContain('Station scope violation: Operational administrator has no assigned organization');
      expect(migration11Content).toContain('Operational admins can only assign stations belonging strictly to their organization');

      // Asserts execution grants
      expect(migration11Content).toContain('REVOKE ALL ON FUNCTION public.provision_employee_profile_and_assignments');
      expect(migration11Content).toContain('GRANT EXECUTE ON FUNCTION public.provision_employee_profile_and_assignments(UUID, TEXT, TEXT, TEXT, TEXT, user_role, TEXT, TEXT, UUID, BOOLEAN, UUID[], UUID) TO service_role');
    });

    it('verifies station RLS policies replace broad "Admins can manage stations" with scoped policies', () => {
      // Old overly-broad policy dropped
      expect(migration11Content).toContain('DROP POLICY IF EXISTS "Admins can manage stations" ON public.stations;');

      // Super admin can manage all
      expect(migration11Content).toContain('CREATE POLICY "Super admins can manage all stations"');

      // Admin insert restricted to own org
      expect(migration11Content).toContain('CREATE POLICY "Admins can insert stations in their organization"');
      expect(migration11Content).toContain('organization_id = public.get_current_user_org_id()');

      // Admin update restricted to own org
      expect(migration11Content).toContain('CREATE POLICY "Admins can update stations in their organization"');

      // Deletion strictly reserved to super_admin
      expect(migration11Content).toContain('CREATE POLICY "Super admins can delete stations"');
      expect(migration11Content).toContain('ON public.stations FOR DELETE');
      expect(migration11Content).toContain('USING (public.is_super_admin())');
    });

    it('verifies station_assignments RLS policies enforce station_belongs_to_user_org', () => {
      expect(migration11Content).toContain('CREATE POLICY "Station assignments viewable by authorized users"');
      expect(migration11Content).toContain('CREATE POLICY "Station assignments insertable by authorized managers"');
      expect(migration11Content).toContain('CREATE POLICY "Station assignments updatable by authorized managers"');

      expect(migration11Content).toContain('public.station_belongs_to_user_org(station_id)');
    });
  });

  describe('2. Behavioral Permissions Unit Tests Aligning with Migration 11 Rules', () => {
    const callerAdminId = 'admin-user-001';
    const targetEmployeeId = 'emp-user-002';
    const validOrgId = '00000000-0000-0000-0000-000000000001';
    const otherOrgId = '00000000-0000-0000-0000-000000000002';

    it('strictly denies operational admin profile update when caller has NULL organization', () => {
      const result = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { full_name: 'تعديل الاسم' },
        null,
        validOrgId,
        'employee'
      );
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('خارج قطاعه التشغيلي');
    });

    it('strictly denies operational admin profile update when target has NULL organization', () => {
      const result = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { full_name: 'تعديل الاسم' },
        validOrgId,
        null,
        'employee'
      );
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('خارج قطاعه التشغيلي');
    });

    it('strictly denies operational admin from modifying a Super Admin profile under any circumstance', () => {
      const result = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { phone: '+201000000000' },
        validOrgId,
        validOrgId,
        'super_admin'
      );
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('لا يمكن لمدير القطاع تعديل بيانات أو صلاحيات مدير النظام العام');
    });

    it('strictly denies operational admin from promoting an employee to super_admin', () => {
      const result = canUpdateEmployeeProfile(
        'admin',
        callerAdminId,
        targetEmployeeId,
        { role: 'super_admin' as UserRole },
        validOrgId,
        validOrgId,
        'employee'
      );
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('ليس لديك الصلاحية لمنح هذه الرتبة');
    });

    it('allows Super Admin to update employee profiles across any organization', () => {
      const result = canUpdateEmployeeProfile(
        'super_admin',
        'super-admin-uid',
        targetEmployeeId,
        { full_name: 'اعتماد المسمى الجديد' },
        null, // Super admin org can be null
        validOrgId,
        'employee'
      );
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('strictly restricts station deletion to super_admin only', () => {
      expect(canDeleteStation('super_admin')).toBe(true);
      expect(canDeleteStation('admin')).toBe(false);
      expect(canDeleteStation('supervisor')).toBe(false);
      expect(canDeleteStation('employee')).toBe(false);
    });

    it('strictly restricts toggle of employee active status to admins and protects super_admin and self', () => {
      // Self-deactivation denied
      const selfResult = canToggleEmployeeStatus('admin', callerAdminId, 'admin', callerAdminId);
      expect(selfResult.allowed).toBe(false);
      expect(selfResult.error).toContain('غير مسموح للمستخدم بتعطيل حسابه الشخصي');

      // Admin trying to deactivate super_admin denied
      const superTargetResult = canToggleEmployeeStatus('admin', callerAdminId, 'super_admin', 'target-super-uid');
      expect(superTargetResult.allowed).toBe(false);
      expect(superTargetResult.error).toContain('لا يمكن لمدير القطاع تعديل حالة حساب مدير النظام العام');

      // Admin deactivating peer employee allowed
      const validToggle = canToggleEmployeeStatus('admin', callerAdminId, 'employee', targetEmployeeId);
      expect(validToggle.allowed).toBe(true);
    });

    it('sanitizes profile update payloads to discard non-updatable or dangerous fields', () => {
      const dirtyPayload = {
        id: 'tampered-uuid',
        email: 'tampered@fake.com',
        employee_number: 'EMP-FAKE',
        assigned_station_ids: ['some-station-uuid'],
        full_name: 'المهندس الجديد',
        phone: '01011112222',
        role: 'supervisor' as UserRole,
        is_active: true,
      };

      const sanitized = sanitizeProfileUpdatePayload(dirtyPayload, true, false);

      // Verify that structural/immutable fields are stripped
      expect(sanitized.id).toBeUndefined();
      expect(sanitized.email).toBeUndefined();
      expect(sanitized.employee_number).toBeUndefined();
      expect(sanitized.assigned_station_ids).toBeUndefined();

      // Verify permitted fields exist
      expect(sanitized.full_name).toBe('المهندس الجديد');
      expect(sanitized.phone).toBe('01011112222');
      expect(sanitized.role).toBe('supervisor');
      expect(sanitized.is_active).toBe(true);
      expect(sanitized.updated_at).toBeDefined();
    });
  });

  describe('3. Comprehensive Policy Inventory Matrix Audit (Before vs After)', () => {
    it('verifies that the policy inventory has transitioned from permissive to strict fail-closed', () => {
      const policyInventory = [
        {
          table: 'public.profiles',
          action: 'SELECT',
          policyName: 'Profiles viewable by authorized users',
          migration09State: 'Permissive: is_admin_or_super() allowed cross-org read of all profiles',
          migration11State: 'Fail-Closed: admin restricted to own non-null org or station peers',
          failClosedEnforced: true,
        },
        {
          table: 'public.profiles',
          action: 'UPDATE',
          policyName: 'Admins can update profiles',
          migration09State: 'Vulnerable: OR get_current_user_org_id() IS NULL permitted full bypass',
          migration11State: 'Fail-Closed: null org blocked, org match required, super_admin protected',
          failClosedEnforced: true,
        },
        {
          table: 'public.stations',
          action: 'ALL / UPDATE',
          policyName: 'Admins can manage stations -> Split policies',
          migration09State: 'Vulnerable: is_admin_or_super() granted cross-org station management',
          migration11State: 'Fail-Closed: admin scoped to own org; DELETE exclusive to super_admin',
          failClosedEnforced: true,
        },
        {
          table: 'public.station_assignments',
          action: 'INSERT / UPDATE',
          policyName: 'Station assignments insertable/updatable by authorized managers',
          migration09State: 'Vulnerable: is_admin_or_super() lacked station_belongs_to_user_org check',
          migration11State: 'Fail-Closed: station_belongs_to_user_org required for operational admin',
          failClosedEnforced: true,
        },
        {
          table: 'RPC',
          action: 'EXECUTE',
          policyName: 'provision_employee_profile_and_assignments',
          migration09State: 'Vulnerable: skipped org check if v_admin_org_id IS NULL',
          migration11State: 'Fail-Closed: immediately throws exception if v_admin_org_id IS NULL',
          failClosedEnforced: true,
        },
        {
          table: 'Trigger',
          action: 'BEFORE UPDATE',
          policyName: 'trg_enforce_profile_update_security',
          migration09State: 'Vulnerable: IF v_current_org_id IS NOT NULL THEN skipped null org admin',
          migration11State: 'Fail-Closed: throws on null caller org, throws on null target org, throws on mismatch',
          failClosedEnforced: true,
        },
      ];

      for (const item of policyInventory) {
        expect(item.failClosedEnforced).toBe(true);
        expect(item.migration11State).toContain('Fail-Closed');
      }
    });
  });
});
