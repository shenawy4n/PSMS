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
  KeyRound,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import {
  validatePasswordStrength,
  validatePasswordMatch,
} from '../../lib/validations/password';

export const ResetPasswordModal: React.FC = () => {
  const { isRecoveryMode, completePasswordReset, setIsRecoveryMode } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isRecoveryMode) return null;

  const strength = validatePasswordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!newPassword.trim()) {
      setErrorMessage('يرجى إدخال كلمة المرور الجديدة.');
      return;
    }
    if (!confirmPassword.trim()) {
      setErrorMessage('يرجى تأكيد كلمة المرور الجديدة.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('كلمة المرور الجديدة وتأكيدها غير متطابقين.');
      return;
    }
    if (!strength.isValid) {
      setErrorMessage(
        strength.errors[0] || 'كلمة المرور لا تحقق جميع معايير الأمان المعتمدة في المنظومة.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await completePasswordReset(newPassword);
      if (res.success) {
        setSuccess(true);
      } else {
        setErrorMessage(
          res.error ||
            'تعذر تعيين كلمة المرور الجديدة. قد يكون الرابط منتهي الصلاحية أو تم استخدامه مسبقاً.'
        );
      }
    } catch {
      setErrorMessage('حدث خطأ غير متوقع أثناء تعيين كلمة المرور.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinish = () => {
    setIsRecoveryMode(false);
    if (typeof window !== 'undefined' && window.history) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 text-right space-y-5 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="text-center space-y-2 pb-4 border-b border-slate-800">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 mx-auto flex items-center justify-center text-blue-400">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 id="reset-modal-title" className="text-lg font-bold text-white">
            تعيين كلمة مرور جديدة
          </h2>
          <p className="text-xs text-slate-400">
            تم التحقق من رابط الاستعادة بنجاح. يرجى إنشاء كلمة مرور جديدة وقوية للمتابعة.
          </p>
        </div>

        {/* Success View */}
        {success ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="font-bold text-white text-sm">تم تعيين كلمة المرور بنجاح!</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                تم تحديث بيانات الدخول وتأمين حسابك في المنظومة. يمكنك الآن المتابعة مباشرة لاستخدام المنظومة.
              </p>
            </div>

            <Button
              size="md"
              variant="primary"
              onClick={handleFinish}
              className="w-full text-xs font-semibold"
            >
              <span>المتابعة إلى لوحة التحكم</span>
              <ArrowRight className="w-4 h-4 mr-1.5" />
            </Button>
          </div>
        ) : (
          /* Reset Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div
                role="alert"
                className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-xl flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-rose-300">تنبيه أمني</p>
                  <p className="text-slate-200">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Field: New Password */}
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

            {/* Field: Confirm Password */}
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

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleFinish}
                className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                إلغاء والعودة
              </button>

              <Button
                type="submit"
                size="md"
                variant="primary"
                isLoading={submitting}
                disabled={
                  submitting ||
                  !newPassword ||
                  !confirmPassword ||
                  !strength.isValid ||
                  newPassword !== confirmPassword
                }
                className="text-xs font-semibold px-5"
              >
                <Lock className="w-3.5 h-3.5 ml-1.5" />
                <span>حفظ كلمة المرور والدخول</span>
              </Button>
            </div>
          </form>
        )}

        <div className="pt-3 border-t border-slate-800 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>منظومة PSMS مشفرة عبر طبقة حماية Supabase Auth الرسمية</span>
        </div>
      </div>
    </div>
  );
};
