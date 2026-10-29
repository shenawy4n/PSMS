/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Database,
  CheckCircle,
  AlertTriangle,
  Copy,
  Check,
  Terminal,
  ShieldCheck,
  RefreshCw,
  Key,
  Globe,
  Sliders,
  Trash2,
} from 'lucide-react';
import {
  isSupabaseConfigured,
  getSupabaseConfig,
  testSupabaseConnection,
  setCustomCredentials,
  clearCustomCredentials,
  getActiveSupabaseUrl,
  getActiveSupabaseKey,
  validateSupabaseUrl,
  validateSupabaseKey,
  ConnectionDiagnosticResult,
} from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface SupabaseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({ isOpen, onClose }) => {
  const config = getSupabaseConfig();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionDiagnosticResult | null>(null);

  // Form inputs for direct credentials setup
  const [inputUrl, setInputUrl] = useState(
    getActiveSupabaseUrl() || 'https://gygksvqqqtjqgcnwfjha.supabase.co'
  );
  const [inputKey, setInputKey] = useState(getActiveSupabaseKey() || '');
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  // Copied buttons state
  const [copiedScript, setCopiedScript] = useState<string | null>(null);
  const [copiedEnv, setCopiedEnv] = useState(false);

  const envSample = `VITE_SUPABASE_URL="${inputUrl || 'https://gygksvqqqtjqgcnwfjha.supabase.co'}"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-or-publishable-key"`;

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testSupabaseConnection();
    setTestResult(result);
    setTesting(false);
  };

  const handleSaveCredentials = () => {
    const trimmedUrl = inputUrl.trim();
    const trimmedKey = inputKey.trim();

    if (!trimmedUrl || !trimmedKey) {
      setTestResult({
        success: false,
        status: 'unconfigured',
        message: 'يرجى إدخال كل من رابط المشروع ومفتاح الوصول (Anon Key).',
        isAuthReachable: false,
        canQueryDatabase: false,
      });
      return;
    }

    const urlValidation = validateSupabaseUrl(trimmedUrl);
    if (!urlValidation.isValid) {
      setTestResult({
        success: false,
        status: 'error',
        message: urlValidation.error || 'رابط Supabase غير صالح.',
        isAuthReachable: false,
        canQueryDatabase: false,
      });
      return;
    }

    const keyValidation = validateSupabaseKey(trimmedKey);
    if (!keyValidation.isValid) {
      setTestResult({
        success: false,
        status: 'error',
        message: keyValidation.error || 'مفتاح الوصول غير صالح.',
        isAuthReachable: false,
        canQueryDatabase: false,
      });
      return;
    }

    // Clear stale cached station to prevent cross-project pollution
    try {
      localStorage.removeItem('psms_selected_station_id');
    } catch {}

    setCustomCredentials(trimmedUrl, trimmedKey);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 3000);
    runTest();
  };

  const handleClearCredentials = () => {
    clearCustomCredentials();
    try {
      localStorage.removeItem('psms_selected_station_id');
    } catch {}
    setInputUrl('https://gygksvqqqtjqgcnwfjha.supabase.co');
    setInputKey('');
    setTestResult(null);
  };

  const copyScriptText = async (scriptKey: string, filePath: string) => {
    try {
      const response = await fetch(filePath);
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      setCopiedScript(scriptKey);
      setTimeout(() => setCopiedScript(null), 3000);
    } catch {
      setCopiedScript(scriptKey);
      setTimeout(() => setCopiedScript(null), 3000);
    }
  };

  const copyEnvSnippet = () => {
    navigator.clipboard.writeText(envSample);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 3000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="تهيئة وربط قاعدة بيانات Supabase (PostgreSQL & RLS)"
      description="إدارة الاتصال المباشر، الفحص التشخيصي، وملفات الترحيل التصحيحية لمشروع PSMS"
      maxWidth="2xl"
    >
      <div className="space-y-5 text-xs text-slate-300">
        {/* Status Callout */}
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-4 ${
            config.isConfigured
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
              : 'bg-amber-950/40 border-amber-800/80 text-amber-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {config.isConfigured ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              )}
            </div>
            <div>
              <p className="font-semibold text-sm">
                {config.isConfigured
                  ? 'اتصال Supabase مهيأ ونشط في المنظومة'
                  : 'الاتصال المباشر بـ Supabase غير مهيأ بعد (يعمل في وضع التجربة المحلي)'}
              </p>
              <p className="text-xs text-slate-300 mt-1 font-mono break-all">
                المشروع: {config.url}
              </p>
              {config.isCustom && (
                <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] bg-blue-900/60 text-blue-300 border border-blue-700">
                  تم ضبط بيانات الاتصال محلياً من المتصفح
                </span>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={runTest}
            isLoading={testing}
            className="shrink-0 text-white cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>اختبار الاتصال</span>
          </Button>
        </div>

        {/* Test Result Message */}
        {testResult && (
          <div
            className={`p-3.5 rounded-lg border text-xs space-y-2 ${
              testResult.success
                ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/50 border-rose-800 text-rose-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{testResult.message}</p>
              {testResult.latencyMs !== undefined && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 shrink-0">
                  {testResult.latencyMs}ms
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80 text-[11px] font-mono">
              <span className={`px-2 py-0.5 rounded ${testResult.isAuthReachable ? 'bg-emerald-900/60 text-emerald-200' : 'bg-rose-900/60 text-rose-200'}`}>
                خدمة Auth: {testResult.isAuthReachable ? 'متاحة' : 'غير متاحة'}
              </span>
              <span className={`px-2 py-0.5 rounded ${testResult.canQueryDatabase ? 'bg-emerald-900/60 text-emerald-200' : testResult.status === 'permission_denied' ? 'bg-cyan-900/60 text-cyan-200' : 'bg-rose-900/60 text-rose-200'}`}>
                قاعدة البيانات: {testResult.canQueryDatabase ? 'استعلام ناجح' : testResult.status === 'permission_denied' ? 'محمية بـ RLS (تتطلب تسجيل الدخول)' : 'تعذر الاستعلام'}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                الحالة: {testResult.status}
              </span>
            </div>
          </div>
        )}

        {/* Section 1: Quick Connect Input */}
        <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" />
              <h3 className="font-semibold text-sm text-white">إعدادات الاتصال بمشروع Supabase (gygksvqqqtjqgcnwfjha):</h3>
            </div>
            {config.isCustom && (
              <button
                type="button"
                onClick={handleClearCredentials}
                className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>إعادة تعيين</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                رابط المشروع (Supabase URL):
              </label>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="https://gygksvqqqtjqgcnwfjha.supabase.co"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                مفتاح الوصول العام (Anon / Publishable Key):
              </label>
              <input
                type="password"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">
              {isSavedNotice ? 'تم حفظ البيانات وتحديث عميل الاتصال بنجاح!' : 'يتم حفظ المفتاح بأمان داخل متصفحك فقط.'}
            </span>
            <Button
              size="sm"
              onClick={handleSaveCredentials}
              className="bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>حفظ وتفعيل الاتصال</span>
            </Button>
          </div>
        </div>

        {/* Section 2: SQL Scripts for Supabase SQL Editor */}
        <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-sm text-white">ملفات الصيانة والإصلاح في Supabase SQL Editor:</h3>
            </div>
          </div>
          <p className="text-slate-400 text-xs">
            يمكنك نسخ أي من الملفات التالية ولصقها مباشرة في <strong>SQL Editor</strong> بمشروعك (gygksvqqqtjqgcnwfjha):
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Patch 09 */}
            <div className="p-2.5 bg-slate-900/90 border border-blue-900/60 rounded-lg flex flex-col justify-between gap-2">
              <div>
                <p className="font-semibold text-white text-xs">09_production_readiness_patch.sql</p>
                <p className="text-[11px] text-blue-300 mt-0.5">
                  الإصلاح الشامل: يحل تكرار RLS (42P17) وخطأ استخراج الدور (P0001) نهائياً.
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyScriptText('patch09', '/supabase/migrations/09_production_readiness_patch.sql')}
                className="w-full flex items-center justify-center gap-1.5 py-1 px-2.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] cursor-pointer"
              >
                {copiedScript === 'patch09' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript === 'patch09' ? 'تم نسخ ملف 09!' : 'نسخ كود الإصلاح الشامل 09'}</span>
              </button>
            </div>

            {/* Diagnostic Check */}
            <div className="p-2.5 bg-slate-900/90 border border-slate-700 rounded-lg flex flex-col justify-between gap-2">
              <div>
                <p className="font-semibold text-white text-xs">diagnostic_check.sql</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  فحص تشخيصي آمن للقراءة فقط: يفحص الجداول، الـ Triggers، والسياسات.
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyScriptText('diag', '/supabase/diagnostic_check.sql')}
                className="w-full flex items-center justify-center gap-1.5 py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] cursor-pointer"
              >
                {copiedScript === 'diag' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript === 'diag' ? 'تم نسخ الفحص التشخيصي!' : 'نسخ كود الفحص التشخيصي'}</span>
              </button>
            </div>

            {/* Migration 08 */}
            <div className="p-2.5 bg-slate-900/90 border border-slate-700 rounded-lg flex flex-col justify-between gap-2">
              <div>
                <p className="font-semibold text-white text-xs">08_fix_jwt_role_extraction.sql</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  إصلاح استخراج الدور فقط باستخدام auth.role() لدالة إنشاء الموظفين.
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyScriptText('m08', '/supabase/migrations/08_fix_jwt_role_extraction_in_employee_provisioning.sql')}
                className="w-full flex items-center justify-center gap-1.5 py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] cursor-pointer"
              >
                {copiedScript === 'm08' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript === 'm08' ? 'تم نسخ ملف 08!' : 'نسخ كود Migration 08'}</span>
              </button>
            </div>

            {/* Migration 01 */}
            <div className="p-2.5 bg-slate-900/90 border border-slate-700 rounded-lg flex flex-col justify-between gap-2">
              <div>
                <p className="font-semibold text-white text-xs">01_initial_schema.sql</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  المخطط التأسيسي للجداول (18 جدولاً) في حال كانت القاعدة جديدة كلياً.
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyScriptText('m01', '/supabase/migrations/01_initial_schema.sql')}
                className="w-full flex items-center justify-center gap-1.5 py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] cursor-pointer"
              >
                {copiedScript === 'm01' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript === 'm01' ? 'تم نسخ ملف 01!' : 'نسخ المخطط التأسيسي 01'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Security Summary Box */}
        <div className="p-3 bg-blue-950/20 border border-blue-900/40 rounded-lg flex items-start gap-2.5 text-blue-300">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>ملاحظة أمنية مشددة:</strong> لن يتم إرسال أي مفاتيح سرية (Service Role Key) إلى المتصفح أبداً.
            يعتمد التطبيق فقط على المفتاح القابل للنشر (Publishable Key) مع فرض صلاحيات صارمة عبر RLS في PostgreSQL.
          </p>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-800">
          <Button size="sm" onClick={onClose} className="cursor-pointer">
            إغلاق
          </Button>
        </div>
      </div>
    </Modal>
  );
};
