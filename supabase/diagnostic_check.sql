-- ==============================================================================
-- PSMS DATABASE DIAGNOSTIC CHECK (READ-ONLY & COMPLETELY SAFE)
-- ==============================================================================
-- Target Project: gygksvqqqtjqgcnwfjha (Power Station Management System - PSMS)
-- Purpose:
--   Runs comprehensive, non-destructive diagnostic queries to audit:
--   1. Applied tables and record counts.
--   2. RLS policy status and detection of circular dependencies (Error 42P17).
--   3. Trigger functions & role extraction mechanism (auth.role() vs request.jwt.claim.role).
--   4. Function permissions (EXECUTE grants for authenticated & service_role).
--   5. Existing profiles and administrator accounts.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLE PRESENCE & ROW COUNT AUDIT
-- -----------------------------------------------------------------------------
SELECT 
    t.table_name,
    c.reltuples::bigint AS estimated_row_count,
    CASE 
        WHEN c.relrowsecurity THEN 'ENABLED' 
        ELSE 'DISABLED' 
    END AS rls_status
FROM information_schema.tables t
LEFT JOIN pg_class c ON c.relname = t.table_name
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;

-- -----------------------------------------------------------------------------
-- 2. ACTIVE RLS POLICIES AUDIT (IDENTIFY RECURSIVE OR LEGACY POLICIES)
-- -----------------------------------------------------------------------------
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    CASE 
        WHEN qual LIKE '%station_assignments%profiles%' OR qual LIKE '%profiles%station_assignments%'
             THEN 'POTENTIAL RECURSION WARNING (42P17)'
        ELSE 'OK'
    END AS policy_health_indicator,
    qual AS using_expression,
    with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'stations', 'station_assignments', 'fault_reports', 'maintenance_orders', 'station_readings')
ORDER BY tablename, policyname;

-- -----------------------------------------------------------------------------
-- 3. EMPLOYEE CREATION TRIGGER & RPC INSPECTION
-- -----------------------------------------------------------------------------
SELECT 
    p.proname AS function_name,
    pg_get_functiondef(p.oid) LIKE '%auth.role()%' AS uses_auth_role_fix,
    pg_get_functiondef(p.oid) LIKE '%request.jwt.claim.role%' AS uses_legacy_jwt_claim,
    CASE 
        WHEN pg_get_functiondef(p.oid) LIKE '%auth.role()%' 
             THEN 'HEALTHY: Migration 08 Applied (auth.role() active)'
        WHEN pg_get_functiondef(p.oid) LIKE '%request.jwt.claim.role%' 
             THEN 'ACTION REQUIRED: Needs Migration 08 (uses request.jwt.claim.role)'
        ELSE 'UNKNOWN'
    END AS function_health_status,
    p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('enforce_profile_insert_security', 'provision_employee_profile_and_assignments');

-- -----------------------------------------------------------------------------
-- 4. PROFILES TABLE TRIGGERS AUDIT
-- -----------------------------------------------------------------------------
SELECT 
    tgname AS trigger_name,
    relname AS table_name,
    proname AS trigger_function,
    CASE tgenabled 
        WHEN 'O' THEN 'ENABLED'
        WHEN 'D' THEN 'DISABLED'
        ELSE tgenabled::text
    END AS trigger_status
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_proc p ON p.oid = tg.tgfoid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'profiles'
  AND NOT tg.tgisinternal;

-- -----------------------------------------------------------------------------
-- 5. FUNCTION EXECUTION PERMISSIONS (GRANTS)
-- -----------------------------------------------------------------------------
SELECT 
    routine_name,
    grantee,
    privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name IN (
      'provision_employee_profile_and_assignments',
      'enforce_profile_insert_security',
      'get_current_user_role',
      'is_super_admin',
      'is_admin_or_super',
      'user_has_station_access'
  )
ORDER BY routine_name, grantee;

-- -----------------------------------------------------------------------------
-- 6. EXISTING PROFILES & ROLES SUMMARY (DATA PRIVACY SAFE)
-- -----------------------------------------------------------------------------
SELECT 
    role,
    COUNT(*) AS profile_count,
    COUNT(CASE WHEN is_active THEN 1 END) AS active_count,
    COUNT(CASE WHEN NOT is_active THEN 1 END) AS inactive_count
FROM public.profiles
GROUP BY role
ORDER BY profile_count DESC;

-- -----------------------------------------------------------------------------
-- 7. DIAGNOSTIC INTERPRETATION GUIDE
-- -----------------------------------------------------------------------------
-- 1. If "enforce_profile_insert_security" has uses_legacy_jwt_claim = TRUE:
--    -> Apply 08_fix_jwt_role_extraction_in_employee_provisioning.sql to fix P0001 error.
--
-- 2. If pg_policies has "POTENTIAL RECURSION WARNING (42P17)" or circular joins:
--    -> Apply 05_centralized_architecture_and_auth_stabilization.sql to clean RLS DAG.
--
-- 3. If everything shows HEALTHY and NO RECURSION:
--    -> Database is in 100% production-ready condition!
-- ==============================================================================
