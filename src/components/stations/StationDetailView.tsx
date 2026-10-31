/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ArrowRight,
  Zap,
  Activity,
  Users,
  Cpu,
  AlertTriangle,
  Wrench,
  MapPin,
  Calendar,
  Layers,
  Plus,
  ShieldCheck,
  CheckCircle,
  UserMinus,
  Archive,
  Clock,
} from 'lucide-react';
import { Station, StationAsset, StationReading, FaultReport, StationAssignment } from '../../types/database';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import {
  canSubmitReadings,
  canSubmitFault,
  canAssignPersonnel,
  canEditStation,
  getStationStatusInfo,
  getStationTypeArabic,
  getFaultSeverityInfo,
} from '../../lib/permissions';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface StationDetailViewProps {
  station: Station;
  onBack: () => void;
  onOpenEditModal: (station: Station) => void;
  onOpenAddReadingModal: (stationId: string) => void;
  onOpenAddFaultModal: (stationId: string) => void;
  onOpenAssignPersonnelModal: (stationId: string) => void;
}

export const StationDetailView: React.FC<StationDetailViewProps> = ({
  station,
  onBack,
  onOpenEditModal,
  onOpenAddReadingModal,
  onOpenAddFaultModal,
  onOpenAssignPersonnelModal,
}) => {
  const { stationAssets, stationReadings, faultReports, stationAssignments, maintenanceOrders, deactivateAssignment, archiveStation } = useStations();
  const { role, currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'personnel' | 'assets' | 'readings' | 'faults'>('overview');
  const [assignmentToRevoke, setAssignmentToRevoke] = useState<StationAssignment | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  const statusInfo = getStationStatusInfo(station.status);

  // Filtered records for this specific station
  const thisAssets = stationAssets.filter((a) => a.station_id === station.id);
  const thisReadings = stationReadings.filter((r) => r.station_id === station.id);
  const thisFaults = faultReports.filter((f) => f.station_id === station.id);
  const thisAssignments = stationAssignments.filter((a) => a.station_id === station.id);
  const thisMaintenance = maintenanceOrders.filter((m) => m.station_id === station.id);

  const canEdit = canEditStation(role, currentUser?.organization_id, station.organization_id);
  const canRead = canSubmitReadings(role, station.id, currentUser?.assigned_station_ids || []);
  const canFault = canSubmitFault(role, station.id, currentUser?.assigned_station_ids || []);
  const canAssign = canAssignPersonnel(role);

  const handleConfirmRevoke = async () => {
    if (!assignmentToRevoke) return;
    setIsRevoking(true);
    await deactivateAssignment(assignmentToRevoke.id);
    setIsRevoking(false);
    setAssignmentToRevoke(null);
  };

  const handleConfirmArchive = async () => {
    setIsArchiving(true);
    await archiveStation(station.id, 'تحويل لحالة خارج الخدمة من صفحة تفاصيل المحطة');
    setIsArchiving(false);
    setShowArchiveDialog(false);
  };

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb / Back button */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة إلى قائمة المحطات</span>
        </button>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={() => onOpenEditModal(station)}>
                تعديل بيانات المحطة
              </Button>
              {station.status !== 'out_of_service' && (
                <Button variant="outline" size="sm" onClick={() => setShowArchiveDialog(true)} className="text-rose-400 hover:text-rose-300">
                  <Archive className="w-3.5 h-3.5" />
                  <span>إخراج من الخدمة</span>
                </Button>
              )}
            </>
          )}
          {canRead && (
            <Button size="sm" onClick={() => onOpenAddReadingModal(station.id)}>
              <Activity className="w-3.5 h-3.5" />
              <span>تسجيل قراءة</span>
            </Button>
          )}
          {canFault && (
            <Button variant="secondary" size="sm" onClick={() => onOpenAddFaultModal(station.id)}>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>إبلاغ عن عطل</span>
            </Button>
          )}
        </div>
      </div>

      {/* Station Summary Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/80">
                {station.code}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
              >
                {statusInfo.label}
              </span>
              <span className="text-xs text-slate-400">
                {getStationTypeArabic(station.type)}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{station.name}</h1>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              <span>{station.address} · {station.governorate} ({station.region})</span>
            </p>
          </div>

          {/* Quick Technical KPIs */}
          <div className="grid grid-cols-3 gap-4 bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl font-mono text-center">
            <div className="px-3">
              <span className="text-xs text-slate-400 block mb-0.5">الجهد الاسمي</span>
              <span className="text-lg font-bold text-slate-100 tabular-nums">{station.voltage_level_kv} ك.ف</span>
            </div>
            <div className="px-3 border-r border-slate-800/80">
              <span className="text-xs text-slate-400 block mb-0.5">القدرة المركبة</span>
              <span className="text-lg font-bold text-blue-400 tabular-nums">{station.installed_capacity_mw} م.و</span>
            </div>
            <div className="px-3 border-r border-slate-800/80">
              <span className="text-xs text-slate-400 block mb-0.5">الحمل اللحظي</span>
              <span className="text-lg font-bold text-emerald-400 tabular-nums">
                {station.current_load_mw ? `${station.current_load_mw} م.و` : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-800/80 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>نظرة عامة والبيانات الفنية</span>
          </button>
          <button
            onClick={() => setActiveTab('personnel')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'personnel'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>طاقم العمل والتعيينات ({thisAssignments.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'assets'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>المعدات والأصول الفنية ({thisAssets.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('readings')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'readings'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>سجل القياسات التشغيلية ({thisReadings.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('faults')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'faults'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>الأعطال والصيانة ({thisFaults.length + thisMaintenance.length})</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Overview and Technical Specifications */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 pb-2 border-b border-slate-800">
              البيانات التشغيلية والتنظيمية
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">القطاع / الشركة المشغلة:</span>
                <span className="text-slate-200 font-medium">{station.organization_name || 'الشركة المصرية لنقل الكهرباء (EETC)'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">تاريخ بدء التشغيل التجاري:</span>
                <span className="text-slate-200 font-mono">{station.commissioning_date || 'غير مسجل'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">الإحداثيات الجغرافية:</span>
                <span className="text-slate-200 font-mono">
                  {station.latitude && station.longitude
                    ? `${station.latitude.toFixed(4)}, ${station.longitude.toFixed(4)}`
                    : 'غير محددة'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">تاريخ التسجيل بالمنظومة:</span>
                <span className="text-slate-200 font-mono">
                  {new Date(station.created_at).toLocaleString('ar-EG')}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">آخر تحديث فني معتمد:</span>
                <span className="text-slate-200 font-mono">
                  {station.updated_at ? new Date(station.updated_at).toLocaleString('ar-EG') : 'مطابق لتاريخ التسجيل'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 pb-2 border-b border-slate-800">
              الوصف الفني والملاحظات التشغيلية
            </h2>
            <div className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-lg border border-slate-800/60 min-h-32">
              {station.description || 'لا توجد ملاحظات إضافية مسجلة لهذه المحطة.'}
            </div>
            <div className="p-3 bg-blue-950/20 border border-blue-900/40 rounded-lg text-xs text-blue-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
              <span>المحطة مطابقة للمعايير الوطنية للشبكة الكهربائية (Grid Code Compliance).</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Personnel & Staff Assignments */}
      {activeTab === 'personnel' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">طاقم المناوبة والمهندسون المكلفون بالمحطة</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                الموظفون المصرح لهم بتسجيل القياسات وإجراء الفحوصات الدورية
              </p>
            </div>
            {canAssign && (
              <Button size="sm" onClick={() => onOpenAssignPersonnelModal(station.id)}>
                <Plus className="w-3.5 h-3.5" />
                <span>تكليف موظف</span>
              </Button>
            )}
          </div>

          {thisAssignments.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              مفيش طاقم عمل معين في المحطة دي حالياً.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">الرقم الوظيفي</th>
                    <th className="py-2.5 px-3">اسم الموظف</th>
                    <th className="py-2.5 px-3">الدور المكلف به بالمحطة</th>
                    <th className="py-2.5 px-3">تاريخ بدء التكليف</th>
                    <th className="py-2.5 px-3">الحالة</th>
                    {canAssign && <th className="py-2.5 px-3 text-center">الإجراء</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {thisAssignments.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-3 font-mono text-blue-400">{a.employee_number || 'EMP-XX'}</td>
                      <td className="py-3 px-3 font-medium text-white">{a.user_name || 'موظف تشغيل'}</td>
                      <td className="py-3 px-3 text-slate-300">{a.assignment_role}</td>
                      <td className="py-3 px-3 font-mono text-slate-400">
                        {new Date(a.assigned_at).toLocaleDateString('ar-EG')}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded border ${
                            a.is_active
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {a.is_active ? 'نشط' : 'مكتمل / منتهي'}
                        </span>
                      </td>
                      {canAssign && (
                        <td className="py-3 px-3 text-center">
                          {a.is_active ? (
                            <button
                              onClick={() => setAssignmentToRevoke(a)}
                              className="text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 px-2 py-1 rounded border border-rose-900/50 transition-colors cursor-pointer flex items-center gap-1 mx-auto"
                              title="إنهاء التكليف بهذه المحطة"
                            >
                              <UserMinus className="w-3 h-3" />
                              <span>إنهاء التكليف</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-mono">-</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Station Technical Assets & Equipment */}
      {activeTab === 'assets' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">المعدات والمحولات والقواطع المركبة بالموقع</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                سجل الأصول والبيانات التصنيعية وفترات المعايرة
              </p>
            </div>
          </div>

          {thisAssets.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              مفيش معدات أو أصول رئيسية مسجلة في المحطة دي حتى الآن.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {thisAssets.map((asset) => (
                <div key={asset.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-blue-400">
                      {asset.serial_number}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                      حالة سليمة (Nominal)
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-white">{asset.name}</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 pt-1 font-mono">
                    <div>المصنّع: <span className="text-slate-200">{asset.manufacturer || '-'}</span></div>
                    <div>السعة: <span className="text-slate-200">{asset.rated_capacity || '-'}</span></div>
                    <div>جهد التشغيل: <span className="text-slate-200">{asset.voltage_rating || '-'}</span></div>
                    <div>التصنيف: <span className="text-slate-200">{asset.category}</span></div>
                  </div>
                  {asset.notes && (
                    <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
                      ملاحظة: {asset.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Operational Measurements History */}
      {activeTab === 'readings' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">سجل القياسات الكهربائية والبيئية</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                الجهد، الأحمال، التردد، معامل القدرة، وحرارة الزيت
              </p>
            </div>
            {canRead && (
              <Button size="sm" onClick={() => onOpenAddReadingModal(station.id)}>
                <Plus className="w-3.5 h-3.5" />
                <span>تسجيل قياس</span>
              </Button>
            )}
          </div>

          {thisReadings.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              مفيش قراءات تشغيلية مسجلة للمحطة دي حتى الآن.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">وقت القياس</th>
                    <th className="py-2.5 px-3">الجهد (kV)</th>
                    <th className="py-2.5 px-3">الحمل الفعال (MW)</th>
                    <th className="py-2.5 px-3">التردد (Hz)</th>
                    <th className="py-2.5 px-3">معامل القدرة (p.f)</th>
                    <th className="py-2.5 px-3">حرارة المحول (°C)</th>
                    <th className="py-2.5 px-3">ضغط SF6 (bar)</th>
                    <th className="py-2.5 px-3">المسجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200 font-mono">
                  {thisReadings.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-3 text-slate-300">
                        {new Date(r.reading_timestamp).toLocaleString('ar-EG')}
                      </td>
                      <td className="py-3 px-3 text-emerald-400 font-bold tabular-nums">{r.voltage_kv}</td>
                      <td className="py-3 px-3 text-blue-400 font-bold tabular-nums">{r.active_power_mw}</td>
                      <td className="py-3 px-3 tabular-nums">{r.frequency_hz}</td>
                      <td className="py-3 px-3 tabular-nums">{r.power_factor}</td>
                      <td className="py-3 px-3 tabular-nums">{r.transformer_temp_celsius ?? '-'}</td>
                      <td className="py-3 px-3 tabular-nums">{r.sf6_gas_pressure_bar ?? '-'}</td>
                      <td className="py-3 px-3 font-sans text-slate-400">{r.recorder_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Fault Reports & Maintenance Work Orders */}
      {activeTab === 'faults' && (
        <div className="space-y-6">
          {/* Faults List */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-200">بلاغات الأعطال المسجلة</h2>
              {canFault && (
                <Button variant="secondary" size="sm" onClick={() => onOpenAddFaultModal(station.id)}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>بلاغ عطل</span>
                </Button>
              )}
            </div>

            {thisFaults.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                مفيش بلاغات أعطال حالياً في المحطة دي.
              </div>
            ) : (
              <div className="space-y-3">
                {thisFaults.map((f) => {
                  const sev = getFaultSeverityInfo(f.severity);
                  return (
                    <div
                      key={f.id}
                      className="p-4 bg-slate-950 border border-slate-800 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-blue-400 font-semibold">{f.report_code}</span>
                          <span className={`px-2 py-0.5 rounded text-[11px] ${sev.bg} ${sev.text}`}>
                            {sev.label}
                          </span>
                        </div>
                        <h4 className="font-semibold text-slate-100">{f.title}</h4>
                        <p className="text-slate-400">{f.description}</p>
                      </div>
                      <div className="text-left font-mono shrink-0">
                        <span className="text-amber-400 font-medium">قيد المعالجة</span>
                        <p className="text-[11px] text-slate-500">
                          {new Date(f.occurred_at).toLocaleDateString('ar-EG')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Maintenance Work Orders */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 pb-3 border-b border-slate-800">
              أوامر الصيانة وتصاريح العمل
            </h2>
            {thisMaintenance.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                مفيش أوامر صيانة مسجلة للمحطة دي حالياً.
              </div>
            ) : (
              <div className="space-y-3">
                {thisMaintenance.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 bg-slate-950 border border-slate-800 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="text-blue-400 font-mono font-semibold">{m.order_code}</span>
                      <h4 className="font-semibold text-slate-100 mt-1">{m.title}</h4>
                      <p className="text-slate-400 mt-0.5">{m.scope_of_work}</p>
                      {m.safety_clearance_number && (
                        <p className="text-[11px] text-emerald-400 font-mono mt-1">
                          تصريح سلامة العمل (PTW): {m.safety_clearance_number}
                        </p>
                      )}
                    </div>
                    <div className="text-left shrink-0">
                      <span className="text-blue-400 font-medium">مجدولة</span>
                      <p className="text-[11px] text-slate-400 font-mono">
                        المشرف: {m.lead_technician_name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Deactivation/Revocation of Station Assignment */}
      <ConfirmDialog
        isOpen={Boolean(assignmentToRevoke)}
        onClose={() => setAssignmentToRevoke(null)}
        onConfirm={handleConfirmRevoke}
        title="تأكيد إنهاء تكليف الموظف بالمحطة"
        message={`هل أنت متأكد من إنهاء تكليف الموظف "${assignmentToRevoke?.user_name}" بدور "${assignmentToRevoke?.assignment_role}" في هذه المحطة؟ سيتم إيقاف صلاحياته الموقعية المتعلقة بهذه المحطة فوراً.`}
        confirmLabel="إنهاء التكليف"
        variant="danger"
        isLoading={isRevoking}
      />

      {/* Confirm Archival of Station */}
      <ConfirmDialog
        isOpen={showArchiveDialog}
        onClose={() => setShowArchiveDialog(false)}
        onConfirm={handleConfirmArchive}
        title="تأكيد إخراج المحطة من الخدمة"
        message={`هل أنت متأكد من إخراج محطة "${station.name}" من الخدمة التشغيلية؟ سيتم تحديث حالتها التشغيلية وتوثيق ذلك في سجل التدقيق الأمني.`}
        confirmLabel="إخراج من الخدمة"
        variant="danger"
        isLoading={isArchiving}
      />
    </div>
  );
};
