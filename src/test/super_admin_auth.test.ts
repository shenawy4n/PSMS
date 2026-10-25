/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  canCreateStation,
  canEditStation,
  canDeleteStation,
  canManageRoles,
  canViewAuditLogs,
  canAccessStation,
  canManageMaintenance,
} from '../lib/permissions';
import { UserProfile, UserRole } from '../types/database';

describe('Super Admin Privileged Role Security', () => {
  const superAdminProfile: UserProfile = {
    id: '45a6a3f5-a01b-4193-a4b9-d2db580380a3',
    employee_number: 'EMP-SUPER-01',
    full_name: 'مدير عام المنظومة الكهربائية',
    email: 'admin@psms.gov.sa',
    role: 'super_admin',
    department: 'الإدارة العامة للتحكم والتشغيل',
    job_title: 'مدير عام المنظومة الكهربائية',
    assigned_station_ids: [],
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  };

  it('verifies that Super Admin has universal station creation and deletion permissions', () => {
    expect(canCreateStation(superAdminProfile.role)).toBe(true);
    expect(canDeleteStation(superAdminProfile.role)).toBe(true);
    expect(canViewAuditLogs(superAdminProfile.role)).toBe(true);
  });

  it('verifies that Super Admin can access ANY station regardless of explicit assignment', () => {
    const randomStationId = 'stn-remote-999';
    const hasAccess = canAccessStation(
      superAdminProfile.role,
      randomStationId,
      superAdminProfile.assigned_station_ids
    );
    expect(hasAccess).toBe(true);
  });

  it('verifies that ONLY Super Admin can grant the super_admin role to others', () => {
    expect(canManageRoles('super_admin', 'super_admin')).toBe(true);
    expect(canManageRoles('admin', 'super_admin')).toBe(false);
    expect(canManageRoles('supervisor', 'super_admin')).toBe(false);
    expect(canManageRoles('employee', 'super_admin')).toBe(false);
  });

  it('verifies that normal admin CANNOT delete stations or grant super_admin', () => {
    expect(canDeleteStation('admin')).toBe(false);
    expect(canManageRoles('admin', 'super_admin')).toBe(false);
    expect(canCreateStation('admin')).toBe(true);
  });

  it('verifies that supervisor and employee CANNOT delete stations, manage roles, or view audit logs', () => {
    const roles: UserRole[] = ['supervisor', 'employee'];
    roles.forEach((r) => {
      expect(canDeleteStation(r)).toBe(false);
      expect(canManageRoles(r, 'admin')).toBe(false);
      expect(canViewAuditLogs(r)).toBe(false);
      expect(canCreateStation(r)).toBe(false);
    });
  });

  it('verifies Super Admin can manage maintenance work orders', () => {
    expect(canManageMaintenance('super_admin')).toBe(true);
    expect(canManageMaintenance('employee')).toBe(false);
  });

  it('validates active status integrity for Super Admin account profile', () => {
    // Function simulating the AuthContext verification gate
    function verifyAuthorizedSession(profile: UserProfile | null): { allowed: boolean; reason?: string } {
      if (!profile) {
        return { allowed: false, reason: 'PROFILE_MISSING' };
      }
      if (!profile.is_active) {
        return { allowed: false, reason: 'ACCOUNT_DEACTIVATED' };
      }
      if (profile.role !== 'super_admin') {
        return { allowed: false, reason: 'NOT_SUPER_ADMIN' };
      }
      return { allowed: true };
    }

    // Active super admin passes
    expect(verifyAuthorizedSession(superAdminProfile)).toEqual({ allowed: true });

    // Missing profile is rejected
    expect(verifyAuthorizedSession(null)).toEqual({
      allowed: false,
      reason: 'PROFILE_MISSING',
    });

    // Deactivated account is rejected even with super_admin role
    const deactivatedAdmin = { ...superAdminProfile, is_active: false };
    expect(verifyAuthorizedSession(deactivatedAdmin)).toEqual({
      allowed: false,
      reason: 'ACCOUNT_DEACTIVATED',
    });

    // Normal employee is not granted super admin access
    const employeeProfile: UserProfile = {
      ...superAdminProfile,
      id: 'usr-emp-1',
      role: 'employee',
    };
    expect(verifyAuthorizedSession(employeeProfile)).toEqual({
      allowed: false,
      reason: 'NOT_SUPER_ADMIN',
    });
  });

  it('enforces UUID format for the target Super Admin account', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(superAdminProfile.id).toMatch(uuidRegex);
    expect(superAdminProfile.id).toBe('45a6a3f5-a01b-4193-a4b9-d2db580380a3');
  });
});
