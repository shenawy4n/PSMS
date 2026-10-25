/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { stationFormSchema } from '../lib/validations/station';
import { readingFormSchema } from '../lib/validations/employee';

describe('Zod Validation Architecture', () => {
  describe('Station Validation Schema', () => {
    it('accepts valid station data', () => {
      const validData = {
        code: 'STN-132-NORTH',
        name: 'محطة تحويل شمال العاصمة 132/33 ك.ف',
        type: 'transmission',
        region: 'المنطقة الوسطى',
        governorate: 'محافظة العاصمة',
        address: 'طريق المطار الدولي - مجمع المحطات 4',
        voltage_level_kv: 132,
        installed_capacity_mw: 150,
        status: 'operational',
        description: 'محطة تحويل رئيسية تغذي شبكة التوزيع الشمالية',
      };

      const result = stationFormSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('rejects invalid station codes with special illegal symbols', () => {
      const invalidData = {
        code: 'STN#123@!',
        name: 'محطة تجريبية',
        type: 'distribution',
        region: 'الوسطى',
        governorate: 'العاصمة',
        address: 'العنوان التجريبي',
        voltage_level_kv: 33,
        installed_capacity_mw: 40,
        status: 'operational',
      };

      const result = stationFormSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('رمز المحطة');
      }
    });

    it('rejects negative or impossible voltage levels', () => {
      const invalidData = {
        code: 'STN-NEG',
        name: 'محطة اختبار',
        type: 'distribution',
        region: 'الوسطى',
        governorate: 'العاصمة',
        address: 'شارع الطاقة',
        voltage_level_kv: -15,
        installed_capacity_mw: 50,
        status: 'operational',
      };

      const result = stationFormSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('Operational Reading Validation Schema', () => {
    it('accepts nominal readings within safe electrical thresholds', () => {
      const validReading = {
        station_id: 'station-uuid-123',
        voltage_kv: 132.4,
        active_power_mw: 95.8,
        reactive_power_mvar: 22.1,
        frequency_hz: 50.02,
        power_factor: 0.96,
        transformer_temp_celsius: 54.2,
        sf6_gas_pressure_bar: 6.1,
        is_anomaly: false,
      };

      const result = readingFormSchema.safeParse(validReading);
      expect(result.success).toBe(true);
    });

    it('rejects electrical frequency outside grid physics limits', () => {
      const outOfRangeReading = {
        station_id: 'station-uuid-123',
        voltage_kv: 132.0,
        active_power_mw: 80,
        frequency_hz: 68.5, // impossible for 50Hz grid
        power_factor: 0.95,
      };

      const result = readingFormSchema.safeParse(outOfRangeReading);
      expect(result.success).toBe(false);
    });
  });
});
