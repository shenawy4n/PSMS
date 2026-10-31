/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Activity, Plus, Search, Filter, AlertCircle, Download } from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

interface ReadingsViewProps {
  onOpenAddModal: () => void;
}

export const ReadingsView: React.FC<ReadingsViewProps> = ({ onOpenAddModal }) => {
  const { stationReadings, stations } = useStations();
  const [selectedStationFilter, setSelectedStationFilter] = useState('all');

  const filteredReadings = stationReadings.filter((r) => {
    if (selectedStationFilter === 'all') return true;
    return r.station_id === selectedStationFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">سجل القياسات والقراءات التشغيلية</h1>
          <p className="text-xs text-slate-400 mt-1">
            متابعة القياسات اللحظية للأحمال، التردد، الجهد، ومعامل القدرة عبر المحطات ({filteredReadings.length} قياس)
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button size="sm" onClick={onOpenAddModal}>
            <Plus className="w-4 h-4" />
            <span>تسجيل قراءة فنية</span>
          </Button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-3">
        <div className="w-full md:w-80">
          <select
            value={selectedStationFilter}
            onChange={(e) => setSelectedStationFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
          >
            <option value="all">كل المحطات المصرح بها</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} - {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredReadings.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-slate-400">
            <Activity className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-white">
            {stationReadings.length === 0 ? 'مفيش قراءات تشغيلية مسجلة للفترة دي.' : 'مفيش قراءات مطابقة للمحطة المختارة.'}
          </p>
          <p className="text-xs text-slate-400">تقدر تسجل قراءة جديدة من خلال الضغط على زر "تسجيل قراءة فنية" في الأعلى.</p>
        </div>
      ) : (
        <>
          {/* Mobile Card View (< 768px) */}
          <div className="block md:hidden space-y-3">
            {filteredReadings.map((r) => (
              <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div>
                    <h3 className="font-semibold text-white text-sm">{r.station_name || r.station_code}</h3>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {new Date(r.reading_timestamp).toLocaleString('ar-EG')}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800">
                    {r.active_power_mw} MW
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block font-sans">الجهد الكهربائي:</span>
                    <span className="font-bold text-emerald-400 tabular-nums">{r.voltage_kv} kV</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block font-sans">الحمل غير الفعال:</span>
                    <span className="text-slate-200 tabular-nums">{r.reactive_power_mvar ? `${r.reactive_power_mvar} MVAR` : '-'}</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block font-sans">التردد:</span>
                    <span className="text-slate-200 tabular-nums">{r.frequency_hz} Hz</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block font-sans">معامل القدرة:</span>
                    <span className="text-slate-200 tabular-nums">{r.power_factor}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 font-mono">
                  <span>حرارة الزيت: {r.transformer_temp_celsius ? `${r.transformer_temp_celsius}°C` : '-'}</span>
                  <span className="font-sans">المسجل: {r.recorder_name}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-medium">
                  <tr>
                    <th className="py-3 px-4">وقت التسجيل</th>
                    <th className="py-3 px-4">المحطة</th>
                    <th className="py-3 px-4">الجهد (kV)</th>
                    <th className="py-3 px-4">الحمل الفعال (MW)</th>
                    <th className="py-3 px-4">الحمل غير الفعال (MVAR)</th>
                    <th className="py-3 px-4">التردد (Hz)</th>
                    <th className="py-3 px-4">معامل القدرة (p.f)</th>
                    <th className="py-3 px-4">حرارة الزيت (°C)</th>
                    <th className="py-3 px-4">ضغط الغاز SF6</th>
                    <th className="py-3 px-4">مسؤول التسجيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-slate-200">
                  {filteredReadings.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">
                        {new Date(r.reading_timestamp).toLocaleString('ar-EG')}
                      </td>
                      <td className="py-3.5 px-4 font-sans font-medium text-white whitespace-nowrap">
                        {r.station_name || r.station_code}
                      </td>
                      <td className="py-3.5 px-4 text-emerald-400 font-bold tabular-nums whitespace-nowrap">
                        {r.voltage_kv} ك.ف
                      </td>
                      <td className="py-3.5 px-4 text-blue-400 font-bold tabular-nums whitespace-nowrap">
                        {r.active_power_mw} م.و
                      </td>
                      <td className="py-3.5 px-4 tabular-nums text-slate-300 whitespace-nowrap">
                        {r.reactive_power_mvar ? `${r.reactive_power_mvar} م.ف` : '-'}
                      </td>
                      <td className="py-3.5 px-4 tabular-nums whitespace-nowrap">{r.frequency_hz} Hz</td>
                      <td className="py-3.5 px-4 tabular-nums whitespace-nowrap">{r.power_factor}</td>
                      <td className="py-3.5 px-4 tabular-nums whitespace-nowrap">{r.transformer_temp_celsius ?? '-'}</td>
                      <td className="py-3.5 px-4 tabular-nums whitespace-nowrap">
                        {r.sf6_gas_pressure_bar ? `${r.sf6_gas_pressure_bar} bar` : '-'}
                      </td>
                      <td className="py-3.5 px-4 font-sans text-slate-400 whitespace-nowrap">
                        {r.recorder_name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
