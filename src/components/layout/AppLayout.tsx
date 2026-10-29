/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  LayoutDashboard,
  Zap,
  Cpu,
  Activity,
  AlertTriangle,
  Wrench,
  ClipboardCheck,
  CheckSquare,
  Users,
  FileBarChart,
  Bell,
  ShieldCheck,
  Settings,
  Database,
  Menu,
  X,
  ChevronDown,
  UserCheck,
  LogOut,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStations } from '../../context/StationContext';
import { UserRole } from '../../types/database';
import { getRoleArabicLabel } from '../../lib/permissions';

interface AppLayoutProps {
  currentTab: string;
  onSelectTab: (tabId: string) => void;
  onOpenSetupModal: () => void;
  onOpenProfileModal?: () => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  onSelectTab,
  onOpenSetupModal,
  onOpenProfileModal,
  children,
}) => {
  const { currentUser, role, isSupabaseMode, isDemoMode, switchUserRole, signOut, exitDemoMode } = useAuth();
  const { stations, activeStation, selectStationById } = useStations();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);

  const navigationItems = [
    { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, minRole: 'employee' },
    { id: 'stations', label: 'محطات الكهرباء', icon: Zap, minRole: 'employee', badge: stations.length },
    { id: 'assets', label: 'المعدات والأصول', icon: Cpu, minRole: 'employee' },
    { id: 'readings', label: 'القراءات التشغيلية', icon: Activity, minRole: 'employee' },
    { id: 'faults', label: 'الأعطال والبلاغات', icon: AlertTriangle, minRole: 'employee' },
    { id: 'maintenance', label: 'أوامر الصيانة', icon: Wrench, minRole: 'employee' },
    { id: 'inspections', label: 'الفحوصات الموقعية', icon: ClipboardCheck, minRole: 'employee' },
    { id: 'tasks', label: 'المهام والتكليفات', icon: CheckSquare, minRole: 'employee' },
    { id: 'employees', label: 'طاقم العمل والموظفون', icon: Users, minRole: 'supervisor' },
    { id: 'reports', label: 'التقارير الفنية', icon: FileBarChart, minRole: 'supervisor' },
    { id: 'notifications', label: 'التنبيهات', icon: Bell, minRole: 'employee' },
    { id: 'audit', label: 'سجل التدقيق', icon: ShieldCheck, minRole: 'admin' },
    { id: 'settings', label: 'إعدادات المنظومة وSupabase', icon: Settings, minRole: 'super_admin' },
  ];

  const isItemVisible = (minRole: string) => {
    if (role === 'super_admin') return true;
    if (role === 'admin') return minRole !== 'super_admin';
    if (role === 'supervisor') return minRole === 'employee' || minRole === 'supervisor';
    return minRole === 'employee';
  };

  const visibleNav = navigationItems.filter((item) => isItemVisible(item.minRole));

  const roleOptions: { role: UserRole; label: string; desc: string }[] = [
    { role: 'super_admin', label: 'مدير النظام العام', desc: 'صلاحيات كاملة تشمل كل المحطات وسجل التدقيق' },
    { role: 'admin', label: 'مدير القطاع التشغيلي', desc: 'إدارة المحطات والموظفين في القطاع المحدد' },
    { role: 'supervisor', label: 'مشرف محطات', desc: 'إشراف على المحطات المعين لها وتكليف المهام' },
    { role: 'employee', label: 'مهندس / فني تشغيل', desc: 'تسجيل القراءات، فحص الأصول، ورفع بلاغات الأعطال' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* 2. Top Bar Contract: Zone 1 (Wordmark) - Zone 2 (Context breadcrumb) - Zone 3 (Primary Action & Status) */}
      <header className="sticky top-0 z-40 h-16 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-4 shrink-0">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
            aria-label="القائمة الرئيسية"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold">
              <Zap className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-base lg:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
              منظومة محطات الكهرباء <span className="text-xs text-blue-400 font-mono font-medium">PSMS</span>
            </span>
          </div>
        </div>

        {/* Zone 2: Clean 4–5 single-line breadcrumb/navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400 whitespace-nowrap overflow-x-auto">
          <button
            onClick={() => onSelectTab('dashboard')}
            className={`hover:text-white transition-colors cursor-pointer ${
              currentTab === 'dashboard' ? 'text-blue-400 border-b-2 border-blue-500 pb-0.5' : ''
            }`}
          >
            لوحة العمليات
          </button>
          <button
            onClick={() => onSelectTab('stations')}
            className={`hover:text-white transition-colors cursor-pointer ${
              currentTab === 'stations' ? 'text-blue-400 border-b-2 border-blue-500 pb-0.5' : ''
            }`}
          >
            شبكة المحطات ({stations.length})
          </button>
          <button
            onClick={() => onSelectTab('readings')}
            className={`hover:text-white transition-colors cursor-pointer ${
              currentTab === 'readings' ? 'text-blue-400 border-b-2 border-blue-500 pb-0.5' : ''
            }`}
          >
            القياسات الحية
          </button>
          <button
            onClick={() => onSelectTab('faults')}
            className={`hover:text-white transition-colors cursor-pointer ${
              currentTab === 'faults' ? 'text-blue-400 border-b-2 border-blue-500 pb-0.5' : ''
            }`}
          >
            مركز الأعطال
          </button>
        </nav>

        {/* Zone 3: 1 Primary action & status indicators */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Supabase Integration Badge / Setup Trigger */}
          <button
            onClick={onOpenSetupModal}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isSupabaseMode
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/50'
                : 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/50'
            }`}
            title="حالة اتصال قاعدة بيانات Supabase"
          >
            <Database className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">
              {isSupabaseMode ? 'Supabase متصل' : 'تهيئة ربط Supabase'}
            </span>
          </button>

          {/* Real Authenticated Session Display vs Demo Switcher */}
          {!isDemoMode && isSupabaseMode ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenProfileModal}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-blue-950/80 hover:bg-blue-900/80 text-blue-300 border border-blue-800/80 rounded-lg shadow-sm cursor-pointer transition-colors"
                title={`الملف الشخصي وإعدادات الحساب: ${currentUser?.email}`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate max-w-[130px] sm:max-w-none">{currentUser?.full_name || getRoleArabicLabel(role)}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/80 text-blue-200 border border-blue-700/50">
                  {getRoleArabicLabel(role)}
                </span>
              </button>

              <button
                onClick={signOut}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-rose-950/40 hover:text-rose-300 hover:border-rose-800/80 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                title="تسجيل الخروج من الحساب"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">خروج</span>
              </button>
            </div>
          ) : (
            /* Interactive Demo Switcher for offline / evaluation mode */
            <div className="relative">
              <button
                onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-amber-950/40 hover:bg-amber-900/50 text-amber-200 border border-amber-800/80 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="وضع المعاينة التجريبي (بيانات وهمية)"
              >
                <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] text-amber-400 font-bold">[تجريبي]</span>
                <span>{getRoleArabicLabel(role)}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {roleMenuOpen && (
                <div className="absolute left-0 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in">
                  <div className="px-3 py-2 border-b border-slate-800 mb-1">
                    <p className="text-xs font-semibold text-amber-300">تبديل الهوية في وضع المعاينة التجريبي</p>
                    <p className="text-[11px] text-slate-400">بيانات وهمية لاختبار عناصر واجهة المستخدم فقط</p>
                  </div>
                  {roleOptions.map((opt) => (
                    <button
                      key={opt.role}
                      onClick={() => {
                        switchUserRole(opt.role);
                        setRoleMenuOpen(false);
                      }}
                      className={`w-full text-right px-3 py-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 ${
                        role === opt.role
                          ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <span className="font-semibold">{opt.label}</span>
                      <span className="text-[11px] text-slate-400">{opt.desc}</span>
                    </button>
                  ))}
                  <div className="pt-2 mt-2 border-t border-slate-800">
                    <button
                      onClick={() => {
                        exitDemoMode();
                        setRoleMenuOpen(false);
                      }}
                      className="w-full text-right px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-950/30 rounded-lg flex items-center gap-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>إنهاء الوضع التجريبي والعودة لتسجيل الدخول</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Workspace Canvas: Sidebar (260px) + Main Viewport */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden lg:flex flex-col w-64 bg-slate-900/60 border-l border-slate-800/80 shrink-0 p-4">
          {/* Active Station Scope Quick Selector */}
          <div className="mb-4 pb-4 border-b border-slate-800/80">
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              المحطة النشطة في نطاق العمل:
            </label>
            <div className="relative">
              <select
                value={activeStation?.id || ''}
                onChange={(e) => selectStationById(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-blue-500 truncate"
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>
            {activeStation && (
              <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between font-mono">
                <span>الجهد: {activeStation.voltage_level_kv} ك.ف</span>
                <span className="tabular-nums">القدرة: {activeStation.installed_capacity_mw} م.و</span>
              </div>
            )}
          </div>

          {/* Module Navigation List */}
          <div className="space-y-1 flex-1 overflow-y-auto pr-0.5">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer select-none ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[11px] px-1.5 py-0.2 rounded font-mono tabular-nums ${
                        isActive ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* User Profile Footer Card */}
          {currentUser && (
            <div className="pt-4 border-t border-slate-800/80 mt-auto">
              <button
                type="button"
                onClick={onOpenProfileModal}
                className="w-full flex items-center gap-3 p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/60 hover:border-blue-500/40 transition-colors text-right cursor-pointer group"
                title="فتح الملف الشخصي وتغيير كلمة المرور"
              >
                <div className="w-8 h-8 rounded-full bg-slate-800 group-hover:bg-blue-950 flex items-center justify-center font-bold text-xs text-blue-400 border border-slate-700 group-hover:border-blue-600 transition-colors">
                  {currentUser.full_name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200 group-hover:text-white truncate">{currentUser.full_name}</p>
                  <p className="text-[11px] text-slate-400 truncate">{currentUser.job_title || currentUser.email}</p>
                </div>
              </button>
            </div>
          )}
        </aside>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm p-4 flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <span className="font-bold text-white">قائمة المنظومة</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="py-4 space-y-1 flex-1 overflow-y-auto">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${
                      isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-950">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
