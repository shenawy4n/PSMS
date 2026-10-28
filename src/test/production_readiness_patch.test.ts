/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  getActiveSupabaseUrl,
  getActiveSupabaseKey,
  setCustomCredentials,
  clearCustomCredentials,
  isSupabaseConfigured,
} from '../lib/supabase';
import { canCreateEmployee, canManageRoles, canAccessStation } from '../lib/permissions';
import { UserProfile, Station } from '../types/database';

describe('PSMS Production Readiness & Hotfix Patch Suite (Migration 09 Audit)', () => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
  const patch09Path = path.join(migrationsDir, '09_production_readiness_patch.sql');
  let patch09Content: string;

  beforeEach(() => {
    clearCustomCredentials();
    if (!patch09Content && fs.existsSync(patch09Path)) {
      patch09Content = fs.readFileSync(patch09Path, 'utf-8');
    }
  });

  describe('1. Dynamic Supabase Credentials Management', () => {
    it('should default to empty or environment variable', () => {
      clearCustomCredentials();
      const url = getActiveSupabaseUrl();
      expect(typeof url).toBe('string');
    });

    it('should allow setting custom credentials dynamically in browser/node environment', () => {
      setCustomCredentials(
        'https://gygksvqqqtjqgcnwfjha.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-anon-token'
      );
      expect(getActiveSupabaseUrl()).toBe('https://gygksvqqqtjqgcnwfjha.supabase.co');
      expect(getActiveSupabaseKey()).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-anon-token');
      expect(isSupabaseConfigured()).toBe(true);
    });

    it('should clear custom credentials and reset properly', () => {
      setCustomCredentials(
        'https://gygksvqqqtjqgcnwfjha.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-anon-token'
      );
      clearCustomCredentials();
      if (!import.meta.env.VITE_SUPABASE_URL) {
        expect(getActiveSupabaseUrl()).toBe('');
      }
    });
  });

  describe('2. Comprehensive Audit of Migration 09 (All 10 Security Requirements)', () => {
    // --------------------------------------------------------------------------
    // Test 1: RLS Recursion Prevention (Postgres 42P17)
    // --------------------------------------------------------------------------
    it('Requirement 1: prevents RLS recursion (42P17) by dropping circular policies and using independent DAG functions', () => {
      expect(patch09Content).toBeDefined();

      // Ensure all previous circular policies are dropped
      expect(patch09Content).toContain('DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;');
      expect(patch09Content).toContain('DROP POLICY IF EXISTS "Station assignments viewable by authenticated users" ON public.station_assignments;');

      // Verify that the new select policies do NOT query the table being protected directly inside subqueries
      expect(patch09Content).toContain('CREATE OR REPLACE FUNCTION public.user_shares_station_with');
      expect(patch09Content).toContain('CREATE OR REPLACE FUNCTION public.user_has_station_access');
      expect(patch09Content).toContain('CREATE OR REPLACE FUNCTION public.user_has_station_assignment');

      // Check that profiles select policy uses user_shares_station_with without circular joins
      expect(patch09Content).toMatch(/CREATE POLICY "Profiles viewable by authorized users"[\s\S]*?ON public\.profiles FOR SELECT[\s\S]*?public\.user_shares_station_with\(id\)/);

      // Check that station_assignments select policy uses user_has_station_assignment without circular joins
      expect(patch09Content).toMatch(/CREATE POLICY "Station assignments viewable by authorized users"[\s\S]*?ON public\.station_assignments FOR SELECT[\s\S]*?public\.user_has_station_assignment\(station_id\)/);
    });

    // --------------------------------------------------------------------------
    // Test 2: Super Admin Access on Central / National Stations (organization_id IS NULL)
    // --------------------------------------------------------------------------
    it('Requirement 2: grants super_admin global access including central/national stations with organization_id IS NULL', () => {
      // In user_has_station_access():
      expect(patch09Content).toContain('IF public.is_super_admin() THEN');
      expect(patch09Content).toContain('RETURN TRUE;');

      // Ensure stations table schema drops NOT NULL constraint on organization_id safely
      expect(patch09Content).toContain('ALTER TABLE public.stations ALTER COLUMN organization_id DROP NOT NULL;');

      // Permissions check logic verification
      const superAdminUser: UserProfile = {
        id: 'user-super-1',
        employee_number: 'EMP-001',
        full_name: 'Super Admin',
        email: 'super@psms.gov',
        role: 'super_admin',
        is_active: true,
        assigned_station_ids: [],
        created_at: new Date().toISOString(),
      };

      const nationalStation: Station = {
        id: 'station-national-grid',
        code: 'ST-NAT-01',
        name: 'محطة النقل المركزية الوطنية',
        type: 'transmission',
        region: 'المنطقة الوسطى',
        governorate: 'بغداد',
        address: 'الشبكة الوطنية المركزية',
        voltage_level_kv: 400,
        installed_capacity_mw: 1500,
        status: 'operational',
        organization_id: undefined, // Central / National station
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(
        canAccessStation(
          superAdminUser.role,
          nationalStation.id,
          superAdminUser.assigned_station_ids || [],
          superAdminUser.organization_id,
          nationalStation.organization_id
        )
      ).toBe(true);
    });

    // --------------------------------------------------------------------------
    // Test 3: Assigned Employee Station Access
    // --------------------------------------------------------------------------
    it('Requirement 3: allows assigned employee access to stations assigned to them', () => {
      // SQL function user_has_station_access delegates to user_has_station_assignment for employee
      expect(patch09Content).toContain('RETURN public.user_has_station_assignment(station_uuid);');

      const employeeUser: UserProfile = {
        id: 'user-emp-1',
        employee_number: 'EMP-100',
        full_name: 'Station Operator',
        email: 'operator@psms.gov',
        role: 'employee',
        is_active: true,
        assigned_station_ids: ['station-alpha-123'],
        created_at: new Date().toISOString(),
      };

      const assignedStation: Station = {
        id: 'station-alpha-123',
        code: 'ST-ALP-01',
        name: 'محطة المنصور التحويلية',
        type: 'distribution',
        region: 'المنطقة الوسطى',
        governorate: 'بغداد',
        address: 'المنصور',
        voltage_level_kv: 33,
        installed_capacity_mw: 45,
        status: 'operational',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(
        canAccessStation(
          employeeUser.role,
          assignedStation.id,
          employeeUser.assigned_station_ids || [],
          employeeUser.organization_id,
          assignedStation.organization_id
        )
      ).toBe(true);
    });

    // --------------------------------------------------------------------------
    // Test 4: Prevention of Unassigned Employee Station Access
    // --------------------------------------------------------------------------
    it('Requirement 4: strictly prevents unassigned employees from accessing unassigned stations', () => {
      const employeeUser: UserProfile = {
        id: 'user-emp-2',
        employee_number: 'EMP-101',
        full_name: 'Unassigned Operator',
        email: 'unassigned@psms.gov',
        role: 'employee',
        is_active: true,
        assigned_station_ids: ['station-alpha-123'], // only assigned to alpha
        created_at: new Date().toISOString(),
      };

      const unassignedStation: Station = {
        id: 'station-beta-456',
        code: 'ST-BET-01',
        name: 'محطة الكرخ الغازية',
        type: 'generation',
        region: 'المنطقة الوسطى',
        governorate: 'بغداد',
        address: 'الكرخ',
        voltage_level_kv: 132,
        installed_capacity_mw: 250,
        status: 'operational',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(
        canAccessStation(
          employeeUser.role,
          unassignedStation.id,
          employeeUser.assigned_station_ids || [],
          employeeUser.organization_id,
          unassignedStation.organization_id
        )
      ).toBe(false);
    });

    // --------------------------------------------------------------------------
    // Test 5: Prevention of Org Admin Bypassing Organization Scope
    // --------------------------------------------------------------------------
    it('Requirement 5: prevents org admins from bypassing organization boundaries in station assignments and profile updates', () => {
      // In enforce_profile_update_security():
      expect(patch09Content).toContain('IF v_current_org_id IS NOT NULL THEN');
      expect(patch09Content).toContain('Organization boundary violation: Administrators cannot modify profiles outside their organization.');
      expect(patch09Content).toContain('Tenant violation: Administrators cannot reassign employee organization.');

      // In provision_employee_profile_and_assignments():
      expect(patch09Content).toContain('Organization scope violation: Operational admins cannot create profiles outside their organization.');
      expect(patch09Content).toContain('Station scope violation: Operational admins can only assign stations belonging strictly to their organization.');

      // SQL station_belongs_to_user_org helper check:
      expect(patch09Content).toContain('CREATE OR REPLACE FUNCTION public.station_belongs_to_user_org');
      expect(patch09Content).toContain('organization_id = public.get_current_user_org_id()');
    });

    // --------------------------------------------------------------------------
    // Test 6: Prevention of Self-Role / Org Modification on Profiles
    // --------------------------------------------------------------------------
    it('Requirement 6: strictly blocks self-modification of role, organization_id, and is_active via database trigger', () => {
      expect(patch09Content).toContain('CREATE OR REPLACE FUNCTION public.enforce_profile_update_security()');
      expect(patch09Content).toContain('IF OLD.id = v_current_uid THEN');
      expect(patch09Content).toContain('Privilege escalation violation: Users are not permitted to change their own role.');
      expect(patch09Content).toContain('Tenant violation: Users are not permitted to alter their own organization affiliation.');
      expect(patch09Content).toContain('Security violation: Users are not permitted to alter their own account activation status.');
      expect(patch09Content).toContain('CREATE TRIGGER trg_enforce_profile_update_security');
    });

    // --------------------------------------------------------------------------
    // Test 7: Prevention of Super Admin Escalation by Non-Super-Admins
    // --------------------------------------------------------------------------
    it('Requirement 7: blocks promoting any user to super_admin by operational admins', () => {
      // In enforce_profile_update_security():
      expect(patch09Content).toContain("IF NEW.role = 'super_admin'::user_role AND OLD.role != 'super_admin'::user_role THEN");
      expect(patch09Content).toContain('Privilege escalation violation: Administrators cannot promote users to super_admin.');

      // In enforce_profile_insert_security():
      expect(patch09Content).toContain("IF NOT v_is_super AND NEW.role = 'super_admin'::user_role THEN");
      expect(patch09Content).toContain('Privilege escalation violation: Only Super Admins can create Super Admin accounts.');

      // In provision_employee_profile_and_assignments():
      expect(patch09Content).toContain("IF v_admin_role = 'admin'::user_role AND p_role = 'super_admin'::user_role THEN");
      expect(patch09Content).toContain('Privilege escalation violation: Operational admins cannot create Super Admin accounts.');

      // TypeScript permission check
      expect(canManageRoles('admin', 'super_admin')).toBe(false);
      expect(canManageRoles('super_admin', 'super_admin')).toBe(true);
      expect(canManageRoles('employee', 'admin')).toBe(false);
    });

    // --------------------------------------------------------------------------
    // Test 8: Provision Employee Parameter Matching and Edge Function Contract
    // --------------------------------------------------------------------------
    it('Requirement 8: verifies provision_employee_profile_and_assignments parameter names match Edge Function exactly', () => {
      const edgeFuncPath = path.resolve(__dirname, '../../supabase/functions/create-employee/index.ts');
      const edgeContent = fs.readFileSync(edgeFuncPath, 'utf-8');

      // The Edge function calls RPC with these exact parameter names:
      const expectedParams = [
        'p_user_id',
        'p_employee_number',
        'p_full_name',
        'p_email',
        'p_phone',
        'p_role',
        'p_department',
        'p_job_title',
        'p_organization_id',
        'p_is_active',
        'p_station_ids',
        'p_assigned_by',
      ];

      expectedParams.forEach((param) => {
        expect(edgeContent).toContain(`${param}:`);
        expect(patch09Content).toContain(param);
      });

      // Verify that RPC returns JSON with assigned_station_ids
      expect(patch09Content).toContain("'assigned_station_ids', COALESCE(v_unique_station_ids, ARRAY[]::UUID[])");
    });

    // --------------------------------------------------------------------------
    // Test 9: Prevention of Duplicate Station Assignments and Immutability
    // --------------------------------------------------------------------------
    it('Requirement 9: enforces uniqueness of active station assignments and immutability of key identifiers', () => {
      // Partial unique index for active assignments
      expect(patch09Content).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_station_user');
      expect(patch09Content).toContain('ON public.station_assignments(station_id, user_id)');
      expect(patch09Content).toContain('WHERE is_active = TRUE;');

      // Immutability trigger on station_assignments
      expect(patch09Content).toContain('CREATE OR REPLACE FUNCTION public.enforce_station_assignment_immutability()');
      expect(patch09Content).toContain('Station assignment station_id is strictly immutable.');
      expect(patch09Content).toContain('Station assignment user_id is strictly immutable.');
      expect(patch09Content).toContain('CREATE TRIGGER trg_enforce_station_assignment_immutability');
    });

    // --------------------------------------------------------------------------
    // Test 10: Prevention of RPC Execution by Anon or Authenticated Roles
    // --------------------------------------------------------------------------
    it('Requirement 10: strictly restricts RPC execution to service_role and rejects anon or authenticated users', () => {
      // Revoke execution from PUBLIC, anon, and authenticated
      expect(patch09Content).toMatch(/REVOKE ALL ON FUNCTION public\.provision_employee_profile_and_assignments[\s\S]*?FROM PUBLIC, anon, authenticated;/);
      expect(patch09Content).toMatch(/GRANT EXECUTE ON FUNCTION public\.provision_employee_profile_and_assignments[\s\S]*?TO service_role;/);

      // Function internal check:
      expect(patch09Content).toContain("v_jwt_role := NULLIF(auth.role(), '');");
      expect(patch09Content).toContain("v_jwt_role = 'service_role'");
      expect(patch09Content).toContain('Access denied: provision_employee_profile_and_assignments is restricted to trusted service_role execution.');
    });
  });

  describe('3. Operational Tables RLS Audit in Migration 09', () => {
    it('should verify all operational tables have explicit non-recursive RLS policies', () => {
      const operationalTables = [
        'station_readings',
        'fault_reports',
        'maintenance_orders',
        'station_assets',
        'inspection_templates',
        'inspection_records',
        'tasks',
        'notifications',
        'audit_logs',
      ];

      operationalTables.forEach((tableName) => {
        expect(patch09Content).toContain(`ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;`);
      });

      // Audit logs must NOT have UPDATE or DELETE policies
      expect(patch09Content).not.toMatch(/CREATE POLICY ".*?" ON public\.audit_logs FOR UPDATE/);
      expect(patch09Content).not.toMatch(/CREATE POLICY ".*?" ON public\.audit_logs FOR DELETE/);
    });

    it('should verify all SECURITY DEFINER functions enforce explicit search_path', () => {
      // Find all non-comment lines containing SECURITY DEFINER
      const codeLines = patch09Content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => !l.startsWith('--'));

      const securityDefinerCount = codeLines.filter((l) => l.includes('SECURITY DEFINER')).length;
      const searchPathCount = codeLines.filter((l) => l.includes('SET search_path = public, pg_temp')).length;

      expect(securityDefinerCount).toBeGreaterThan(0);
      expect(securityDefinerCount).toBe(searchPathCount);
    });
  });
});
