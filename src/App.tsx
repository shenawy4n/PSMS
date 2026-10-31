/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { StationProvider, useStations } from './context/StationContext';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardView } from './components/dashboard/DashboardView';
import { StationListView } from './components/stations/StationListView';
import { StationDetailView } from './components/stations/StationDetailView';
import { StationFormModal } from './components/stations/StationFormModal';
import { AddReadingModal } from './components/readings/AddReadingModal';
import { AddFaultModal } from './components/faults/AddFaultModal';
import { AssignEmployeeModal } from './components/employees/AssignEmployeeModal';
import { SupabaseSetupModal } from './components/setup/SupabaseSetupModal';
import { ReadingsView } from './components/readings/ReadingsView';
import { FaultReportsView } from './components/faults/FaultReportsView';
import { MaintenanceView } from './components/maintenance/MaintenanceView';
import { EmployeeListView } from './components/employees/EmployeeListView';
import { AuditLogView } from './components/audit/AuditLogView';
import { SettingsView } from './components/settings/SettingsView';
import { InspectionsView } from './components/inspections/InspectionsView';
import { TasksView } from './components/tasks/TasksView';
import { ReportsView } from './components/reports/ReportsView';
import { NotificationsView } from './components/notifications/NotificationsView';
import { LoginView } from './components/auth/LoginView';
import { UserProfileModal } from './components/auth/UserProfileModal';
import { ResetPasswordModal } from './components/auth/ResetPasswordModal';
import { Station } from './types/database';

function MainApp() {
  const { isAuthenticated, isLoadingAuth, isSupabaseMode } = useAuth();
  const { stations, toast, clearToast } = useStations();

  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);

  // Modals state
  const [isStationModalOpen, setIsStationModalOpen] = useState(false);
  const [stationToEdit, setStationToEdit] = useState<Station | null>(null);

  const [isReadingModalOpen, setIsReadingModalOpen] = useState(false);
  const [targetStationForReading, setTargetStationForReading] = useState<string | undefined>();

  const [isFaultModalOpen, setIsFaultModalOpen] = useState(false);
  const [targetStationForFault, setTargetStationForFault] = useState<string | undefined>();

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [targetStationForAssign, setTargetStationForAssign] = useState<string | undefined>();

  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 font-sans">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs">جاري التحقق من جلسة المصادقة المعتمدة...</p>
      </div>
    );
  }

  // If Supabase environment configuration is missing, show a controlled Arabic deployment notice
  // (Never an editable form, never a pre-login setup screen)
  if (!isSupabaseMode) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center font-sans text-slate-200">
        <div className="max-w-md w-full bg-slate-900 border border-amber-500/30 rounded-2xl p-8 shadow-2xl flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-5">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">إعدادات الربط غير مكتملة</h2>
          <p className="text-sm text-slate-400 leading-relaxed mb-6">
            لم يتم العثور على متغيرات بيئة التشغيل المعتمدة لخادم قاعدة البيانات (Supabase).
            يتطلب تشغيل المنظومة ضبط متغيرات البيئة في إعدادات النشر بواسطة مسؤول النظام.
          </p>
          <div className="w-full bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-right text-xs text-slate-400 font-mono space-y-1">
            <p className="text-slate-500 text-[11px] mb-1">المتغيرات المطلوبة في بيئة النشر:</p>
            <p>VITE_SUPABASE_URL</p>
            <p>VITE_SUPABASE_PUBLISHABLE_KEY</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginView
          onSuccess={() => setCurrentTab('dashboard')}
        />
        <ResetPasswordModal />
      </>
    );
  }

  const handleOpenCreateStation = () => {
    setStationToEdit(null);
    setIsStationModalOpen(true);
  };

  const handleOpenEditStation = (station: Station) => {
    setStationToEdit(station);
    setIsStationModalOpen(true);
  };

  const handleOpenAddReading = (stationId?: string) => {
    setTargetStationForReading(stationId);
    setIsReadingModalOpen(true);
  };

  const handleOpenAddFault = (stationId?: string) => {
    setTargetStationForFault(stationId);
    setIsFaultModalOpen(true);
  };

  const handleOpenAssign = (stationId?: string) => {
    setTargetStationForAssign(stationId);
    setIsAssignModalOpen(true);
  };

  const handleSelectStation = (station: Station) => {
    setSelectedStation(station);
    setCurrentTab('stations');
  };

  return (
    <AppLayout
      currentTab={currentTab}
      onSelectTab={(tabId) => {
        setCurrentTab(tabId);
        if (tabId !== 'stations') {
          setSelectedStation(null);
        }
      }}
      onOpenSetupModal={() => setIsSetupModalOpen(true)}
      onOpenProfileModal={() => setIsProfileModalOpen(true)}
    >
      {/* Tab Routing */}
      {currentTab === 'dashboard' && (
        <DashboardView
          onNavigate={(tab) => {
            setCurrentTab(tab);
            setSelectedStation(null);
          }}
          onOpenNewStationModal={handleOpenCreateStation}
        />
      )}

      {currentTab === 'stations' && (
        <>
          {selectedStation ? (
            <StationDetailView
              station={selectedStation}
              onBack={() => setSelectedStation(null)}
              onOpenEditModal={handleOpenEditStation}
              onOpenAddReadingModal={handleOpenAddReading}
              onOpenAddFaultModal={handleOpenAddFault}
              onOpenAssignPersonnelModal={handleOpenAssign}
            />
          ) : (
            <StationListView
              onSelectStation={handleSelectStation}
              onOpenCreateModal={handleOpenCreateStation}
              onOpenEditModal={handleOpenEditStation}
            />
          )}
        </>
      )}

      {currentTab === 'assets' && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-white tracking-tight pb-2 border-b border-slate-800">
            المعدات والأصول الفنية
          </h1>
          <p className="text-xs text-slate-400">
            يمكنك استعراض المعدات والمحولات الخاصة بكل محطة بالانتقال إلى صفحة تفاصيل المحطة المعنية.
          </p>
          <StationListView
            onSelectStation={handleSelectStation}
            onOpenCreateModal={handleOpenCreateStation}
            onOpenEditModal={handleOpenEditStation}
          />
        </div>
      )}

      {currentTab === 'readings' && (
        <ReadingsView onOpenAddModal={() => handleOpenAddReading()} />
      )}

      {currentTab === 'faults' && (
        <FaultReportsView onOpenAddModal={() => handleOpenAddFault()} />
      )}

      {currentTab === 'maintenance' && <MaintenanceView />}

      {currentTab === 'inspections' && <InspectionsView />}

      {currentTab === 'tasks' && <TasksView />}

      {currentTab === 'employees' && (
        <EmployeeListView onOpenAssignModal={() => handleOpenAssign()} />
      )}

      {currentTab === 'reports' && <ReportsView />}

      {currentTab === 'notifications' && <NotificationsView />}

      {currentTab === 'audit' && <AuditLogView />}

      {currentTab === 'settings' && (
        <SettingsView onOpenSetupModal={() => setIsSetupModalOpen(true)} />
      )}

      {/* Global Modals */}
      <StationFormModal
        isOpen={isStationModalOpen}
        onClose={() => setIsStationModalOpen(false)}
        initialStation={stationToEdit}
      />

      <AddReadingModal
        isOpen={isReadingModalOpen}
        onClose={() => setIsReadingModalOpen(false)}
        defaultStationId={targetStationForReading}
      />

      <AddFaultModal
        isOpen={isFaultModalOpen}
        onClose={() => setIsFaultModalOpen(false)}
        defaultStationId={targetStationForFault}
      />

      <AssignEmployeeModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        defaultStationId={targetStationForAssign}
      />

      <SupabaseSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
      />

      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />

      <ResetPasswordModal />

      {/* Global Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-6 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs flex items-center gap-3 transition-all ${
            toast.type === 'success'
              ? 'bg-slate-900 border-emerald-700/80 text-emerald-300'
              : toast.type === 'error'
              ? 'bg-slate-900 border-rose-700/80 text-rose-300'
              : 'bg-slate-900 border-slate-700 text-slate-200'
          }`}
        >
          <span className="font-medium">{toast.message}</span>
          <button
            onClick={clearToast}
            className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
            aria-label="إغلاق التنبيه"
          >
            &times;
          </button>
        </div>
      )}
    </AppLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StationProvider>
        <MainApp />
      </StationProvider>
    </AuthProvider>
  );
}
