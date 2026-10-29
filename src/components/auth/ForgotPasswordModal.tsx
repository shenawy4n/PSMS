/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  KeyRound,
  Mail,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { resetPasswordForEmail, isSupabaseMode } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('يرجى إدخال البريد الإلكتروني.');
      return;
    }

    setLoading(true);
    try {
      const res = await resetPasswordForEmail(cleanEmail);
      if (res.success) {
        setStatusMessage(
          res.message ||
            'إذا كان البريد الإلكتروني مسجلاً في المنظومة، فقد تم إرسال رابط وتعليمات استعادة كلمة المرور إليه.'
        );
        setIsSubmitted(true);
      } else {
        setErrorMessage(res.error || 'تعذر إرسال طلب استعادة كلمة المرور، يرجى المحاولة لاحقاً.');
      }
    } catch {
      setErrorMessage('حدث خطأ غير متوقع أثناء معالجة الطلب.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetForm = () => {
    setIsSubmitted(false);
    setStatusMessage(null);
    setErrorMessage(null);
    setEmail('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="forgot-password-title"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 text-right space-y-5 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 id="forgot-password-title" className="text-sm font-bold text-white">
                استعادة كلمة المرور
              </h2>
              <p className="text-[11px] text-slate-400">
                إرسال رابط استعادة آمن للبريد الإلكتروني المعتمد
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success State */}
        {isSubmitted ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-950/50 border border-emerald-800/80 rounded-xl space-y-2 text-xs text-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-bold text-white">تم إرسال الطلب بنجاح</span>
              </div>
              <p className="text-slate-300 leading-relaxed">{statusMessage}</p>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <p className="font-semibold text-slate-300">ملاحظات أمنية هامة:</p>
              <ul className="list-disc list-inside space-y-1 pr-1 text-slate-400">
                <li>الرابط صالح للاستخدام لمرة واحدة فقط ولفترة زمنية محدودة.</li>
                <li>تأكد من فحص مجلد الرسائل غير المرغوب فيها (Junk / Spam).</li>
                <li>إذا لم تكن تملك حساباً في المنظومة فلن يصلك أي بريد.</li>
              </ul>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleResetForm}
                className="text-xs text-blue-400 hover:text-blue-300 underline cursor-pointer"
              >
                إرسال بريد آخر
              </button>
              <Button size="sm" variant="outline" onClick={onClose}>
                <span>العودة لصفحة الدخول</span>
                <ArrowRight className="w-3.5 h-3.5 mr-1" />
              </Button>
            </div>
          </div>
        ) : (
          /* Form State */
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div
                role="alert"
                className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-xl flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                البريد الإلكتروني الوظيفي <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  disabled={loading}
                  autoComplete="email"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-3 pl-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50"
                />
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                أدخل البريد الإلكتروني المسجل في منظومة محطات الكهرباء لتلقي رابط تعيين كلمة مرور جديدة.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                إلغاء والعودة
              </button>

              <Button
                type="submit"
                size="md"
                variant="primary"
                isLoading={loading}
                disabled={loading || !email.trim()}
                className="text-xs font-semibold px-5"
              >
                <span>إرسال رابط الاستعادة</span>
                <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
              </Button>
            </div>
          </form>
        )}

        {/* Footer info */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            <span>حماية من هجمات التعداد (Anti-Enumeration)</span>
          </span>
          <span>{isSupabaseMode ? 'Supabase Auth' : 'محلي'}</span>
        </div>
      </div>
    </div>
  );
};
