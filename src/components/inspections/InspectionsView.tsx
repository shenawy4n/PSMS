/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ClipboardCheck, CheckCircle2, AlertTriangle, Calendar, Plus } from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

export const InspectionsView: React.FC = () => {
  const { stations, insulationTests } = useStations();
  const { isDemoMode } = useAuth();

  const stationMap = new Map(stations.map((s) => [s.id, s]));

  const demoInspections = [
    {
      id: 'insp-1',
      station_code: 'CAI-W-500',
      station_name: 'محطة محولات غرب القاهرة 500/220 ك.ف',
      inspector: 'م. طارق إبراهيم',
      date: '2026-10-20',
      rating: 'ممتاز',
      findings: 'فحص منظومة تبريد المحولات ومستوى زيت عوازل البطانات (Bushings)، الحالة نموذجية وفق معايير EETC.',
      status: 'معتمد',
    },
    {
      id: 'insp-2',
      station_code: 'TTA-001',
      station_name: 'محطة محولات طنطا 220/66 ك.ف',
      inspector: 'فني. علي مصطفى',
      date: '2026-10-18',
      rating: 'يحتاج متابعة',
      findings: 'ملاحظة ترسبات أتربة خفيفة على عوازل السكينة الهوائية 66 ك.ف، تمت جدولة غسيل عوازل كيميائي.',
      status: 'قيد الإجراء',
    },
  ];

  const hasRealTests = insulationTests && insulationTests.length > 0;
  const showDemo = !hasRealTests && isDemoMode;

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

      {!hasRealTests && !showDemo ? (
        <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-xl p-8 space-y-3">
          <ClipboardCheck className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-200">مفيش فحوصات ميدانية أو معايرات مسجلة حتى الآن</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            تقدر تسجل فحوصات مقاومة العزل، واختبارات القواطع والمحولات الميدانية مباشرة من صفحة إدارة الصيانة.
          </p>
        </div>
      ) : hasRealTests ? (
        <div className="space-y-3">
          {insulationTests.map((test) => {
            const stn = stationMap.get(test.station_id);
            return (
              <div key={test.id} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                      {test.test_code}
                    </span>
                    <span className="text-xs font-medium text-white">
                      {stn ? stn.name : test.station_name || test.asset_name}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800 font-mono">
                      {test.measured_value} {test.measurement_unit}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-sans ${
                        test.status_rating === 'satisfactory'
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                          : test.status_rating === 'warning'
                          ? 'bg-amber-950/60 text-amber-400 border border-amber-800'
                          : 'bg-rose-950/60 text-rose-400 border border-rose-800'
                      }`}
                    >
                      {test.status_rating === 'satisfactory'
                        ? 'ناجح ومطابق'
                        : test.status_rating === 'warning'
                        ? 'مقبول بتحفظ'
                        : 'راسب - عزل رديء'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    تاريخ الفحص: {new Date(test.test_date).toLocaleDateString('ar-EG')}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-300 font-mono">
                  <div>المعدة: <span className="text-slate-100">{test.asset_name || 'عام بالمحطة'}</span></div>
                  <div>نوع الفحص: <span className="text-slate-100">{test.test_type}</span></div>
                  <div>الجهد المطبق: <span className="text-slate-100">{test.applied_voltage_kv || '-'} kV</span></div>
                  <div>الحرارة: <span className="text-slate-100">{test.temperature_celsius || '-'}°C</span></div>
                </div>

                {(test.remarks || test.recommendations) && (
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {test.remarks} {test.recommendations ? `· التوصيات: ${test.recommendations}` : ''}
                  </p>
                )}

                <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/60 font-mono">
                  <span>الفاحص الميداني: <span className="text-slate-200 font-sans">{test.tester_name || 'مهندس الموقع'}</span></span>
                  <span className="text-blue-400 font-sans">{stn?.code || ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {demoInspections.map((insp) => (
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
                  تاريخ الفحص: {new Date(insp.date).toLocaleDateString('ar-EG')}
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
      )}
    </div>
  );
};
