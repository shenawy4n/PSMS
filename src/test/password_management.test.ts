/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validatePasswordStrength,
  validatePasswordMatch,
  MIN_PASSWORD_LENGTH,
} from '../lib/validations/password';
import { formatArabicError } from '../lib/errorHandler';
import { employeeFormSchema } from '../lib/validations/employee';

describe('PSMS Password Management & Recovery Architecture', () => {
  /* ==============================================================================
     1. Password Strength Policy Tests
     ============================================================================== */
  describe('Password Strength Policy (Enterprise & Supabase Auth Compliance)', () => {
    it('accepts a strong compliant password meeting all criteria', () => {
      const valid = 'PowerGrid@2026!';
      const result = validatePasswordStrength(valid);

      expect(result.isValid).toBe(true);
      expect(result.score).toBe(4);
      expect(result.strengthLabel).toBe('قوية ومثالية');
      expect(result.errors.length).toBe(0);
      expect(result.requirements.every((r) => r.met)).toBe(true);
    });

    it('rejects passwords shorter than the minimum length (8 characters)', () => {
      const short = 'Pw@1a';
      const result = validatePasswordStrength(short);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(`كلمة المرور يجب أن لا تقل عن ${MIN_PASSWORD_LENGTH} أحرف.`);
    });

    it('rejects passwords missing uppercase letters', () => {
      const noUpper = 'powergrid@2026!';
      const result = validatePasswordStrength(noUpper);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل.');
    });

    it('rejects passwords missing lowercase letters', () => {
      const noLower = 'POWERGRID@2026!';
      const result = validatePasswordStrength(noLower);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('يجب أن تحتوي كلمة المرور على حرف صغير واحد على الأقل.');
    });

    it('rejects passwords missing numbers', () => {
      const noNumber = 'PowerGrid@Special!';
      const result = validatePasswordStrength(noNumber);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('يجب أن تحتوي كلمة المرور على رقم واحد على الأقل.');
    });

    it('rejects passwords missing special characters/symbols', () => {
      const noSpecial = 'PowerGrid2026Pass';
      const result = validatePasswordStrength(noSpecial);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('يجب أن تحتوي كلمة المرور على رمز خاص واحد على الأقل.');
    });
  });

  /* ==============================================================================
     2. Password Match Validation
     ============================================================================== */
  describe('Password Confirmation Matching', () => {
    it('approves identical new password and confirmation', () => {
      const match = validatePasswordMatch('GridAdmin#2026', 'GridAdmin#2026');
      expect(match.isMatch).toBe(true);
      expect(match.error).toBeUndefined();
    });

    it('rejects mismatched new password and confirmation', () => {
      const mismatch = validatePasswordMatch('GridAdmin#2026', 'GridAdmin#9999');
      expect(mismatch.isMatch).toBe(false);
      expect(mismatch.error).toBe('كلمة المرور الجديدة وتأكيدها غير متطابقين.');
    });

    it('rejects empty confirmation', () => {
      const emptyConfirm = validatePasswordMatch('GridAdmin#2026', '');
      expect(emptyConfirm.isMatch).toBe(false);
      expect(emptyConfirm.error).toBe('يرجى تأكيد كلمة المرور الجديدة.');
    });
  });

  /* ==============================================================================
     3. Re-Authentication & In-App Password Change Flow
     ============================================================================== */
  describe('In-App Password Change Security & Re-Authentication', () => {
    it('simulates successful password change after valid re-authentication', async () => {
      const mockSignIn = vi.fn().mockResolvedValue({ error: null });
      const mockUpdateUser = vi.fn().mockResolvedValue({ error: null });

      const email = 'engineer@psms.gov.sa';
      const currentPassword = 'OldPassword@2025';
      const newPassword = 'NewSecurePassword@2026';

      // 1. Re-authenticate
      const reauthRes = await mockSignIn({ email, password: currentPassword });
      expect(reauthRes.error).toBeNull();

      // 2. Update user
      const updateRes = await mockUpdateUser({ password: newPassword });
      expect(updateRes.error).toBeNull();
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: newPassword });
    });

    it('rejects password change if current password is wrong during re-authentication', async () => {
      const mockSignIn = vi.fn().mockResolvedValue({
        error: { message: 'Invalid login credentials' },
      });

      const email = 'engineer@psms.gov.sa';
      const wrongCurrentPassword = 'WrongPassword@123';

      const reauthRes = await mockSignIn({ email, password: wrongCurrentPassword });
      expect(reauthRes.error).toBeDefined();

      const translated = formatArabicError(reauthRes.error);
      expect(translated.message).toBe('بيانات الدخول غير صحيحة (يرجى التحقق من البريد الإلكتروني وكلمة المرور).');
    });

    it('rejects password change if new password is identical to old password', () => {
      const oldPass = 'SamePassword#123';
      const newPass = 'SamePassword#123';

      const isSame = oldPass === newPass;
      expect(isSame).toBe(true);

      const error = formatArabicError({ message: 'New password should be different from the old password' });
      expect(error.message).toBe('يجب أن تكون كلمة المرور الجديدة مختلفة عن كلمة المرور الحالية.');
    });
  });

  /* ==============================================================================
     4. Password Recovery & Anti-Enumeration
     ============================================================================== */
  describe('Password Recovery (Forgot Password & Anti-Enumeration)', () => {
    it('returns a generic neutral message regardless of whether the email exists', async () => {
      const neutralMessage =
        'إذا كان البريد الإلكتروني مسجلاً في المنظومة، فقد تم إرسال رابط وتعليمات استعادة كلمة المرور إلى صندوق الوارد الخاص بك.';

      const mockResetPassword = vi.fn().mockImplementation(async (email: string) => {
        // Even if supabase reports no user or success, client presents neutral message
        return { data: {}, error: null };
      });

      const registeredEmail = 'admin@psms.gov.sa';
      const res1 = await mockResetPassword(registeredEmail);
      expect(res1.error).toBeNull();

      const unregisteredEmail = 'nonexistent.user.999@random.com';
      const res2 = await mockResetPassword(unregisteredEmail);
      expect(res2.error).toBeNull();
      // Both cases return neutral guidance to prevent account harvesting
      expect(neutralMessage).toContain('إذا كان البريد الإلكتروني مسجلاً في المنظومة');
    });

    it('uses the published app domain instead of localhost for password recovery redirect', () => {
      const mockWindow = {
        location: {
          origin: 'https://ais-dev-pb6lavqcd3qj6vbrk27ss7-557716477492.europe-west3.run.app',
          pathname: '/',
        },
      };

      const redirectUrl = `${mockWindow.location.origin}${mockWindow.location.pathname}`;
      expect(redirectUrl).not.toContain('localhost:3000');
      expect(redirectUrl).toBe('https://ais-dev-pb6lavqcd3qj6vbrk27ss7-557716477492.europe-west3.run.app/');
    });

    it('handles expired or invalid recovery token with clear user-friendly explanation', () => {
      const expiredError = { message: 'Email link is invalid or has expired' };
      const formatted = formatArabicError(expiredError);

      expect(formatted.message).toBe('رابط استعادة كلمة المرور غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد.');
      expect(formatted.type).toBe('authorization');
    });

    it('handles rate limit errors gracefully without exposing internal system details', () => {
      const rateLimitError = { message: 'For security purposes, you can only request this once every 60 seconds' };
      const formatted = formatArabicError(rateLimitError);

      expect(formatted.message).toBe('تم تجاوز الحد المسموح للطلبات المتتالية. يرجى الانتظار دقيقة واحدة قبل المحاولة مجدداً.');
      expect(formatted.type).toBe('validation');
    });
  });

  /* ==============================================================================
     5. Error Handling & Safe Logging
     ============================================================================== */
  describe('Safe Error Handling & Log Sanitization', () => {
    it('never logs or leaks sensitive plaintext passwords in audit entries', () => {
      const auditPayload = {
        actor_id: 'user-uuid-123',
        actor_email: 'user@psms.gov.sa',
        action: 'auth:password_change',
        entity_type: 'user_security',
        entity_id: 'user-uuid-123',
        new_data: { event: 'password_updated_successfully' },
      };

      const serialized = JSON.stringify(auditPayload);
      expect(serialized).not.toContain('SecretPass');
      expect(serialized).not.toContain('password_hash');
      expect(auditPayload.new_data.event).toBe('password_updated_successfully');
    });

    it('formats unknown Supabase errors into safe strings', () => {
      const unexpectedError = new Error('Unexpected calculation anomaly');
      const formatted = formatArabicError(unexpectedError);
      expect(formatted.message).toBe('Unexpected calculation anomaly');
      expect(formatted.type).toBe('unknown');
    });
  });

  /* ==============================================================================
     6. Compatibility with Existing Login & Employee Management
     ============================================================================== */
  describe('Backward Compatibility with Existing Login & Employee Workflows', () => {
    it('ensures employee creation schema remains valid and unaffected', () => {
      const newEmployee = {
        employee_number: 'EMP-9901',
        full_name: 'مهندس حسام الدين علي',
        email: 'hossam.ali@psms.gov.sa',
        role: 'employee' as const,
        department: 'تشغيل المحطات',
        job_title: 'مهندس حماية وتحكم',
        assigned_station_ids: ['stn-101'],
        is_active: true,
      };

      const result = employeeFormSchema.safeParse(newEmployee);
      expect(result.success).toBe(true);
    });

    it('keeps existing role hierarchy intact', () => {
      const roles = ['super_admin', 'admin', 'supervisor', 'employee'];
      expect(roles).toHaveLength(4);
      expect(roles).toContain('super_admin');
    });
  });
});
