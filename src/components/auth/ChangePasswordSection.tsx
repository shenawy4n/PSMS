/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  KeyRound,
  Info,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import {
  validatePasswordStrength,
  validatePasswordMatch,
} from '../../lib/validations/password';

export const ChangePasswordSection: React.FC = () => {
  const { currentUser, isOAuthUser, isSupabaseMode, isDemoMode, changePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Live strength calculation
  const strength = validatePasswordStrength(newPassword);
  const matchCheck = validatePasswordMatch(newPassword, confirmPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Basic required check
    if (!currentPassword.trim()) {
      setErrorMessage('يرجى إدخال كلمة المرور الحالية.');
      return;
    }
    if (!newPassword.trim()) {
      setErrorMessage('يرجى إدخال كلمة المرور الجديدة.');
      return;
    }
    if (!confirmPassword.trim()) {
      setErrorMessage('يرجى تأكيد كلمة المرور الجديدة.');
      return;
    }

    // Match check
    if (newPassword !== confirmPassword) {
      setErrorMessage('كلمة المرور الجديدة وتأكيدها غير متطابقين.');
      return;
    }

    // Same password check
    if (currentPassword === newPassword) {
      setErrorMessage('يجب أن تكون كلمة المرور الجديدة مختلفة عن كلمة المرور الحالية.');
      return;
    }

    // Strength check
    if (!strength.isValid) {
      setErrorMessage(
        strength.errors[0] || 'كلمة المرور لا تحقق جميع معايير الأمان المعتمدة في المنظومة.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await changePassword(currentPassword, newPassword);
      if (res.success) {
        setSuccessMessage('تم تحديث كلمة المرور بنجاح. تم حفظ التغييرات وتأمين الحساب.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setErrorMessage(res.error || 'تعذر تحديث كلمة المرور، يرجى المحاولة لاحقاً.');
      }
    } catch {
      setErrorMessage('حدث خطأ غير متوقع أثناء تحديث كلمة المرور.');
    } finally {
      setSubmitting(false);
    }
  };

  // If OAuth account (e.g. Azure AD, Google, SSO)
  if (isOAuthUser) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-right">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
          <KeyRound className="w-5 h-5 text-blue-400" />
          <h2 className="text-sm font-bold text-white">الأمان وتغيير كلمة المرور</h2>
        </div>
        <div className="p-4 bg-blue-950/40 border border-blue-800/80 rounded-xl text-xs text-blue-200 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-white">حساب موثق عبر موفر هوية خارجي (SSO / OAuth)</p>
            <p className="text-slate-300 leading-relaxed">
              تم تسجيل دخولك باستخدام موفر هوية مؤسسي خارجي. لا يتطلب هذا الحساب إدارة كلمة مرور محلية في منظومة PSMS، وتتم إدارة معايير الأمان وكلمات المرور مباشرة عبر بوابة مزود الخدمة الخاص بك.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5 text-right">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <KeyRound className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-sm font-bold text-white">الأمان وتغيير كلمة المرور</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              تحديث بيانات الدخول المعتمدة للمستخدم ({currentUser?.email})
            </p>
          </div>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded border border-slate-700 bg-slate-950 text-slate-400 font-mono">
          {isSupabaseMode && !isDemoMode ? 'Supabase Auth' : 'وضع المعاينة المحلي'}
        </span>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div
          role="alert"
          className="p-3.5 bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-xs rounded-xl flex items-start gap-2.5 animate-in fade-in"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold text-emerald-300">نجاح العملية</p>
            <p className="text-slate-200">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs rounded-xl flex items-start gap-2.5 animate-in fade-in"
        >
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold text-rose-300">تعذر تحديث كلمة المرور</p>
            <p className="text-slate-200">{errorMessage}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Field 1: Current Password */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            كلمة المرور الحالية <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="أدخل كلمة المرور الحالية للتحقق من هويتك"
              disabled={submitting}
              required
              autoComplete="current-password"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-3 pl-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute left-3 top-2.5 text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
              title={showCurrent ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              aria-label={showCurrent ? 'إخفاء كلمة المرور الحالية' : 'إظهار كلمة المرور الحالية'}
            >
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            يتم التحقق من كلمة المرور الحالية عبر إعادة المصادقة المشفرة قبل قبول التعديل.
          </p>
        </div>

        {/* Field 2: New Password */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            كلمة المرور الجديدة <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              disabled={submitting}
              required
              autoComplete="new-password"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-3 pl-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute left-3 top-2.5 text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
              title={showNew ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              aria-label={showNew ? 'إخفاء كلمة المرور الجديدة' : 'إظهار كلمة المرور الجديدة'}
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Password Strength Meter */}
          {newPassword && (
            <div className="mt-2.5 space-y-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">قوة كلمة المرور:</span>
                <span
                  className={`font-semibold font-mono ${
                    strength.score === 4
                      ? 'text-emerald-400'
                      : strength.score === 3
                      ? 'text-blue-400'
                      : strength.score === 2
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {strength.strengthLabel}
                </span>
              </div>

              {/* Progress 4 Bars */}
              <div className="grid grid-cols-4 gap-1.5 h-1.5">
                {[1, 2, 3, 4].map((step) => {
                  let barColor = 'bg-slate-800';
                  if (strength.score >= step) {
                    if (strength.score === 4) barColor = 'bg-emerald-500';
                    else if (strength.score === 3) barColor = 'bg-blue-500';
                    else if (strength.score === 2) barColor = 'bg-amber-500';
                    else barColor = 'bg-rose-500';
                  }
                  return (
                    <div
                      key={step}
                      className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                    />
                  );
                })}
              </div>

              {/* Requirements Checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[11px]">
                {strength.requirements.map((req) => (
                  <div
                    key={req.id}
                    className={`flex items-center gap-1.5 ${
                      req.met ? 'text-emerald-400 font-medium' : 'text-slate-500'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        req.met ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                    <span>{req.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Field 3: Confirm New Password */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            تأكيد كلمة المرور الجديدة <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              disabled={submitting}
              required
              autoComplete="new-password"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-3 pl-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute left-3 top-2.5 text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
              title={showConfirm ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              aria-label={showConfirm ? 'إخفاء تأكيد كلمة المرور' : 'إظهار تأكيد كلمة المرور'}
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Match Status */}
          {confirmPassword && (
            <p
              className={`text-[11px] mt-1.5 flex items-center gap-1 ${
                newPassword === confirmPassword ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {newPassword === confirmPassword ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 inline" />
                  <span>كلمات المرور متطابقة</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 inline" />
                  <span>كلمات المرور غير متطابقة</span>
                </>
              )}
            </p>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-2 flex items-center justify-between">
          <p className="text-[11px] text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>يتم التشفير الآمن عبر معايير Supabase Auth</span>
          </p>

          <Button
            type="submit"
            size="md"
            variant="primary"
            isLoading={submitting}
            disabled={
              submitting ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword ||
              !strength.isValid ||
              newPassword !== confirmPassword
            }
            className="text-xs font-semibold px-5"
          >
            <Lock className="w-3.5 h-3.5 ml-1.5" />
            <span>تغيير كلمة المرور</span>
          </Button>
        </div>
      </form>
    </div>
  );
};
