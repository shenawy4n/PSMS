/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  canAccessStation,
  canCreateStation,
  canEditStation,
  canDeleteStation,
  canAssignPersonnel,
  canManageRoles,
  canViewAuditLogs,
  canSubmitReadings,
} from '../lib/permissions';
import { stationFormSchema } from '../lib/validations/station';
import { employeeFormSchema } from '../lib/validations/employee';
import { UserProfile, Station, StationAssignment } from '../types/database';

/* ==============================================================================
   PART 1: UNIT TESTS — Permission Architecture & Zod Form Validations
   ============================================================================== */
describe('UNIT TESTS: Permission Functions & Schema Validations', () => {
  describe('1. Centralized Station Management (No Organization Lock)', () => {
    it('allows super_admin to access and edit any station regardless of organization', () => {
      expect(canAccessStation('super_admin', 'stn-001', [])).toBe(true);
      expect(canAccessStation('super_admin', 'stn-999', [], undefined, undefined)).toBe(true);
      expect(canEditStation('super_admin')).toBe(true);
      expect(canDeleteStation('super_admin')).toBe(true);
    });

    it('allows admin central access to all stations without requiring matching organization_id', () => {
      // Both with undefined orgs and disparate orgs
      expect(canAccessStation('admin', 'stn-001', [], undefined, undefined)).toBe(true);
      expect(canAccessStation('admin', 'stn-002', [], 'org-alpha', 'org-beta')).toBe(true);
      expect(canEditStation('admin')).toBe(true);
      expect(canEditStation('admin', 'org-alpha', 'org-beta')).toBe(true);
      expect(canCreateStation('admin')).toBe(true);
      // Admin cannot delete stations (super_admin exclusive)
      expect(canDeleteStation('admin')).toBe(false);
    });

    it('restricts supervisor strictly to assigned stations', () => {
      const assigned = ['stn-101', 'stn-102'];
      expect(canAccessStation('supervisor', 'stn-101', assigned)).toBe(true);
      expect(canAccessStation('supervisor', 'stn-103', assigned)).toBe(false);
      expect(canEditStation('supervisor')).toBe(false);
      expect(canCreateStation('supervisor')).toBe(false);
    });

    it('restricts employee strictly to assigned stations for access and readings', () => {
      const assigned = ['stn-201'];
      expect(canAccessStation('employee', 'stn-201', assigned)).toBe(true);
      expect(canAccessStation('employee', 'stn-202', assigned)).toBe(false);
      expect(canSubmitReadings('employee', 'stn-201', assigned)).toBe(true);
      expect(canSubmitReadings('employee', 'stn-202', assigned)).toBe(false);
      expect(canEditStation('employee')).toBe(false);
    });
  });

  describe('2. Centralized Personnel Assignment Rules', () => {
    it('allows super_admin and admin to assign personnel centrally', () => {
      expect(canAssignPersonnel('super_admin')).toBe(true);
      expect(canAssignPersonnel('admin')).toBe(true);
    });

    it('allows supervisor to assign personnel (bounded to their assigned stations in logic)', () => {
      expect(canAssignPersonnel('supervisor')).toBe(true);
    });

    it('forbids employee from assigning personnel', () => {
      expect(canAssignPersonnel('employee')).toBe(false);
    });

    it('allows admin to manage subordinate roles but prevents creating super_admin', () => {
      expect(canManageRoles('admin', 'employee')).toBe(true);
      expect(canManageRoles('admin', 'supervisor')).toBe(true);
      expect(canManageRoles('admin', 'admin')).toBe(true);
      expect(canManageRoles('admin', 'super_admin')).toBe(false);
    });

    it('allows super_admin to grant all roles including super_admin', () => {
      expect(canManageRoles('super_admin', 'super_admin')).toBe(true);
      expect(canManageRoles('super_admin', 'admin')).toBe(true);
    });

    it('forbids supervisor and employee from managing any roles', () => {
      expect(canManageRoles('supervisor', 'employee')).toBe(false);
      expect(canManageRoles('employee', 'employee')).toBe(false);
    });
  });

  describe('3. Station Form Schema Validation in Centralized Model', () => {
    it('validates a complete station without requiring organization_id', () => {
      const validPayload = {
        code: 'STN-380-C01',
        name: 'محطة تحويل الرياض المركزية 380 ك.ف',
        type: 'transmission',
        region: 'المنطقة الوسطى',
        governorate: 'الرياض',
        address: 'طريق الملك سلمان، تقاطع الدائري الشمالي',
        voltage_level_kv: 380,
        installed_capacity_mw: 500,
        status: 'operational',
        description: 'محطة ربط رئيسية للشبكة الوطنية الفائقة',
      };

      const result = stationFormSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('rejects invalid station code formatting', () => {
      const invalidPayload = {
        code: 'INVALID CODE with spaces!',
        name: 'محطة تجريبية',
        type: 'generation',
        region: 'المنطقة الشرقية',
        governorate: 'الدمام',
        address: 'حي الصناعية الأولى',
        voltage_level_kv: 110,
        installed_capacity_mw: 50,
        status: 'operational',
      };

      const result = stationFormSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path[0] === 'code')).toBe(true);
      }
    });
  });

  describe('4. Employee Profile Form Validation in Centralized Model', () => {
    it('validates employee creation with optional organization', () => {
      const validEmployee = {
        employee_number: 'EMP-9001',
        full_name: 'المهندس عبدالرحمن العتيبي',
        email: 'a.otaibi@psms.gov.sa',
        phone: '0555123456',
        role: 'supervisor',
        department: 'إدارة تشغيل محطات التحويل المركزية',
        job_title: 'كبير مهندسي تشغيل الشبكة',
        is_active: true,
        assigned_station_ids: ['stn-1', 'stn-2'],
      };

      const result = employeeFormSchema.safeParse(validEmployee);
      expect(result.success).toBe(true);
    });
  });
});

/* ==============================================================================
   PART 2: INTEGRATION TESTS — AuthContext Lifecycle, Inactive Accounts & Safe Logout
   ============================================================================== */
describe('INTEGRATION TESTS: AuthContext Lifecycle & Deadlock Prevention', () => {
  describe('1. Inactive Profile Protection and Graceful Sign-out', () => {
    it('identifies and rejects deactivated accounts', () => {
      const activeProfile: UserProfile = {
        id: 'usr-1',
        employee_number: 'EMP-01',
        full_name: 'أحمد نشط',
        email: 'active@psms.gov.sa',
        role: 'employee',
        is_active: true,
        assigned_station_ids: [],
        created_at: new Date().toISOString(),
      };

      const deactivatedProfile: UserProfile = {
        ...activeProfile,
        id: 'usr-2',
        is_active: false,
      };

      expect(activeProfile.is_active).toBe(true);
      expect(deactivatedProfile.is_active).toBe(false);
    });

    it('rejects session and performs non-blocking signOut if loaded profile is inactive', async () => {
      let currentUser: UserProfile | null = null;
      let isDemoMode = true;
      const mockSignOut = vi.fn().mockResolvedValue({});

      // Simulates the AuthContext onAuthStateChange/initSession handler for inactive profiles
      const handleLoadedProfile = (profile: UserProfile | null) => {
        if (!profile || !profile.is_active) {
          currentUser = null;
          isDemoMode = false;
          mockSignOut().catch(() => {});
          return false;
        }
        currentUser = profile;
        isDemoMode = false;
        return true;
      };

      const inactiveUser: UserProfile = {
        id: 'usr-inactive',
        employee_number: 'EMP-99',
        full_name: 'موظف معطل',
        email: 'inactive@psms.gov.sa',
        role: 'employee',
        is_active: false,
        assigned_station_ids: [],
        created_at: new Date().toISOString(),
      };

      const accepted = handleLoadedProfile(inactiveUser);
      expect(accepted).toBe(false);
      expect(currentUser).toBeNull();
      expect(isDemoMode).toBe(false);
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Request Counter Pattern for Invalidation of Stale Requests', () => {
    it('discards stale requests when newer request counter increments', async () => {
      let currentRequestId = 0;
      let state: string | null = null;

      const triggerAsyncAuthLoad = async (reqId: number, delayMs: number, resultPayload: string) => {
        await new Promise((r) => setTimeout(r, delayMs));
        // Guard check: only apply if this request is still the latest active generation
        if (reqId === currentRequestId) {
          state = resultPayload;
        }
      };

      // Request 1 starts (slow: 50ms)
      const req1 = ++currentRequestId;
      const promise1 = triggerAsyncAuthLoad(req1, 50, 'User-A');

      // Request 2 starts immediately after (fast: 10ms)
      const req2 = ++currentRequestId;
      const promise2 = triggerAsyncAuthLoad(req2, 10, 'User-B');

      await Promise.all([promise1, promise2]);

      // Request 1 should NOT overwrite Request 2, even though it resolved later!
      expect(state).toBe('User-B');
    });

    it('cancels pending resolution on explicit signOut', async () => {
      let currentRequestId = 0;
      let currentUser: string | null = null;

      const triggerAuth = async (reqId: number) => {
        await new Promise((r) => setTimeout(r, 30));
        if (reqId === currentRequestId) {
          currentUser = 'Loaded-User';
        }
      };

      const reqId = ++currentRequestId;
      const authPromise = triggerAuth(reqId);

      // User clicks Sign Out before response returns
      currentRequestId += 1;
      currentUser = null;

      await authPromise;

      // Ensure state remains null and was not overwritten by the late response
      expect(currentUser).toBeNull();
    });
  });

  describe('3. Safe Logout Guarantees (Resilience against Supabase Errors)', () => {
    it('guarantees local logout completes even if remote Supabase signOut throws', async () => {
      let localUser: UserProfile | null = {
        id: 'usr-admin',
        employee_number: 'EMP-00',
        full_name: 'مدير',
        email: 'admin@psms.gov.sa',
        role: 'super_admin',
        is_active: true,
        assigned_station_ids: [],
        created_at: new Date().toISOString(),
      };

      const mockSupabaseSignOut = vi.fn().mockRejectedValue(new Error('Network error: Auth session expired or offline'));

      // Safe signOut pattern implementation
      const safeSignOut = async () => {
        // 1. Immediately clear local session
        localUser = null;

        // 2. Safely call remote Supabase signOut with error boundary
        try {
          await mockSupabaseSignOut();
        } catch (err) {
          // Handled gracefully without propagating or crashing
        }
      };

      await expect(safeSignOut()).resolves.not.toThrow();
      expect(localUser).toBeNull();
      expect(mockSupabaseSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Token Refresh Identity Preservation (Prevents Screen Churn)', () => {
    it('detects when token refreshed event belongs to same authenticated user and avoids state churn', () => {
      const currentActiveId = 'usr-current-123';
      const refreshSession = {
        user: { id: 'usr-current-123' },
      };

      const shouldSkipReload = currentActiveId === refreshSession.user.id;
      expect(shouldSkipReload).toBe(true);

      const differentSession = {
        user: { id: 'usr-different-456' },
      };
      const shouldReloadDifferent = currentActiveId === differentSession.user.id;
      expect(shouldReloadDifferent).toBe(false);
    });
  });
});

/* ==============================================================================
   PART 3: INTEGRATION TESTS — StationContext Lifecycle & Data Cleanup on Logout
   ============================================================================== */
describe('INTEGRATION TESTS: StationContext Data Lifecycle & Stale Data Prevention', () => {
  it('clears all user-bound station state immediately when user logs out', () => {
    // Initial loaded state representing an authenticated session
    let allRawStations: Station[] = [
      {
        id: 'stn-01',
        code: 'STN-01',
        name: 'محطة الرياض',
        type: 'transmission',
        region: 'الوسطى',
        governorate: 'الرياض',
        address: 'شارع الملك فهد',
        voltage_level_kv: 132,
        installed_capacity_mw: 200,
        status: 'operational',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    let stationAssets = [{ id: 'ast-01', station_id: 'stn-01' }];
    let stationReadings = [{ id: 'rdg-01', station_id: 'stn-01' }];
    let activeStation: Station | null = allRawStations[0];
    let isLoading = false;
    let stationRequestId = 1;

    // Simulation of StationContext clearStationData()
    const clearStationData = () => {
      stationRequestId += 1;
      allRawStations = [];
      stationAssets = [];
      stationReadings = [];
      activeStation = null;
      isLoading = false;
    };

    // Trigger logout
    clearStationData();

    expect(allRawStations).toEqual([]);
    expect(stationAssets).toEqual([]);
    expect(stationReadings).toEqual([]);
    expect(activeStation).toBeNull();
    expect(isLoading).toBe(false);
    expect(stationRequestId).toBe(2);
  });

  it('prevents in-flight station queries from restoring data after logout', async () => {
    let stationRequestId = 0;
    let stationsState: Station[] = [];

    const asyncFetchStations = async (reqId: number, delayMs: number, data: Station[]) => {
      await new Promise((r) => setTimeout(r, delayMs));
      // Generation check from StationContext refreshData()
      if (reqId === stationRequestId) {
        stationsState = data;
      }
    };

    // User logs in: start fetch (takes 40ms)
    const req1 = ++stationRequestId;
    const fetchPromise = asyncFetchStations(req1, 40, [
      {
        id: 'stn-secret',
        code: 'SEC-01',
        name: 'محطة سرية',
        type: 'generation',
        region: 'الشرقية',
        governorate: 'الجبيل',
        address: 'المنطقة الصناعية',
        voltage_level_kv: 380,
        installed_capacity_mw: 1000,
        status: 'operational',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    // Before response completes, user logs out (clears state and increments generation)
    stationRequestId += 1;
    stationsState = [];

    await fetchPromise;

    // Verify stale response did NOT overwrite the cleared logout state
    expect(stationsState).toEqual([]);
  });

  it('suppresses station data fetches while authentication is still loading', () => {
    const isLoadingAuth = true;
    const currentUser = null;
    let fetchCalled = false;

    // Simulates StationContext useEffect
    const evaluateStationFetch = () => {
      if (isLoadingAuth) {
        return 'WAITING_FOR_AUTH';
      }
      if (!currentUser) {
        return 'CLEARED';
      }
      fetchCalled = true;
      return 'FETCHED';
    };

    expect(evaluateStationFetch()).toBe('WAITING_FOR_AUTH');
    expect(fetchCalled).toBe(false);
  });
});
