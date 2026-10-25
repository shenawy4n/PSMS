/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FileBarChart, Download, Calendar, Zap, CheckCircle2 } from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { Button } from '../ui/Button';

export const ReportsView: React.FC = () => {
  const { stations, faultReports, stationReadings } = useStations();
  const [reportType, setReportType] = useState('monthly_load');
  const [generating, setGenerating] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    }, 800);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">التقارير الفنية والتشغيلية</h1>
          <p className="text-xs text-slate-400 mt-1">
            إصدار تقارير الأحمال القصوى، فترات انقطاع الخدمة، وتحليلات موثوقية الأصول
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">إعداد التقرير الدوري</h2>
          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">نوع التقرير:</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
              >
                <option value="monthly_load">تقرير الأحمال وساعات الذروة الشهرية</option>
                <option value="fault_analysis">تقرير تحليل أسباب الأعطال ومؤشرات SAIDI</option>
                <option value="maintenance_compliance">تقرير الامتثال لخطط الصيانة الوقائية</option>
                <option value="station_inventory">تقرير الحصر الفني للأصول والمعدات</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">الفترة الزمنية:</label>
              <select className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200">
                <option>الشهر الحالي (أكتوبر 2026)</option>
                <option>الربع الثالث 2026</option>
                <option>العام المالي 2026 كامل</option>
              </select>
            </div>

            <Button
              className="w-full mt-2"
              size="sm"
              onClick={handleGenerate}
              isLoading={generating}
            >
              <FileBarChart className="w-4 h-4" />
              <span>توليد وتصدير التقرير</span>
            </Button>

            {downloadSuccess && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-300 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>تم إعداد التقرير بنجاح وتجهيزه للتنزيل (PDF/Excel).</span>
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">التقارير المعتمدة والمحفوظة مؤخراً</h2>
          <div className="space-y-3">
            {[
              {
                title: 'تقرير كفاءة محطات التحويل الفائقة 380 ك.ف - الربع الثالث 2026',
                date: '2026-10-01',
                size: '2.4 MB',
                type: 'PDF',
              },
              {
                title: 'سجل اختبارات زيت محولات القدرة DGA والغازات المنحلة',
                date: '2026-09-15',
                size: '1.1 MB',
                type: 'XLSX',
              },
              {
                title: 'التقرير السنوي لموثوقية قواطع SF6 ومعدلات التسرب الغازي',
                date: '2026-08-30',
                size: '4.8 MB',
                type: 'PDF',
              },
            ].map((rep, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-blue-950 text-blue-400 flex items-center justify-center font-bold text-xs font-mono">
                    {rep.type}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-100">{rep.title}</h3>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      تاريخ الإصدار: {rep.date} · الحجم: {rep.size}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleGenerate}
                  className="p-2 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-800 transition-colors"
                  title="تحميل التقرير"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
