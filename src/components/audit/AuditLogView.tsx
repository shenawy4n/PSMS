/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldCheck, Search, Filter, Lock } from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { canViewAuditLogs } from '../../lib/permissions';

export const AuditLogView: React.FC = () => {
  const { auditLogs } = useStations();
  const { role } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');

  const isAuthorized = canViewAuditLogs(role);

  if (!isAuthorized) {
    return (
      <div className="py-20 text-center space-y-3 bg-slate-900 border border-slate-800 rounded-xl p-8">
        <Lock className="w-10 h-10 text-rose-400 mx-auto" />
        <h2 className="text-lg font-bold text-white">غير مصرح بالوصول إلى سجل التدقيق الأمني</h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          سجل التدقيق خاضع لحماية أمنية مشددة وفق سياسات RLS، ولا يمكن مراجعته إلا من قبل مديري النظام المعتمدين (Super Admin / Admin).
        </p>
      </div>
    );
  }

  const filteredLogs = auditLogs.filter((log) => {
    const term = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(term) ||
      log.entity_type.toLowerCase().includes(term) ||
      (log.actor_name && log.actor_name.toLowerCase().includes(term)) ||
      (log.actor_email && log.actor_email.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">سجل التدقيق الأمني (Audit Logs)</h1>
          <p className="text-xs text-slate-400 mt-1">
            سجل غير قابل للتعديل يوثق جميع العمليات الحساسة، التعديلات الفنية، وتغيير الصلاحيات ({filteredLogs.length} عملية)
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800 px-3 py-1.5 rounded-lg">
          <ShieldCheck className="w-4 h-4" />
          <span>حماية التدقيق مفعلة (Immutable Ledger)</span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="relative">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="البحث بالعملية، هوية المنفذ، أو الكيان المتأثر..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-medium">
              <tr>
                <th className="py-3 px-4">الطابع الزمني</th>
                <th className="py-3 px-4">المنفّذ (Actor)</th>
                <th className="py-3 px-4">نوع العملية (Action)</th>
                <th className="py-3 px-4">الكيان المتأثر</th>
                <th className="py-3 px-4">معرّف الكيان</th>
                <th className="py-3 px-4">تفاصيل التغيير (Changes)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-slate-200">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('ar-SA')}
                  </td>
                  <td className="py-3.5 px-4 font-sans whitespace-nowrap">
                    <p className="font-medium text-white">{log.actor_name || 'النظام'}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{log.actor_email || '-'}</p>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800 font-semibold text-[11px]">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">{log.entity_type}</td>
                  <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">{log.entity_id}</td>
                  <td className="py-3.5 px-4 max-w-xs truncate text-[11px] text-slate-400 font-mono">
                    {log.new_data ? JSON.stringify(log.new_data) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
