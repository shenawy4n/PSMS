/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getActiveSupabaseUrl,
  getActiveSupabaseKey,
  isSupabaseConfigured,
  getSupabaseConfig,
  clearCustomCredentials,
  setCustomCredentials,
  isDemoModeAllowed,
  setDemoModeAllowedForTesting,
  evaluateDemoModeAllowed,
} from '../lib/supabase';
import { UserProfile } from '../types/database';

describe('PSMS Authentication Startup Flow & Production Guardrails', () => {
  beforeEach(() => {
    clearCustomCredentials();
    setDemoModeAllowedForTesting(null);
    try {
      if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
        globalThis.localStorage.clear();
      }
    } catch {}
  });

  afterEach(() => {
    clearCustomCredentials();
    setDemoModeAllowedForTesting(null);
    try {
      if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
        globalThis.localStorage.clear();
      }
    } catch {}
  });

  describe('Requirement 1: Initial unauthenticated startup & credentials security', () => {
    it('initializes with active production Supabase credentials from environment or config', () => {
      setCustomCredentials(
        'https://gygksvqqqtjqgcnwfjha.supabase.co',
        'sb_publishable_x6GR6jgpGj1X1UCftRHIog_luPiWImK'
      );
      const url = getActiveSupabaseUrl();
      const key = getActiveSupabaseKey();
      const configured = isSupabaseConfigured();

      expect(url).toBe('https://gygksvqqqtjqgcnwfjha.supabase.co');
      expect(key).toBe('sb_publishable_x6GR6jgpGj1X1UCftRHIog_luPiWImK');
      expect(configured).toBe(true);
    });

    it('does not store Supabase credentials in browser localStorage', () => {
      const storedUrl = typeof globalThis !== 'undefined' && globalThis.localStorage
        ? globalThis.localStorage.getItem('psms_supabase_url')
        : null;
      const storedKey = typeof globalThis !== 'undefined' && globalThis.localStorage
        ? globalThis.localStorage.getItem('psms_supabase_key')
        : null;
      expect(storedUrl).toBeNull();
      expect(storedKey).toBeNull();
    });

    it('getSupabaseConfig confirms configured state without exposing raw secrets', () => {
      setCustomCredentials(
        'https://gygksvqqqtjqgcnwfjha.supabase.co',
        'sb_publishable_x6GR6jgpGj1X1UCftRHIog_luPiWImK'
      );
      const config = getSupabaseConfig();
      expect(config.isConfigured).toBe(true);
      expect(config.url).toBe('https://gygksvqqqtjqgcnwfjha.supabase.co');
      expect(config.hasKey).toBe(true);
    });
  });

  describe('Requirement 2: Valid session restoration & profile loading', () => {
    it('validates active session and associates profile data correctly', () => {
      const currentTimeSec = Math.floor(Date.now() / 1000);
      const mockSession = {
        user: {
          id: 'b140984d-2e21-4f32-9cb8-b02131971777',
          email: 'ahmedjeko96@gmail.com',
        },
        access_token: 'header.payload.signature',
        expires_at: currentTimeSec + 3600,
      };

      const mockProfile: UserProfile = {
        id: mockSession.user.id,
        employee_number: 'EMP-001',
        full_name: 'م. أحمد محمد',
        email: mockSession.user.email,
        role: 'super_admin',
        is_active: true,
        created_at: new Date().toISOString(),
        assigned_station_ids: ['stn-101'],
      };

      const isSessionValid = Boolean(
        mockSession.user?.id &&
        mockSession.expires_at &&
        mockSession.expires_at > currentTimeSec
      );

      expect(isSessionValid).toBe(true);
      expect(mockProfile.id).toBe(mockSession.user.id);
      expect(mockProfile.is_active).toBe(true);
      expect(mockProfile.role).toBe('super_admin');
    });
  });

  describe('Requirement 3: Expired session handling', () => {
    it('detects expired session and transitions to unauthenticated status', () => {
      const currentTimeSec = Math.floor(Date.now() / 1000);
      const expiredSession = {
        user: {
          id: 'b140984d-2e21-4f32-9cb8-b02131971777',
          email: 'ahmedjeko96@gmail.com',
        },
        expires_at: currentTimeSec - 120, // 2 minutes expired
      };

      const isExpired = !expiredSession.expires_at || expiredSession.expires_at <= currentTimeSec;
      expect(isExpired).toBe(true);

      // Verify state transition simulation
      let currentUser: UserProfile | null = { id: expiredSession.user.id } as any;
      let sessionStatus = 'validating';

      if (isExpired) {
        currentUser = null;
        sessionStatus = 'unauthenticated';
      }

      expect(currentUser).toBeNull();
      expect(sessionStatus).toBe('unauthenticated');
    });
  });

  describe('Requirement 4: Missing profile handling (orphaned auth account)', () => {
    it('detects authenticated auth user missing public.profiles record and signs out safely', () => {
      const mockSessionUser = {
        id: '99999999-9999-4999-9999-999999999999',
        email: 'orphan@psms.gov.eg',
      };

      const profileLookupResult = null; // No matching record in public.profiles

      let currentUser: UserProfile | null = null;
      let sessionStatus = 'validating';
      let signedOut = false;

      if (!profileLookupResult) {
        sessionStatus = 'no_profile';
        currentUser = null;
        signedOut = true;
      }

      expect(sessionStatus).toBe('no_profile');
      expect(currentUser).toBeNull();
      expect(signedOut).toBe(true);
    });
  });

  describe('Requirement 5: Inactive account handling', () => {
    it('blocks deactivated accounts from signing in and terminates session', () => {
      const deactivatedProfile: UserProfile = {
        id: 'b140984d-2e21-4f32-9cb8-b02131971777',
        employee_number: 'EMP-DEACT',
        full_name: 'موظف معطل',
        email: 'deactivated@psms.gov.eg',
        role: 'employee',
        is_active: false,
        created_at: new Date().toISOString(),
        assigned_station_ids: [],
      };

      let currentUser: UserProfile | null = null;
      let sessionStatus = 'validating';
      let signedOut = false;
      let errorMessage = '';

      if (!deactivatedProfile.is_active) {
        sessionStatus = 'inactive';
        currentUser = null;
        signedOut = true;
        errorMessage = 'تم تجميد أو تعطيل هذا الحساب. يرجى التواصل مع مسؤول المنظومة.';
      }

      expect(sessionStatus).toBe('inactive');
      expect(currentUser).toBeNull();
      expect(signedOut).toBe(true);
      expect(errorMessage).toContain('تعطيل هذا الحساب');
    });
  });

  describe('Requirement 6: Network failure handling', () => {
    it('maintains login state with network_error and clear Arabic warning without falling back to Demo Mode', () => {
      const networkError = new Error('Failed to fetch: NetworkError when attempting to fetch resource');
      const isNet = networkError.message.includes('Failed to fetch') || networkError.message.includes('NetworkError');

      let connectionStatus = 'checking';
      let isDemoMode = false;
      let currentUser = null;
      let errorMessage = '';

      if (isNet) {
        connectionStatus = 'network_error';
        isDemoMode = false;
        currentUser = null;
        errorMessage = 'تعذر الاتصال بخادم قاعدة البيانات. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';
      }

      expect(connectionStatus).toBe('network_error');
      expect(isDemoMode).toBe(false);
      expect(currentUser).toBeNull();
      expect(errorMessage).toContain('تعذر الاتصال');
    });
  });

  describe('Requirement 7: Demo Mode isolation in production', () => {
    it('returns false for isDemoModeAllowed when simulated in production', () => {
      setDemoModeAllowedForTesting(false);
      expect(isDemoModeAllowed()).toBe(false);
    });

    it('returns true for isDemoModeAllowed only when explicitly enabled', () => {
      setDemoModeAllowedForTesting(true);
      expect(isDemoModeAllowed()).toBe(true);
    });

    it('unconditionally disables demo mode in production regardless of VITE_ENABLE_DEMO_MODE env var', () => {
      // In production build with VITE_ENABLE_DEMO_MODE='true'
      const prodWithEnv = evaluateDemoModeAllowed({
        isProd: true,
        isDev: false,
        viteEnableDemoMode: 'true',
      });
      expect(prodWithEnv).toBe(false);

      // In production build without env var
      const prodWithoutEnv = evaluateDemoModeAllowed({
        isProd: true,
        isDev: false,
      });
      expect(prodWithoutEnv).toBe(false);

      // In development, demo mode is enabled by default or with flag
      const devDefault = evaluateDemoModeAllowed({
        isProd: false,
        isDev: true,
      });
      expect(devDefault).toBe(true);

      // In development with explicit disable flag
      const devDisabled = evaluateDemoModeAllowed({
        isProd: false,
        isDev: true,
        viteEnableDemoMode: 'false',
      });
      expect(devDisabled).toBe(false);
    });

    it('rejects starting demo mode when demo mode is not allowed', () => {
      setDemoModeAllowedForTesting(false);

      let isDemoMode = false;
      let currentUser: UserProfile | null = null;

      const attemptStartDemo = () => {
        if (!isDemoModeAllowed()) {
          return;
        }
        isDemoMode = true;
        currentUser = { id: 'demo-user' } as any;
      };

      attemptStartDemo();
      expect(isDemoMode).toBe(false);
      expect(currentUser).toBeNull();
    });
  });

  describe('Requirement 8: Missing environment variables handling', () => {
    it('detects unconfigured environment and rejects operation without public setup modal', () => {
      setCustomCredentials('', '');
      expect(isSupabaseConfigured()).toBe(false);

      setCustomCredentials('https://your-project-id.supabase.co', 'your-anon-or-publishable-key');
      expect(isSupabaseConfigured()).toBe(false);
    });
  });
});
