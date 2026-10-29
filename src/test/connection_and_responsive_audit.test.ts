/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  validateSupabaseUrl,
  validateSupabaseKey,
} from '../lib/supabase';

describe('Supabase Connection & Credentials Diagnostics', () => {
  describe('validateSupabaseUrl', () => {
    it('rejects empty or whitespace-only URLs', () => {
      expect(validateSupabaseUrl('').isValid).toBe(false);
      expect(validateSupabaseUrl('   ').isValid).toBe(false);
    });

    it('rejects URLs without HTTPS protocol', () => {
      const res = validateSupabaseUrl('http://gygksvqqqtjqgcnwfjha.supabase.co');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('https://');
    });

    it('rejects invalid or malformed URL strings', () => {
      const res = validateSupabaseUrl('not-a-valid-url');
      expect(res.isValid).toBe(false);
    });

    it('accepts legitimate Supabase project URLs', () => {
      const res = validateSupabaseUrl('https://gygksvqqqtjqgcnwfjha.supabase.co');
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('accepts legitimate custom domains and localhost for local testing', () => {
      expect(validateSupabaseUrl('http://localhost:54321').isValid).toBe(true);
      expect(validateSupabaseUrl('https://psms-db.my-company.com').isValid).toBe(true);
    });
  });

  describe('validateSupabaseKey', () => {
    it('rejects empty or whitespace keys', () => {
      expect(validateSupabaseKey('').isValid).toBe(false);
      expect(validateSupabaseKey('   ').isValid).toBe(false);
    });

    it('rejects trivially short keys', () => {
      const res = validateSupabaseKey('short_key_123');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('طول المفتاح');
    });

    it('flags and strictly blocks service_role keys on client side', () => {
      // Simulating a JWT payload with role: service_role
      // Base64 for {"role":"service_role"} is eyJyb2xlIjoic2VydmljZV9yb2xlIn0
      const serviceRoleSimulated = `eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.${'a'.repeat(40)}`;
      const res = validateSupabaseKey(serviceRoleSimulated);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('service_role');
      expect(res.error).toContain('أمني');
    });

    it('accepts legitimate anon JWT keys', () => {
      // Base64 for {"role":"anon"} is eyJyb2xlIjoiYW5vbiJ9
      const anonSimulated = `eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.${'b'.repeat(40)}`;
      const res = validateSupabaseKey(anonSimulated);
      expect(res.isValid).toBe(true);
    });
  });
});

describe('Role Navigation Visibility Matrix', () => {
  const navigationItems = [
    { id: 'dashboard', minRole: 'employee' },
    { id: 'stations', minRole: 'employee' },
    { id: 'assets', minRole: 'employee' },
    { id: 'readings', minRole: 'employee' },
    { id: 'faults', minRole: 'employee' },
    { id: 'maintenance', minRole: 'employee' },
    { id: 'inspections', minRole: 'employee' },
    { id: 'tasks', minRole: 'employee' },
    { id: 'employees', minRole: 'supervisor' },
    { id: 'reports', minRole: 'supervisor' },
    { id: 'notifications', minRole: 'employee' },
    { id: 'audit', minRole: 'admin' },
    { id: 'settings', minRole: 'super_admin' },
  ];

  const filterNavByRole = (role: string) => {
    return navigationItems.filter((item) => {
      if (role === 'super_admin') return true;
      if (role === 'admin') return item.minRole !== 'super_admin';
      if (role === 'supervisor') return item.minRole === 'employee' || item.minRole === 'supervisor';
      return item.minRole === 'employee';
    });
  };

  it('super_admin has full access to all 13 modules including settings and audit', () => {
    const visible = filterNavByRole('super_admin');
    expect(visible.length).toBe(13);
    expect(visible.some((i) => i.id === 'settings')).toBe(true);
    expect(visible.some((i) => i.id === 'audit')).toBe(true);
  });

  it('admin has access to 12 modules (all except system settings)', () => {
    const visible = filterNavByRole('admin');
    expect(visible.length).toBe(12);
    expect(visible.some((i) => i.id === 'audit')).toBe(true);
    expect(visible.some((i) => i.id === 'settings')).toBe(false);
  });

  it('supervisor has access to 11 modules (all operational + employees + reports, but not audit or settings)', () => {
    const visible = filterNavByRole('supervisor');
    expect(visible.length).toBe(11);
    expect(visible.some((i) => i.id === 'employees')).toBe(true);
    expect(visible.some((i) => i.id === 'reports')).toBe(true);
    expect(visible.some((i) => i.id === 'audit')).toBe(false);
    expect(visible.some((i) => i.id === 'settings')).toBe(false);
  });

  it('employee has access strictly to 9 operational and notification modules', () => {
    const visible = filterNavByRole('employee');
    expect(visible.length).toBe(9);
    expect(visible.some((i) => i.id === 'employees')).toBe(false);
    expect(visible.some((i) => i.id === 'reports')).toBe(false);
    expect(visible.some((i) => i.id === 'audit')).toBe(false);
    expect(visible.some((i) => i.id === 'settings')).toBe(false);
  });
});
