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
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  latencyMs?: number;
}> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: 'بيانات الاتصال بـ Supabase غير مكتملة في متغيرات البيئة (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).',
    };
  }

  const client = getSupabase();
  if (!client) {
    return {
      success: false,
      message: 'تعذر تهيئة عميل Supabase بالرابط والمفتاح الحاليين.',
    };
  }

  const start = performance.now();
  try {
    // Attempt a light ping or read from system or stations
    const { error } = await client.from('stations').select('id', { count: 'exact', head: true });
    const latency = Math.round(performance.now() - start);

    if (error) {
      // If table doesn't exist yet, it means connection works but migration is needed!
      if (error.code === '42P01' || error.message?.includes('relation "stations" does not exist')) {
        return {
          success: true,
          message: 'تم الاتصال بخادم Supabase بنجاح! يلزم تشغيل ملف الترحيل (01_initial_schema.sql) لإنشاء الجداول.',
          latencyMs: latency,
        };
      }
      if (error.code === '42P17' || error.message?.includes('infinite recursion')) {
        return {
          success: false,
          message: 'تم الاتصال بخادم Supabase، ولكن تم رصد تكرار لانهائي في سياسات الأمان RLS (خطأ 42P17). يرجى تطبيق ملف الترحيل 09_production_readiness_patch.sql في لوحة Supabase SQL Editor لحل المشكلة نهائياً.',
          latencyMs: latency,
        };
      }
      return {
        success: false,
        message: `خطأ من Supabase: ${error.message} (${error.code || 'خطأ غير معروف'})`,
        latencyMs: latency,
      };
    }

    return {
      success: true,
      message: 'الاتصال بقاعدة بيانات Supabase نشط والجداول متاحة.',
      latencyMs: latency,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'تعذر الاتصال بخادم Supabase.',
    };
  }
}
