/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

export interface PasswordValidationResult {
  isValid: boolean;
  score: number; // 0 to 4
  strengthLabel: string;
  errors: string[];
  requirements: PasswordRequirement[];
}

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Validates password against PSMS enterprise and Supabase Auth security policies:
 * 1. Minimum 8 characters
 * 2. At least one uppercase letter (A-Z)
 * 3. At least one lowercase letter (a-z)
 * 4. At least one number (0-9)
 * 5. At least one special symbol (!@#$%^&*...)
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const p = password || '';

  const hasMinLength = p.length >= MIN_PASSWORD_LENGTH;
  const hasUppercase = /[A-Z]/.test(p);
  const hasLowercase = /[a-z]/.test(p);
  const hasNumber = /[0-9]/.test(p);
  const hasSpecial = /[^A-Za-z0-9]/.test(p);

  const requirements: PasswordRequirement[] = [
    {
      id: 'length',
      label: `8 أحرف أو أكثر (${p.length}/${MIN_PASSWORD_LENGTH})`,
      met: hasMinLength,
    },
    {
      id: 'uppercase',
      label: 'حرف كبير واحد على الأقل (A-Z)',
      met: hasUppercase,
    },
    {
      id: 'lowercase',
      label: 'حرف صغير واحد على الأقل (a-z)',
      met: hasLowercase,
    },
    {
      id: 'number',
      label: 'رقم واحد على الأقل (0-9)',
      met: hasNumber,
    },
    {
      id: 'special',
      label: 'رمز خاص واحد على الأقل (!@#$%...)',
      met: hasSpecial,
    },
  ];

  const metCount = requirements.filter((r) => r.met).length;
  // Score: 0 to 4
  let score = 0;
  if (metCount >= 5) score = 4; // ممتاز
  else if (metCount >= 4) score = 3; // قوي
  else if (metCount >= 3) score = 2; // متوسط
  else if (metCount >= 1) score = 1; // ضعيف
  else score = 0;

  let strengthLabel = 'ضعيفة جداً';
  if (score === 4) strengthLabel = 'قوية ومثالية';
  else if (score === 3) strengthLabel = 'قوية';
  else if (score === 2) strengthLabel = 'متوسطة';
  else if (score === 1) strengthLabel = 'ضعيفة';

  const errors: string[] = [];
  if (!hasMinLength) errors.push(`كلمة المرور يجب أن لا تقل عن ${MIN_PASSWORD_LENGTH} أحرف.`);
  if (!hasUppercase) errors.push('يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل.');
  if (!hasLowercase) errors.push('يجب أن تحتوي كلمة المرور على حرف صغير واحد على الأقل.');
  if (!hasNumber) errors.push('يجب أن تحتوي كلمة المرور على رقم واحد على الأقل.');
  if (!hasSpecial) errors.push('يجب أن تحتوي كلمة المرور على رمز خاص واحد على الأقل.');

  const isValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;

  return {
    isValid,
    score,
    strengthLabel,
    errors,
    requirements,
  };
}

/**
 * Validates that confirmation matches new password
 */
export function validatePasswordMatch(password: string, confirmPassword: string): {
  isMatch: boolean;
  error?: string;
} {
  if (!confirmPassword) {
    return { isMatch: false, error: 'يرجى تأكيد كلمة المرور الجديدة.' };
  }
  if (password !== confirmPassword) {
    return { isMatch: false, error: 'كلمة المرور الجديدة وتأكيدها غير متطابقين.' };
  }
  return { isMatch: true };
}
