/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Settings,
  Database,
  ShieldCheck,
  Lock,
  Layers,
  Server,
  Key,
  FileCode,
  Copy,
  Check,
} from 'lucide-react';
import { getSupabaseConfig, testSupabaseConnection } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

interface SettingsViewProps {
  onOpenSetupModal: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenSetupModal }) => {
  const config = getSupabaseConfig();
  const { currentUser, role } = useAuth();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);

  const handleTest = async () => {
    setTesting(true);
    const res = await testSupabaseConnection();
    setTestResult(res);
    setTesting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">إعدادات المنظومة والبنية التحتية</h1>
          <p className="text-xs text-slate-400 mt-1">
            إدارة الاتصال بقاعدة بيانات Supabase، سياسات RLS، والمعايير التشغيلية للشبكة
          </p>
        </div>
        <Button size="sm" onClick={onOpenSetupModal}>
          <Database className="w-4 h-4" />
          <span>لوحة ربط Supabase</span>
        </Button>
      </div>

      {/* Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Supabase Connection Info */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <Database className="w-5 h-5 text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-100">حالة اتصال قاعدة البيانات (PostgreSQL)</h2>
            </div>
            <span
              className={`text-xs px-2.5 py-0.5 rounded border font-medium ${
                config.isConfigured
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                  : 'bg-amber-950/60 text-amber-400 border-amber-800'
              }`}
            >
              {config.isConfigured ? 'نشط ومتصل' : 'وضع المعاينة المحلي'}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">رابط خادم Supabase:</span>
              <span className="text-slate-200 font-mono text-[11px] max-w-xs truncate">{config.url}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">مفتاح النشر العام (Publishable Key):</span>
              <span className="text-slate-200 font-mono text-[11px]">
                {config.hasKey ? '•••••••••••••••• (مضبوط)' : 'غير معرّف'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">إصدار قاعدة البيانات:</span>
              <span className="text-slate-200 font-mono">PostgreSQL 15+ with pg_stat</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <Button size="sm" variant="outline" onClick={handleTest} isLoading={testing}>
              فحص الاتصال الفعلي الآن
            </Button>
            {testResult && (
              <span className={`text-xs font-mono ${testResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                {testResult.message}
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Security & RLS Architecture */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-100">بنية الأمان وسياسات مستوى الصف (RLS)</h2>
          </div>

          <div className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
            <p>
              يتم تطبيق الأمان في PostgreSQL على مستوى قاعدة البيانات ولا يتم الاعتماد على واجهة المستخدم فحسب:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pr-1">
              <li>
                <strong className="text-slate-200">سياسة المحطات:</strong> الموظفون والمشرفون يستطيعون قراءة وتعديل المحطات المكلفين بها فقط (<code className="text-blue-400">station_assignments</code>).
              </li>
              <li>
                <strong className="text-slate-200">سياسة القراءات:</strong> تسجيل القراءات مقتصر على مستخدمين مسجلين ومكلفين بالمحطة ذاتها مع التحقق من <code className="text-blue-400">auth.uid()</code>.
              </li>
              <li>
                <strong className="text-slate-200">سجل التدقيق:</strong> غير قابل للتعديل أو الحذف من المستخدمين (<code className="text-blue-400">read-only for admins</code>).
              </li>
              <li>
                <strong className="text-slate-200">منع تصعيد الصلاحيات:</strong> يمنع المشرفون والمديرون العاديون من ترقية أي حساب إلى رتبة <code className="text-blue-400">super_admin</code>.
              </li>
            </ul>
          </div>
        </div>

        {/* Card 3: Electrical Grid Physical Constants */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
            <Layers className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-semibold text-slate-100">المعايير الهندسية والفيزيائية للشبكة</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-500 block mb-1">التردد الاسمي:</span>
              <span className="text-white font-bold text-sm">50.00 Hz (±0.2)</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-500 block mb-1">معامل القدرة المستهدف:</span>
              <span className="text-white font-bold text-sm">≥ 0.95 Lagging</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-500 block mb-1">الحد الأقصى لحرارة الزيت:</span>
              <span className="text-amber-400 font-bold text-sm">75.0 °C (تحذير) / 85.0 °C (حرج)</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-500 block mb-1">ضغط غاز العزل SF6:</span>
              <span className="text-white font-bold text-sm">6.2 bar (اسمي)</span>
            </div>
          </div>
        </div>

        {/* Card 4: Operating Sector */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
            <Server className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-100">بيانات القطاع والمنظومة</h2>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">الاسم التجاري للنظام:</span>
              <span className="text-slate-200 font-medium">نظام إدارة محطات الكهرباء (PSMS)</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">المستخدم الحالي:</span>
              <span className="text-slate-200 font-medium">{currentUser?.full_name} ({currentUser?.employee_number})</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">بيئة التشغيل:</span>
              <span className="text-emerald-400 font-mono">Production Ready (Enterprise Grade)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
