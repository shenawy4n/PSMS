/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read from Vite environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Verify whether valid credentials have been supplied
export function isSupabaseConfigured(): boolean {
  if (!supabaseUrl || !supabasePublishableKey) {
    return false;
  }
  // Check if it's still the default template placeholder
  if (
    supabaseUrl.includes('your-project-id') ||
    supabaseUrl.includes('MY_APP_URL') ||
    supabasePublishableKey.includes('your-anon-or-publishable-key')
  ) {
    return false;
  }
  return true;
}

export function getSupabaseConfig() {
  return {
    url: supabaseUrl || 'غير معرّف (يرجى ضبط VITE_SUPABASE_URL)',
    isConfigured: isSupabaseConfigured(),
    hasKey: Boolean(supabasePublishableKey && !supabasePublishableKey.includes('your-anon-or-publishable-key')),
  };
}

// Fallback dummy client if credentials are missing, preventing runtime initialization crashes
let clientInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!clientInstance) {
    try {
      clientInstance = createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
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
