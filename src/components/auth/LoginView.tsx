import React, { useState } from 'react';
import { Zap, ShieldCheck, Lock, Mail, ArrowLeft, UserCheck, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface LoginViewProps {
  onSuccess: () => void;
  onOpenSetupModal: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess, onOpenSetupModal }) => {
  const { signIn, startDemoMode, allProfiles } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDemoOptions, setShowDemoOptions] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  const isSupabase = isSupabaseConfigured();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn(email, password);
    setLoading(false);

    if (res.success) {
      onSuccess();
    } else {
      setError(res.error || 'تعذر تسجيل الدخول، يرجى التحقق من صحة البيانات.');
    }
  };

  const handleDemoSelect = (userId: string) => {
    startDemoMode(userId);
    onSuccess();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 selection:bg-blue-600 selection:text-white">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Lockup */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/40 mx-auto flex items-center justify-center text-blue-400">
            <Zap className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">منظومة إدارة محطات الكهرباء</h1>
          <p className="text-xs text-slate-400 font-mono">Power Station Management System (PSMS)</p>
        </div>

        {/* Supabase Status Banner */}
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
            isSupabase
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : 'bg-amber-950/40 border-amber-800/80 text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isSupabase ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{isSupabase ? 'مصادقة Supabase Auth مشغّلة' : 'وضع المعاينة والتحقق الأولي'}</span>
          </div>
          <button
            onClick={onOpenSetupModal}
            className="underline hover:text-white cursor-pointer font-medium"
          >
            إعدادات الربط
          </button>
        </div>

        {/* Login Form Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-5">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-sm font-semibold text-slate-200">
              {isSupabase ? 'تسجيل الدخول المعتمد (Supabase Auth)' : 'تسجيل الدخول للنظام'}
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isSupabase
                ? 'أدخل بيانات الحساب الموثق في قاعدة البيانات'
                : 'أدخل البريد الإلكتروني للمتابعة في الوضع المحلي'}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-lg leading-relaxed flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Input
              label="البريد الإلكتروني الوظيفي"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div>
              <Input
                label="كلمة المرور"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={isSupabase}
                helperText={isSupabase ? 'كلمة المرور المسجلة في Supabase Auth' : 'غير مطلوبة في وضع المعاينة السريعة'}
              />
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={() => setIsForgotPasswordOpen(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline cursor-pointer"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" size="md" isLoading={loading}>
              <span>تسجيل الدخول للمنظومة</span>
              <ArrowLeft className="w-4 h-4 mr-1" />
            </Button>
          </form>

          <ForgotPasswordModal
            isOpen={isForgotPasswordOpen}
            onClose={() => setIsForgotPasswordOpen(false)}
          />

          {/* Collapsible Demo Mode for offline testing */}
          <div className="pt-4 border-t border-slate-800">
            {isSupabase ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowDemoOptions(!showDemoOptions)}
                  className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors py-1 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                    استعراض الواجهات بالوضع التجريبي المحلي (بيانات تجريبية)
                  </span>
                  {showDemoOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showDemoOptions && (
                  <div className="p-3 bg-slate-950/80 rounded-lg border border-amber-900/40 space-y-2.5 animate-in fade-in">
                    <p className="text-[11px] text-amber-300/90 leading-relaxed">
                      ⚠️ <strong className="font-semibold">تنبيه أمني:</strong> الوضع التجريبي معزول ولا يملك أي صلاحيات على قاعدة بيانات Supabase. لاختبار صلاحيات السوبر أدمن الحقيقية، سجّل الدخول بحسابك الموثق أعلاه.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {allProfiles.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleDemoSelect(p.id)}
                          className="p-2 text-right rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/40 transition-colors cursor-pointer"
                        >
                          <p className="font-semibold text-slate-200 truncate">{p.full_name}</p>
                          <p className="text-[10px] text-amber-400 font-mono">
                            {p.role === 'super_admin' ? 'مدير عام تجريبي' : p.role === 'admin' ? 'مدير قطاع تجريبي' : 'فني تجريبي'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-slate-300 text-right">
                  الدخول السريع بهوية تجريبية (لاختبار الصلاحيات محلياً):
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {allProfiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleDemoSelect(p.id)}
                      className="p-2.5 text-right rounded-lg bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-blue-500/50 transition-colors cursor-pointer"
                    >
                      <p className="font-semibold text-slate-200 truncate">{p.full_name}</p>
                      <p className="text-[11px] text-blue-400 font-mono">
                        {p.role === 'super_admin'
                          ? 'مدير عام'
                          : p.role === 'admin'
                          ? 'مدير قطاع'
                          : p.role === 'supervisor'
                          ? 'مشرف محطة'
                          : 'فني تشغيل'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security Notice */}
        <div className="text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>منظومة تشغيل محمية بسياسات RLS ومصادقة مشفرة</span>
        </div>
      </div>
    </div>
  );
};
