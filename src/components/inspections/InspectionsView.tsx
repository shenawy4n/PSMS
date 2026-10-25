/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ClipboardCheck, CheckCircle2, AlertTriangle, Calendar, Plus } from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { Button } from '../ui/Button';

export const InspectionsView: React.FC = () => {
  const { stations } = useStations();

  const mockInspections = [
    {
      id: 'insp-1',
      station_code: 'STN-380-C01',
      station_name: 'محطة تحويل جنوب الرياض الفائقة',
      inspector: 'م. فهد القحطاني',
      date: '2026-10-20',
      rating: 'ممتاز',
      findings: 'فحص منظومة تبريد المحولات ومستوى زيت عوازل البطانات (Bushings)، الحالة نموذجية.',
      status: 'معتمد',
    },
    {
      id: 'insp-2',
      station_code: 'STN-132-E04',
      station_name: 'محطة تحويل الدمام الصناعية',
      inspector: 'فني. عبدالله الحربي',
      date: '2026-10-18',
      rating: 'يحتاج متابعة',
      findings: 'ملاحظة ترسبات غبارية خفيفة على عوازل السكينة الهوائية 33 ك.ف، تمت جدولة غسيل عوازل.',
      status: 'قيد الإجراء',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">الفحوصات الميدانية والمعايرة</h1>
          <p className="text-xs text-slate-400 mt-1">
            قوائم التحقق الدورية للسلامة المهنية، فحص المحولات، ومطابقة معايير العزل الكهربائي
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {mockInspections.map((insp) => (
          <div key={insp.id} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                  {insp.station_code}
                </span>
                <span className="text-xs font-medium text-white">{insp.station_name}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                  التقييم: {insp.rating}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                تاريخ الفحص: {new Date(insp.date).toLocaleDateString('ar-SA')}
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{insp.findings}</p>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/60 font-mono">
              <span>الفاحص الميداني: <span className="text-slate-200 font-sans">{insp.inspector}</span></span>
              <span className="text-emerald-400 font-sans">الحالة: {insp.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
