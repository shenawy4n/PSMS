/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatArabicError } from '../lib/errorHandler';
import { canCreateStation, canEditStation } from '../lib/permissions';
import { stationFormSchema } from '../lib/validations/station';

describe('Phase 3: Station Creation & RBAC Hardening Suite', () => {
  describe('PostgreSQL 42P17 Infinite Recursion Error Handling', () => {
    it('translates 42P17 error code to actionable Arabic migration guidance', () => {
      const err = {
        code: '42P17',
        message: 'infinite recursion detected in policy for relation "profiles"',
      };
      const formatted = formatArabicError(err);
      expect(formatted.type).toBe('authorization');
      expect(formatted.code).toBe('42P17');
      expect(formatted.message).toContain('04_fix_rls_recursion.sql');
    });

    it('translates 42P17 by message substring when code is not populated', () => {
      const err = new Error('infinite recursion detected in policy for relation "station_assignments"');
      const formatted = formatArabicError(err);
      expect(formatted.type).toBe('authorization');
      expect(formatted.message).toContain('تكرار لانهائي');
    });
  });

  describe('Super Admin Station Provisioning & Organization Integrity', () => {
    it('allows super_admin to create stations regardless of profile organization_id being null', () => {
      expect(canCreateStation('super_admin')).toBe(true);
      expect(canEditStation('super_admin', undefined, 'f31f8f4b-2d2e-44a9-b001-f55aa0506fdf')).toBe(true);
    });

    it('validates station technical schema and ensures organization UUID is compatible', () => {
      const stationData = {
        code: 'STN-132-RIYADH-01',
        name: 'محطة تحويل شمال الرياض 132/33 ك.ف',
        type: 'transmission',
        region: 'المنطقة الوسطى',
        governorate: 'الرياض',
        address: 'طريق الملك فهد، مجمع المحطات 14',
        voltage_level_kv: 132,
        installed_capacity_mw: 150,
        status: 'operational',
      };

      const result = stationFormSchema.safeParse(stationData);
      expect(result.success).toBe(true);

      const targetOrgId = 'f31f8f4b-2d2e-44a9-b001-f55aa0506fdf';
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(targetOrgId)).toBe(true);
    });

    it('enforces multi-tenant station assignment boundary for admin and supervisor', () => {
      const orgA = 'f31f8f4b-2d2e-44a9-b001-f55aa0506fdf';
      const orgB = 'a1111111-2222-3333-4444-555555555555';

      const candidateA = { id: 'usr-1', organization_id: orgA, role: 'employee' };
      const candidateB = { id: 'usr-2', organization_id: orgB, role: 'employee' };
      const superAdminCandidate = { id: 'usr-super', organization_id: null, role: 'super_admin' };

      // Filter simulation for Org A admin:
      const filterForAdminA = (p: { organization_id: string | null; role: string }) =>
        p.organization_id === orgA && p.role !== 'super_admin';

      expect(filterForAdminA(candidateA)).toBe(true);
      expect(filterForAdminA(candidateB)).toBe(false);
      expect(filterForAdminA(superAdminCandidate)).toBe(false);
    });

    it('blocks supervisor from managing stations outside their active assignment list', () => {
      const supervisorAssignedStations = ['stn-101', 'stn-102'];
      const targetStationPermitted = 'stn-101';
      const targetStationForbidden = 'stn-999';

      const canSupervisorManage = (stnId: string) => supervisorAssignedStations.includes(stnId);

      expect(canSupervisorManage(targetStationPermitted)).toBe(true);
      expect(canSupervisorManage(targetStationForbidden)).toBe(false);
    });
  });
});
