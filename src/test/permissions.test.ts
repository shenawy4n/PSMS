/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  canCreateStation,
  canEditStation,
  canDeleteStation,
  canAssignPersonnel,
  canManageRoles,
  canViewAuditLogs,
  canAccessStation,
  canSubmitReadings,
  getRoleArabicLabel,
  getStationStatusInfo
} from '../lib/permissions';

describe('Role-Based Authorization Architecture', () => {
  describe('Station Creation & Deletion', () => {
    it('allows super_admin and admin to create stations', () => {
      expect(canCreateStation('super_admin')).toBe(true);
      expect(canCreateStation('admin')).toBe(true);
      expect(canCreateStation('supervisor')).toBe(false);
      expect(canCreateStation('employee')).toBe(false);
    });

    it('only allows super_admin to delete stations', () => {
      expect(canDeleteStation('super_admin')).toBe(true);
      expect(canDeleteStation('admin')).toBe(false);
      expect(canDeleteStation('supervisor')).toBe(false);
      expect(canDeleteStation('employee')).toBe(false);
    });
  });

  describe('Station Editing & Scoping', () => {
    it('allows super_admin to edit any station across organizations', () => {
      expect(canEditStation('super_admin', 'org-1', 'org-2')).toBe(true);
    });

    it('restricts admin to stations within their own organization', () => {
      expect(canEditStation('admin', 'org-1', 'org-1')).toBe(true);
      expect(canEditStation('admin', 'org-1', 'org-2')).toBe(false);
    });

    it('forbids supervisor and employee from changing core station data', () => {
      expect(canEditStation('supervisor', 'org-1', 'org-1')).toBe(false);
      expect(canEditStation('employee', 'org-1', 'org-1')).toBe(false);
    });
  });

  describe('Personnel Assignment & Role Management', () => {
    it('allows super_admin, admin, and supervisor to assign personnel to stations', () => {
      expect(canAssignPersonnel('super_admin')).toBe(true);
      expect(canAssignPersonnel('admin')).toBe(true);
      expect(canAssignPersonnel('supervisor')).toBe(true);
      expect(canAssignPersonnel('employee')).toBe(false);
    });

    it('prevents admin from creating or promoting super_admin accounts', () => {
      expect(canManageRoles('admin', 'super_admin')).toBe(false);
      expect(canManageRoles('admin', 'supervisor')).toBe(true);
      expect(canManageRoles('admin', 'employee')).toBe(true);
      expect(canManageRoles('super_admin', 'super_admin')).toBe(true);
      expect(canManageRoles('supervisor', 'employee')).toBe(false);
    });
  });

  describe('Station Access Scope', () => {
    it('allows super_admin to access all stations regardless of assignments', () => {
      expect(canAccessStation('super_admin', 'stn-99', [])).toBe(true);
    });

    it('restricts employees strictly to assigned stations', () => {
      expect(canAccessStation('employee', 'stn-1', ['stn-1', 'stn-2'])).toBe(true);
      expect(canAccessStation('employee', 'stn-3', ['stn-1', 'stn-2'])).toBe(false);
    });

    it('enforces reading submission only on assigned stations for employees', () => {
      expect(canSubmitReadings('employee', 'stn-1', ['stn-1'])).toBe(true);
      expect(canSubmitReadings('employee', 'stn-2', ['stn-1'])).toBe(false);
    });
  });

  describe('Audit Log Access', () => {
    it('only permits super_admin and admin to review audit logs', () => {
      expect(canViewAuditLogs('super_admin')).toBe(true);
      expect(canViewAuditLogs('admin')).toBe(true);
      expect(canViewAuditLogs('supervisor')).toBe(false);
      expect(canViewAuditLogs('employee')).toBe(false);
    });
  });

  describe('Arabic Representation', () => {
    it('correctly maps roles and statuses to standard Arabic labels', () => {
      expect(getRoleArabicLabel('super_admin')).toBe('مدير النظام العام');
      expect(getRoleArabicLabel('employee')).toBe('مهندس / فني تشغيل');
      expect(getStationStatusInfo('operational').label).toBe('تشغيلية');
      expect(getStationStatusInfo('under_maintenance').label).toBe('تحت الصيانة');
    });
  });
});
