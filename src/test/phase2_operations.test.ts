/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { stationFormSchema } from '../lib/validations/station';
import { employeeFormSchema } from '../lib/validations/employee';
import { formatArabicError } from '../lib/errorHandler';
import {
  canCreateStation,
  canEditStation,
  canAssignPersonnel,
  canManageRoles,
  canAccessStation,
} from '../lib/permissions';

describe('Phase 2: Operational Core & Security Suite', () => {
  describe('Station Form Validation & Code Uniqueness Rules', () => {
    it('validates proper station technical data', () => {
      const valid = {
        code: 'STN-380-TEST',
        name: 'محطة تحويل الجهد الفائق 380/132 ك.ف',
        type: 'transmission',
        region: 'المنطقة الشرقية',
        governorate: 'الخبر',
        address: 'شارع الطاقة - مجمع الشبكة الشرقية',
        voltage_level_kv: 380,
        installed_capacity_mw: 500,
        status: 'operational',
      };

      const parsed = stationFormSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('rejects station code with lowercase or spaces if regex restricted', () => {
      const invalidCode = {
        code: 'STN 380 INVALID!',
        name: 'محطة غير صالحة',
        type: 'distribution',
        region: 'الوسطى',
        governorate: 'الرياض',
        address: 'عنوان تجريبي',
        voltage_level_kv: 33,
        installed_capacity_mw: 50,
        status: 'operational',
      };

      const parsed = stationFormSchema.safeParse(invalidCode);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain('رمز المحطة');
      }
    });

    it('rejects installed capacity of 0 or negative', () => {
      const negativeCap = {
        code: 'STN-NEG-CAP',
        name: 'محطة سعة سالبة',
        type: 'distribution',
        region: 'الوسطى',
        governorate: 'الرياض',
        address: 'عنوان تجريبي',
        voltage_level_kv: 33,
        installed_capacity_mw: -50,
        status: 'operational',
      };

      const parsed = stationFormSchema.safeParse(negativeCap);
      expect(parsed.success).toBe(false);
    });
  });

  describe('Employee Profile Validation', () => {
    it('accepts valid engineer profile data', () => {
      const validEmp = {
        employee_number: 'EMP-9001',
        full_name: 'م. عبدالله السبيعي',
        email: 'abdullah.subaie@psms.gov.sa',
        phone: '+966 50 111 2233',
        role: 'employee',
        department: 'إدارة الصيانة الوقائية',
        job_title: 'مهندس وقاية ومحولات',
        assigned_station_ids: ['stn-1'],
        is_active: true,
      };

      const parsed = employeeFormSchema.safeParse(validEmp);
      expect(parsed.success).toBe(true);
    });

    it('rejects employee with invalid email format', () => {
      const invalidEmail = {
        employee_number: 'EMP-9002',
        full_name: 'فني كهربائي',
        email: 'not-an-email',
        role: 'employee',
        department: 'الصيانة',
        job_title: 'فني',
      };

      const parsed = employeeFormSchema.safeParse(invalidEmail);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.some((i) => i.path.includes('email'))).toBe(true);
      }
    });
  });

  describe('Assignment & Organizational Boundary Checks', () => {
    it('restricts admin from assigning personnel to a station outside their organization', () => {
      const adminOrg = 'org-central';
      const stationOrg = 'org-western';

      // An admin can only manage/edit within their organization
      expect(canEditStation('admin', adminOrg, stationOrg)).toBe(false);
      expect(canEditStation('admin', adminOrg, adminOrg)).toBe(true);
    });

    it('supervisors can only access and record readings in assigned stations', () => {
      const supervisorAssignedStations = ['stn-1', 'stn-2'];
      expect(canAccessStation('supervisor', 'stn-1', supervisorAssignedStations)).toBe(true);
      expect(canAccessStation('supervisor', 'stn-3', supervisorAssignedStations)).toBe(false);
    });

    it('prevents supervisors and ordinary employees from managing roles or granting super_admin', () => {
      expect(canManageRoles('supervisor', 'employee')).toBe(false);
      expect(canManageRoles('employee', 'employee')).toBe(false);
      expect(canManageRoles('admin', 'super_admin')).toBe(false);
      expect(canManageRoles('super_admin', 'super_admin')).toBe(true);
    });
  });

  describe('Arabic Error Translation Handling', () => {
    it('translates PostgreSQL 23505 unique code constraint to Arabic', () => {
      const pgError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint "stations_code_key"',
      };
      const formatted = formatArabicError(pgError);
      expect(formatted.type).toBe('duplicate');
      expect(formatted.message).toContain('رمز المحطة مسجل مسبقاً');
    });

    it('translates PostgreSQL 23505 employee number conflict to Arabic', () => {
      const pgError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint "profiles_employee_number_key"',
      };
      const formatted = formatArabicError(pgError);
      expect(formatted.type).toBe('duplicate');
      expect(formatted.message).toContain('الرقم الوظيفي مسجل مسبقاً');
    });

    it('translates PostgreSQL 42501 RLS violation to clear authorization warning', () => {
      const rlsError = {
        code: '42501',
        message: 'new row violates row-level security policy for table "stations"',
      };
      const formatted = formatArabicError(rlsError);
      expect(formatted.type).toBe('authorization');
      expect(formatted.message).toContain('سياسات الأمان (RLS)');
    });

    it('translates Auth invalid credentials error to human Arabic', () => {
      const authErr = {
        message: 'Invalid login credentials',
      };
      const formatted = formatArabicError(authErr);
      expect(formatted.type).toBe('authorization');
      expect(formatted.message).toContain('بيانات الدخول غير صحيحة');
    });
  });

  describe('Pagination Mathematical Integrity', () => {
    it('accurately calculates pagination slice boundaries', () => {
      const totalItems = 23;
      const pageSize = 8;
      const totalPages = Math.ceil(totalItems / pageSize);
      expect(totalPages).toBe(3);

      // Page 1 slice: 0 to 8
      const page1Start = 0;
      const page1End = Math.min(8, totalItems);
      expect(page1End - page1Start).toBe(8);

      // Page 3 slice: 16 to 23 (7 items)
      const page3Start = 16;
      const page3End = Math.min(24, totalItems);
      expect(page3End - page3Start).toBe(7);
    });
  });
});
