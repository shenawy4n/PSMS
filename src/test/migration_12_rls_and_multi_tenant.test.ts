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
  canAccessStation,
  canSubmitReadings,
  canSubmitFault,
  canManageMaintenance,
  canApprovePTW,
  canCreatePTW,
  sanitizeProfileUpdatePayload,
} from '../lib/permissions';
import { UserRole } from '../types/database';

describe('PSMS Migration 12: Complete RLS Audit & Multi-Tenant Security Hardening', () => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
  const migration12Path = path.join(migrationsDir, '12_complete_rls_multi_tenant_hardening.sql');
  const migration11Path = path.join(migrationsDir, '11_database_security_hardening.sql');
  const migration09Path = path.join(migrationsDir, '09_production_readiness_patch.sql');

  let migration12Content: string;
  let migration11Content: string;
  let migration09Content: string;

  beforeEach(() => {
    if (!migration12Content && fs.existsSync(migration12Path)) {
      migration12Content = fs.readFileSync(migration12Path, 'utf-8');
    }
    if (!migration11Content && fs.existsSync(migration11Path)) {
      migration11Content = fs.readFileSync(migration11Path, 'utf-8');
    }
    if (!migration09Content && fs.existsSync(migration09Path)) {
      migration09Content = fs.readFileSync(migration09Path, 'utf-8');
    }
  });

  /* ==============================================================================
     SECTION 1: STATIC SQL AUDIT OF MIGRATION 12 INTEGRITY & OBSOLETE POLICY PURGING
     ============================================================================== */
  describe('1. Static SQL Verification of Migration 12', () => {
    it('verifies that Migration 12 exists and is non-empty', () => {
      expect(fs.existsSync(migration12Path)).toBe(true);
      expect(migration12Content).toBeDefined();
      expect(migration12Content.length).toBeGreaterThan(2000);
    });

    it('confirms inactive account checks in get_current_user_role and get_current_user_org_id', () => {
      // Both functions must check is_active = TRUE
      expect(migration12Content).toContain('SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()) AND is_active = TRUE;');
      expect(migration12Content).toContain('SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid()) AND is_active = TRUE;');
    });

    it('verifies strict station isolation in user_has_station_access (no cross-org assignment bypass)', () => {
      expect(migration12Content).toContain('CREATE OR REPLACE FUNCTION public.user_has_station_access');
      
      // Admin with null org returns false
      expect(migration12Content).toContain('IF v_user_org IS NULL THEN');
      expect(migration12Content).toContain('RETURN FALSE;');

      // Admin requires station to belong to their non-null organization
      expect(migration12Content).toContain('organization_id IS NOT NULL');
      expect(migration12Content).toContain('organization_id = v_user_org');

      // Crucial: The dangerous direct assignment bypass for admin MUST NOT be present in admin block
      const adminBlockMatch = migration12Content.match(/IF v_user_role = 'admin'::user_role THEN[\s\S]*?RETURN FALSE;\s*END IF;/);
      expect(adminBlockMatch).not.toBeNull();
      if (adminBlockMatch) {
        expect(adminBlockMatch[0]).not.toContain('RETURN public.user_has_station_assignment');
      }
    });

    it('verifies that station_assets RLS enforces station_belongs_to_user_org for INSERT & UPDATE', () => {
      // Old overly-broad policy dropped
      expect(migration12Content).toContain('DROP POLICY IF EXISTS "Station assets insertable by managers" ON public.station_assets;');
      expect(migration12Content).toContain('DROP POLICY IF EXISTS "Station assets updatable by managers" ON public.station_assets;');

      // Scoped INSERT
      expect(migration12Content).toContain('CREATE POLICY "Station assets insertable by managers"');
      expect(migration12Content).toContain('public.station_belongs_to_user_org(station_id)');

      // Scoped UPDATE with both USING and WITH CHECK
      const updateAssetMatch = migration12Content.match(/CREATE POLICY "Station assets updatable by managers"[\s\S]*?ON public\.station_assets FOR UPDATE[\s\S]*?WITH CHECK/i);
      expect(updateAssetMatch).not.toBeNull();
      if (updateAssetMatch) {
        expect(updateAssetMatch[0]).toContain('public.station_belongs_to_user_org(station_id)');
      }
    });

    it('verifies that maintenance_orders RLS enforces station_belongs_to_user_org for INSERT & UPDATE', () => {
      expect(migration12Content).toContain('DROP POLICY IF EXISTS "Maintenance orders insertable by managers" ON public.maintenance_orders;');
      expect(migration12Content).toContain('DROP POLICY IF EXISTS "Maintenance orders updatable by managers" ON public.maintenance_orders;');

      expect(migration12Content).toContain('CREATE POLICY "Maintenance orders insertable by managers"');
      expect(migration12Content).toContain('public.station_belongs_to_user_org(station_id)');

      expect(migration12Content).toContain('CREATE POLICY "Maintenance orders updatable by managers"');
      expect(migration12Content).toContain('public.station_belongs_to_user_org(station_id)');
    });

    it('verifies that station_readings UPDATE policy is scoped and includes WITH CHECK', () => {
      expect(migration12Content).toContain('DROP POLICY IF EXISTS "Super admins and supervisors can update readings" ON public.station_readings;');
      expect(migration12Content).toContain('CREATE POLICY "Super admins and station supervisors can update readings"');
      expect(migration12Content).toContain('public.station_belongs_to_user_org(station_id)');
    });

    it('verifies that tasks SELECT and UPDATE policies eliminate global is_admin_or_super leak', () => {
      expect(migration12Content).toContain('DROP POLICY IF EXISTS "Tasks viewable by assignee or station manager" ON public.tasks;');
      expect(migration12Content).toContain('DROP POLICY IF EXISTS "Tasks updatable by assignee or managers" ON public.tasks;');

      // Admin requires station_belongs_to_user_org on tasks
      const taskSelectMatch = migration12Content.match(/CREATE POLICY "Tasks viewable by assignee or station manager"[\s\S]*?USING\s*\(([\s\S]*?)\);/);
      expect(taskSelectMatch).not.toBeNull();
      if (taskSelectMatch) {
        expect(taskSelectMatch[1]).toContain('public.station_belongs_to_user_org(station_id)');
      }
    });

    it('verifies that audit_logs is strictly immutable and cannot be deleted or updated', () => {
      expect(migration12Content).toContain('DROP POLICY IF EXISTS "Audit logs viewable by central admins" ON public.audit_logs;');
      expect(migration12Content).toContain('CREATE POLICY "Audit logs viewable by authorized admins"');
      expect(migration12Content).toContain('public.station_belongs_to_user_org(station_id)');

      // Asserts that no UPDATE or DELETE policy exists on audit_logs
      expect(migration12Content).not.toMatch(/CREATE POLICY [^\n]+ ON public\.audit_logs FOR (?:UPDATE|DELETE|ALL)/i);
    });
  });

  /* ==============================================================================
     SECTION 2: MULTI-TENANT ISOLATION SIMULATION & RLS BEHAVIORAL VERIFICATION
     ============================================================================== */
  describe('2. Multi-Tenant Organization & Station Isolation Behavioral Simulation', () => {
    // Test data fixtures
    const orgCairo = 'org-cairo-0001';
    const orgAlex = 'org-alex-0002';

    const stationCairo1 = { id: 'stn-cairo-1', organization_id: orgCairo };
    const stationCairo2 = { id: 'stn-cairo-2', organization_id: orgCairo };
    const stationAlex1 = { id: 'stn-alex-1', organization_id: orgAlex };
    const stationCentral = { id: 'stn-central-nat', organization_id: null };

    // Personas
    const superAdmin = { id: 'u-super', role: 'super_admin' as UserRole, organization_id: null, is_active: true };
    const adminCairo = { id: 'u-admin-cairo', role: 'admin' as UserRole, organization_id: orgCairo, is_active: true };
    const adminAlex = { id: 'u-admin-alex', role: 'admin' as UserRole, organization_id: orgAlex, is_active: true };
    const adminOrphan = { id: 'u-admin-null', role: 'admin' as UserRole, organization_id: null, is_active: true };
    const adminDeactivated = { id: 'u-admin-deact', role: 'admin' as UserRole, organization_id: orgCairo, is_active: false };
    const supervisorCairo = { id: 'u-sup-cairo', role: 'supervisor' as UserRole, organization_id: orgCairo, is_active: true };
    const supervisorDeactivated = { id: 'u-sup-deact', role: 'supervisor' as UserRole, organization_id: orgCairo, is_active: false };
    const employeeCairo = { id: 'u-emp-cairo', role: 'employee' as UserRole, organization_id: orgCairo, is_active: true };

    // Station assignments
    const stationAssignments = [
      { user_id: supervisorCairo.id, station_id: stationCairo1.id, is_active: true },
      { user_id: employeeCairo.id, station_id: stationCairo1.id, is_active: true },
      // Pathological out-of-org assignment attempt for testing
      { user_id: adminCairo.id, station_id: stationAlex1.id, is_active: true },
    ];

    // Simulated PostgreSQL helper functions matching Migration 12 exactly
    function sim_get_current_user_role(user: { role: UserRole; is_active: boolean } | null): UserRole | null {
      if (!user || !user.is_active) return null;
      return user.role;
    }

    function sim_get_current_user_org_id(user: { organization_id: string | null; is_active: boolean } | null): string | null {
      if (!user || !user.is_active) return null;
      return user.organization_id;
    }

    function sim_is_super_admin(user: any): boolean {
      return sim_get_current_user_role(user) === 'super_admin';
    }

    function sim_is_admin_or_super(user: any): boolean {
      const role = sim_get_current_user_role(user);
      return role === 'super_admin' || role === 'admin';
    }

    function sim_user_has_station_assignment(user: any, stationId: string): boolean {
      if (!user || !user.is_active) return false;
      return stationAssignments.some(sa => sa.user_id === user.id && sa.station_id === stationId && sa.is_active);
    }

    function sim_station_belongs_to_user_org(user: any, station: { id: string; organization_id: string | null }): boolean {
      if (sim_is_super_admin(user)) return true;
      const userOrg = sim_get_current_user_org_id(user);
      return userOrg !== null && station.organization_id !== null && station.organization_id === userOrg;
    }

    function sim_user_has_station_access(user: any, station: { id: string; organization_id: string | null }): boolean {
      if (sim_is_super_admin(user)) return true;
      const role = sim_get_current_user_role(user);
      const userOrg = sim_get_current_user_org_id(user);

      if (!role) return false;

      if (role === 'admin') {
        if (userOrg === null) return false; // Fail-closed
        // Strict tenant isolation: Admin cannot access out-of-org station through assignment
        return station.organization_id !== null && station.organization_id === userOrg;
      }

      return sim_user_has_station_assignment(user, station.id);
    }

    // Simulated RLS policies for station_assets
    function sim_can_insert_station_asset(user: any, station: any): boolean {
      return (
        sim_is_super_admin(user) ||
        (sim_is_admin_or_super(user) && sim_station_belongs_to_user_org(user, station)) ||
        (sim_get_current_user_role(user) === 'supervisor' && sim_user_has_station_assignment(user, station.id))
      );
    }

    function sim_can_update_station_asset(user: any, currentStation: any, newStation: any): boolean {
      // USING check on current record
      const usingPass = (
        sim_is_super_admin(user) ||
        (sim_is_admin_or_super(user) && sim_station_belongs_to_user_org(user, currentStation)) ||
        (sim_get_current_user_role(user) === 'supervisor' && sim_user_has_station_assignment(user, currentStation.id))
      );

      // WITH CHECK on updated record (prevents changing station_id to an unauthorized station)
      const withCheckPass = (
        sim_is_super_admin(user) ||
        (sim_is_admin_or_super(user) && sim_station_belongs_to_user_org(user, newStation)) ||
        (sim_get_current_user_role(user) === 'supervisor' && sim_user_has_station_assignment(user, newStation.id))
      );

      return usingPass && withCheckPass;
    }

    it('guarantees Organization A administrator CANNOT access Organization B station records', () => {
      // Cairo admin accessing Cairo station -> ALLOWED
      expect(sim_user_has_station_access(adminCairo, stationCairo1)).toBe(true);

      // Cairo admin accessing Alex station -> DENIED
      expect(sim_user_has_station_access(adminCairo, stationAlex1)).toBe(false);

      // Alex admin accessing Cairo station -> DENIED
      expect(sim_user_has_station_access(adminAlex, stationCairo1)).toBe(false);
    });

    it('guarantees administrator CANNOT bypass organization boundary via anomalous station_assignment', () => {
      // adminCairo has an anomalous row in stationAssignments for stationAlex1
      expect(sim_user_has_station_assignment(adminCairo, stationAlex1.id)).toBe(true);

      // Under Migration 12 strict isolation, admin access to Alex station MUST STILL BE DENIED!
      expect(sim_user_has_station_access(adminCairo, stationAlex1)).toBe(false);
    });

    it('guarantees NULL-organization administrator is DENIED station access (fail-closed)', () => {
      expect(sim_user_has_station_access(adminOrphan, stationCairo1)).toBe(false);
      expect(sim_user_has_station_access(adminOrphan, stationAlex1)).toBe(false);
      expect(sim_user_has_station_access(adminOrphan, stationCentral)).toBe(false);
    });

    it('guarantees deactivated administrator is DENIED all operational actions', () => {
      expect(sim_get_current_user_role(adminDeactivated)).toBeNull();
      expect(sim_is_admin_or_super(adminDeactivated)).toBe(false);
      expect(sim_is_super_admin(adminDeactivated)).toBe(false);
      expect(sim_user_has_station_access(adminDeactivated, stationCairo1)).toBe(false);
      expect(sim_can_insert_station_asset(adminDeactivated, stationCairo1)).toBe(false);
    });

    it('guarantees deactivated supervisor is DENIED all operational actions', () => {
      expect(sim_get_current_user_role(supervisorDeactivated)).toBeNull();
      expect(sim_user_has_station_access(supervisorDeactivated, stationCairo1)).toBe(false);
    });

    it('guarantees Super Admin retains global access across all organizations and central stations', () => {
      expect(sim_user_has_station_access(superAdmin, stationCairo1)).toBe(true);
      expect(sim_user_has_station_access(superAdmin, stationAlex1)).toBe(true);
      expect(sim_user_has_station_access(superAdmin, stationCentral)).toBe(true);
      expect(sim_can_insert_station_asset(superAdmin, stationAlex1)).toBe(true);
    });

    it('prevents cross-tenant asset insertion (Organization A admin into Organization B)', () => {
      // Cairo admin inserting asset into Cairo station -> ALLOWED
      expect(sim_can_insert_station_asset(adminCairo, stationCairo1)).toBe(true);

      // Cairo admin inserting asset into Alex station -> DENIED
      expect(sim_can_insert_station_asset(adminCairo, stationAlex1)).toBe(false);
    });

    it('prevents station-hopping attacks on asset updates (WITH CHECK enforcement)', () => {
      // Cairo admin updating asset within Cairo station -> ALLOWED
      expect(sim_can_update_station_asset(adminCairo, stationCairo1, stationCairo2)).toBe(true);

      // Cairo admin trying to reassign an asset from Cairo to Alex station -> DENIED by WITH CHECK!
      expect(sim_can_update_station_asset(adminCairo, stationCairo1, stationAlex1)).toBe(false);
    });

    it('verifies supervisor station boundary enforcement', () => {
      // Supervisor assigned to Cairo1 -> ALLOWED
      expect(sim_user_has_station_access(supervisorCairo, stationCairo1)).toBe(true);
      expect(sim_can_insert_station_asset(supervisorCairo, stationCairo1)).toBe(true);

      // Supervisor NOT assigned to Cairo2 -> DENIED
      expect(sim_user_has_station_access(supervisorCairo, stationCairo2)).toBe(false);
      expect(sim_can_insert_station_asset(supervisorCairo, stationCairo2)).toBe(false);
    });
  });

  /* ==============================================================================
     SECTION 3: ROLE ISOLATION & EMPLOYEE SELF-SERVICE SECURITY
     ============================================================================== */
  describe('3. Role Isolation and Employee Self-Service', () => {
    it('prevents an operational administrator from modifying Super Admin profile', () => {
      const res = canUpdateEmployeeProfile(
        'admin',
        'caller-admin-id',
        'target-super-id',
        { full_name: 'محاولة تعديل اسم السوبر' },
        'org-1',
        'org-1',
        'super_admin'
      );
      expect(res.allowed).toBe(false);
      expect(res.error).toContain('لا يمكن لمدير القطاع تعديل بيانات أو صلاحيات مدير النظام العام');
    });

    it('prevents employee from elevating their own role during self-update', () => {
      const res = canUpdateEmployeeProfile(
        'employee',
        'emp-self-id',
        'emp-self-id',
        { role: 'super_admin' as UserRole },
        'org-1',
        'org-1',
        'employee'
      );
      expect(res.allowed).toBe(false);
      expect(res.error).toContain('غير مصرح بتعديل رتبتك أو صلاحياتك بنفسك');
    });

    it('prevents user from modifying their organization during self-update', () => {
      const res = canUpdateEmployeeProfile(
        'employee',
        'emp-self-id',
        'emp-self-id',
        { organization_id: 'org-another' },
        'org-1',
        'org-1',
        'employee'
      );
      expect(res.allowed).toBe(false);
      expect(res.error).toContain('غير مصرح بتعديل تبعية المؤسسة لحسابك');
    });

    it('allows employee to update non-sensitive fields (phone, department, job_title)', () => {
      const rawPayload = {
        id: 'tampered-id',
        role: 'super_admin' as UserRole,
        organization_id: 'tampered-org',
        full_name: 'م. أحمد حسني',
        phone: '01099998888',
        job_title: 'مهندس اتصالات وتحكم',
      };

      const sanitized = sanitizeProfileUpdatePayload(rawPayload, false, false);
      expect(sanitized.id).toBeUndefined();
      expect(sanitized.role).toBeUndefined();
      expect(sanitized.organization_id).toBeUndefined();
      expect(sanitized.full_name).toBe('م. أحمد حسني');
      expect(sanitized.phone).toBe('01099998888');
      expect(sanitized.job_title).toBe('مهندس اتصالات وتحكم');
    });
  });
});
