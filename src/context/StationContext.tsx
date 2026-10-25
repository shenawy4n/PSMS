/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  Station,
  StationAsset,
  StationReading,
  FaultReport,
  MaintenanceOrder,
  StationAssignment,
  AuditLog,
} from '../types/database';
import {
  INITIAL_STATIONS,
  INITIAL_ASSETS,
  INITIAL_READINGS,
  INITIAL_FAULTS,
  INITIAL_MAINTENANCE,
  INITIAL_ASSIGNMENTS,
  INITIAL_AUDIT_LOGS,
} from '../data/initialData';
import { useAuth } from './AuthContext';
import { isSupabaseConfigured, getSupabase } from '../lib/supabase';
import { canAccessStation, canAssignPersonnel, canEditStation } from '../lib/permissions';
import { formatArabicError } from '../lib/errorHandler';

interface ToastNotification {
  type: 'success' | 'error' | 'info';
  message: string;
}

interface StationContextType {
  stations: Station[];
  allRawStations: Station[];
  activeStation: Station | null;
  setActiveStation: (station: Station | null) => void;
  selectStationById: (id: string) => void;
  stationAssets: StationAsset[];
  stationReadings: StationReading[];
  faultReports: FaultReport[];
  maintenanceOrders: MaintenanceOrder[];
  stationAssignments: StationAssignment[];
  auditLogs: AuditLog[];
  isLoading: boolean;
  toast: ToastNotification | null;
  clearToast: () => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
  addStation: (input: Omit<Station, 'id' | 'created_at' | 'updated_at'>) => Promise<{ success: boolean; error?: string; station?: Station }>;
  updateStation: (id: string, updates: Partial<Station>) => Promise<{ success: boolean; error?: string }>;
  archiveStation: (id: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  addReading: (reading: Omit<StationReading, 'id' | 'created_at'>) => Promise<{ success: boolean; error?: string }>;
  addFaultReport: (fault: Omit<FaultReport, 'id' | 'report_code' | 'created_at' | 'updated_at'>) => Promise<{ success: boolean; error?: string }>;
  addAsset: (asset: Omit<StationAsset, 'id' | 'created_at'>) => Promise<{ success: boolean; error?: string }>;
  assignEmployee: (stationId: string, userId: string, assignmentRole: string) => Promise<{ success: boolean; error?: string }>;
  deactivateAssignment: (assignmentId: string) => Promise<{ success: boolean; error?: string }>;
  updateFaultStatus: (faultId: string, status: FaultReport['status'], resolution?: string) => Promise<{ success: boolean; error?: string }>;
  refreshData: () => Promise<void>;
}

const StationContext = createContext<StationContextType | undefined>(undefined);

export const StationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, role, refreshProfiles, allProfiles } = useAuth();
  const [allRawStations, setAllRawStations] = useState<Station[]>(INITIAL_STATIONS);
  const [stationAssets, setStationAssets] = useState<StationAsset[]>(INITIAL_ASSETS);
  const [stationReadings, setStationReadings] = useState<StationReading[]>(INITIAL_READINGS);
  const [faultReports, setFaultReports] = useState<FaultReport[]>(INITIAL_FAULTS);
  const [maintenanceOrders, setMaintenanceOrders] = useState<MaintenanceOrder[]>(INITIAL_MAINTENANCE);
  const [stationAssignments, setStationAssignments] = useState<StationAssignment[]>(INITIAL_ASSIGNMENTS);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);
  const [activeStation, setActiveStation] = useState<Station | null>(INITIAL_STATIONS[0]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastNotification | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  // Supabase Data Refresh
  const refreshData = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const client = getSupabase();
    if (!client) return;

    setIsLoading(true);
    try {
      // 1. Fetch stations
      const { data: dbStations, error: stnError } = await client
        .from('stations')
        .select('*, organizations(id, code, name)')
        .order('created_at', { ascending: false });

      if (dbStations && !stnError) {
        const mapped: Station[] = dbStations.map((s: any) => ({
          ...s,
          organization_name: s.organizations?.name || s.organization_name || '',
        }));
        setAllRawStations(mapped);
      }

      // 2. Fetch assignments
      const { data: dbAssignments } = await client
        .from('station_assignments')
        .select('*')
        .order('assigned_at', { ascending: false });

      if (dbAssignments) {
        setStationAssignments(dbAssignments);
      }

      // 3. Fetch assets
      const { data: dbAssets } = await client.from('station_assets').select('*');
      if (dbAssets) setStationAssets(dbAssets);

      // 4. Fetch readings
      const { data: dbReadings } = await client
        .from('station_readings')
        .select('*')
        .order('reading_timestamp', { ascending: false });
      if (dbReadings) setStationReadings(dbReadings);

      // 5. Fetch faults
      const { data: dbFaults } = await client
        .from('fault_reports')
        .select('*')
        .order('occurred_at', { ascending: false });
      if (dbFaults) setFaultReports(dbFaults);

      // 6. Fetch maintenance orders
      const { data: dbOrders } = await client.from('maintenance_orders').select('*');
      if (dbOrders) setMaintenanceOrders(dbOrders);

      // 7. Fetch audit logs
      const { data: dbLogs } = await client
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (dbLogs) setAuditLogs(dbLogs);
    } catch (err) {
      console.error('Error fetching Supabase records in StationContext:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Authorization Scoping: Filter visible stations according to role and assignment
  const visibleStations = useMemo(() => {
    if (!currentUser) return [];
    return allRawStations.filter((stn) =>
      canAccessStation(
        role,
        stn.id,
        currentUser.assigned_station_ids || [],
        currentUser.organization_id,
        stn.organization_id
      )
    );
  }, [allRawStations, currentUser, role]);

  const selectStationById = (id: string) => {
    const found = allRawStations.find((s) => s.id === id);
    if (found) {
      setActiveStation(found);
    }
  };

  // 1. Add Station
  const addStation = async (input: Omit<Station, 'id' | 'created_at' | 'updated_at'>) => {
    // Check code uniqueness locally first
    const exists = allRawStations.some((s) => s.code.toUpperCase() === input.code.toUpperCase());
    if (exists) {
      const errorMsg = 'رمز المحطة مسجل مسبقاً، يجب أن يكون رمزاً فريداً.';
      showToast('error', errorMsg);
      return { success: false, error: errorMsg };
    }

    const newId = `stn-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const newStation: Station = {
      ...input,
      id: newId,
      assigned_personnel_count: 0,
      open_faults_count: 0,
      created_at: timestamp,
      updated_at: timestamp,
    };

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const { data, error } = await client
            .from('stations')
            .insert([
              {
                code: input.code,
                name: input.name,
                type: input.type,
                organization_id: input.organization_id || null,
                region_id: null,
                governorate: input.governorate,
                address: input.address,
                latitude: input.latitude,
                longitude: input.longitude,
                voltage_level_kv: input.voltage_level_kv,
                installed_capacity_mw: input.installed_capacity_mw,
                status: input.status,
                description: input.description,
                created_by: currentUser?.id,
              },
            ])
            .select('*, organizations(id, code, name)')
            .single();

          if (error) {
            const formatted = formatArabicError(error);
            showToast('error', formatted.message);
            return { success: false, error: formatted.message };
          }

          const createdStation: Station = {
            ...(data as any),
            organization_name: (data as any)?.organizations?.name || input.organization_name || '',
            assigned_personnel_count: 0,
            open_faults_count: 0,
          };

          setAllRawStations((prev) => [createdStation, ...prev.filter((s) => s.id !== createdStation.id)]);
          setActiveStation(createdStation);

          // Refresh full list from Supabase
          await refreshData();
          showToast('success', 'تمت إضافة المحطة بنجاح وحفظها في قاعدة البيانات.');
          return { success: true, station: createdStation };
        } catch (err) {
          const formatted = formatArabicError(err);
          showToast('error', formatted.message);
          return { success: false, error: formatted.message };
        }
      }
    }

    // Local state fallback
    setAllRawStations((prev) => [newStation, ...prev]);
    setActiveStation(newStation);

    // Record audit log
    const auditEntry: AuditLog = {
      id: `log-${Date.now()}`,
      actor_id: currentUser?.id,
      actor_name: currentUser?.full_name || 'مدير النظام',
      actor_email: currentUser?.email || 'admin@psms.gov.sa',
      action: 'STATION_CREATED',
      entity_type: 'STATION',
      entity_id: newStation.id,
      station_id: newStation.id,
      station_name: newStation.name,
      new_data: { code: newStation.code, name: newStation.name, type: newStation.type },
      created_at: timestamp,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);

    showToast('success', 'تمت إضافة المحطة بنجاح.');
    return { success: true, station: newStation };
  };

  // 2. Update Station
  const updateStation = async (id: string, updates: Partial<Station>) => {
    const timestamp = new Date().toISOString();
    const current = allRawStations.find((s) => s.id === id);

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const { error } = await client
            .from('stations')
            .update({ ...updates, updated_at: timestamp })
            .eq('id', id);

          if (error) {
            const formatted = formatArabicError(error);
            showToast('error', formatted.message);
            return { success: false, error: formatted.message };
          }

          await refreshData();
          showToast('success', 'تم تحديث بيانات المحطة بنجاح.');
          return { success: true };
        } catch (err) {
          const formatted = formatArabicError(err);
          showToast('error', formatted.message);
          return { success: false, error: formatted.message };
        }
      }
    }

    setAllRawStations((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates, updated_at: timestamp } : s))
    );

    if (activeStation && activeStation.id === id) {
      setActiveStation((prev) => (prev ? { ...prev, ...updates, updated_at: timestamp } : null));
    }

    const auditEntry: AuditLog = {
      id: `log-${Date.now()}`,
      actor_id: currentUser?.id,
      actor_name: currentUser?.full_name || 'المستخدم',
      actor_email: currentUser?.email || 'user@psms.gov.sa',
      action: 'STATION_UPDATED',
      entity_type: 'STATION',
      entity_id: id,
      station_id: id,
      station_name: current?.name,
      old_data: current as unknown as Record<string, unknown>,
      new_data: updates as unknown as Record<string, unknown>,
      created_at: timestamp,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);

    showToast('success', 'تم حفظ التعديلات بنجاح.');
    return { success: true };
  };

  // 3. Station Archival / Deactivation workflow (Safe alternative to hard deletion)
  const archiveStation = async (id: string, reason = 'أرشفة وإخراج من الخدمة بقرار تشغيلي') => {
    return updateStation(id, {
      status: 'out_of_service',
      description: `${allRawStations.find((s) => s.id === id)?.description || ''}\n[أرشفة]: ${reason}`,
    });
  };

  // 4. Assign Employee to Station
  const assignEmployee = async (stationId: string, userId: string, assignmentRole: string) => {
    if (!canAssignPersonnel(role)) {
      const err = 'ليس لديك الصلاحية لتكليف الموظفين بمحطات الشبكة.';
      showToast('error', err);
      return { success: false, error: err };
    }

    const station = allRawStations.find((s) => s.id === stationId);
    if (!station) {
      return { success: false, error: 'المحطة المحددة غير موجودة' };
    }

    // Check duplicate active assignment
    const activeExists = stationAssignments.some(
      (a) => a.station_id === stationId && a.user_id === userId && a.is_active
    );
    if (activeExists) {
      const err = 'الموظف يمتلك تكليفاً نشطاً بالفعل في هذه المحطة.';
      showToast('error', err);
      return { success: false, error: err };
    }

    // In the centralized architecture:
    // - super_admin & admin: can assign any candidate to any station in the central network.
    // - supervisor: can only assign personnel to stations they are actively assigned to.
    if (role === 'supervisor') {
      const isSupervisorAssigned = (currentUser?.assigned_station_ids || []).includes(stationId);
      if (!isSupervisorAssigned) {
        const err = 'لا يمكنك تكليف موظفين إلا في المحطات المسندة إلى إشرافك المباشر.';
        showToast('error', err);
        return { success: false, error: err };
      }
    }

    const timestamp = new Date().toISOString();
    const newAssignmentId = `asg-${Date.now()}`;

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const { error } = await client.from('station_assignments').insert([
            {
              station_id: stationId,
              user_id: userId,
              assignment_role: assignmentRole,
              assigned_by: currentUser?.id,
              is_active: true,
            },
          ]);

          if (error) {
            const formatted = formatArabicError(error);
            showToast('error', formatted.message);
            return { success: false, error: formatted.message };
          }

          await refreshData();
          await refreshProfiles();
          showToast('success', 'تم تكليف الموظف بالمحطة بنجاح في قاعدة البيانات.');
          return { success: true };
        } catch (err) {
          const formatted = formatArabicError(err);
          showToast('error', formatted.message);
          return { success: false, error: formatted.message };
        }
      }
    }

    // Local state fallback
    const newAssignment: StationAssignment = {
      id: newAssignmentId,
      station_id: stationId,
      station_name: station.name,
      station_code: station.code,
      user_id: userId,
      assignment_role: assignmentRole,
      assigned_at: timestamp,
      is_active: true,
    };

    setStationAssignments((prev) => [newAssignment, ...prev]);

    // Increment count on station
    setAllRawStations((prev) =>
      prev.map((s) =>
        s.id === stationId
          ? { ...s, assigned_personnel_count: (s.assigned_personnel_count || 0) + 1 }
          : s
      )
    );

    // Audit log
    const auditEntry: AuditLog = {
      id: `log-${Date.now()}`,
      actor_id: currentUser?.id,
      actor_name: currentUser?.full_name || 'المشرف',
      action: 'STATION_ASSIGNMENT_CREATED',
      entity_type: 'ASSIGNMENT',
      entity_id: newAssignmentId,
      station_id: stationId,
      station_name: station.name,
      new_data: { user_id: userId, assignment_role: assignmentRole },
      created_at: timestamp,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);

    showToast('success', 'تم تكليف الموظف بالمحطة بنجاح.');
    return { success: true };
  };

  // 5. Deactivate Station Assignment
  const deactivateAssignment = async (assignmentId: string) => {
    const target = stationAssignments.find((a) => a.id === assignmentId);
    if (!target) return { success: false, error: 'التكليف غير موجود' };

    const timestamp = new Date().toISOString();

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const { error } = await client
            .from('station_assignments')
            .update({ is_active: false })
            .eq('id', assignmentId);

          if (error) {
            const formatted = formatArabicError(error);
            showToast('error', formatted.message);
            return { success: false, error: formatted.message };
          }

          await refreshData();
          await refreshProfiles();
          showToast('success', 'تم إنهاء تكليف الموظف بالمحطة بنجاح.');
          return { success: true };
        } catch (err) {
          const formatted = formatArabicError(err);
          showToast('error', formatted.message);
          return { success: false, error: formatted.message };
        }
      }
    }

    setStationAssignments((prev) =>
      prev.map((a) => (a.id === assignmentId ? { ...a, is_active: false } : a))
    );

    // Decrement count on station
    setAllRawStations((prev) =>
      prev.map((s) =>
        s.id === target.station_id
          ? { ...s, assigned_personnel_count: Math.max(0, (s.assigned_personnel_count || 1) - 1) }
          : s
      )
    );

    showToast('success', 'تم إنهاء التكليف بنجاح.');
    return { success: true };
  };

  // 6. Add Reading
  const addReading = async (reading: Omit<StationReading, 'id' | 'created_at'>) => {
    const timestamp = new Date().toISOString();
    const newReading: StationReading = {
      ...reading,
      id: `rdg-${Date.now()}`,
      created_at: timestamp,
    };

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const { error } = await client.from('station_readings').insert([
            {
              station_id: reading.station_id,
              recorded_by: currentUser?.id,
              reading_timestamp: reading.reading_timestamp,
              voltage_kv: reading.voltage_kv,
              active_power_mw: reading.active_power_mw,
              reactive_power_mvar: reading.reactive_power_mvar,
              frequency_hz: reading.frequency_hz,
              power_factor: reading.power_factor,
              transformer_temp_celsius: reading.transformer_temp_celsius,
              sf6_gas_pressure_bar: reading.sf6_gas_pressure_bar,
              is_anomaly: reading.is_anomaly,
              anomaly_notes: reading.anomaly_notes,
            },
          ]);

          if (error) {
            const formatted = formatArabicError(error);
            showToast('error', formatted.message);
            return { success: false, error: formatted.message };
          }

          await refreshData();
          showToast('success', 'تم تسجيل القراءة التشغيلية في قاعدة البيانات.');
          return { success: true };
        } catch (err) {
          const formatted = formatArabicError(err);
          showToast('error', formatted.message);
          return { success: false, error: formatted.message };
        }
      }
    }

    setStationReadings((prev) => [newReading, ...prev]);
    if (reading.active_power_mw) {
      setAllRawStations((prev) =>
        prev.map((s) => (s.id === reading.station_id ? { ...s, current_load_mw: reading.active_power_mw } : s))
      );
    }
    showToast('success', 'تم تسجيل القراءة بنجاح.');
    return { success: true };
  };

  // 7. Add Fault Report
  const addFaultReport = async (fault: Omit<FaultReport, 'id' | 'report_code' | 'created_at' | 'updated_at'>) => {
    const timestamp = new Date().toISOString();
    const count = faultReports.length + 1;
    const reportCode = `FLT-${new Date().getFullYear()}-${String(count).padStart(3, '0')}`;

    const newFault: FaultReport = {
      ...fault,
      id: `flt-${Date.now()}`,
      report_code: reportCode,
      created_at: timestamp,
      updated_at: timestamp,
    };

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const { error } = await client.from('fault_reports').insert([
            {
              report_code: reportCode,
              station_id: fault.station_id,
              asset_id: fault.asset_id,
              reported_by: currentUser?.id,
              title: fault.title,
              description: fault.description,
              severity: fault.severity,
              status: fault.status,
              occurred_at: fault.occurred_at,
            },
          ]);

          if (error) {
            const formatted = formatArabicError(error);
            showToast('error', formatted.message);
            return { success: false, error: formatted.message };
          }

          await refreshData();
          showToast('success', `تم تسجيل البلاغ رقم ${reportCode} بنجاح.`);
          return { success: true };
        } catch (err) {
          const formatted = formatArabicError(err);
          showToast('error', formatted.message);
          return { success: false, error: formatted.message };
        }
      }
    }

    setFaultReports((prev) => [newFault, ...prev]);
    setAllRawStations((prev) =>
      prev.map((s) =>
        s.id === fault.station_id
          ? { ...s, open_faults_count: (s.open_faults_count || 0) + 1 }
          : s
      )
    );

    showToast('success', `تم تسجيل البلاغ رقم ${reportCode} بنجاح.`);
    return { success: true };
  };

  // 8. Update Fault Status
  const updateFaultStatus = async (faultId: string, status: FaultReport['status'], resolution?: string) => {
    const timestamp = new Date().toISOString();
    const target = faultReports.find((f) => f.id === faultId);
    if (!target) return { success: false, error: 'البلاغ غير موجود' };

    const updates: Partial<FaultReport> = {
      status,
      updated_at: timestamp,
      ...(resolution ? { resolution_summary: resolution, resolved_at: timestamp } : {}),
    };

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const { error } = await client.from('fault_reports').update(updates).eq('id', faultId);
          if (error) {
            const formatted = formatArabicError(error);
            showToast('error', formatted.message);
            return { success: false, error: formatted.message };
          }

          await refreshData();
          showToast('success', 'تم تحديث حالة البلاغ بنجاح.');
          return { success: true };
        } catch (err) {
          const formatted = formatArabicError(err);
          showToast('error', formatted.message);
          return { success: false, error: formatted.message };
        }
      }
    }

    setFaultReports((prev) =>
      prev.map((f) => (f.id === faultId ? { ...f, ...updates } : f))
    );
    showToast('success', 'تم تحديث حالة البلاغ بنجاح.');
    return { success: true };
  };

  // 9. Add Asset
  const addAsset = async (asset: Omit<StationAsset, 'id' | 'created_at'>) => {
    const timestamp = new Date().toISOString();
    const newAsset: StationAsset = {
      ...asset,
      id: `ast-${Date.now()}`,
      created_at: timestamp,
    };

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const { error } = await client.from('station_assets').insert([asset]);
          if (error) {
            const formatted = formatArabicError(error);
            showToast('error', formatted.message);
            return { success: false, error: formatted.message };
          }
          await refreshData();
          showToast('success', 'تمت إضافة المعدة بنجاح.');
          return { success: true };
        } catch (err) {
          const formatted = formatArabicError(err);
          showToast('error', formatted.message);
          return { success: false, error: formatted.message };
        }
      }
    }

    setStationAssets((prev) => [newAsset, ...prev]);
    showToast('success', 'تمت إضافة المعدة بنجاح.');
    return { success: true };
  };

  return (
    <StationContext.Provider
      value={{
        stations: visibleStations,
        allRawStations,
        activeStation,
        setActiveStation,
        selectStationById,
        stationAssets,
        stationReadings,
        faultReports,
        maintenanceOrders,
        stationAssignments,
        auditLogs,
        isLoading,
        toast,
        clearToast,
        showToast,
        addStation,
        updateStation,
        archiveStation,
        addReading,
        addFaultReport,
        addAsset,
        assignEmployee,
        deactivateAssignment,
        updateFaultStatus,
        refreshData,
      }}
    >
      {children}
    </StationContext.Provider>
  );
};

export function useStations() {
  const context = useContext(StationContext);
  if (!context) {
    throw new Error('useStations must be used within a StationProvider');
  }
  return context;
}
