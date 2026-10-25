/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle, Plus, CheckCircle, Clock, Search, ShieldAlert } from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { getFaultSeverityInfo } from '../../lib/permissions';
import { FaultStatus } from '../../types/database';
import { Button } from '../ui/Button';

interface FaultReportsViewProps {
  onOpenAddModal: () => void;
}

export const FaultReportsView: React.FC<FaultReportsViewProps> = ({ onOpenAddModal }) => {
  const { faultReports, updateFaultStatus } = useStations();
  const { role } = useAuth();
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  const canChangeStatus = role === 'super_admin' || role === 'admin' || role === 'supervisor';

  const filteredFaults = faultReports.filter((f) => {
    if (selectedStatusFilter === 'all') return true;
    return f.status === selectedStatusFilter;
  });

  const getStatusArabic = (status: FaultStatus) => {
    switch (status) {
      case 'open':
        return { label: 'مفتوح جديد', color: 'text-rose-400 bg-rose-950/60 border-rose-800' };
      case 'in_progress':
        return { label: 'قيد المعالجة الميدانية', color: 'text-amber-400 bg-amber-950/60 border-amber-800' };
      case 'resolved':
        return { label: 'تم الإصلاح والمعايرة', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' };
      case 'closed':
        return { label: 'مغلق نهائياً', color: 'text-slate-400 bg-slate-800 border-slate-700' };
      default:
        return { label: status, color: 'text-slate-300 bg-slate-800 border-slate-700' };
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">سجل الأعطال والبلاغات الطارئة</h1>
          <p className="text-xs text-slate-400 mt-1">
            إدارة وتتبع الحوادث التشغيلية، إشارات الوقاية، وأعطال المحولات والقواطع ({filteredFaults.length} بلاغ)
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="danger" size="sm" onClick={onOpenAddModal}>
            <Plus className="w-4 h-4" />
            <span>تسجيل بلاغ عطل</span>
          </Button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex gap-3">
        <select
          value={selectedStatusFilter}
          onChange={(e) => setSelectedStatusFilter(e.target.value)}
          className="w-full md:w-64 px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
        >
          <option value="all">كل حالات البلاغات</option>
          <option value="open">البلاغات المفتوحة</option>
          <option value="in_progress">قيد المعالجة</option>
          <option value="resolved">المعالجة والمعتمدة</option>
          <option value="closed">المغلقة</option>
        </select>
      </div>

      <div className="space-y-3">
        {filteredFaults.map((fault) => {
          const sev = getFaultSeverityInfo(fault.severity);
          const st = getStatusArabic(fault.status);

          return (
            <div
              key={fault.id}
              className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                    {fault.report_code}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${sev.bg} ${sev.text}`}>
                    الخطورة: {sev.label}
                  </span>
                  <span className={`text-xs px-2.5 py-0.5 rounded border font-medium ${st.color}`}>
                    {st.label}
                  </span>
                </div>
                <span className="text-xs text-slate-500 font-mono">
                  تاريخ الحدوث: {new Date(fault.occurred_at).toLocaleString('ar-SA')}
                </span>
              </div>

              <div>
                <h3 className="text-base font-semibold text-white">{fault.title}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{fault.description}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-400 font-mono pt-2 border-t border-slate-800/60">
                <div>المحطة: <span className="text-slate-200 font-sans">{fault.station_name}</span></div>
                <div>المعدة: <span className="text-slate-200 font-sans">{fault.asset_name || 'عام بالموقع'}</span></div>
                <div>المبلغ: <span className="text-slate-200 font-sans">{fault.reporter_name}</span></div>
              </div>

              {canChangeStatus && (
                <div className="flex items-center gap-2 pt-2 text-xs">
                  <span className="text-slate-500">تحديث حالة البلاغ:</span>
                  {fault.status === 'open' && (
                    <button
                      onClick={() => updateFaultStatus(fault.id, 'in_progress')}
                      className="px-2.5 py-1 rounded bg-amber-950/60 text-amber-300 border border-amber-800 hover:bg-amber-900/50 cursor-pointer"
                    >
                      بدء المعالجة الميدانية
                    </button>
                  )}
                  {fault.status === 'in_progress' && (
                    <button
                      onClick={() => updateFaultStatus(fault.id, 'resolved', 'تم إصلاح العطل واستعادة التغذية')}
                      className="px-2.5 py-1 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800 hover:bg-emerald-900/50 cursor-pointer"
                    >
                      اعتماد اكتمال الإصلاح
                    </button>
                  )}
                  {fault.status === 'resolved' && (
                    <button
                      onClick={() => updateFaultStatus(fault.id, 'closed')}
                      className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 cursor-pointer"
                    >
                      إغلاق البلاغ نهائياً
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
