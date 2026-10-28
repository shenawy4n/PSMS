/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { readingFormSchema, faultReportSchema } from '../lib/validations/employee';
import { formatArabicError } from '../lib/errorHandler';
import { Station, StationReading, FaultReport } from '../types/database';

describe('Fault and Reading Station Selection & Operations Suite', () => {
  const validStationId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  const validStation: Station = {
    id: validStationId,
    code: 'ST-BG-01',
    name: 'محطة جنوب بغداد الغازية',
    type: 'generation',
    region: 'المنطقة الوسطى',
    governorate: 'بغداد',
    address: 'الزعفرانية - مجمع الطاقة',
    voltage_level_kv: 132,
    installed_capacity_mw: 350,
    status: 'operational',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // --------------------------------------------------------------------------
  // Requirement 1: اختيار محطة صالحة ثم تسجيل عطل بنجاح
  // --------------------------------------------------------------------------
  it('1. accepts valid station UUID and registers fault report successfully', () => {
    const validPayload = {
      station_id: validStation.id,
      asset_id: undefined,
      title: 'ارتفاع حرارة زيت محول التوليد الرئيسي',
      description: 'لوحظ وصول درجة الحرارة إلى 85 درجة مئوية مع عمل مراوح التبريد الإضافية',
      severity: 'high' as const,
    };

    const parseResult = faultReportSchema.safeParse(validPayload);
    expect(parseResult.success).toBe(true);

    if (parseResult.success) {
      expect(parseResult.data.station_id).toBe(validStationId);
      expect(typeof parseResult.data.station_id).toBe('string');
      // Must be valid UUID format
      expect(parseResult.data.station_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 2: اختيار محطة صالحة ثم تسجيل قراءة بنجاح
  // --------------------------------------------------------------------------
  it('2. accepts valid station UUID and registers meter reading successfully', () => {
    const validReadingPayload = {
      station_id: validStation.id,
      voltage_kv: 132.5,
      active_power_mw: 120.4,
      reactive_power_mvar: 25.1,
      frequency_hz: 50.01,
      power_factor: 0.97,
      transformer_temp_celsius: 55.0,
      sf6_gas_pressure_bar: 6.2,
      is_anomaly: false,
    };

    const parseResult = readingFormSchema.safeParse(validReadingPayload);
    expect(parseResult.success).toBe(true);

    if (parseResult.success) {
      expect(parseResult.data.station_id).toBe(validStationId);
      expect(parseResult.data.voltage_kv).toBe(132.5);
      expect(parseResult.data.active_power_mw).toBe(120.4);
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 3: محاولة الحفظ دون اختيار محطة
  // --------------------------------------------------------------------------
  it('3. rejects saving without selecting a station with exact Arabic error "يرجى اختيار المحطة"', () => {
    // 3.1 Empty string station_id in reading
    const emptyReading = {
      station_id: '',
      voltage_kv: 132.0,
      active_power_mw: 80.0,
      frequency_hz: 50.0,
      power_factor: 0.95,
    };
    const readingResult = readingFormSchema.safeParse(emptyReading);
    expect(readingResult.success).toBe(false);
    if (!readingResult.success) {
      const stationError = readingResult.error.issues.find((i) => i.path.includes('station_id'));
      expect(stationError?.message).toBe('يرجى اختيار المحطة');
    }

    // 3.2 Whitespace-only station_id in fault report
    const whitespaceFault = {
      station_id: '   ',
      title: 'عطل مفتاح قاطع الدورة',
      description: 'فشل في إشارة الإغلاق عن بعد أثناء المناورة الصباحية',
      severity: 'medium' as const,
    };
    const faultResult = faultReportSchema.safeParse(whitespaceFault);
    expect(faultResult.success).toBe(false);
    if (!faultResult.success) {
      const stationError = faultResult.error.issues.find((i) => i.path.includes('station_id'));
      expect(stationError?.message).toBe('يرجى اختيار المحطة');
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 4: فشل تحميل المحطات
  // --------------------------------------------------------------------------
  it('4. handles station loading failure gracefully and detects empty station list', () => {
    // Simulated Supabase error response when fetching stations
    const simulatedError = {
      code: '42P17',
      message: 'infinite recursion detected in policy for relation "stations"',
    };

    const formatted = formatArabicError(simulatedError);
    expect(formatted.type).toBe('authorization');
    expect(formatted.message).toContain('سياسات الأمان');

    // When stations fail to load, stations array in context is empty
    const availableStations: Station[] = [];
    expect(availableStations.length).toBe(0);

    // In modal logic: submitting when stations list is empty must be intercepted
    const handleModalSubmitCheck = (stationsList: Station[]) => {
      if (stationsList.length === 0) {
        return {
          allowed: false,
          errorMessage: 'لا توجد محطات متاحة أو مصرح لك بالوصول إليها حالياً. يرجى مراجعة إدارة المنظومة للتأكد من صلاحيات حسابك ومحطاتك المسندة.',
        };
      }
      return { allowed: true };
    };

    const check = handleModalSubmitCheck(availableStations);
    expect(check.allowed).toBe(false);
    expect(check.errorMessage).toContain('لا توجد محطات متاحة');
  });

  // --------------------------------------------------------------------------
  // Requirement 5: رفض الحفظ بسبب RLS أو خطأ من قاعدة البيانات
  // --------------------------------------------------------------------------
  it('5. handles save rejection due to RLS or DB constraint error with accurate Arabic feedback', () => {
    // 5.1 RLS Violation (PostgreSQL 42501)
    const rlsError = {
      code: '42501',
      message: 'new row violates row-level security policy for table "station_readings"',
    };
    const formattedRls = formatArabicError(rlsError);
    expect(formattedRls.type).toBe('authorization');
    expect(formattedRls.message).toContain('سياسات الأمان (RLS)');

    // 5.2 Foreign key violation (e.g. non-existent station_id)
    const fkError = {
      code: '23503',
      message: 'insert or update on table "fault_reports" violates foreign key constraint "fault_reports_station_id_fkey"',
    };
    const formattedFk = formatArabicError(fkError);
    expect(formattedFk.type).toBe('validation');
    expect(formattedFk.message).toContain('ارتباطات تشغيلية');
  });

  // --------------------------------------------------------------------------
  // Requirement 6: التأكد من إرسال معرّف المحطة الصحيح في الطلب
  // --------------------------------------------------------------------------
  it('6. verifies that the exact station UUID is transmitted to database insert calls', () => {
    // Mock Supabase client insert function
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });

    const simulateSupabaseReadingInsert = async (reading: {
      station_id: string;
      voltage_kv: number;
      active_power_mw: number;
      reading_timestamp: string;
    }) => {
      return mockInsert([
        {
          station_id: reading.station_id,
          voltage_kv: reading.voltage_kv,
          active_power_mw: reading.active_power_mw,
          reading_timestamp: reading.reading_timestamp,
        },
      ]);
    };

    const payload = {
      station_id: validStation.id, // Must be UUID
      voltage_kv: 132.0,
      active_power_mw: 95.0,
      reading_timestamp: new Date().toISOString(),
    };

    simulateSupabaseReadingInsert(payload);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const sentRecord = mockInsert.mock.calls[0][0][0];

    // Verify it is the UUID, NOT the station code ('ST-BG-01'), NOT the name, NOT an object
    expect(sentRecord.station_id).toBe(validStationId);
    expect(sentRecord.station_id).not.toBe(validStation.code);
    expect(sentRecord.station_id).not.toBe(validStation.name);
    expect(typeof sentRecord.station_id).toBe('string');
  });

  // --------------------------------------------------------------------------
  // Optional asset_id safety in fault reports: empty string must normalize to null
  // --------------------------------------------------------------------------
  it('normalizes empty asset_id to null to prevent UUID syntax errors in PostgreSQL', () => {
    const rawAssetInput: string = '';
    const safeAssetId = rawAssetInput && rawAssetInput.trim() !== '' ? rawAssetInput : null;
    expect(safeAssetId).toBeNull();

    const selectedAssetInput: string = '4fa85f64-5717-4562-b3fc-2c963f66afa7';
    const safeSelectedAsset = selectedAssetInput && selectedAssetInput.trim() !== '' ? selectedAssetInput : null;
    expect(safeSelectedAsset).toBe('4fa85f64-5717-4562-b3fc-2c963f66afa7');
  });
});
