/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Zap,
  Activity,
  AlertTriangle,
  Wrench,
  Users,
  ShieldAlert,
  ArrowUpRight,
  Database,
  Plus,
  ClipboardList,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { canCreateStation } from '../../lib/permissions';
import { Button } from '../ui/Button';

interface DashboardViewProps {
  onNavigate: (tabId: string) => void;
  onOpenNewStationModal: () => void;
  onOpenSetupModal?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenNewStationModal,
  onOpenSetupModal,
}) => {
  const { stations, faultReports, maintenanceOrders, stationReadings } = useStations();
  const { currentUser, role } = useAuth();

  // Metrics calculated strictly from real authorized station data
  const totalStations = stations.length;
  const operationalStations = stations.filter((s) => s.status === 'operational').length;
  const maintenanceStations = stations.filter((s) => s.status === 'under_maintenance').length;
  const outOfServiceStations = stations.filter((s) => s.status === 'out_of_service').length;

  const openFaults = faultReports.filter((f) => f.status === 'open' || f.status === 'in_progress').length;
  const criticalFaults = faultReports.filter(
    (f) => f.severity === 'critical' && f.status !== 'closed' && f.status !== 'resolved'
  ).length;

  const totalPersonnel = stations.reduce((acc, curr) => acc + (curr.assigned_personnel_count || 0), 0);
  const totalCapacityMW = stations.reduce((acc, curr) => acc + curr.installed_capacity_mw, 0);
  const currentLoadMW = stations.reduce((acc, curr) => acc + (curr.current_load_mw || 0), 0);

  // Chart data: Distribution by station type
  const typeMap: Record<string, number> = {
    'نقل وتحويل': 0,
    'توزيع': 0,
    'توليد': 0,
    'طاقة متجددة': 0,
    'أخرى': 0,
  };

  stations.forEach((s) => {
    if (s.type === 'transmission') typeMap['نقل وتحويل'] += 1;
    else if (s.type === 'distribution') typeMap['توزيع'] += 1;
    else if (s.type === 'generation') typeMap['توليد'] += 1;
    else if (s.type === 'solar_hybrid') typeMap['طاقة متجددة'] += 1;
    else typeMap['أخرى'] += 1;
  });

  const chartDataByType = Object.entries(typeMap).map(([name, count]) => ({
    name,
    count,
  }));

  // Status breakdown chart data
  const statusPieData = [
    { name: 'تشغيلية', value: operationalStations, color: '#10B981' },
    { name: 'تحت الصيانة', value: maintenanceStations, color: '#F59E0B' },
    { name: 'خارج الخدمة', value: outOfServiceStations, color: '#EF4444' },
  ].filter((item) => item.value > 0);

  const canAdd = canCreateStation(role);

  return (
    <div className="space-y-6">

      {/* Header with Title and Quick Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">لوحة العمليات والتحكم</h1>
          <p className="text-xs text-slate-400 mt-1">
            نطاق الحساب: <span className="text-blue-400 font-medium">{currentUser?.full_name}</span> (
            {currentUser?.department || 'المقر الرئيسي'}) · آخر تحديث لحظي
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {canAdd && (
            <Button size="sm" onClick={onOpenNewStationModal}>
              <Plus className="w-4 h-4" />
              <span>إضافة محطة جديدة</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onNavigate('readings')}>
            <Activity className="w-4 h-4" />
            <span>تسجيل قياس فوري</span>
          </Button>
        </div>
      </div>

      {/* Primary KPI Grid (8 Metrics) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1: Total Stations */}
        <div
          onClick={() => onNavigate('stations')}
          className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-xl cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>إجمالي المحطات المعتمدة</span>
            <Zap className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">{totalStations}</div>
          <div className="text-[11px] text-slate-500 mt-1">المحطات المصرح لك بالوصول لها</div>
        </div>

        {/* Metric 2: Operational Stations */}
        <div
          onClick={() => onNavigate('stations')}
          className="bg-slate-900 border border-slate-800 hover:border-emerald-900/60 p-4 rounded-xl cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>المحطات التشغيلية (النشطة)</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
            {operationalStations}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {totalStations > 0 ? `${Math.round((operationalStations / totalStations) * 100)}% الجاهزية التشغيلية` : '0%'}
          </div>
        </div>

        {/* Metric 3: Under Maintenance */}
        <div
          onClick={() => onNavigate('stations')}
          className="bg-slate-900 border border-slate-800 hover:border-amber-900/60 p-4 rounded-xl cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>تحت أعمال الصيانة</span>
            <Wrench className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 font-mono tabular-nums">
            {maintenanceStations}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">تخضع لجداول صيانة وقائية أو تصحيحية</div>
        </div>

        {/* Metric 4: Out of Service */}
        <div
          onClick={() => onNavigate('stations')}
          className="bg-slate-900 border border-slate-800 hover:border-rose-900/60 p-4 rounded-xl cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>خارج الخدمة</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 font-mono tabular-nums">
            {outOfServiceStations}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">عزل طارئ أو توقف فني معتمد</div>
        </div>

        {/* Metric 5: Open Faults */}
        <div
          onClick={() => onNavigate('faults')}
          className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-xl cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>البلاغات المفتوحة</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">{openFaults}</div>
          <div className="text-[11px] text-slate-500 mt-1">قيد المتابعة أو التحقيق الموقعي</div>
        </div>

        {/* Metric 6: Critical Faults */}
        <div
          onClick={() => onNavigate('faults')}
          className="bg-slate-900 border border-slate-800 hover:border-rose-900/60 p-4 rounded-xl cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>أعطال حرجة</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-500 font-mono tabular-nums">
            {criticalFaults}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">تتطلب تدخلاً فورياً</div>
        </div>

        {/* Metric 7: Active Personnel */}
        <div
          onClick={() => onNavigate('employees')}
          className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-xl cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>طواقم العمل المعينة</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">
            {totalPersonnel}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">مشرفون ومهندسون وفنيو مناوبة</div>
        </div>

        {/* Metric 8: Grid Capacity Load */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>الحمل اللحظي / القدرة</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">
            {currentLoadMW.toFixed(1)} <span className="text-xs text-slate-400">/ {totalCapacityMW} م.و</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            نسبة التحميل: {totalCapacityMW > 0 ? ((currentLoadMW / totalCapacityMW) * 100).toFixed(1) : 0}%
          </div>
        </div>
      </div>

      {/* Visual Analytics Split: Station Distribution & Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Distribution by Type (Bar Chart) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">توزيع المحطات حسب التصنيف الفني</h2>
            <span className="text-xs text-slate-400 font-mono">نطاق السجلات المعتمدة</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartDataByType} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#F8FAFC',
                    fontSize: '12px',
                    textAlign: 'right',
                  }}
                />
                <Bar dataKey="count" fill="#2563EB" radius={[4, 4, 0, 0]} name="عدد المحطات" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Operational Health Distribution (Pie) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-200">الحالة التشغيلية للمحطات</h2>
            <span className="text-xs text-slate-400 font-mono tabular-nums">{totalStations} محطة</span>
          </div>
          <div className="h-52 w-full flex items-center justify-center">
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                      textAlign: 'right',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-500">مفيش محطات مسجلة</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800 text-center text-xs">
            <div>
              <span className="text-emerald-400 font-bold font-mono tabular-nums">{operationalStations}</span>
              <p className="text-[11px] text-slate-400">تشغيلية</p>
            </div>
            <div>
              <span className="text-amber-400 font-bold font-mono tabular-nums">{maintenanceStations}</span>
              <p className="text-[11px] text-slate-400">صيانة</p>
            </div>
            <div>
              <span className="text-rose-400 font-bold font-mono tabular-nums">{outOfServiceStations}</span>
              <p className="text-[11px] text-slate-400">خارج الخدمة</p>
            </div>
          </div>
        </div>
      </div>

      {/* Two-Column Detail Grid: Recent Readings & Recent Work Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest Readings Strip */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <h2 className="text-sm font-semibold text-slate-200">آخر القراءات التشغيلية المسجلة</h2>
            <button
              onClick={() => onNavigate('readings')}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
            >
              <span>عرض الكل</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2.5">
            {stationReadings.length > 0 ? (
              stationReadings.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-medium text-slate-200">{r.station_name || r.station_code}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      سُجلت بواسطة: {r.recorder_name} · {new Date(r.reading_timestamp).toLocaleDateString('ar-EG')}
                    </p>
                  </div>
                  <div className="text-left font-mono">
                    <span className="text-emerald-400 font-bold tabular-nums">{r.voltage_kv} ك.ف</span>
                    <p className="text-[11px] text-slate-400 tabular-nums">{r.active_power_mw} م.و</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 py-6 text-center">مفيش قراءات تشغيلية مسجلة حتى الآن.</p>
            )}
          </div>
        </div>

        {/* Latest Maintenance Orders */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <h2 className="text-sm font-semibold text-slate-200">أوامر الصيانة الجارية</h2>
            <button
              onClick={() => onNavigate('maintenance')}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
            >
              <span>سجل الأوامر</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2.5">
            {maintenanceOrders.length > 0 ? (
              maintenanceOrders.slice(0, 3).map((m) => (
                <div
                  key={m.id}
                  className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-medium text-slate-200">{m.title}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {m.station_name} · أمر: {m.order_code}
                    </p>
                  </div>
                  <div className="text-left">
                    <span className="text-amber-400 font-medium">قيد التنفيذ</span>
                    <p className="text-[11px] text-slate-400">{m.lead_technician_name}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 py-6 text-center">مفيش أوامر صيانة مسجلة حالياً.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
