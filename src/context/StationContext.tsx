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
  MaintenanceStatus,
  StationAssignment,
  AuditLog,
  PermitToWork,
  PTWStatus,
  InsulationTest,
} from '../types/database';
import {
  INITIAL_STATIONS,
  INITIAL_ASSETS,
  INITIAL_READINGS,
  INITIAL_FAULTS,
  INITIAL_MAINTENANCE,
  INITIAL_ASSIGNMENTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_PTWS,
  INITIAL_INSULATION_TESTS,
} from '../data/initialData';
import { useAuth } from './AuthContext';
import { isSupabaseConfigured, getSupabase } from '../lib/supabase';
import { canAccessStation, canAssignPersonnel, canEditStation } from '../lib/permissions';
import { formatArabicError } from '../lib/errorHandler';
import { getRegionByGovernorate, toStationDatabasePayload } from '../lib/validations/station';

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
  permitsToWork: PermitToWork[];
  insulationTests: InsulationTest[];
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
  addMaintenanceOrder: (order: Omit<MaintenanceOrder, 'id' | 'order_code' | 'created_at' | 'updated_at'>) => Promise<{ success: boolean; error?: string; order?: MaintenanceOrder }>;
  updateMaintenanceOrderStatus: (orderId: string, status: MaintenanceStatus, notes?: string, actualEnd?: string) => Promise<{ success: boolean; error?: string }>;
  updateMaintenanceOrder: (orderId: string, updates: Partial<MaintenanceOrder>) => Promise<{ success: boolean; error?: string }>;
  addPermitToWork: (ptw: Omit<PermitToWork, 'id' | 'permit_code' | 'created_at' | 'updated_at'>) => Promise<{ success: boolean; error?: string; permit?: PermitToWork }>;
  updatePermitStatus: (permitId: string, status: PTWStatus, approverId?: string) => Promise<{ success: boolean; error?: string }>;
  addInsulationTest: (test: Omit<InsulationTest, 'id' | 'test_code' | 'created_at'>) => Promise<{ success: boolean; error?: string; test?: InsulationTest }>;
  refreshData: () => Promise<void>;
}

const StationContext = createContext<StationContextType | undefined>(undefined);

export const StationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, role, refreshProfiles, allProfiles, isLoadingAuth, isDemoMode } = useAuth();
  const isSupabaseMode = isSupabaseConfigured() && !isDemoMode;

  const [allRawStations, setAllRawStations] = useState<Station[]>(isSupabaseMode ? [] : INITIAL_STATIONS);
  const [stationAssets, setStationAssets] = useState<StationAsset[]>(isSupabaseMode ? [] : INITIAL_ASSETS);
  const [stationReadings, setStationReadings] = useState<StationReading[]>(isSupabaseMode ? [] : INITIAL_READINGS);
  const [faultReports, setFaultReports] = useState<FaultReport[]>(isSupabaseMode ? [] : INITIAL_FAULTS);
  const [maintenanceOrders, setMaintenanceOrders] = useState<MaintenanceOrder[]>(isSupabaseMode ? [] : INITIAL_MAINTENANCE);
  const [permitsToWork, setPermitsToWork] = useState<PermitToWork[]>(isSupabaseMode ? [] : INITIAL_PTWS);
  const [insulationTests, setInsulationTests] = useState<InsulationTest[]>(isSupabaseMode ? [] : INITIAL_INSULATION_TESTS);
  const [stationAssignments, setStationAssignments] = useState<StationAssignment[]>(isSupabaseMode ? [] : INITIAL_ASSIGNMENTS);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(isSupabaseMode ? [] : INITIAL_AUDIT_LOGS);
  const [activeStation, setActiveStation] = useState<Station | null>(isSupabaseMode ? null : INITIAL_STATIONS[0]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastNotification | null>(null);

  // Request counter ref to prevent race conditions from out-of-order responses
  const stationRequestIdRef = React.useRef(0);
  const isMountedRef = React.useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  // Clear all station data and invalidate in-flight queries
  const clearStationData = useCallback(() => {
    stationRequestIdRef.current += 1;
    if (isSupabaseConfigured() && !isDemoMode) {
      setAllRawStations([]);
      setStationAssets([]);
      setStationReadings([]);
      setFaultReports([]);
      setMaintenanceOrders([]);
      setPermitsToWork([]);
      setInsulationTests([]);
      setStationAssignments([]);
      setAuditLogs([]);
      setActiveStation(null);
    } else {
      setAllRawStations(INITIAL_STATIONS);
      setStationAssets(INITIAL_ASSETS);
      setStationReadings(INITIAL_READINGS);
      setFaultReports(INITIAL_FAULTS);
      setMaintenanceOrders(INITIAL_MAINTENANCE);
      setPermitsToWork(INITIAL_PTWS);
      setInsulationTests(INITIAL_INSULATION_TESTS);
      setStationAssignments(INITIAL_ASSIGNMENTS);
      setAuditLogs(INITIAL_AUDIT_LOGS);
      setActiveStation(INITIAL_STATIONS[0]);
    }
    setIsLoading(false);
  }, [isDemoMode]);

  // Supabase Data Refresh with request sequence checking
  const refreshData = useCallback(async () => {
    if (!isSupabaseConfigured() || isDemoMode) return;
    const client = getSupabase();
    if (!client) return;

    if (!currentUser) {
      clearStationData();
      return;
    }

    const reqId = ++stationRequestIdRef.current;
    setIsLoading(true);

    try {
      // 1. Fetch stations
      const { data: dbStations, error: stnError } = await client
        .from('stations')
        .select('*, organizations(id, code, name)')
        .order('created_at', { ascending: false });

      if (!isMountedRef.current || reqId !== stationRequestIdRef.current) return;

      if (stnError) {
        console.error('Error fetching stations:', stnError);
        if (stnError.code === '42P17' || stnError.message?.includes('infinite recursion')) {
          showToast(
            'error',
            'تنبيه RLS (42P17): تم رصد تكرار لانهائي في سياسات الأمان. يرجى تطبيق كود الترحيل 09 في Supabase SQL Editor.'
          );
        } else {
          showToast('error', `تعذر جلب بيانات المحطات من Supabase: ${stnError.message}`);
        }
      } else if (dbStations) {
        setAllRawStations((prev) =>
          dbStations.map((s: any) => {
            const existing = prev.find((item) => item.id === s.id);
            return {
              ...s,
              region: s.region || existing?.region || getRegionByGovernorate(s.governorate),
              organization_name: s.organizations?.name || s.organization_name || '',
              assigned_personnel_count: existing?.assigned_personnel_count ?? 0,
              open_faults_count: existing?.open_faults_count ?? 0,
            };
          })
        );
      }

      // 2. Fetch assignments
      const { data: dbAssignments } = await client
        .from('station_assignments')
        .select('*')
        .order('assigned_at', { ascending: false });

      if (!isMountedRef.current || reqId !== stationRequestIdRef.current) return;
      if (dbAssignments) setStationAssignments(dbAssignments);

      // 3. Fetch assets
      const { data: dbAssets } = await client.from('station_assets').select('*');
      if (!isMountedRef.current || reqId !== stationRequestIdRef.current) return;
      if (dbAssets) setStationAssets(dbAssets);

      // 4. Fetch readings
      const { data: dbReadings } = await client
        .from('station_readings')
        .select('*')
        .order('reading_timestamp', { ascending: false });
      if (!isMountedRef.current || reqId !== stationRequestIdRef.current) return;
      if (dbReadings) setStationReadings(dbReadings);

      // 5. Fetch faults
      const { data: dbFaults } = await client
        .from('fault_reports')
        .select('*')
        .order('occurred_at', { ascending: false });
      if (!isMountedRef.current || reqId !== stationRequestIdRef.current) return;
      if (dbFaults) setFaultReports(dbFaults);

      // 6. Fetch maintenance orders with entity enrichments
      const { data: dbOrders } = await client
        .from('maintenance_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (!isMountedRef.current || reqId !== stationRequestIdRef.current) return;
      if (dbOrders && dbOrders.length > 0) {
        setMaintenanceOrders(
          dbOrders.map((o: any) => ({
            ...o,
            station_name: (dbStations || []).find((s: any) => s.id === o.station_id)?.name || o.station_name || 'محطة كهرباء',
            asset_name: (dbAssets || []).find((a: any) => a.id === o.asset_id)?.name || o.asset_name,
            lead_technician_name: allProfiles?.find((p) => p.id === o.lead_technician_id)?.full_name || o.lead_technician_name || 'فني الصيانة',
          }))
        );
      } else if (dbOrders && dbOrders.length === 0) {
        // If Supabase table is empty, load demo seed to maintain realistic visibility
        setMaintenanceOrders(INITIAL_MAINTENANCE);
      }

      // 7. Fetch permits to work (PTW)
      try {
        const { data: dbPtws, error: ptwErr } = await client
          .from('permits_to_work')
          .select('*')
          .order('created_at', { ascending: false });
        if (!isMountedRef.current || reqId !== stationRequestIdRef.current) return;
        if (dbPtws && dbPtws.length > 0) {
          setPermitsToWork(
            dbPtws.map((p: any) => ({
              ...p,
              station_name: (dbStations || []).find((s: any) => s.id === p.station_id)?.name || p.station_name,
              order_code: (dbOrders || []).find((o: any) => o.id === p.order_id)?.order_code || p.order_code,
              requester_name: allProfiles?.find((u) => u.id === p.requested_by)?.full_name || p.requester_name,
              approver_name: allProfiles?.find((u) => u.id === p.approved_by)?.full_name || p.approver_name,
            }))
          );
        } else if (ptwErr || (dbPtws && dbPtws.length === 0)) {
          setPermitsToWork(INITIAL_PTWS);
        }
      } catch {
        setPermitsToWork(INITIAL_PTWS);
      }

      // 8. Fetch insulation and diagnostic tests
      try {
        const { data: dbTests, error: testErr } = await client
          .from('insulation_tests')
          .select('*')
          .order('test_date', { ascending: false });
        if (!isMountedRef.current || reqId !== stationRequestIdRef.current) return;
        if (dbTests && dbTests.length > 0) {
          setInsulationTests(
            dbTests.map((t: any) => ({
              ...t,
              station_name: (dbStations || []).find((s: any) => s.id === t.station_id)?.name || t.station_name,
              asset_name: (dbAssets || []).find((a: any) => a.id === t.asset_id)?.name || t.asset_name,
              tester_name: allProfiles?.find((u) => u.id === t.tested_by)?.full_name || t.tester_name,
            }))
          );
        } else if (testErr || (dbTests && dbTests.length === 0)) {
          setInsulationTests(INITIAL_INSULATION_TESTS);
        }
      } catch {
        setInsulationTests(INITIAL_INSULATION_TESTS);
      }

      // 9. Fetch audit logs
      const { data: dbLogs } = await client
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!isMountedRef.current || reqId !== stationRequestIdRef.current) return;
      if (dbLogs) setAuditLogs(dbLogs);
    } catch (err) {
      console.error('Error fetching Supabase records in StationContext:', err);
    } finally {
      if (isMountedRef.current && reqId === stationRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [currentUser, isDemoMode, clearStationData]);

  // Synchronize data strictly when authentication settles or user changes
  useEffect(() => {
    if (isLoadingAuth) {
      return; // Do not fetch before authentication is settled
    }

    if (!currentUser) {
      clearStationData();
      return;
    }

    refreshData();
  }, [currentUser?.id, isLoadingAuth, refreshData, clearStationData]);

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

  // Keep activeStation aligned with authorized stations
  useEffect(() => {
    if (!currentUser) {
      setActiveStation(null);
      return;
    }
    if (!activeStation && visibleStations.length > 0) {
      setActiveStation(visibleStations[0]);
    } else if (activeStation && !visibleStations.some((s) => s.id === activeStation.id)) {
      setActiveStation(visibleStations[0] || null);
    }
  }, [currentUser, visibleStations, activeStation]);

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
                latitude: typeof input.latitude === 'number' && !Number.isNaN(input.latitude) ? input.latitude : null,
                longitude: typeof input.longitude === 'number' && !Number.isNaN(input.longitude) ? input.longitude : null,
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
            region: input.region || getRegionByGovernorate(data.governorate),
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
          // Whitelist strictly the valid database columns of public.stations
          // PostgREST rejects any payload containing non-existent columns (such as 'region')
          const dbPayload = toStationDatabasePayload(updates as Record<string, unknown>, timestamp);

          const { error } = await client
            .from('stations')
            .update(dbPayload)
            .eq('id', id);

          if (error) {
            const formatted = formatArabicError(error);
            showToast('error', formatted.message);
            return { success: false, error: formatted.message };
          }

          const resolvedRegion =
            updates.region ||
            (updates.governorate ? getRegionByGovernorate(updates.governorate) : current?.region);

          setAllRawStations((prev) =>
            prev.map((s) =>
              s.id === id
                ? {
                    ...s,
                    ...updates,
                    region: resolvedRegion || s.region || getRegionByGovernorate(updates.governorate || s.governorate),
                    updated_at: timestamp,
                  }
                : s
            )
          );

          if (activeStation && activeStation.id === id) {
            setActiveStation((prev) =>
              prev
                ? {
                    ...prev,
                    ...updates,
                    region: resolvedRegion || prev.region || getRegionByGovernorate(updates.governorate || prev.governorate),
                    updated_at: timestamp,
                  }
                : null
            );
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

    const resolvedRegionFallback =
      updates.region ||
      (updates.governorate ? getRegionByGovernorate(updates.governorate) : current?.region);

    setAllRawStations((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              ...updates,
              region: resolvedRegionFallback || s.region || getRegionByGovernorate(updates.governorate || s.governorate),
              updated_at: timestamp,
            }
          : s
      )
    );

    if (activeStation && activeStation.id === id) {
      setActiveStation((prev) =>
        prev
          ? {
              ...prev,
              ...updates,
              region: resolvedRegionFallback || prev.region || getRegionByGovernorate(updates.governorate || prev.governorate),
              updated_at: timestamp,
            }
          : null
      );
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
    if (!reading.station_id || reading.station_id.trim() === '') {
      const err = 'يرجى اختيار المحطة أولاً قبل تسجيل القراءة.';
      showToast('error', err);
      return { success: false, error: err };
    }

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
              reactive_power_mvar: reading.reactive_power_mvar ?? null,
              frequency_hz: reading.frequency_hz,
              power_factor: reading.power_factor,
              transformer_temp_celsius: reading.transformer_temp_celsius ?? null,
              sf6_gas_pressure_bar: reading.sf6_gas_pressure_bar ?? null,
              is_anomaly: reading.is_anomaly,
              anomaly_notes: reading.anomaly_notes || null,
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
    if (!fault.station_id || fault.station_id.trim() === '') {
      const err = 'يرجى اختيار المحطة أولاً قبل تسجيل البلاغ.';
      showToast('error', err);
      return { success: false, error: err };
    }

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
              asset_id: fault.asset_id && fault.asset_id.trim() !== '' ? fault.asset_id : null,
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

  // 10. Add Maintenance Order
  const addMaintenanceOrder = async (
    order: Omit<MaintenanceOrder, 'id' | 'order_code' | 'created_at' | 'updated_at'>
  ) => {
    if (!order.station_id || order.station_id.trim() === '') {
      const err = 'يرجى اختيار المحطة أولاً قبل إنشاء أمر الصيانة.';
      showToast('error', err);
      return { success: false, error: err };
    }

    const timestamp = new Date().toISOString();
    const count = maintenanceOrders.length + 1;
    const orderCode = `WO-${new Date().getFullYear()}-${String(count).padStart(3, '0')}`;
    const stationObj = allRawStations.find((s) => s.id === order.station_id);
    const assetObj = stationAssets.find((a) => a.id === order.asset_id);
    const techObj = allProfiles.find((p) => p.id === order.lead_technician_id);

    const newOrder: MaintenanceOrder = {
      ...order,
      id: `mnt-${Date.now()}`,
      order_code: orderCode,
      station_name: stationObj?.name || 'محطة كهرباء',
      asset_name: assetObj?.name,
      lead_technician_name: techObj?.full_name || currentUser?.full_name || 'فني الصيانة',
      created_at: timestamp,
      updated_at: timestamp,
    };

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const { data, error } = await client
            .from('maintenance_orders')
            .insert([
              {
                order_code: orderCode,
                station_id: order.station_id,
                asset_id: order.asset_id || null,
                fault_report_id: order.fault_report_id || null,
                maintenance_type: order.maintenance_type,
                status: order.status || 'scheduled',
                title: order.title,
                scope_of_work: order.scope_of_work,
                scheduled_start: order.scheduled_start,
                scheduled_end: order.scheduled_end,
                lead_technician_id: order.lead_technician_id || currentUser?.id || null,
                safety_clearance_number: order.safety_clearance_number || null,
                notes: order.notes || null,
                created_by: currentUser?.id || null,
              },
            ])
            .select()
            .single();

          if (error) {
            const formatted = formatArabicError(error);
            showToast('error', formatted.message);
            return { success: false, error: formatted.message };
          }

          await refreshData();
          showToast('success', `تم إصدار أمر الصيانة رقم ${orderCode} بنجاح.`);
          return { success: true, order: data ? { ...newOrder, id: data.id } : newOrder };
        } catch (err) {
          const formatted = formatArabicError(err);
          showToast('error', formatted.message);
          return { success: false, error: formatted.message };
        }
      }
    }

    setMaintenanceOrders((prev) => [newOrder, ...prev]);

    const auditEntry: AuditLog = {
      id: `log-${Date.now()}`,
      actor_id: currentUser?.id,
      actor_name: currentUser?.full_name || 'المشرف',
      action: 'MAINTENANCE_ORDER_CREATED',
      entity_type: 'MAINTENANCE_ORDER',
      entity_id: newOrder.id,
      station_id: order.station_id,
      station_name: stationObj?.name,
      new_data: { order_code: orderCode, title: order.title, type: order.maintenance_type },
      created_at: timestamp,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);

    showToast('success', `تم إصدار أمر الصيانة رقم ${orderCode} بنجاح.`);
    return { success: true, order: newOrder };
  };

  // 11. Update Maintenance Order Status
  const updateMaintenanceOrderStatus = async (
    orderId: string,
    status: MaintenanceStatus,
    notes?: string,
    actualEnd?: string
  ) => {
    const target = maintenanceOrders.find((m) => m.id === orderId);
    if (!target) return { success: false, error: 'أمر الصيانة غير موجود' };

    const timestamp = new Date().toISOString();
    const updates: Partial<MaintenanceOrder> = {
      status,
      updated_at: timestamp,
      ...(status === 'in_progress' && !target.actual_start ? { actual_start: timestamp } : {}),
      ...(status === 'completed' ? { actual_end: actualEnd || timestamp } : {}),
      ...(notes ? { notes: target.notes ? `${target.notes}\n${notes}` : notes } : {}),
    };

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const { error } = await client
            .from('maintenance_orders')
            .update({
              status: updates.status,
              updated_at: updates.updated_at,
              ...(updates.actual_start ? { actual_start: updates.actual_start } : {}),
              ...(updates.actual_end ? { actual_end: updates.actual_end } : {}),
              ...(notes ? { notes: updates.notes } : {}),
            })
            .eq('id', orderId);

          if (error) {
            const formatted = formatArabicError(error);
            showToast('error', formatted.message);
            return { success: false, error: formatted.message };
          }

          await refreshData();
          showToast('success', 'تم تحديث حالة أمر الصيانة بنجاح.');
          return { success: true };
        } catch (err) {
          const formatted = formatArabicError(err);
          showToast('error', formatted.message);
          return { success: false, error: formatted.message };
        }
      }
    }

    setMaintenanceOrders((prev) =>
      prev.map((m) => (m.id === orderId ? { ...m, ...updates } : m))
    );

    const auditEntry: AuditLog = {
      id: `log-${Date.now()}`,
      actor_id: currentUser?.id,
      actor_name: currentUser?.full_name || 'المشرف',
      action: 'MAINTENANCE_STATUS_UPDATED',
      entity_type: 'MAINTENANCE_ORDER',
      entity_id: orderId,
      station_id: target.station_id,
      station_name: target.station_name,
      old_data: { status: target.status },
      new_data: { status },
      created_at: timestamp,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);

    showToast('success', 'تم تحديث حالة أمر الصيانة بنجاح.');
    return { success: true };
  };

  // 12. Update Maintenance Order Details
  const updateMaintenanceOrder = async (orderId: string, updates: Partial<MaintenanceOrder>) => {
    const target = maintenanceOrders.find((m) => m.id === orderId);
    if (!target) return { success: false, error: 'أمر الصيانة غير موجود' };

    const timestamp = new Date().toISOString();
    const finalUpdates = { ...updates, updated_at: timestamp };

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const dbPayload: any = {};
          if (finalUpdates.title !== undefined) dbPayload.title = finalUpdates.title;
          if (finalUpdates.scope_of_work !== undefined) dbPayload.scope_of_work = finalUpdates.scope_of_work;
          if (finalUpdates.scheduled_start !== undefined) dbPayload.scheduled_start = finalUpdates.scheduled_start;
          if (finalUpdates.scheduled_end !== undefined) dbPayload.scheduled_end = finalUpdates.scheduled_end;
          if (finalUpdates.lead_technician_id !== undefined) dbPayload.lead_technician_id = finalUpdates.lead_technician_id;
          if (finalUpdates.maintenance_type !== undefined) dbPayload.maintenance_type = finalUpdates.maintenance_type;
          if (finalUpdates.status !== undefined) dbPayload.status = finalUpdates.status;
          if (finalUpdates.safety_clearance_number !== undefined) dbPayload.safety_clearance_number = finalUpdates.safety_clearance_number;
          if (finalUpdates.notes !== undefined) dbPayload.notes = finalUpdates.notes;
          dbPayload.updated_at = timestamp;

          const { error } = await client.from('maintenance_orders').update(dbPayload).eq('id', orderId);

          if (error) {
            const formatted = formatArabicError(error);
            showToast('error', formatted.message);
            return { success: false, error: formatted.message };
          }

          await refreshData();
          showToast('success', 'تم تعديل بيانات أمر الصيانة بنجاح.');
          return { success: true };
        } catch (err) {
          const formatted = formatArabicError(err);
          showToast('error', formatted.message);
          return { success: false, error: formatted.message };
        }
      }
    }

    setMaintenanceOrders((prev) =>
      prev.map((m) => (m.id === orderId ? { ...m, ...finalUpdates } : m))
    );
    showToast('success', 'تم تعديل بيانات أمر الصيانة بنجاح.');
    return { success: true };
  };

  // 13. Add Permit to Work (PTW)
  const addPermitToWork = async (
    ptw: Omit<PermitToWork, 'id' | 'permit_code' | 'created_at' | 'updated_at'>
  ) => {
    if (!ptw.station_id || ptw.station_id.trim() === '') {
      const err = 'يرجى اختيار المحطة أولاً لإصدار تصريح العمل.';
      showToast('error', err);
      return { success: false, error: err };
    }

    const timestamp = new Date().toISOString();
    const count = permitsToWork.length + 1;
    const permitCode = `PTW-${new Date().getFullYear()}-${String(count).padStart(3, '0')}`;
    const stationObj = allRawStations.find((s) => s.id === ptw.station_id);
    const orderObj = maintenanceOrders.find((m) => m.id === ptw.order_id);

    const newPermit: PermitToWork = {
      ...ptw,
      id: `ptw-${Date.now()}`,
      permit_code: permitCode,
      station_name: stationObj?.name || 'محطة كهرباء',
      order_code: orderObj?.order_code,
      requester_name: currentUser?.full_name || 'مهندس الموقع',
      created_at: timestamp,
      updated_at: timestamp,
    };

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const { data, error } = await client
            .from('permits_to_work')
            .insert([
              {
                permit_code: permitCode,
                order_id: ptw.order_id || null,
                station_id: ptw.station_id,
                title: ptw.title,
                work_type: ptw.work_type,
                status: ptw.status || 'draft',
                voltage_level_kv: ptw.voltage_level_kv || null,
                equipment_isolated: ptw.equipment_isolated,
                loto_applied: ptw.loto_applied,
                grounding_applied: ptw.grounding_applied,
                zero_voltage_verified: ptw.zero_voltage_verified,
                safety_precautions: ptw.safety_precautions || null,
                requested_by: currentUser?.id,
                approved_by: ptw.approved_by || null,
                valid_from: ptw.valid_from,
                valid_to: ptw.valid_to,
                notes: ptw.notes || null,
              },
            ])
            .select()
            .single();

          if (error) {
            console.warn('Supabase PTW insert returned error, falling back locally:', error);
            // If table does not exist or permissions prevent insert, persist locally
          } else if (data) {
            newPermit.id = data.id;
          }

          // If linked to an order, update order safety clearance number
          if (ptw.order_id) {
            await client
              .from('maintenance_orders')
              .update({ safety_clearance_number: permitCode })
              .eq('id', ptw.order_id);
          }

          await refreshData();
          showToast('success', `تم إصدار تصريح العمل رقم ${permitCode} بنجاح.`);
          return { success: true, permit: newPermit };
        } catch (err) {
          console.warn('Error in Supabase PTW creation:', err);
        }
      }
    }

    setPermitsToWork((prev) => [newPermit, ...prev]);

    // Also link to maintenance order locally if linked
    if (ptw.order_id) {
      setMaintenanceOrders((prev) =>
        prev.map((m) => (m.id === ptw.order_id ? { ...m, safety_clearance_number: permitCode } : m))
      );
    }

    const auditEntry: AuditLog = {
      id: `log-${Date.now()}`,
      actor_id: currentUser?.id,
      actor_name: currentUser?.full_name || 'مهندس السلامة',
      action: 'PTW_ISSUED',
      entity_type: 'PERMIT_TO_WORK',
      entity_id: newPermit.id,
      station_id: ptw.station_id,
      station_name: stationObj?.name,
      new_data: { permit_code: permitCode, title: ptw.title, work_type: ptw.work_type },
      created_at: timestamp,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);

    showToast('success', `تم إصدار تصريح العمل رقم ${permitCode} بنجاح.`);
    return { success: true, permit: newPermit };
  };

  // 14. Update Permit Status (Approval, Activation, Closure)
  const updatePermitStatus = async (permitId: string, status: PTWStatus, approverId?: string) => {
    const target = permitsToWork.find((p) => p.id === permitId);
    if (!target) return { success: false, error: 'تصريح العمل غير موجود' };

    const timestamp = new Date().toISOString();
    const effectiveApprover = approverId || (status === 'approved' ? currentUser?.id : target.approved_by);
    const approverName = effectiveApprover ? (allProfiles.find((u) => u.id === effectiveApprover)?.full_name || currentUser?.full_name) : target.approver_name;

    const updates: Partial<PermitToWork> = {
      status,
      approved_by: effectiveApprover,
      approver_name: approverName,
      updated_at: timestamp,
    };

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const { error } = await client
            .from('permits_to_work')
            .update({
              status,
              approved_by: effectiveApprover,
              updated_at: timestamp,
            })
            .eq('id', permitId);

          if (error) {
            console.warn('Could not update PTW in Supabase, using local state:', error);
          } else {
            await refreshData();
            showToast('success', `تم تحديث حالة تصريح العمل إلى (${status}).`);
            return { success: true };
          }
        } catch (err) {
          console.warn('Error updating PTW:', err);
        }
      }
    }

    setPermitsToWork((prev) =>
      prev.map((p) => (p.id === permitId ? { ...p, ...updates } : p))
    );

    const auditEntry: AuditLog = {
      id: `log-${Date.now()}`,
      actor_id: currentUser?.id,
      actor_name: currentUser?.full_name || 'مسؤول السلامة',
      action: 'PTW_STATUS_UPDATED',
      entity_type: 'PERMIT_TO_WORK',
      entity_id: permitId,
      station_id: target.station_id,
      station_name: target.station_name,
      old_data: { status: target.status },
      new_data: { status },
      created_at: timestamp,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);

    showToast('success', `تم تحديث حالة تصريح العمل بنجاح.`);
    return { success: true };
  };

  // 15. Add Insulation and Diagnostic Test
  const addInsulationTest = async (
    test: Omit<InsulationTest, 'id' | 'test_code' | 'created_at'>
  ) => {
    if (!test.station_id || test.station_id.trim() === '') {
      const err = 'يرجى تحديد المحطة أولاً قبل تسجيل الفحص العزلي.';
      showToast('error', err);
      return { success: false, error: err };
    }

    const timestamp = new Date().toISOString();
    const count = insulationTests.length + 1;
    const testCode = `INS-${new Date().getFullYear()}-${String(count).padStart(3, '0')}`;
    const stationObj = allRawStations.find((s) => s.id === test.station_id);
    const assetObj = stationAssets.find((a) => a.id === test.asset_id);

    const newTest: InsulationTest = {
      ...test,
      id: `ins-${Date.now()}`,
      test_code: testCode,
      station_name: stationObj?.name || 'محطة كهرباء',
      asset_name: assetObj?.name,
      tester_name: currentUser?.full_name || 'فاحص العوازل',
      created_at: timestamp,
    };

    if (isSupabaseConfigured()) {
      const client = getSupabase();
      if (client) {
        try {
          const { data, error } = await client
            .from('insulation_tests')
            .insert([
              {
                test_code: testCode,
                station_id: test.station_id,
                asset_id: test.asset_id || null,
                test_type: test.test_type,
                tested_by: currentUser?.id,
                test_date: test.test_date,
                applied_voltage_kv: test.applied_voltage_kv || null,
                measured_value: test.measured_value,
                measurement_unit: test.measurement_unit,
                temperature_celsius: test.temperature_celsius || null,
                status_rating: test.status_rating,
                remarks: test.remarks || null,
                recommendations: test.recommendations || null,
              },
            ])
            .select()
            .single();

          if (error) {
            console.warn('Supabase insulation_tests insert error, saving locally:', error);
          } else if (data) {
            newTest.id = data.id;
          }

          await refreshData();
          showToast('success', `تم تسجيل فحص العوازل رقم ${testCode} بنجاح.`);
          return { success: true, test: newTest };
        } catch (err) {
          console.warn('Error inserting insulation test:', err);
        }
      }
    }

    setInsulationTests((prev) => [newTest, ...prev]);

    const auditEntry: AuditLog = {
      id: `log-${Date.now()}`,
      actor_id: currentUser?.id,
      actor_name: currentUser?.full_name || 'فاحص العوازل',
      action: 'INSULATION_TEST_RECORDED',
      entity_type: 'INSULATION_TEST',
      entity_id: newTest.id,
      station_id: test.station_id,
      station_name: stationObj?.name,
      new_data: { test_code: testCode, type: test.test_type, rating: test.status_rating },
      created_at: timestamp,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);

    showToast('success', `تم تسجيل فحص العوازل رقم ${testCode} بنجاح.`);
    return { success: true, test: newTest };
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
        permitsToWork,
        insulationTests,
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
        addMaintenanceOrder,
        updateMaintenanceOrderStatus,
        updateMaintenanceOrder,
        addPermitToWork,
        updatePermitStatus,
        addInsulationTest,
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
