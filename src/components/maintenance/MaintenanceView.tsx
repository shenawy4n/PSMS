/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Wrench,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Search,
  Filter,
  Eye,
  Play,
  Check,
  Zap,
  Gauge,
  Flame,
  FileText,
  User,
  ArrowRight,
  ClipboardList,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import {
  MaintenanceOrder,
  MaintenanceType,
  MaintenanceStatus,
  TaskPriority,
  PermitToWork,
  PTWStatus,
  InsulationTest,
} from '../../types/database';
import { canManageMaintenance, canApprovePTW } from '../../lib/permissions';
import { Button } from '../ui/Button';
import { CreateMaintenanceModal } from './CreateMaintenanceModal';
import { CreatePTWModal } from './CreatePTWModal';
import { CreateInsulationTestModal } from './CreateInsulationTestModal';
import { MaintenanceOrderDetailModal } from './MaintenanceOrderDetailModal';

type ActiveTab = 'orders' | 'preventive' | 'ptw' | 'insulation' | 'audit';

export const MaintenanceView: React.FC = () => {
  const {
    stations,
    maintenanceOrders,
    permitsToWork,
    insulationTests,
    stationAssets,
    auditLogs,
    updateMaintenanceOrderStatus,
    updatePermitStatus,
  } = useStations();
  const { role, currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>('orders');

  // Filters state for Orders
  const [orderSearch, setOrderSearch] = useState('');
  const [filterStationId, setFilterStationId] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  // Filters state for PTW
  const [ptwSearch, setPtwSearch] = useState('');
  const [ptwFilterStatus, setPtwFilterStatus] = useState<string>('all');

  // Filters state for Insulation
  const [insulationSearch, setInsulationSearch] = useState('');

  // Modals state
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [isCreatePTWOpen, setIsCreatePTWOpen] = useState(false);
  const [isCreateTestOpen, setIsCreateTestOpen] = useState(false);
  const [targetStationForPTW, setTargetStationForPTW] = useState<string | undefined>();
  const [targetOrderForPTW, setTargetOrderForPTW] = useState<string | undefined>();
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<MaintenanceOrder | null>(null);

  const canManage = canManageMaintenance(role);
  const canApprove = canApprovePTW(role);

  // 1. KPI Metrics
  const totalOrders = maintenanceOrders.length;
  const inProgressOrders = maintenanceOrders.filter((o) => o.status === 'in_progress').length;
  const scheduledOrders = maintenanceOrders.filter((o) => o.status === 'scheduled').length;
  const urgentOrders = maintenanceOrders.filter(
    (o) => (o.maintenance_type === 'emergency' || o.priority === 'urgent') && o.status !== 'completed' && o.status !== 'cancelled'
  ).length;
  const activePTWCount = permitsToWork.filter((p) => p.status === 'active' || p.status === 'approved').length;
  const totalTestsCount = insulationTests.length;
  const criticalTestsCount = insulationTests.filter((t) => t.status_rating === 'critical').length;

  // 2. Filtered Orders
  const filteredOrders = useMemo(() => {
    return maintenanceOrders.filter((order) => {
      if (filterStationId && order.station_id !== filterStationId) return false;
      if (filterStatus !== 'all' && order.status !== filterStatus) return false;
      if (filterType !== 'all' && order.maintenance_type !== filterType) return false;
      if (filterPriority !== 'all' && order.priority !== filterPriority) return false;

      if (orderSearch.trim()) {
        const query = orderSearch.toLowerCase();
        const matchesCode = order.order_code.toLowerCase().includes(query);
        const matchesTitle = order.title.toLowerCase().includes(query);
        const matchesStation = (order.station_name || '').toLowerCase().includes(query);
        const matchesAsset = (order.asset_name || '').toLowerCase().includes(query);
        const matchesTech = (order.lead_technician_name || '').toLowerCase().includes(query);
        if (!matchesCode && !matchesTitle && !matchesStation && !matchesAsset && !matchesTech) {
          return false;
        }
      }

      return true;
    });
  }, [maintenanceOrders, filterStationId, filterStatus, filterType, filterPriority, orderSearch]);

  // 3. Preventive Schedule Orders
  const preventiveOrders = useMemo(() => {
    return maintenanceOrders.filter((o) => o.maintenance_type === 'preventive' || o.maintenance_type === 'overhaul');
  }, [maintenanceOrders]);

  // 4. Filtered PTWs
  const filteredPTWs = useMemo(() => {
    return permitsToWork.filter((ptw) => {
      if (filterStationId && ptw.station_id !== filterStationId) return false;
      if (ptwFilterStatus !== 'all' && ptw.status !== ptwFilterStatus) return false;
      if (ptwSearch.trim()) {
        const query = ptwSearch.toLowerCase();
        const matchesCode = ptw.permit_code.toLowerCase().includes(query);
        const matchesTitle = ptw.title.toLowerCase().includes(query);
        const matchesStation = (ptw.station_name || '').toLowerCase().includes(query);
        const matchesIsolated = ptw.equipment_isolated.toLowerCase().includes(query);
        if (!matchesCode && !matchesTitle && !matchesStation && !matchesIsolated) {
          return false;
        }
      }
      return true;
    });
  }, [permitsToWork, filterStationId, ptwFilterStatus, ptwSearch]);

  // 5. Filtered Insulation Tests
  const filteredInsulationTests = useMemo(() => {
    return insulationTests.filter((test) => {
      if (filterStationId && test.station_id !== filterStationId) return false;
      if (insulationSearch.trim()) {
        const query = insulationSearch.toLowerCase();
        const matchesCode = test.test_code.toLowerCase().includes(query);
        const matchesStation = (test.station_name || '').toLowerCase().includes(query);
        const matchesAsset = (test.asset_name || '').toLowerCase().includes(query);
        const matchesRemarks = (test.remarks || '').toLowerCase().includes(query);
        if (!matchesCode && !matchesStation && !matchesAsset && !matchesRemarks) {
          return false;
        }
      }
      return true;
    });
  }, [insulationTests, filterStationId, insulationSearch]);

  // 6. Maintenance-Related Audit Logs
  const maintenanceAuditLogs = useMemo(() => {
    return auditLogs.filter(
      (log) =>
        log.entity_type === 'MAINTENANCE_ORDER' ||
        log.entity_type === 'PERMIT_TO_WORK' ||
        log.entity_type === 'INSULATION_TEST' ||
        log.action.includes('MAINTENANCE') ||
        log.action.includes('PTW')
    );
  }, [auditLogs]);

  const handleOpenCreatePTWForOrder = (stnId: string, ordId: string) => {
    setTargetStationForPTW(stnId);
    setTargetOrderForPTW(ordId);
    setIsCreatePTWOpen(true);
  };

  const getTypeBadge = (type: MaintenanceType) => {
    switch (type) {
      case 'preventive':
        return <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800">صيانة وقائية دورية</span>;
      case 'corrective':
        return <span className="text-xs px-2 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800">صيانة تصحيحية</span>;
      case 'emergency':
        return <span className="text-xs px-2 py-0.5 rounded bg-rose-950/60 text-rose-400 border border-rose-800">صيانة طارئة</span>;
      case 'overhaul':
        return <span className="text-xs px-2 py-0.5 rounded bg-purple-950/60 text-purple-400 border border-purple-800">عمرة شاملة</span>;
      default:
        return <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">{type}</span>;
    }
  };

  const getStatusBadge = (status: MaintenanceStatus) => {
    switch (status) {
      case 'scheduled':
        return <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">مجدول</span>;
      case 'in_progress':
        return <span className="text-xs px-2.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800">قيد التنفيذ الميداني</span>;
      case 'pending_parts':
        return <span className="text-xs px-2 py-0.5 rounded bg-orange-950/60 text-orange-300 border border-orange-800">معلق لقطع الغيار</span>;
      case 'completed':
        return <span className="text-xs px-2.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800">مكتمل بنجاح</span>;
      case 'cancelled':
        return <span className="text-xs px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800">ملغي</span>;
      default:
        return <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">{status}</span>;
    }
  };

  const getPTWStatusBadge = (status: PTWStatus) => {
    switch (status) {
      case 'draft':
        return <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">مسودة</span>;
      case 'submitted':
        return <span className="text-xs px-2 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800">بانتظار الاعتماد</span>;
      case 'approved':
        return <span className="text-xs px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800">معتمد وجاهز</span>;
      case 'active':
        return <span className="text-xs px-2.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800 animate-pulse">نشط وساري ميدانياً</span>;
      case 'closed':
        return <span className="text-xs px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">مغلق بعد الإنجاز</span>;
      case 'cancelled':
        return <span className="text-xs px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800">ملغي</span>;
      default:
        return <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">{status}</span>;
    }
  };

  const getRatingBadge = (rating: string) => {
    switch (rating) {
      case 'satisfactory':
        return <span className="text-xs px-2.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800">سليم ومطابق</span>;
      case 'warning':
        return <span className="text-xs px-2.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800">تحذير ومتابعة</span>;
      case 'critical':
        return <span className="text-xs px-2.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800">حرج - عزل فوري</span>;
      default:
        return <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">{rating}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Top Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Wrench className="w-6 h-6 text-blue-500" />
            <span>إدارة أوامر الصيانة وتصاريح العمل (PTW)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            جدولة وتتبع الصيانة الوقائية والتصحيحية، تصاريح السلامة وعزل الجهد LOTO، وفحوصات العوازل والمحولات
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCreateTestOpen(true)}
            className="flex items-center gap-1.5 text-xs text-purple-300 border-purple-800/80 hover:bg-purple-950/40"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>تسجيل فحص عوازل</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setTargetStationForPTW(undefined);
              setTargetOrderForPTW(undefined);
              setIsCreatePTWOpen(true);
            }}
            className="flex items-center gap-1.5 text-xs text-amber-300 border-amber-800/80 hover:bg-amber-950/40"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>إصدار تصريح عمل (PTW)</span>
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={() => setIsCreateOrderOpen(true)}
            className="flex items-center gap-1.5 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>أمر صيانة جديد</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>إجمالي الأوامر</span>
            <ClipboardList className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{totalOrders}</div>
          <div className="text-[11px] text-slate-500 mt-1">مسجلة بالمنظومة</div>
        </div>

        <div className="bg-slate-900 border border-amber-900/50 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-amber-400 mb-2">
            <span>قيد التنفيذ</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300 font-mono">{inProgressOrders}</div>
          <div className="text-[11px] text-amber-500/80 mt-1">فرق العمل بالموقع</div>
        </div>

        <div className="bg-slate-900 border border-blue-900/50 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-blue-400 mb-2">
            <span>صيانة مجدولة</span>
            <Calendar className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-blue-300 font-mono">{scheduledOrders}</div>
          <div className="text-[11px] text-blue-400/80 mt-1">بانتظار البدء</div>
        </div>

        <div className="bg-slate-900 border border-rose-900/50 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-rose-400 mb-2">
            <span>صيانة طارئة / حرجة</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-300 font-mono">{urgentOrders}</div>
          <div className="text-[11px] text-rose-400/80 mt-1">تتطلب أولوية قصوى</div>
        </div>

        <div className="bg-slate-900 border border-emerald-900/50 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-emerald-400 mb-2">
            <span>تصاريح PTW النشطة</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-300 font-mono">{activePTWCount}</div>
          <div className="text-[11px] text-emerald-400/80 mt-1">عزل وتأريض مفعل</div>
        </div>

        <div className="bg-slate-900 border border-purple-900/50 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-purple-400 mb-2">
            <span>فحوصات العوازل</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-300 font-mono">{totalTestsCount}</div>
          <div className="text-[11px] text-purple-400/80 mt-1">
            {criticalTestsCount > 0 ? `${criticalTestsCount} فحص بحالة حرجة` : 'حالة العوازل طبيعية'}
          </div>
        </div>
      </div>

      {/* Tabs Navigation Header */}
      <div className="flex items-center gap-2 border-b border-slate-800 overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2.5 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTab === 'orders'
              ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/10 rounded-t-lg'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>أوامر الصيانة والعمليات ({maintenanceOrders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('preventive')}
          className={`px-4 py-2.5 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTab === 'preventive'
              ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/10 rounded-t-lg'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>جدول الصيانة الوقائية ({preventiveOrders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('ptw')}
          className={`px-4 py-2.5 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTab === 'ptw'
              ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/10 rounded-t-lg'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span>تصاريح العمل والسلامة PTW ({permitsToWork.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('insulation')}
          className={`px-4 py-2.5 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTab === 'insulation'
              ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/10 rounded-t-lg'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4 text-purple-400" />
          <span>فحوصات العوازل والمعدات ({insulationTests.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2.5 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTab === 'audit'
              ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/10 rounded-t-lg'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>سجل التدقيق والمتابعة ({maintenanceAuditLogs.length})</span>
        </button>
      </div>

      {/* TAB 1: Work Orders View */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Search and Filters Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="دور برقم الأمر، العنوان، أو اسم المحطة..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <select
                value={filterStationId}
                onChange={(e) => setFilterStationId(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">جميع المحطات</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="all">كل الحالات</option>
                <option value="scheduled">مجدول</option>
                <option value="in_progress">قيد التنفيذ</option>
                <option value="pending_parts">معلق لقطع الغيار</option>
                <option value="completed">مكتمل</option>
                <option value="cancelled">ملغي</option>
              </select>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="all">كل أنواع الصيانة</option>
                <option value="preventive">وقائية دورية</option>
                <option value="corrective">تصحيحية</option>
                <option value="emergency">طارئة</option>
                <option value="overhaul">عمرة شاملة</option>
              </select>

              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="all">كل الأولويات</option>
                <option value="urgent">حرجة / فورية</option>
                <option value="high">عالية</option>
                <option value="medium">متوسطة</option>
                <option value="low">منخفضة</option>
              </select>
            </div>
          </div>

          {/* Work Orders List */}
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <Wrench className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-300">
                {maintenanceOrders.length === 0 ? 'مفيش أوامر صيانة مسجلة حالياً.' : 'مفيش أوامر صيانة مطابقة لبحثك.'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {maintenanceOrders.length === 0
                  ? 'تقدر تبدأ بتسجيل أول أمر صيانة للمحطة من خلال الزر بالأسفل.'
                  : 'جرب تغير الفلاتر أو كلمة البحث لإظهار النتائج المطلوبة.'}
              </p>
              <Button size="sm" variant="outline" onClick={() => setIsCreateOrderOpen(true)}>
                إصدار أمر صيانة جديد
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3 hover:border-slate-700 transition-all shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                        {order.order_code}
                      </span>
                      {getTypeBadge(order.maintenance_type)}
                      {getStatusBadge(order.status)}
                      {order.priority && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          أولوية: {order.priority}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      الفترة المجدولة: {new Date(order.scheduled_start).toLocaleDateString('ar-EG')} - {new Date(order.scheduled_end).toLocaleDateString('ar-EG')}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-white">{order.title}</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">
                      {order.scope_of_work}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-400 font-mono pt-2 border-t border-slate-800/60">
                    <div>
                      المحطة: <span className="text-slate-200 font-sans">{order.station_name}</span>
                    </div>
                    <div>
                      المعدة: <span className="text-slate-200 font-sans">{order.asset_name || 'عام بالمحطة'}</span>
                    </div>
                    <div>
                      الفني المسؤول: <span className="text-slate-200 font-sans">{order.lead_technician_name || 'غير محدد'}</span>
                    </div>
                  </div>

                  {/* Safety Clearance / Action Bar */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/40">
                    {order.safety_clearance_number ? (
                      <div className="p-2 bg-slate-950 rounded-lg text-xs text-emerald-400 font-mono border border-emerald-950/80 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span>تصريح السلامة وعزل الجهد المعتمد (PTW): {order.safety_clearance_number}</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleOpenCreatePTWForOrder(order.station_id, order.id)}
                        className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1.5 cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>إصدار تصريح سلامة (PTW) لهذا الأمر &larr;</span>
                      </button>
                    )}

                    <div className="flex items-center gap-2 mr-auto sm:mr-0">
                      {order.status === 'scheduled' && (
                        <button
                          onClick={() => updateMaintenanceOrderStatus(order.id, 'in_progress')}
                          className="px-2.5 py-1 text-xs bg-amber-600/20 text-amber-300 border border-amber-600/40 rounded-lg hover:bg-amber-600/30 flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-3 h-3" />
                          <span>بدء التنفيذ</span>
                        </button>
                      )}

                      {order.status === 'in_progress' && (
                        <button
                          onClick={() => updateMaintenanceOrderStatus(order.id, 'completed')}
                          className="px-2.5 py-1 text-xs bg-emerald-600/20 text-emerald-300 border border-emerald-600/40 rounded-lg hover:bg-emerald-600/30 flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>اكتمال الصيانة</span>
                        </button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedOrderForDetail(order)}
                        className="flex items-center gap-1 text-xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>التفاصيل</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Preventive Maintenance Schedule */}
      {activeTab === 'preventive' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white">جدول الصيانة الوقائية الدورية للمحولات والقواطع</h2>
              <p className="text-xs text-slate-400 mt-1">
                تتبع فترات الصيانة المبرمجة حسب معايير التشغيل (المحولات كل 90 يوماً، قواطع الدورة كل 90 يوماً، السكاكين كل 120 يوماً)
              </p>
            </div>
            <Button size="sm" variant="primary" onClick={() => setIsCreateOrderOpen(true)}>
              جدولة صيانة وقائية جديدة
            </Button>
          </div>

          {preventiveOrders.length === 0 ? (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <Calendar className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-300">مفيش أوامر صيانة وقائية مجدولة حالياً.</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                تقدر تجدول أعمال الصيانة الدورية للمحولات والقواطع بالضغط على زر "جدولة صيانة وقائية جديدة".
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {preventiveOrders.map((order) => {
                const startDate = new Date(order.scheduled_start);
                return (
                  <div key={order.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {order.order_code}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        تاريخ البدء: {startDate.toLocaleDateString('ar-EG')}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-white">{order.title}</h4>
                      <p className="text-xs text-slate-400 mt-1">{order.scope_of_work}</p>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/60 font-mono">
                      <span>المحطة: {order.station_name}</span>
                      <span className={order.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'}>
                        الحالة: {order.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Permits to Work (PTW & LOTO) */}
      {activeTab === 'ptw' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
              <input
                type="text"
                value={ptwSearch}
                onChange={(e) => setPtwSearch(e.target.value)}
                placeholder="دور برقم التصريح أو تفاصيل العمل..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={ptwFilterStatus}
                onChange={(e) => setPtwFilterStatus(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
              >
                <option value="all">كل حالات التصاريح</option>
                <option value="submitted">بانتظار الاعتماد</option>
                <option value="approved">معتمد</option>
                <option value="active">نشط وساري</option>
                <option value="closed">مغلق</option>
              </select>

              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setTargetStationForPTW(undefined);
                  setTargetOrderForPTW(undefined);
                  setIsCreatePTWOpen(true);
                }}
                className="bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إصدار تصريح عمل</span>
              </Button>
            </div>
          </div>

          {filteredPTWs.length === 0 ? (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-300">
                {permitsToWork.length === 0 ? 'مفيش تصاريح عمل وسلامة مسجلة حالياً.' : 'مفيش تصاريح عمل مطابقة لبحثك.'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {permitsToWork.length === 0
                  ? 'اضغط على زر "إصدار تصريح عمل" لإصدار تصريح عزل وتأريض جديد.'
                  : 'جرب تغير شروط البحث لعرض تصاريح أخرى.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPTWs.map((ptw) => (
                <div key={ptw.id} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
                        {ptw.permit_code}
                      </span>
                      {getPTWStatusBadge(ptw.status)}
                      {ptw.voltage_level_kv && (
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {ptw.voltage_level_kv} kV
                        </span>
                      )}
                      {ptw.order_code && (
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-950 text-blue-400 font-mono">
                          أمر: {ptw.order_code}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      فترة الصلاحية: {new Date(ptw.valid_from).toLocaleDateString('ar-EG')} إلى {new Date(ptw.valid_to).toLocaleDateString('ar-EG')}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white">{ptw.title}</h3>
                    <p className="text-xs text-slate-300 mt-1 font-mono">
                      معدات العزل: <span className="text-slate-200">{ptw.equipment_isolated}</span>
                    </p>
                  </div>

                  {/* Electrical safety verified badges */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-800/60">
                    <div className={`p-2 rounded-lg border flex items-center gap-2 ${ptw.loto_applied ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>قفل ووسم LOTO: {ptw.loto_applied ? 'تم بنجاح' : 'غير مفعل'}</span>
                    </div>

                    <div className={`p-2 rounded-lg border flex items-center gap-2 ${ptw.grounding_applied ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>التأريض الأرضي: {ptw.grounding_applied ? 'مركب ومؤكد' : 'غير مركب'}</span>
                    </div>

                    <div className={`p-2 rounded-lg border flex items-center gap-2 ${ptw.zero_voltage_verified ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>انعدام الجهد: {ptw.zero_voltage_verified ? 'تم الفحص (0V)' : 'لم يتم'}</span>
                    </div>
                  </div>

                  {/* Footer & Approval Lifecycle */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/40 text-xs">
                    <div className="flex items-center gap-4 text-slate-400">
                      <span>طالب التصريح: <span className="text-slate-200">{ptw.requester_name || 'طاقم المحطة'}</span></span>
                      {ptw.approver_name && (
                        <span>المعتمد: <span className="text-emerald-400">{ptw.approver_name}</span></span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mr-auto sm:mr-0">
                      {ptw.status === 'submitted' && canApprove && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => updatePermitStatus(ptw.id, 'approved', currentUser?.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                        >
                          اعتماد التصريح والسلامة
                        </Button>
                      )}

                      {ptw.status === 'approved' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updatePermitStatus(ptw.id, 'active')}
                          className="text-emerald-400 border-emerald-800 hover:bg-emerald-950/40 text-xs"
                        >
                          تفعيل ميداني ساري
                        </Button>
                      )}

                      {ptw.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updatePermitStatus(ptw.id, 'closed')}
                          className="text-slate-300 border-slate-700 hover:bg-slate-800 text-xs"
                        >
                          إغلاق التصريح بعد إتمام العمل
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Insulation & Diagnostics */}
      {activeTab === 'insulation' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
              <input
                type="text"
                value={insulationSearch}
                onChange={(e) => setInsulationSearch(e.target.value)}
                placeholder="دور برقم الفحص أو المحطة أو المعدة..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <Button
              size="sm"
              variant="primary"
              onClick={() => setIsCreateTestOpen(true)}
              className="bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>تسجيل فحص عوازل جديد</span>
            </Button>
          </div>

          {filteredInsulationTests.length === 0 ? (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <Activity className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-300">
                {insulationTests.length === 0 ? 'مفيش فحوصات عوازل مسجلة حتى الآن.' : 'مفيش فحوصات عوازل مطابقة لبحثك.'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {insulationTests.length === 0
                  ? 'تقدر تسجل قياسات الميجر ومقاومة العزل أو جهد انهيار زيت المحولات بالضغط على الزر أعلاه.'
                  : 'جرب تغير شروط البحث لعرض فحوصات أخرى.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredInsulationTests.map((test) => (
                <div key={test.id} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-purple-950 text-purple-400 border border-purple-800">
                        {test.test_code}
                      </span>
                      {getRatingBadge(test.status_rating)}
                    </div>
                    <span className="text-xs text-slate-400 font-mono">
                      {new Date(test.test_date).toLocaleDateString('ar-EG')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <div>
                      <span className="text-xs text-slate-400 block">نوع الفحص:</span>
                      <span className="text-sm font-bold text-white">
                        {test.test_type === 'insulation_resistance' && 'مقاومة العزل (Megger)'}
                        {test.test_type === 'oil_bdv' && 'جهد انهيار الزيت (BDV)'}
                        {test.test_type === 'sf6_pressure' && 'ضغط غاز SF6'}
                        {test.test_type === 'contact_resistance' && 'مقاومة التلامس (Contact Res.)'}
                        {test.test_type === 'tan_delta' && 'معامل الفقد العزلي (Tan Delta)'}
                      </span>
                    </div>

                    <div className="text-left font-mono">
                      <span className="text-xs text-slate-400 block">القيمة المقاسة:</span>
                      <span className="text-lg font-bold text-emerald-400">
                        {test.measured_value} {test.measurement_unit}
                      </span>
                      {test.applied_voltage_kv && (
                        <span className="text-[11px] text-slate-500 block">@ {test.applied_voltage_kv} kV</span>
                      )}
                    </div>
                  </div>

                  {test.remarks && (
                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/30 p-2.5 rounded-lg border border-slate-800/60">
                      {test.remarks}
                    </p>
                  )}

                  {test.recommendations && (
                    <p className="text-xs text-emerald-400/90 leading-relaxed font-sans">
                      التوصية: {test.recommendations}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/60 font-mono">
                    <span>المحطة: {test.station_name}</span>
                    <span>الفاحص: {test.tester_name || 'فني العوازل'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Audit History */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-1">سجل التدقيق والمتابعة لأوامر الصيانة وتصاريح السلامة</h3>
            <p className="text-xs text-slate-400">
              سجل زمني غير قابل للتعديل يوثق كافة إجراءات إصدار وتحديث أوامر الصيانة وتصاريح عزل الجهد
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-3 font-semibold">التاريخ والتوقيت</th>
                  <th className="p-3 font-semibold">المستخدم والمنفّذ</th>
                  <th className="p-3 font-semibold">نوع الإجراء</th>
                  <th className="p-3 font-semibold">الكائن</th>
                  <th className="p-3 font-semibold">المحطة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {maintenanceAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">
                      مفيش عمليات مسجلة في سجل تدقيق الصيانة حتى الآن.
                    </td>
                  </tr>
                ) : (
                  maintenanceAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-850/50">
                      <td className="p-3 font-mono text-slate-400">
                        {new Date(log.created_at).toLocaleString('ar-EG')}
                      </td>
                      <td className="p-3 text-slate-200">
                        {log.actor_name || log.actor_email || 'النظام'}
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-900/40">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300 font-mono">
                        {log.entity_type} ({log.entity_id.slice(0, 8)})
                      </td>
                      <td className="p-3 text-slate-400">
                        {log.station_name || log.station_id || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateMaintenanceModal
        isOpen={isCreateOrderOpen}
        onClose={() => setIsCreateOrderOpen(false)}
      />

      <CreatePTWModal
        isOpen={isCreatePTWOpen}
        onClose={() => {
          setIsCreatePTWOpen(false);
          setTargetStationForPTW(undefined);
          setTargetOrderForPTW(undefined);
        }}
        defaultStationId={targetStationForPTW}
        defaultOrderId={targetOrderForPTW}
      />

      <CreateInsulationTestModal
        isOpen={isCreateTestOpen}
        onClose={() => setIsCreateTestOpen(false)}
      />

      <MaintenanceOrderDetailModal
        order={selectedOrderForDetail}
        isOpen={!!selectedOrderForDetail}
        onClose={() => setSelectedOrderForDetail(null)}
        onOpenCreatePTW={handleOpenCreatePTWForOrder}
      />
    </div>
  );
};
