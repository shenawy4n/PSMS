/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile, UserRole } from '../types/database';
import { INITIAL_PROFILES } from '../data/initialData';
import { isSupabaseConfigured, getSupabase } from '../lib/supabase';
import { formatArabicError } from '../lib/errorHandler';
import { canCreateEmployee, canManageRoles } from '../lib/permissions';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface AuthContextType {
  currentUser: UserProfile | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  isSupabaseMode: boolean;
  isDemoMode: boolean;
  allProfiles: UserProfile[];
  switchUserRole: (newRole: UserRole) => void;
  selectUserPersona: (userId: string) => void;
  startDemoMode: (personaId?: string) => void;
  exitDemoMode: () => void;
  signIn: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  createEmployeeProfile: (newProfile: Omit<UserProfile, 'id' | 'created_at'> & { id?: string }) => Promise<{ success: boolean; error?: string; profile?: UserProfile }>;
  updateEmployeeProfile: (userId: string, updates: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  toggleEmployeeActiveStatus: (userId: string) => Promise<{ success: boolean; error?: string }>;
  refreshProfiles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isSupabaseMode = isSupabaseConfigured();
  const [profiles, setProfiles] = useState<UserProfile[]>(INITIAL_PROFILES);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(isSupabaseMode ? null : INITIAL_PROFILES[0]);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(isSupabaseMode);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(!isSupabaseMode);

  // Request ID sequence counter to discard stale async requests and race conditions
  const requestIdRef = React.useRef(0);
  const isMountedRef = React.useRef(true);
  const currentUserRef = React.useRef<UserProfile | null>(currentUser);
  const authTimeoutRef = React.useRef<any>(null);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load profiles from Supabase if configured (stable callback without currentUser dependency to eliminate subscription churn)
  const refreshProfiles = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const client = getSupabase();
    if (!client) return;

    try {
      const { data, error } = await client
        .from('profiles')
        .select('*, station_assignments!station_assignments_user_id_fkey(station_id, is_active)')
        .order('created_at', { ascending: false });

      if (data && !error && isMountedRef.current) {
        // Map station assignments to assigned_station_ids
        const mapped: UserProfile[] = data.map((p: any) => ({
          ...p,
          assigned_station_ids: (p.station_assignments || [])
            .filter((a: any) => a.is_active)
            .map((a: any) => a.station_id),
        }));
        setProfiles(mapped);

        // Functional state update avoids tearing down auth listeners
        setCurrentUser((prev) => {
          if (!prev) return null;
          const freshCurrent = mapped.find((m) => m.id === prev.id);
          return freshCurrent || prev;
        });
      }
    } catch (err) {
      console.error('Error fetching profiles from Supabase:', err);
    }
  }, []);

  // Sync Supabase Auth session on mount and listen to auth changes
  useEffect(() => {
    if (!isSupabaseMode) {
      setIsLoadingAuth(false);
      return;
    }

    const client = getSupabase();
    if (!client) {
      setIsLoadingAuth(false);
      return;
    }

    let authSubscription: { unsubscribe: () => void } | null = null;

    // 1. Initial session check
    const initSession = async () => {
      const reqId = ++requestIdRef.current;
      try {
        const { data: { session }, error } = await client.auth.getSession();
        if (!isMountedRef.current || reqId !== requestIdRef.current) return;

        if (session?.user && !error) {
          const { data: profileData, error: profileError } = await client
            .from('profiles')
            .select('*, station_assignments!station_assignments_user_id_fkey(station_id, is_active)')
            .eq('id', session.user.id)
            .maybeSingle();

          if (!isMountedRef.current || reqId !== requestIdRef.current) return;

          if (profileData && !profileError) {
            // Strictly check account active status
            if (!profileData.is_active) {
              console.warn('Account is deactivated. Signing out.');
              setCurrentUser(null);
              setIsDemoMode(false);
              client.auth.signOut().catch(() => {});
              return;
            }

            const assignedIds = (profileData.station_assignments || [])
              .filter((a: any) => a.is_active)
              .map((a: any) => a.station_id);

            // Trusted role loaded directly from database record
            setCurrentUser({
              ...profileData,
              assigned_station_ids: assignedIds,
            });
            setIsDemoMode(false);
          } else {
            console.warn('Authenticated user has no matching profile in public.profiles. Signing out.');
            setCurrentUser(null);
            setIsDemoMode(false);
            client.auth.signOut().catch(() => {});
          }
        } else {
          setCurrentUser(null);
        }
      } catch (err) {
        console.error('Auth session init error:', err);
        if (isMountedRef.current && reqId === requestIdRef.current) {
          setCurrentUser(null);
        }
      } finally {
        if (isMountedRef.current && reqId === requestIdRef.current) {
          setIsLoadingAuth(false);
        }
      }
    };

    initSession();

    // 2. Auth State Change Listener (Synchronous callback to avoid navigator.locks deadlock)
    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        requestIdRef.current += 1;
        setCurrentUser(null);
        setIsDemoMode(false);
        setIsLoadingAuth(false);
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        // If session belongs to already active loaded user, prevent UI interruption
        if (currentUserRef.current && currentUserRef.current.id === session.user.id) {
          return;
        }
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        const reqId = ++requestIdRef.current;
        if (authTimeoutRef.current) {
          clearTimeout(authTimeoutRef.current);
        }
        // Schedule profile query outside the synchronous Supabase auth event lock
        authTimeoutRef.current = setTimeout(async () => {
          if (!isMountedRef.current || reqId !== requestIdRef.current) return;
          try {
            const { data: profileData, error: profileErr } = await client
              .from('profiles')
              .select('*, station_assignments!station_assignments_user_id_fkey(station_id, is_active)')
              .eq('id', session.user.id)
              .maybeSingle();

            if (!isMountedRef.current || reqId !== requestIdRef.current) return;

            if (profileData && !profileErr) {
              if (!profileData.is_active) {
                setCurrentUser(null);
                setIsDemoMode(false);
                setIsLoadingAuth(false);
                client.auth.signOut().catch(() => {});
                return;
              }

              const assignedIds = (profileData.station_assignments || [])
                .filter((a: any) => a.is_active)
                .map((a: any) => a.station_id);

              setCurrentUser({
                ...profileData,
                assigned_station_ids: assignedIds,
              });
              setIsDemoMode(false);
              setIsLoadingAuth(false);
            } else {
              setCurrentUser(null);
              setIsDemoMode(false);
              setIsLoadingAuth(false);
              client.auth.signOut().catch(() => {});
            }
          } catch (err) {
            console.error('Error in onAuthStateChange profile load:', err);
            if (isMountedRef.current && reqId === requestIdRef.current) {
              setCurrentUser(null);
              setIsLoadingAuth(false);
            }
          }
        }, 0);
      }
    });

    authSubscription = authListener?.subscription;

    // Load initial profiles list once
    refreshProfiles();

    return () => {
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
      }
      authSubscription?.unsubscribe();
    };
  }, [isSupabaseMode, refreshProfiles]);

  // Demo Mode management
  const startDemoMode = (personaId?: string) => {
    const targetPersona = personaId
      ? INITIAL_PROFILES.find((p) => p.id === personaId) || INITIAL_PROFILES[0]
      : INITIAL_PROFILES[0];
    setCurrentUser(targetPersona);
    setIsDemoMode(true);
  };

  const exitDemoMode = () => {
    setCurrentUser(null);
    setIsDemoMode(false);
  };

  // In Local/Demo Mode only: allow switching persona for verification.
  // In Production Supabase Mode: persona switcher is restricted so users cannot spoof DB roles!
  const switchUserRole = (newRole: UserRole) => {
    if (isSupabaseMode && !isDemoMode) {
      console.warn('Role switching is disabled when live Supabase Auth is active. Role is governed strictly by PostgreSQL RLS.');
      return;
    }
    const matchingProfile = profiles.find((p) => p.role === newRole);
    if (matchingProfile) {
      setCurrentUser(matchingProfile);
    } else if (currentUser) {
      setCurrentUser({ ...currentUser, role: newRole });
    }
  };

  const selectUserPersona = (userId: string) => {
    if (isSupabaseMode && !isDemoMode) {
      console.warn('Persona switching is restricted in live Supabase mode.');
      return;
    }
    const target = profiles.find((p) => p.id === userId);
    if (target) {
      setCurrentUser(target);
    }
  };

  const signIn = async (email: string, password?: string): Promise<{ success: boolean; error?: string }> => {
    if (isSupabaseMode && !isDemoMode) {
      const client = getSupabase();
      if (!client) {
        return { success: false, error: 'تعذر الاتصال بـ Supabase' };
      }
      if (!password) {
        return { success: false, error: 'يرجى إدخال كلمة المرور' };
      }

      const reqId = ++requestIdRef.current;
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
        authTimeoutRef.current = null;
      }

      try {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (!isMountedRef.current || reqId !== requestIdRef.current) {
          return { success: false, error: 'تم إلغاء عملية تسجيل الدخول' };
        }

        if (error) {
          const formatted = formatArabicError(error);
          return { success: false, error: formatted.message };
        }

        if (data.user) {
          // Fetch database profile for this authenticated user UUID
          const { data: profileData, error: profileError } = await client
            .from('profiles')
            .select('*, station_assignments!station_assignments_user_id_fkey(station_id, is_active)')
            .eq('id', data.user.id)
            .maybeSingle();

          if (!isMountedRef.current || reqId !== requestIdRef.current) {
            return { success: false, error: 'تم إلغاء عملية تسجيل الدخول' };
          }

          if (!profileData || profileError) {
            // Profile does not exist: sign out safely to prevent untrusted access
            client.auth.signOut().catch(() => {});
            setCurrentUser(null);
            return {
              success: false,
              error: 'تم توثيق الحساب بنجاح، ولكن لا يوجد ملف وظيفي (Profile) مرتبط بهذا المستخدم في قاعدة البيانات (public.profiles). يرجى مراجعة إدارة المنظومة لربط حسابك.'
            };
          }

          if (!profileData.is_active) {
            // Account is deactivated: sign out safely
            client.auth.signOut().catch(() => {});
            setCurrentUser(null);
            return {
              success: false,
              error: 'تم تجميد أو تعطيل هذا الحساب. يرجى التواصل مع مسؤول المنظومة.'
            };
          }

          const assignedIds = (profileData.station_assignments || [])
            .filter((a: any) => a.is_active)
            .map((a: any) => a.station_id);

          // Role is trusted directly from PostgreSQL row
          setCurrentUser({
            ...profileData,
            assigned_station_ids: assignedIds,
          });
          setIsDemoMode(false);

          await refreshProfiles();
          return { success: true };
        }
      } catch (err) {
        const formatted = formatArabicError(err);
        return { success: false, error: formatted.message };
      }
    }

    // Local / Demonstration mode matching
    const found = profiles.find((p) => p.email.toLowerCase() === email.toLowerCase());
    if (found) {
      setCurrentUser(found);
      setIsDemoMode(true);
      return { success: true };
    }
    return { success: false, error: 'البريد الإلكتروني غير مسجل في قاعدة البيانات' };
  };

  const signOut = async () => {
    // 1. Immediately invalidate in-flight queries and clear local authentication state
    requestIdRef.current += 1;
    if (authTimeoutRef.current) {
      clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;
    }
    setCurrentUser(null);
    setIsDemoMode(false);
    setIsLoadingAuth(false);

    // 2. Perform Supabase remote sign out safely without throwing unhandled rejection on network or token errors
    if (isSupabaseMode && !isDemoMode) {
      const client = getSupabase();
      if (client) {
        try {
          await client.auth.signOut();
        } catch (err) {
          console.warn('Supabase remote sign out warning (handled gracefully):', err);
        }
      }
    }
  };

  const createEmployeeProfile = async (
    newProfile: Omit<UserProfile, 'id' | 'created_at'> & { id?: string }
  ): Promise<{ success: boolean; error?: string; profile?: UserProfile }> => {
    // 1. Authorization check: only super_admin and admin can create employees
    if (!canCreateEmployee(role)) {
      return { success: false, error: 'ليس لديك الصلاحية لإنشاء موظفين في المنظومة.' };
    }

    // Role escalation prevention
    if (!canManageRoles(role, newProfile.role)) {
      return { success: false, error: 'ليس لديك الصلاحية لمنح هذه الرتبة (لا يمكن ترقية أو إنشاء مدير نظام عام).' };
    }

    const cleanNum = newProfile.employee_number.trim().toUpperCase();
    const cleanEmail = newProfile.email.trim().toLowerCase();

    // 2. Client-side deduplication check against already loaded profiles
    const existsNum = profiles.some(
      (p) => p.employee_number.trim().toUpperCase() === cleanNum
    );
    if (existsNum) {
      return { success: false, error: 'الرقم الوظيفي مسجل مسبقاً لموظف آخر' };
    }

    const existsEmail = profiles.some(
      (p) => p.email.trim().toLowerCase() === cleanEmail
    );
    if (existsEmail) {
      return { success: false, error: 'البريد الإلكتروني مسجل مسبقاً لموظف آخر' };
    }

    // 3. Demo Mode or Local Mode (Offline / Vitest / Demo persona)
    if (isDemoMode || !isSupabaseMode) {
      // Must generate a valid RFC 4122 v4 UUID, NEVER a non-UUID string
      const validId =
        newProfile.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(newProfile.id)
          ? newProfile.id
          : generateUUID();

      const timestamp = new Date().toISOString();
      const created: UserProfile = {
        ...newProfile,
        employee_number: cleanNum,
        email: cleanEmail,
        id: validId,
        created_at: timestamp,
        assigned_station_ids: newProfile.assigned_station_ids || [],
      };

      setProfiles((prev) => [created, ...prev]);
      return { success: true, profile: created };
    }

    // 4. Live Supabase Mode: Server-Side Provisioning via Edge Function
    const client = getSupabase();
    if (!client) {
      return { success: false, error: 'تعذر الاتصال بـ Supabase' };
    }

    try {
      // 4.1 Invoke the server-side Supabase Edge Function 'create-employee'
      // which uses the caller's JWT to authenticate and provisions both auth.users and public.profiles
      const { data, error: fnError } = await client.functions.invoke('create-employee', {
        body: {
          employee_number: cleanNum,
          full_name: newProfile.full_name.trim(),
          email: cleanEmail,
          phone: newProfile.phone?.trim() || null,
          role: newProfile.role,
          department: newProfile.department?.trim() || null,
          job_title: newProfile.job_title?.trim() || null,
          organization_id: newProfile.organization_id || null,
          is_active: newProfile.is_active ?? true,
          assigned_station_ids: newProfile.assigned_station_ids || [],
        },
      });

      if (!fnError && data && data.success && data.profile) {
        const createdProfile: UserProfile = data.profile;
        setProfiles((prev) => [createdProfile, ...prev.filter((p) => p.id !== createdProfile.id)]);
        await refreshProfiles();
        return { success: true, profile: createdProfile };
      }

      // If Edge Function returned an explicit error response
      if (data && !data.success && data.error) {
        return { success: false, error: data.error };
      }

      if (fnError) {
        // If an explicit pre-existing Auth User UUID was provided in newProfile.id
        // (for example, user created manually in Supabase Dashboard -> Authentication -> Users)
        if (
          newProfile.id &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(newProfile.id)
        ) {
          const { data: dbData, error: dbError } = await client
            .from('profiles')
            .insert([
              {
                id: newProfile.id,
                employee_number: cleanNum,
                full_name: newProfile.full_name.trim(),
                email: cleanEmail,
                phone: newProfile.phone?.trim() || null,
                role: newProfile.role,
                department: newProfile.department?.trim() || null,
                job_title: newProfile.job_title?.trim() || null,
                organization_id: newProfile.organization_id || null,
                is_active: newProfile.is_active ?? true,
              },
            ])
            .select()
            .single();

          if (dbError) {
            const formatted = formatArabicError(dbError);
            return { success: false, error: formatted.message };
          }

          const createdProfile: UserProfile = {
            ...dbData,
            assigned_station_ids: newProfile.assigned_station_ids || [],
          };
          setProfiles((prev) => [createdProfile, ...prev.filter((p) => p.id !== createdProfile.id)]);
          await refreshProfiles();
          return { success: true, profile: createdProfile };
        }

        const formatted = formatArabicError(fnError);
        const detailMessage =
          fnError.message?.includes('Failed to send a request') ||
          fnError.message?.includes('FunctionsFetchError') ||
          fnError.message?.includes('404')
            ? 'تعذر استدعاء دالة إنشاء الموظفين في Supabase (create-employee). يرجى التأكد من نشر Edge Function في مشروع Supabase.'
            : formatted.message;

        return { success: false, error: detailMessage };
      }
    } catch (err) {
      const formatted = formatArabicError(err);
      return { success: false, error: formatted.message };
    }

    return { success: false, error: 'حدث خطأ غير متوقع أثناء إضافة الموظف' };
  };

  const updateEmployeeProfile = async (
    userId: string,
    updates: Partial<UserProfile>
  ): Promise<{ success: boolean; error?: string }> => {
    if (isSupabaseMode) {
      const client = getSupabase();
      if (client) {
        try {
          const { error } = await client
            .from('profiles')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', userId);

          if (error) {
            const formatted = formatArabicError(error);
            return { success: false, error: formatted.message };
          }
        } catch (err) {
          const formatted = formatArabicError(err);
          return { success: false, error: formatted.message };
        }
      }
    }

    setProfiles((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, ...updates } : p))
    );
    if (currentUser?.id === userId) {
      setCurrentUser((prev) => (prev ? { ...prev, ...updates } : null));
    }
    return { success: true };
  };

  const toggleEmployeeActiveStatus = async (
    userId: string
  ): Promise<{ success: boolean; error?: string }> => {
    const target = profiles.find((p) => p.id === userId);
    if (!target) return { success: false, error: 'الموظف غير موجود' };

    const newStatus = !target.is_active;
    return updateEmployeeProfile(userId, { is_active: newStatus });
  };

  const role: UserRole = currentUser?.role || 'employee';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role,
        isAuthenticated: currentUser !== null,
        isLoadingAuth,
        isSupabaseMode,
        isDemoMode,
        allProfiles: profiles,
        switchUserRole,
        selectUserPersona,
        startDemoMode,
        exitDemoMode,
        signIn,
        signOut,
        createEmployeeProfile,
        updateEmployeeProfile,
        toggleEmployeeActiveStatus,
        refreshProfiles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
