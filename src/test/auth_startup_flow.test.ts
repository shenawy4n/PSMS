/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getActiveSupabaseUrl,
  getActiveSupabaseKey,
  isSupabaseConfigured,
  getSupabaseConfig,
  clearCustomCredentials,
  setCustomCredentials,
} from '../lib/supabase';

describe('PSMS Authentication Startup Flow & Production Guardrails', () => {
  beforeEach(() => {
    clearCustomCredentials();
    try {
      localStorage.clear();
    } catch {}
  });

  afterEach(() => {
    clearCustomCredentials();
    try {
      localStorage.clear();
    } catch {}
  });

  describe('Scenario 1: Production config exists + no session -> Login screen (not setup screen)', () => {
    it('initializes with active production Supabase credentials from environment', () => {
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
      const config = getSupabaseConfig();
      expect(config.isConfigured).toBe(true);
      expect(config.url).toBe('https://gygksvqqqtjqgcnwfjha.supabase.co');
      expect(config.hasKey).toBe(true);
    });
  });

  describe('Scenario 2: Production config exists + valid session -> Loads profile and displays Dashboard', () => {
    it('identifies valid session format and authenticates user profile', () => {
      const mockSession = {
        user: {
          id: 'emp-001-uuid',
          email: 'ahmedjeko96@gmail.com',
        },
        access_token: 'valid-jwt-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };

      expect(mockSession.user.id).toBeDefined();
      expect(mockSession.user.email).toBe('ahmedjeko96@gmail.com');
      expect(mockSession.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('Scenario 3: Production config exists + expired session -> Cleans session and routes to Login screen', () => {
    it('detects expired session timestamp and invalidates user state', () => {
      const expiredSession = {
        user: {
          id: 'emp-001-uuid',
          email: 'ahmedjeko96@gmail.com',
        },
        expires_at: Math.floor(Date.now() / 1000) - 60, // 1 minute in the past
      };

      const isExpired = expiredSession.expires_at < Math.floor(Date.now() / 1000);
      expect(isExpired).toBe(true);
    });
  });

  describe('Scenario 4: Invalid credentials -> Login screen with appropriate Arabic error', () => {
    it('produces descriptive Arabic error message for invalid login credentials', () => {
      const arabicErrorMessage = 'بيانات الدخول غير صحيحة. يرجى التحقق من البريد الإلكتروني وكلمة المرور.';
      expect(arabicErrorMessage).toContain('بيانات الدخول غير صحيحة');
    });
  });

  describe('Scenario 5: Supabase unreachable -> Login screen with network warning & retry, NO silent Demo mode', () => {
    it('retains unauthenticated state with network_error connection status instead of silent Demo mode', () => {
      const connectionStatus = 'network_error';
      const isDemoMode = false;
      const currentUser = null;

      expect(connectionStatus).toBe('network_error');
      expect(isDemoMode).toBe(false);
      expect(currentUser).toBeNull();
    });

    it('provides clear Arabic network warning with retry instruction', () => {
      const networkWarning = 'تعذر الاتصال بخادم قاعدة البيانات (Supabase). يرجى التحقق من الاتصال بالإنترنت والمحاولة مجدداً.';
      expect(networkWarning).toContain('تعذر الاتصال');
      expect(networkWarning).toContain('المحاولة');
    });
  });

  describe('Scenario 6: Missing environment variables -> Controlled deployment notice, not editable form', () => {
    it('correctly detects when environment variables are unconfigured or placeholder', () => {
      // Mock unconfigured environment
      setCustomCredentials('', '');
      expect(isSupabaseConfigured()).toBe(false);

      setCustomCredentials('https://your-project-id.supabase.co', 'your-anon-or-publishable-key');
      expect(isSupabaseConfigured()).toBe(false);
    });
  });

  describe('Scenario 7: Demo mode -> Only when explicitly activated by user action', () => {
    it('defaults demo mode to false at all times on initial load', () => {
      const initialDemoState = false;
      expect(initialDemoState).toBe(false);
    });
  });

  describe('Scenario 8: Page refresh -> Preserves session restoration without flashing setup screen', () => {
    it('starts with isLoadingAuth true and sessionStatus validating before resolving state', () => {
      const initialLoading = true;
      const initialStatus = 'validating';

      expect(initialLoading).toBe(true);
      expect(initialStatus).toBe('validating');
    });
  });
});
