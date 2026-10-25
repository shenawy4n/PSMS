/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AppError {
  message: string;
  code?: string;
  type: 'validation' | 'authorization' | 'duplicate' | 'network' | 'unknown';
}

/**
 * Translates Supabase PostgreSQL errors, Auth errors, and API exceptions
 * into clear, user-friendly Arabic explanations.
 */
export function formatArabicError(err: unknown): AppError {
  if (!err) {
    return {
      message: 'حدث خطأ غير متوقع في المنظومة',
      type: 'unknown',
    };
  }

  // Handle standard Error or Supabase PostgrestError
  const errorObj = err as { code?: string; message?: string; details?: string; hint?: string };
  const rawMessage = errorObj.message || String(err);
  const code = errorObj.code;

  // 1. PostgreSQL Error Code 23505: Unique Constraint Violation
  if (code === '23505' || rawMessage.includes('duplicate key') || rawMessage.includes('unique constraint')) {
    if (rawMessage.includes('code') || rawMessage.includes('stations_code_key')) {
      return {
        message: 'رمز المحطة مسجل مسبقاً في قاعدة البيانات، يجب استخدام رمز فني فريد.',
        code: '23505',
        type: 'duplicate',
      };
    }
    if (rawMessage.includes('employee_number') || rawMessage.includes('profiles_employee_number_key')) {
      return {
        message: 'الرقم الوظيفي مسجل مسبقاً لموظف آخر في المنظومة.',
        code: '23505',
        type: 'duplicate',
      };
    }
    if (rawMessage.includes('idx_unique_active_station_user') || rawMessage.includes('station_assignments')) {
      return {
        message: 'الموظف يمتلك تكليفاً نشطاً بالفعل في هذه المحطة.',
        code: '23505',
        type: 'duplicate',
      };
    }
    return {
      message: 'القيمة المدخلة مسجلة مسبقاً في النظام ويجب أن تكون فريدة.',
      code: '23505',
      type: 'duplicate',
    };
  }

  // 2. PostgreSQL Error Code 42501: RLS / Insufficient Privilege
  if (
    code === '42501' ||
    rawMessage.includes('row-level security') ||
    rawMessage.includes('insufficient_privilege')
  ) {
    return {
      message: 'تم رفض العملية من قاعدة البيانات: ليس لديك الصلاحية الكافية لتنفيذ هذا الإجراء وفق سياسات الأمان (RLS).',
      code: '42501',
      type: 'authorization',
    };
  }

  // 2.1 PostgreSQL Error Code 42P17: Infinite recursion detected in policy
  if (
    code === '42P17' ||
    rawMessage.includes('infinite recursion detected in policy')
  ) {
    return {
      message: 'خطأ تكرار لانهائي في سياسات الأمان (RLS Recursion 42P17). يرجى تطبيق ملف الترحيل 04_fix_rls_recursion.sql في لوحة Supabase.',
      code: '42P17',
      type: 'authorization',
    };
  }

  // 3. PostgreSQL Error Code 23503: Foreign Key Violation
  if (code === '23503' || rawMessage.includes('foreign key constraint')) {
    return {
      message: 'تعذر إتمام العملية لوجود ارتباطات تشغيلية بسجلات أخرى في المنظومة.',
      code: '23503',
      type: 'validation',
    };
  }

  // 4. Supabase Auth specific error codes & messages
  if (rawMessage.includes('Invalid login credentials')) {
    return {
      message: 'بيانات الدخول غير صحيحة (يرجى التحقق من البريد الإلكتروني وكلمة المرور).',
      type: 'authorization',
    };
  }
  if (rawMessage.includes('Email not confirmed')) {
    return {
      message: 'حساب البريد الإلكتروني لم يتم تأكيده بعد، يرجى مراجعة بريدك.',
      type: 'authorization',
    };
  }
  if (rawMessage.includes('User already registered')) {
    return {
      message: 'البريد الإلكتروني مسجل مسبقاً بحساب مستخدم آخر.',
      type: 'duplicate',
    };
  }
  if (rawMessage.includes('JWT expired') || code === 'PGRST301') {
    return {
      message: 'انتهت صلاحية جلسة العمل، يرجى تسجيل الدخول مجدداً.',
      code: 'PGRST301',
      type: 'authorization',
    };
  }

  // 5. Network and connectivity errors
  if (
    rawMessage.includes('Failed to fetch') ||
    rawMessage.includes('NetworkError') ||
    rawMessage.includes('network')
  ) {
    return {
      message: 'تعذر الاتصال بخادم قاعدة البيانات. يرجى التحقق من اتصال الإنترنت وحالة خادم Supabase.',
      type: 'network',
    };
  }

  return {
    message: rawMessage,
    code,
    type: 'unknown',
  };
}
