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
import { Station } from './types/database';

function MainApp() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
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

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 font-sans">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs">جاري التحقق من جلسة المصادقة المعتمدة...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginView
          onSuccess={() => setCurrentTab('dashboard')}
          onOpenSetupModal={() => setIsSetupModalOpen(true)}
        />
        <SupabaseSetupModal
          isOpen={isSetupModalOpen}
          onClose={() => setIsSetupModalOpen(false)}
        />
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
    >
      {/* Tab Routing */}
      {currentTab === 'dashboard' && (
        <DashboardView
          onNavigate={(tab) => {
            setCurrentTab(tab);
            setSelectedStation(null);
          }}
          onOpenNewStationModal={handleOpenCreateStation}
          onOpenSetupModal={() => setIsSetupModalOpen(true)}
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
