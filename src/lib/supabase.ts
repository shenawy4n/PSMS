/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const memoryStorage = new Map<string, string>();

function getStorageItem(key: string): string | null {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage.getItem(key);
    }
  } catch {}
  return memoryStorage.get(key) || null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.setItem(key, value);
      return;
    }
  } catch {}
  memoryStorage.set(key, value);
}

function removeStorageItem(key: string): void {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.removeItem(key);
    }
  } catch {}
  memoryStorage.delete(key);
}

// Read from Vite environment variables or dynamic local storage for easy zero-restart setup
export function getActiveSupabaseUrl(): string {
  const custom = getStorageItem('psms_supabase_url');
  if (custom && custom.trim() && !custom.includes('your-project-id')) {
    return custom.trim();
  }
  return (import.meta.env.VITE_SUPABASE_URL || '').trim();
}

export function getActiveSupabaseKey(): string {
  const custom = getStorageItem('psms_supabase_key');
  if (custom && custom.trim() && !custom.includes('your-anon-or-publishable-key')) {
    return custom.trim();
  }
  return (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();
}

// Verify whether valid credentials have been supplied
export function isSupabaseConfigured(): boolean {
  const url = getActiveSupabaseUrl();
  const key = getActiveSupabaseKey();
  if (!url || !key) {
    return false;
  }
  // Check if it's still the default template placeholder
  if (
    url.includes('your-project-id') ||
    url.includes('MY_APP_URL') ||
    key.includes('your-anon-or-publishable-key')
  ) {
    return false;
  }
  return true;
}

/**
 * Validates Supabase project URL format
 */
export function validateSupabaseUrl(url: string): { isValid: boolean; error?: string } {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'رابط مشروع Supabase مطلوب.' };
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return { isValid: false, error: 'يجب أن يبدأ الرابط بـ https://' };
  }
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname || parsed.hostname.length < 4) {
      return { isValid: false, error: 'اسم النطاق (Host) في الرابط غير صحيح.' };
    }
    // Remote Supabase projects must use secure HTTPS
    if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      return { isValid: false, error: 'يجب أن يبدأ الرابط بـ https:// (الاتصال المشفر مطلوب لمشاريع Supabase السحابية).' };
    }
    return { isValid: true };
  } catch {
    return { isValid: false, error: 'صيغة رابط المشروع غير صالحة.' };
  }
}

/**
 * Validates Supabase public / anon key format
 */
export function validateSupabaseKey(key: string): { isValid: boolean; error?: string } {
  const trimmed = (key || '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'مفتاح الوصول العام (Anon Key) مطلوب.' };
  }
  if (trimmed.length < 20) {
    return { isValid: false, error: 'طول المفتاح غير كافٍ: مفتاح الوصول قصير جداً ولا يطابق معايير مفاتيح Supabase.' };
  }
  if (/\s/.test(trimmed)) {
    return { isValid: false, error: 'يجب ألا يحتوي المفتاح على أي مسافات فارغة.' };
  }

  // Security Hardening: strictly block client-side injection of service_role key
  if (trimmed.toLowerCase().includes('service_role')) {
    return { isValid: false, error: 'تحذير أمني خطير: تم رصد مفتاح service_role ولا يجوز استخدامه إطلاقاً في واجهة العميل.' };
  }

  try {
    const parts = trimmed.split('.');
    if (parts.length === 3) {
      // Decode JWT payload
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const parsedPayload = JSON.parse(jsonPayload);
      if (parsedPayload.role === 'service_role') {
        return { isValid: false, error: 'تحذير أمني خطير: تم رصد مفتاح service_role. استخدم المفتاح العام anon فقط.' };
      }
    }
  } catch {}

  return { isValid: true };
}

export type SupabaseConnectionStatus =
  | 'unconfigured'      // إعدادات الاتصال غير مكتملة
  | 'unverified'        // لم يتم التحقق من الاتصال بعد
  | 'checking'          // جاري فحص الاتصال بالخادم
  | 'connected'         // الاتصال بالخادم وقاعدة البيانات نشط
  | 'permission_denied' // متصل بالخادم ولكن الوصول مقيد بسياسات RLS
  | 'schema_mismatch'   // متصل بالخادم ولكن الجداول مفقودة (يلزم ترحيل SQL)
  | 'network_error'     // تعذر الوصول إلى الخادم (انقطاع شبكة أو رابط غير صالح)
  | 'error';            // خطأ عام من خادم Supabase

export interface ConnectionDiagnosticResult {
  success: boolean;
  status: SupabaseConnectionStatus;
  message: string;
  latencyMs?: number;
  canQueryDatabase: boolean;
  isAuthReachable: boolean;
}

export function getSupabaseConfig() {
  const url = getActiveSupabaseUrl();
  const key = getActiveSupabaseKey();
  const isCustom = typeof window !== 'undefined' && Boolean(localStorage.getItem('psms_supabase_url'));
  return {
    url: url || 'غير معرّف (يرجى ضبط VITE_SUPABASE_URL)',
    isConfigured: isSupabaseConfigured(),
    hasKey: Boolean(key && !key.includes('your-anon-or-publishable-key')),
    isCustom,
  };
}

// Global cached client instance
let clientInstance: SupabaseClient | null = null;
let currentClientKey = '';

export function setCustomCredentials(url: string, key: string): boolean {
  if (url.trim()) setStorageItem('psms_supabase_url', url.trim());
  if (key.trim()) setStorageItem('psms_supabase_key', key.trim());
  clientInstance = null;
  currentClientKey = '';
  return true;
}

export function clearCustomCredentials(): void {
  removeStorageItem('psms_supabase_url');
  removeStorageItem('psms_supabase_key');
  clientInstance = null;
  currentClientKey = '';
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const url = getActiveSupabaseUrl();
  const key = getActiveSupabaseKey();
  const cacheKey = `${url}_${key}`;

  if (!clientInstance || currentClientKey !== cacheKey) {
    try {
      clientInstance = createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      currentClientKey = cacheKey;
    } catch (err) {
      console.warn('Failed to initialize Supabase client:', err);
      return null;
    }
  }
  return clientInstance;
}

// For direct queries where client might be null
export const supabase = getSupabase();

/**
 * Diagnostic tool to verify live connection to Supabase instance
 * Accurately differentiates between configuration, connectivity, RLS authorization, and schema state.
 */
export async function testSupabaseConnection(): Promise<ConnectionDiagnosticResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      status: 'unconfigured',
      message: 'بيانات الاتصال بـ Supabase غير مكتملة في متغيرات البيئة (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).',
      canQueryDatabase: false,
      isAuthReachable: false,
    };
  }

  const client = getSupabase();
  if (!client) {
    return {
      success: false,
      status: 'error',
      message: 'تعذر تهيئة عميل Supabase بالرابط والمفتاح الحاليين.',
      canQueryDatabase: false,
      isAuthReachable: false,
    };
  }

  const start = performance.now();
  let isAuthReachable = false;

  try {
    // 1. Verify Auth service reachability
    try {
      const { error: authErr } = await client.auth.getSession();
      if (!authErr) {
        isAuthReachable = true;
      }
    } catch {
      isAuthReachable = false;
    }

    // 2. Verify PostgreSQL Database reachability & RLS
    const { error: dbError } = await client
      .from('stations')
      .select('id', { count: 'exact', head: true });
    const latency = Math.round(performance.now() - start);

    if (dbError) {
      const msg = dbError.message || '';
      const code = dbError.code || '';

      // Network / Fetch error
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network')) {
        return {
          success: false,
          status: 'network_error',
          message: 'تعذر الاتصال بخادم Supabase. يرجى التحقق من اتصال الإنترنت وصحة رابط المشروع.',
          latencyMs: latency,
          canQueryDatabase: false,
          isAuthReachable: false,
        };
      }

      // 42501: Row Level Security denial. Connection is REACHABLE and functional!
      if (code === '42501' || msg.includes('row-level security') || msg.includes('insufficient_privilege')) {
        return {
          success: true,
          status: 'permission_denied',
          message: 'الاتصال بخادم Supabase نشط وسياسات الأمان RLS مفعلة (يتطلب تسجيل الدخول للوصول لبيانات المحطات).',
          latencyMs: latency,
          canQueryDatabase: false,
          isAuthReachable: true,
        };
      }

      // 42P01: Relation does not exist (schema migration required)
      if (code === '42P01' || msg.includes('relation "stations" does not exist')) {
        return {
          success: true,
          status: 'schema_mismatch',
          message: 'تم الاتصال بخادم Supabase بنجاح! يلزم تشغيل ملف الترحيل (01_initial_schema.sql) لإنشاء الجداول.',
          latencyMs: latency,
          canQueryDatabase: false,
          isAuthReachable: true,
        };
      }

      // 42P17: Infinite recursion detected in RLS policy
      if (code === '42P17' || msg.includes('infinite recursion')) {
        return {
          success: false,
          status: 'error',
          message: 'تم الاتصال بخادم Supabase، ولكن تم رصد تكرار لانهائي في سياسات الأمان RLS (خطأ 42P17). يرجى تطبيق ملف الترحيل 09_production_readiness_patch.sql في لوحة Supabase SQL Editor.',
          latencyMs: latency,
          canQueryDatabase: false,
          isAuthReachable: true,
        };
      }

      return {
        success: false,
        status: 'error',
        message: `استجابة من Supabase: ${msg} (${code || 'رمز غير معروف'})`,
        latencyMs: latency,
        canQueryDatabase: false,
        isAuthReachable,
      };
    }

    // Both Database and Auth verified
    return {
      success: true,
      status: 'connected',
      message: 'الاتصال بقاعدة بيانات Supabase نشط وجداول المنظومة متاحة للاستعلام.',
      latencyMs: latency,
      canQueryDatabase: true,
      isAuthReachable: true,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const isNet = raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('network');
    return {
      success: false,
      status: isNet ? 'network_error' : 'error',
      message: isNet
        ? 'تعذر الاتصال بخادم Supabase. يرجى التحقق من اتصال الإنترنت وصحة رابط المشروع.'
        : `تعذر الاتصال بخادم Supabase: ${raw}`,
      canQueryDatabase: false,
      isAuthReachable: false,
    };
  }
}
