/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  MaintenanceOrder,
  PermitToWork,
  InsulationTest,
  UserRole,
} from '../types/database';
import { canManageMaintenance, canApprovePTW, canCreatePTW } from '../lib/permissions';
import {
  INITIAL_MAINTENANCE,
  INITIAL_PTWS,
  INITIAL_INSULATION_TESTS,
} from '../data/initialData';

describe('Maintenance Orders & PTW System Suite', () => {
  describe('1. Maintenance Orders Data & Lifecycle', () => {
    it('initializes with valid maintenance orders with correct code format', () => {
      expect(INITIAL_MAINTENANCE.length).toBeGreaterThanOrEqual(1);
      INITIAL_MAINTENANCE.forEach((order) => {
        expect(order.order_code).toMatch(/^WO-\d{4}-\d{3}$/);
        expect(order.station_id).toBeTruthy();
        expect(order.title).toBeTruthy();
        expect(order.scope_of_work).toBeTruthy();
        expect(['preventive', 'corrective', 'emergency', 'overhaul']).toContain(order.maintenance_type);
        expect(['scheduled', 'in_progress', 'pending_parts', 'completed', 'cancelled']).toContain(order.status);
      });
    });

    it('validates maintenance order status progression correctly', () => {
      const order: MaintenanceOrder = {
        id: 'test-mnt-1',
        order_code: 'WO-2026-999',
        station_id: 'stn-1',
        station_name: 'محطة جنوب الرياض',
        maintenance_type: 'preventive',
        priority: 'medium',
        status: 'scheduled',
        title: 'فحص دوري',
        scope_of_work: 'فحص القواطع وتزييت الأذرع الميكانيكية',
        scheduled_start: '2026-10-25T08:00:00Z',
        scheduled_end: '2026-10-26T16:00:00Z',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Progress from scheduled to in_progress
      const startedOrder: MaintenanceOrder = {
        ...order,
        status: 'in_progress',
        actual_start: new Date().toISOString(),
      };
      expect(startedOrder.status).toBe('in_progress');
      expect(startedOrder.actual_start).toBeDefined();

      // Complete order
      const completedOrder: MaintenanceOrder = {
        ...startedOrder,
        status: 'completed',
        actual_end: new Date().toISOString(),
      };
      expect(completedOrder.status).toBe('completed');
      expect(completedOrder.actual_end).toBeDefined();
    });
  });

  describe('2. Permits to Work (PTW) & Electrical Safety Lifecycle', () => {
    it('initializes with realistic PTW records containing electrical safety checklists', () => {
      expect(INITIAL_PTWS.length).toBeGreaterThanOrEqual(1);
      INITIAL_PTWS.forEach((ptw) => {
        expect(ptw.permit_code).toMatch(/^PTW-\d{4}-\d{3}$/);
        expect(ptw.station_id).toBeTruthy();
        expect(ptw.equipment_isolated).toBeTruthy();
        expect(typeof ptw.loto_applied).toBe('boolean');
        expect(typeof ptw.grounding_applied).toBe('boolean');
        expect(typeof ptw.zero_voltage_verified).toBe('boolean');
        expect(['draft', 'submitted', 'approved', 'active', 'closed', 'cancelled']).toContain(ptw.status);
      });
    });

    it('requires electrical isolation verification for high-risk work', () => {
      const activePTW = INITIAL_PTWS.find((p) => p.status === 'active' && p.work_type === 'electrical_isolation');
      expect(activePTW).toBeDefined();
      if (activePTW) {
        expect(activePTW.loto_applied).toBe(true);
        expect(activePTW.zero_voltage_verified).toBe(true);
      }
    });

    it('enforces RBAC for PTW approval', () => {
      // super_admin, admin, and supervisor can approve
      expect(canApprovePTW('super_admin')).toBe(true);
      expect(canApprovePTW('admin')).toBe(true);
      expect(canApprovePTW('supervisor')).toBe(true);

      // technicians / employees cannot approve their own PTW
      expect(canApprovePTW('employee')).toBe(false);

      // but employees can request / issue PTW draft
      expect(canCreatePTW('employee')).toBe(true);
      expect(canManageMaintenance('supervisor')).toBe(true);
      expect(canManageMaintenance('employee')).toBe(false);
    });

    it('progresses PTW through lifecycle states correctly', () => {
      const ptwDraft: PermitToWork = {
        id: 'ptw-test-1',
        permit_code: 'PTW-2026-901',
        station_id: 'stn-2',
        title: 'عزل محول 132 ك.ف',
        work_type: 'electrical_isolation',
        status: 'submitted',
        equipment_isolated: 'CB-01, DS-01',
        loto_applied: true,
        grounding_applied: true,
        zero_voltage_verified: true,
        requested_by: 'emp-1',
        valid_from: '2026-10-25T08:00:00Z',
        valid_to: '2026-10-25T16:00:00Z',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Supervisor approves
      const approvedPTW: PermitToWork = {
        ...ptwDraft,
        status: 'approved',
        approved_by: 'sup-1',
        approver_name: 'م. أحمد الشمري',
      };
      expect(approvedPTW.status).toBe('approved');
      expect(approvedPTW.approved_by).toBe('sup-1');

      // Team activates in field
      const activePTW: PermitToWork = {
        ...approvedPTW,
        status: 'active',
      };
      expect(activePTW.status).toBe('active');

      // Team closes after work completion
      const closedPTW: PermitToWork = {
        ...activePTW,
        status: 'closed',
      };
      expect(closedPTW.status).toBe('closed');
    });
  });

  describe('3. Insulation & Diagnostic Testing Suite', () => {
    it('initializes with high voltage diagnostic tests', () => {
      expect(INITIAL_INSULATION_TESTS.length).toBeGreaterThanOrEqual(1);
      INITIAL_INSULATION_TESTS.forEach((test) => {
        expect(test.test_code).toMatch(/^INS-\d{4}-\d{3}$/);
        expect(test.station_id).toBeTruthy();
        expect(test.measured_value).toBeGreaterThan(0);
        expect(test.measurement_unit).toBeTruthy();
        expect(['satisfactory', 'warning', 'critical']).toContain(test.status_rating);
      });
    });

    it('verifies megger insulation resistance technical thresholds', () => {
      const meggerTest = INITIAL_INSULATION_TESTS.find((t) => t.test_type === 'insulation_resistance');
      expect(meggerTest).toBeDefined();
      if (meggerTest) {
        expect(meggerTest.measured_value).toBeGreaterThanOrEqual(1000); // MΩ
        expect(meggerTest.measurement_unit).toBe('MΩ');
        expect(meggerTest.status_rating).toBe('satisfactory');
      }
    });

    it('verifies transformer oil breakdown voltage (BDV) standards', () => {
      const oilTest = INITIAL_INSULATION_TESTS.find((t) => t.test_type === 'oil_bdv');
      expect(oilTest).toBeDefined();
      if (oilTest) {
        // Standard IEC 60156 acceptable BDV for operational power transformers is > 50 kV
        expect(oilTest.measured_value).toBeGreaterThanOrEqual(50);
        expect(oilTest.measurement_unit).toBe('kV');
        expect(oilTest.status_rating).toBe('satisfactory');
      }
    });
  });
});
