/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getRegionByGovernorate,
  toStationDatabasePayload,
  stationFormSchema,
} from '../lib/validations/station';

describe('Station Update & Region Payload Sanitization Suite', () => {
  describe('toStationDatabasePayload Unit Tests', () => {
    it('strips virtual and non-column fields (specifically region) from database payload', () => {
      const formInput = {
        id: 'stn-test-uuid',
        code: 'STN-132-TEST',
        name: 'محطة الاختبار 132 ك.ف',
        type: 'transmission' as const,
        region: 'المنطقة الوسطى', // <--- NON-EXISTENT COLUMN in public.stations!
        organization_name: 'الشركة الوطنية لنقل الكهرباء', // <--- Joined field, not a column
        assigned_personnel_count: 5, // <--- Computed field
        open_faults_count: 2, // <--- Computed field
        current_load_mw: 150.5, // <--- Dynamic load field
        governorate: 'الرياض',
        address: 'طريق الملك فهد، مجمع المحطات 14',
        voltage_level_kv: 132,
        installed_capacity_mw: 200,
        status: 'operational' as const,
        latitude: 24.7136,
        longitude: 46.6753,
        description: 'محطة تجريبية للتحقق من المخطط',
        organization_id: 'org-test-uuid',
      };

      const timestamp = '2026-10-28T12:00:00.000Z';
      const dbPayload = toStationDatabasePayload(formInput, timestamp);

      // Verify that 'region' is strictly NOT in the payload
      expect('region' in dbPayload).toBe(false);
      expect((dbPayload as Record<string, unknown>).region).toBeUndefined();

      // Verify other non-column fields are strictly NOT in the payload
      expect('organization_name' in dbPayload).toBe(false);
      expect('assigned_personnel_count' in dbPayload).toBe(false);
      expect('open_faults_count' in dbPayload).toBe(false);
      expect('current_load_mw' in dbPayload).toBe(false);
      expect('id' in dbPayload).toBe(false);

      // Verify that genuine database columns are correctly present and preserved
      expect(dbPayload.code).toBe('STN-132-TEST');
      expect(dbPayload.name).toBe('محطة الاختبار 132 ك.ف');
      expect(dbPayload.type).toBe('transmission');
      expect(dbPayload.governorate).toBe('الرياض');
      expect(dbPayload.address).toBe('طريق الملك فهد، مجمع المحطات 14');
      expect(dbPayload.voltage_level_kv).toBe(132);
      expect(dbPayload.installed_capacity_mw).toBe(200);
      expect(dbPayload.status).toBe('operational');
      expect(dbPayload.latitude).toBe(24.7136);
      expect(dbPayload.longitude).toBe(46.6753);
      expect(dbPayload.description).toBe('محطة تجريبية للتحقق من المخطط');
      expect(dbPayload.organization_id).toBe('org-test-uuid');
      expect(dbPayload.updated_at).toBe(timestamp);
    });

    it('handles partial updates containing only some fields without injecting region', () => {
      const partialUpdate = {
        name: 'اسم المحطة المحدث',
        region: 'المنطقة الشرقية',
        governorate: 'الدمام',
      };

      const dbPayload = toStationDatabasePayload(partialUpdate);

      expect('region' in dbPayload).toBe(false);
      expect(dbPayload.name).toBe('اسم المحطة المحدث');
      expect(dbPayload.governorate).toBe('الدمام');
      expect(dbPayload.code).toBeUndefined();
      expect(dbPayload.address).toBeUndefined();
    });

    it('sanitizes coordinates and empty organization_id safely', () => {
      const input = {
        latitude: '',
        longitude: 'invalid-num',
        organization_id: '   ',
        region: 'المنطقة الغربية',
      };

      const dbPayload = toStationDatabasePayload(input);

      expect('region' in dbPayload).toBe(false);
      expect(dbPayload.latitude).toBeNull();
      expect(dbPayload.longitude).toBeNull();
      expect(dbPayload.organization_id).toBeNull();
    });
  });

  describe('getRegionByGovernorate Regional Mapping Tests', () => {
    it('correctly maps Saudi governorates to their respective administrative regions', () => {
      // Central Region
      expect(getRegionByGovernorate('الرياض')).toBe('المنطقة الوسطى');
      expect(getRegionByGovernorate('الخرج')).toBe('المنطقة الوسطى');
      expect(getRegionByGovernorate('القصيم - بريدة')).toBe('المنطقة الوسطى');
      expect(getRegionByGovernorate('عنيزة')).toBe('المنطقة الوسطى');

      // Eastern Region
      expect(getRegionByGovernorate('الدمام')).toBe('المنطقة الشرقية');
      expect(getRegionByGovernorate('الخبر')).toBe('المنطقة الشرقية');
      expect(getRegionByGovernorate('الأحساء')).toBe('المنطقة الشرقية');
      expect(getRegionByGovernorate('الجبيل الصناعية')).toBe('المنطقة الشرقية');

      // Western Region
      expect(getRegionByGovernorate('مكة المكرمة')).toBe('المنطقة الغربية');
      expect(getRegionByGovernorate('جدة')).toBe('المنطقة الغربية');
      expect(getRegionByGovernorate('المدينة المنورة')).toBe('المنطقة الغربية');
      expect(getRegionByGovernorate('ينبع')).toBe('المنطقة الغربية');
      expect(getRegionByGovernorate('رابغ')).toBe('المنطقة الغربية');

      // Southern Region
      expect(getRegionByGovernorate('أبها')).toBe('المنطقة الجنوبية');
      expect(getRegionByGovernorate('خميس مشيط')).toBe('المنطقة الجنوبية');
      expect(getRegionByGovernorate('جازان')).toBe('المنطقة الجنوبية');
      expect(getRegionByGovernorate('نجران')).toBe('المنطقة الجنوبية');

      // Northern Region
      expect(getRegionByGovernorate('تبوك')).toBe('المنطقة الشمالية');
      expect(getRegionByGovernorate('سكاكا (الجوف)')).toBe('المنطقة الشمالية');
      expect(getRegionByGovernorate('حائل')).toBe('المنطقة الشمالية');
      expect(getRegionByGovernorate('عرعر')).toBe('المنطقة الشمالية');
    });

    it('returns a safe fallback if governorate is empty or unspecified', () => {
      expect(getRegionByGovernorate('')).toBe('المنطقة الوسطى');
      expect(getRegionByGovernorate(null)).toBe('المنطقة الوسطى');
      expect(getRegionByGovernorate(undefined)).toBe('المنطقة الوسطى');
    });
  });

  describe('Station Form Schema & Location Data Preservation', () => {
    it('validates a complete station form input with all location fields', () => {
      const validStation = {
        code: 'STN-400-WEST-01',
        name: 'محطة توليد رابغ الغازية المركبة',
        type: 'generation' as const,
        region: 'المنطقة الغربية',
        governorate: 'رابغ',
        address: 'الساحل الغربي، مجمع التوليد الحراري',
        voltage_level_kv: 400,
        installed_capacity_mw: 1400,
        status: 'operational' as const,
        latitude: 22.7812,
        longitude: 39.0234,
        description: 'محطة توليد رئيسية',
      };

      const parsed = stationFormSchema.safeParse(validStation);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.governorate).toBe('رابغ');
        expect(parsed.data.address).toBe('الساحل الغربي، مجمع التوليد الحراري');
        expect(parsed.data.region).toBe('المنطقة الغربية');

        // Verify conversion to database payload removes region while preserving location
        const dbPayload = toStationDatabasePayload(parsed.data);
        expect('region' in dbPayload).toBe(false);
        expect(dbPayload.governorate).toBe('رابغ');
        expect(dbPayload.address).toBe('الساحل الغربي، مجمع التوليد الحراري');
        expect(dbPayload.voltage_level_kv).toBe(400);
      }
    });
  });

  describe('Simulated Station Update with Supabase PostgREST Interception', () => {
    it('ensures Supabase update receives ONLY valid database columns', async () => {
      let interceptedPayload: Record<string, unknown> | null = null;
      let interceptedTable: string | null = null;
      let interceptedFilter: string | null = null;

      // Mock Supabase client
      const mockSupabase = {
        from: (tableName: string) => {
          interceptedTable = tableName;
          return {
            update: (payload: Record<string, unknown>) => {
              interceptedPayload = payload;
              return {
                eq: (column: string, val: string) => {
                  interceptedFilter = `${column}=${val}`;
                  // If 'region' is sent, simulate PostgREST schema cache rejection
                  if ('region' in payload) {
                    return Promise.resolve({
                      error: {
                        code: 'PGRST204',
                        message: "Could not find the 'region' column of 'stations' in the schema cache",
                      },
                    });
                  }
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };

      // Payload coming from UI form modal
      const editInput = {
        code: 'STN-132-EAST-01',
        name: 'محطة تحويل الدمام الصناعية',
        type: 'distribution' as const,
        region: 'المنطقة الشرقية', // Virtual/UI field
        governorate: 'الدمام',
        address: 'المدينة الصناعية الثانية',
        voltage_level_kv: 132,
        installed_capacity_mw: 220,
        status: 'under_maintenance' as const,
        organization_name: 'الشركة الشرقية للتوزيع', // Virtual field
      };

      // Sanitize payload as StationContext does
      const dbPayload = toStationDatabasePayload(editInput, '2026-10-28T12:00:00Z');

      const result = await mockSupabase
        .from('stations')
        .update(dbPayload as Record<string, unknown>)
        .eq('id', 'stn-uuid-123');

      expect(result.error).toBeNull();
      expect(interceptedTable).toBe('stations');
      expect(interceptedFilter).toBe('id=stn-uuid-123');
      expect(interceptedPayload).not.toBeNull();
      expect('region' in interceptedPayload!).toBe(false);
      expect('organization_name' in interceptedPayload!).toBe(false);
      expect(interceptedPayload!.governorate).toBe('الدمام');
      expect(interceptedPayload!.address).toBe('المدينة الصناعية الثانية');
    });

    it('confirms PostgREST fails if un-sanitized payload with region is transmitted', async () => {
      const mockSupabase = {
        from: () => ({
          update: (payload: Record<string, unknown>) => ({
            eq: () => {
              if ('region' in payload) {
                return Promise.resolve({
                  error: {
                    code: 'PGRST204',
                    message: "Could not find the 'region' column of 'stations' in the schema cache",
                  },
                });
              }
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };

      const rawUnsanitized = {
        region: 'المنطقة الوسطى',
        governorate: 'الرياض',
      };

      const result = await mockSupabase
        .from()
        .update(rawUnsanitized)
        .eq();

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain("Could not find the 'region' column of 'stations' in the schema cache");
    });
  });
});
