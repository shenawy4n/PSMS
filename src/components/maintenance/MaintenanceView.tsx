/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Wrench, Plus, Calendar, Clock, CheckCircle } from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { Button } from '../ui/Button';

export const MaintenanceView: React.FC = () => {
  const { maintenanceOrders } = useStations();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">إدارة أوامر الصيانة وتصاريح العمل</h1>
          <p className="text-xs text-slate-400 mt-1">
            جدولة وتتبع الصيانة الوقائية والتصحيحية، وفحوصات العوازل وتصاريح السلامة (PTW)
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {maintenanceOrders.map((order) => (
          <div
            key={order.id}
            className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                  {order.order_code}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                  صيانة وقائية دورية
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800">
                  قيد التنفيذ الميداني
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                الفترة المجدولة: {new Date(order.scheduled_start).toLocaleDateString('ar-SA')} - {new Date(order.scheduled_end).toLocaleDateString('ar-SA')}
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-white">{order.title}</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{order.scope_of_work}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-400 font-mono pt-2 border-t border-slate-800/60">
              <div>المحطة: <span className="text-slate-200 font-sans">{order.station_name}</span></div>
              <div>المعدة: <span className="text-slate-200 font-sans">{order.asset_name || '-'}</span></div>
              <div>الفني المسؤول: <span className="text-slate-200 font-sans">{order.lead_technician_name}</span></div>
            </div>

            {order.safety_clearance_number && (
              <div className="p-2.5 bg-slate-950 rounded-lg text-xs text-emerald-400 font-mono border border-slate-800/80 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>رقم تصريح السلامة وعزل الجهد المعتمد (LOTO / PTW): {order.safety_clearance_number}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
