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
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { isSupabaseConfigured, getSupabaseConfig, testSupabaseConnection } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface SupabaseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({ isOpen, onClose }) => {
  const config = getSupabaseConfig();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [copiedMigration, setCopiedMigration] = useState(false);
  const [copiedMigration2, setCopiedMigration2] = useState(false);
  const [copiedMigration3, setCopiedMigration3] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);

  const envSample = `VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-or-publishable-key"`;

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testSupabaseConnection();
    setTestResult(result);
    setTesting(false);
  };

  const copyMigrationSQL = async (migrationNum: 1 | 2 | 3) => {
    const filename =
      migrationNum === 1
        ? '/supabase/migrations/01_initial_schema.sql'
        : migrationNum === 2
        ? '/supabase/migrations/02_security_and_assignments.sql'
        : '/supabase/migrations/03_super_admin_provisioning.sql';

    try {
      const response = await fetch(filename);
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      if (migrationNum === 1) {
        setCopiedMigration(true);
        setTimeout(() => setCopiedMigration(false), 3000);
      } else if (migrationNum === 2) {
        setCopiedMigration2(true);
        setTimeout(() => setCopiedMigration2(false), 3000);
      } else {
        setCopiedMigration3(true);
        setTimeout(() => setCopiedMigration3(false), 3000);
      }
    } catch {
      if (migrationNum === 1) {
        setCopiedMigration(true);
        setTimeout(() => setCopiedMigration(false), 3000);
      } else if (migrationNum === 2) {
        setCopiedMigration2(true);
        setTimeout(() => setCopiedMigration2(false), 3000);
      } else {
        setCopiedMigration3(true);
        setTimeout(() => setCopiedMigration3(false), 3000);
      }
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
      description="دليل الربط السريع ونشر مخطط الجداول وسياسات الأمان على مشروع Supabase الخاص بك"
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
                  ? 'تم العثور على متغيرات Supabase في البيئة'
                  : 'متغيرات البيئة لـ Supabase غير مضبوطة بعد'}
              </p>
              <p className="text-xs text-slate-300 mt-1 font-mono">
                الرابط: {config.url}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={runTest}
            isLoading={testing}
            className="shrink-0 text-white"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>اختبار الاتصال</span>
          </Button>
        </div>

        {/* Test Result Message */}
        {testResult && (
          <div
            className={`p-3 rounded-lg border font-mono text-xs ${
              testResult.success
                ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/50 border-rose-800 text-rose-300'
            }`}
          >
            <p>{testResult.message}</p>
            {testResult.latencyMs !== undefined && (
              <p className="text-[11px] text-slate-400 mt-1">زمن الاستجابة: {testResult.latencyMs}ms</p>
            )}
          </div>
        )}

        {/* Step-by-Step Setup Instructions */}
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold text-white">خطوات الربط والتشغيل (خلال دقيقتين):</h3>

          {/* Step 1 */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">1. إضافة متغيرات البيئة</span>
              <button
                onClick={copyEnvSnippet}
                className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                {copiedEnv ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedEnv ? 'تم النسخ!' : 'نسخ النموذج'}</span>
              </button>
            </div>
            <p className="text-slate-400">
              قم بإنشاء ملف <code className="text-blue-400">.env</code> أو ضبط المتغيرات في لوحة التحكم:
            </p>
            <pre className="p-2 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-slate-300 overflow-x-auto">
              {envSample}
            </pre>
          </div>

          {/* Step 2 */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-semibold text-slate-200">2. تنفيذ ملفات الترحيل SQL في Supabase</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => copyMigrationSQL(1)}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  {copiedMigration ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedMigration ? 'تم النسخ!' : '01 (المخطط)'}</span>
                </button>
                <button
                  onClick={() => copyMigrationSQL(2)}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  {copiedMigration2 ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedMigration2 ? 'تم النسخ!' : '02 (الأمان)'}</span>
                </button>
                <button
                  onClick={() => copyMigrationSQL(3)}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-blue-950/70 border border-blue-700 rounded text-blue-300 hover:text-white cursor-pointer font-semibold"
                >
                  {copiedMigration3 ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedMigration3 ? 'تم النسخ!' : '03 (تعيين السوبر أدمن)'}</span>
                </button>
              </div>
            </div>
            <p className="text-slate-400">
              افتح <strong>SQL Editor</strong> في لوحة تحكم مشروع Supabase والصق الكود بالترتيب:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 pr-2">
              <li><strong>ملف 01_initial_schema.sql:</strong> إنشاء 18 جدولاً، الأنواع، وسياسات RLS التأسيسية.</li>
              <li><strong>ملف 02_security_and_assignments.sql:</strong> تشديد سياسات التكليف الميداني، الفهارس الفريدة، ومحفزات التدقيق التلقائي بالخادم.</li>
              <li><strong>ملف 03_super_admin_provisioning.sql:</strong> ترقية الحساب الحقيقي إلى مدير عام (Super Admin) بأمان تام وتوثيق التدقيق.</li>
            </ul>
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
          <Button size="sm" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </div>
    </Modal>
  );
};
