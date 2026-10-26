-- ==============================================================================
-- PSMS MIGRATION 05: CENTRALIZED ARCHITECTURE & AUTHENTICATION STABILIZATION
-- ==============================================================================
-- Complete Production RLS Audit & Centralization Specification:
-- 1. ARCHITECTURE TRANSITION:
--    Transition PSMS from multi-tenant isolation to a single centralized platform
--    governed by super_admin and operational admins.
-- 2. PRESERVATION OF HISTORICAL DATA & RETRO-COMPATIBILITY:
--    - Retains public.organizations and organization_id without column removal.
--    - Ensures organization_id is nullable on both stations and profiles.
-- 3. PERMISSIVE-POLICY OR-COMPOSITION LEAK PREVENTION:
--    Explicitly drops all legacy policies from 01_initial_schema.sql,
--    02_security_and_assignments.sql, and 04_fix_rls_recursion.sql across ALL tables:
--    profiles, stations, station_assignments, station_assets, station_readings,
--    fault_reports, maintenance_orders, audit_logs, organizations, regions,
--    tasks, notifications, inspection_templates, inspection_records,
--    asset_types, and measurement_types.
-- 4. LEAST PRIVILEGE ROLE MODEL:
--    - super_admin: Full system-wide authority across all operational tables.
--    - admin: Central operational administration (manage stations, personnel, assets,
--             maintenance, readings, and faults) across the central network.
--    - supervisor: Supervisory actions strictly bounded to authorized stations (user_has_station_access).
--    - employee: Operational data viewing and measurement/fault submissions strictly
--                bounded to authorized stations (user_has_station_access).
-- 5. FUNCTION HARDENING & ACCESS CONTROL:
--    - All helper functions use SECURITY DEFINER with explicit SET search_path = public, pg_temp.
--    - Public execution is REVOKED; EXECUTE is granted strictly to authenticated roles.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: SCHEMA ADJUSTMENTS (Backward-Compatible Centralization)
-- -----------------------------------------------------------------------------

-- 1.1 Ensure organization_id is nullable on stations using explicit schema checks
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'stations'
          AND column_name = 'organization_id'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.stations ALTER COLUMN organization_id DROP NOT NULL;
    END IF;
END $$;

-- 1.2 Ensure organization_id is nullable on profiles using explicit schema checks
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'organization_id'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.profiles ALTER COLUMN organization_id DROP NOT NULL;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- STEP 2: HARDENED SECURITY DEFINER HELPER FUNCTIONS
-- -----------------------------------------------------------------------------

-- 2.1 Extract role for currently authenticated user without triggering RLS cycles
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT role FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

-- 2.2 Extract organization_id for currently authenticated user (optional metadata)
CREATE OR REPLACE FUNCTION public.get_current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

-- 2.3 Super Admin check
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((public.get_current_user_role() = 'super_admin'::user_role), FALSE);
$$;

-- 2.4 Admin or Super Admin check (Central System Administrators)
CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((public.get_current_user_role() IN ('super_admin'::user_role, 'admin'::user_role)), FALSE);
$$;

-- 2.5 Check if current user has an active assignment to a given station
CREATE OR REPLACE FUNCTION public.user_has_station_assignment(target_station_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.station_assignments
        WHERE user_id = (SELECT auth.uid())
          AND station_id = target_station_id
          AND is_active = TRUE
    );
$$;

-- 2.6 Centralized station access check:
-- - super_admin & admin: Global central access to all power stations in the platform.
-- - supervisor & employee: Operational access strictly bounded to active station assignments.
CREATE OR REPLACE FUNCTION public.user_has_station_access(station_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_role user_role;
BEGIN
    v_user_role := public.get_current_user_role();

    IF v_user_role IN ('super_admin'::user_role, 'admin'::user_role) THEN
        RETURN TRUE;
    END IF;

    RETURN public.user_has_station_assignment(station_uuid);
END;
$$;

-- 2.7 Check if current user shares at least one active station assignment with target user
CREATE OR REPLACE FUNCTION public.user_shares_station_with(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.station_assignments my_sa
        JOIN public.station_assignments their_sa
          ON my_sa.station_id = their_sa.station_id
        WHERE my_sa.user_id = (SELECT auth.uid())
          AND my_sa.is_active = TRUE
          AND their_sa.user_id = target_user_id
          AND their_sa.is_active = TRUE
    );
$$;

-- 2.8 Backward-compatible helpers for legacy queries
CREATE OR REPLACE FUNCTION public.station_belongs_to_user_org(target_station_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    -- In centralized architecture, central admins have access to all stations
    SELECT public.is_admin_or_super() OR EXISTS (
        SELECT 1 FROM public.stations
        WHERE id = target_station_id
          AND organization_id IS NOT NULL
          AND organization_id = public.get_current_user_org_id()
    );
$$;

CREATE OR REPLACE FUNCTION public.profile_belongs_to_user_org(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    -- In centralized architecture, central admins manage all non-super-admin profiles
    SELECT (public.is_admin_or_super() AND NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = target_user_id AND role = 'super_admin'::user_role
    )) OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = target_user_id
          AND organization_id IS NOT NULL
          AND organization_id = public.get_current_user_org_id()
          AND role != 'super_admin'::user_role
    );
$$;

-- -----------------------------------------------------------------------------
-- STEP 3: FUNCTION EXECUTION GRANTS (Least-Privilege Security)
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;

REVOKE ALL ON FUNCTION public.get_current_user_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_org_id() TO authenticated;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin_or_super() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super() TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_station_assignment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_station_assignment(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_station_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_station_access(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.user_shares_station_with(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_shares_station_with(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.station_belongs_to_user_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.station_belongs_to_user_org(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.profile_belongs_to_user_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_belongs_to_user_org(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- STEP 4: DATABASE TRIGGERS FOR CENTRALIZED ACCESS & ANTI-ESCALATION
-- -----------------------------------------------------------------------------

-- 4.1 Profiles Update Trigger
CREATE OR REPLACE FUNCTION public.enforce_profile_update_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_uid UUID;
    v_is_super BOOLEAN;
    v_is_admin BOOLEAN;
BEGIN
    v_current_uid := (SELECT auth.uid());
    v_is_super := public.is_super_admin();
    v_is_admin := public.is_admin_or_super();

    -- 1. Super admin: unrestricted management of all profile attributes
    IF v_is_super THEN
        RETURN NEW;
    END IF;

    -- 2. Immutable Fields: id, email, and employee_number cannot be modified by non-super-admins
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Field "id" is strictly immutable.';
    END IF;

    IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'Field "email" is governed by Supabase Auth and cannot be modified directly in profiles.';
    END IF;

    IF NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
        RAISE EXCEPTION 'Field "employee_number" is corporate-assigned and cannot be modified without Super Admin authorization.';
    END IF;

    -- 3. Self-Update branch (evaluated FIRST for self-service updates):
    -- Users cannot escalate their own role, change their activation status, or modify supervisor
    IF OLD.id = v_current_uid THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Privilege escalation violation: Users are not permitted to change their own role.';
        END IF;
        IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
            RAISE EXCEPTION 'Security violation: Users are not permitted to alter their own account activation status.';
        END IF;
        IF NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id THEN
            RAISE EXCEPTION 'Security violation: Users are not permitted to modify their supervisor reference.';
        END IF;
        RETURN NEW;
    END IF;

    -- 4. Central System Admin managing subordinate profiles across the central system:
    IF v_is_admin THEN
        -- Cannot promote any user to super_admin
        IF NEW.role = 'super_admin'::user_role AND OLD.role != 'super_admin'::user_role THEN
            RAISE EXCEPTION 'Privilege escalation violation: Admins cannot promote users to super_admin.';
        END IF;
        -- Cannot modify an existing Super Admin account
        IF OLD.role = 'super_admin'::user_role THEN
            RAISE EXCEPTION 'Security violation: Admins cannot modify Super Admin profiles.';
        END IF;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Permission denied: Unauthorized profile modification attempt.';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_update_security ON public.profiles;
CREATE TRIGGER trg_enforce_profile_update_security
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_update_security();

-- 4.2 Station Assignments Update Trigger
CREATE OR REPLACE FUNCTION public.enforce_station_assignment_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_super BOOLEAN;
    v_is_admin BOOLEAN;
    v_user_role user_role;
BEGIN
    -- 1. Structural Immutability: station_id and user_id can NEVER be mutated on UPDATE
    IF NEW.station_id IS DISTINCT FROM OLD.station_id THEN
        RAISE EXCEPTION 'Station assignment station_id is strictly immutable. To reassign, deactivate the existing assignment and create a new one.';
    END IF;

    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Station assignment user_id is strictly immutable. Create a new assignment for the target user.';
    END IF;

    v_is_super := public.is_super_admin();
    v_is_admin := public.is_admin_or_super();
    v_user_role := public.get_current_user_role();

    -- 2. Super admin & Central Admin: full management of assignment status and role
    IF v_is_super OR v_is_admin THEN
        RETURN NEW;
    END IF;

    -- 3. Supervisor: can update assignments ONLY for stations where they hold an active assignment
    IF v_user_role = 'supervisor'::user_role AND public.user_has_station_assignment(OLD.station_id) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Permission denied: You are not authorized to modify station assignments.';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_station_assignment_immutability ON public.station_assignments;
CREATE TRIGGER trg_enforce_station_assignment_immutability
BEFORE UPDATE ON public.station_assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_station_assignment_immutability();

-- -----------------------------------------------------------------------------
-- STEP 5: CENTRALIZED RLS POLICIES ACROSS ALL SYSTEM TABLES
-- -----------------------------------------------------------------------------

-- =============================================================================
-- 5.1 ORGANIZATIONS
-- =============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizations viewable by scoped users" ON public.organizations;
DROP POLICY IF EXISTS "Organizations viewable by authenticated users" ON public.organizations;
DROP POLICY IF EXISTS "Organizations manageable by super admins" ON public.organizations;

CREATE POLICY "Organizations viewable by authenticated users"
ON public.organizations FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY "Organizations manageable by super admins"
ON public.organizations FOR ALL
TO authenticated
USING (public.is_super_admin());

-- =============================================================================
-- 5.2 REGIONS
-- =============================================================================
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Regions viewable by authenticated users" ON public.regions;
DROP POLICY IF EXISTS "Regions manageable by super admins" ON public.regions;

CREATE POLICY "Regions viewable by authenticated users"
ON public.regions FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY "Regions manageable by super admins"
ON public.regions FOR ALL
TO authenticated
USING (public.is_super_admin());

-- =============================================================================
-- 5.3 PROFILES
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by authorized users" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update central profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage central profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles self update" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own non-sensitive profile data" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert central profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can delete profiles" ON public.profiles;

CREATE POLICY "Profiles viewable by authorized users"
ON public.profiles FOR SELECT
TO authenticated
USING (
    id = (SELECT auth.uid())
    OR public.is_admin_or_super()
    OR public.user_shares_station_with(id)
);

CREATE POLICY "Super admins can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Admins can insert central profiles"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_super());

CREATE POLICY "Admins can update central profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.is_admin_or_super())
WITH CHECK (public.is_admin_or_super());

CREATE POLICY "Profiles self update"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "Super admins can delete profiles"
ON public.profiles FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- =============================================================================
-- 5.4 STATIONS
-- =============================================================================
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Stations viewable based on assignment or org scope" ON public.stations;
DROP POLICY IF EXISTS "Super admins and Org Admins can insert stations" ON public.stations;
DROP POLICY IF EXISTS "Super admins and Org Admins can update stations" ON public.stations;
DROP POLICY IF EXISTS "Central admins can insert stations" ON public.stations;
DROP POLICY IF EXISTS "Central admins can update stations" ON public.stations;
DROP POLICY IF EXISTS "Stations viewable based on centralized access" ON public.stations;
DROP POLICY IF EXISTS "Super admins can delete stations" ON public.stations;

CREATE POLICY "Stations viewable based on centralized access"
ON public.stations FOR SELECT
TO authenticated
USING (public.user_has_station_access(id));

CREATE POLICY "Central admins can insert stations"
ON public.stations FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_super());

CREATE POLICY "Central admins can update stations"
ON public.stations FOR UPDATE
TO authenticated
USING (public.is_admin_or_super())
WITH CHECK (public.is_admin_or_super());

CREATE POLICY "Super admins can delete stations"
ON public.stations FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- =============================================================================
-- 5.5 STATION ASSIGNMENTS
-- =============================================================================
ALTER TABLE public.station_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Station assignments viewable by authorized users" ON public.station_assignments;
DROP POLICY IF EXISTS "Station assignments insertable by authorized managers" ON public.station_assignments;
DROP POLICY IF EXISTS "Station assignments updatable by authorized managers" ON public.station_assignments;
DROP POLICY IF EXISTS "Station assignments deletable by super admins" ON public.station_assignments;

CREATE POLICY "Station assignments viewable by authorized users"
ON public.station_assignments FOR SELECT
TO authenticated
USING (
    user_id = (SELECT auth.uid())
    OR public.is_admin_or_super()
    OR public.user_has_station_assignment(station_id)
);

CREATE POLICY "Station assignments insertable by authorized managers"
ON public.station_assignments FOR INSERT
TO authenticated
WITH CHECK (
    public.is_admin_or_super()
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_assignments.station_id)
    )
);

CREATE POLICY "Station assignments updatable by authorized managers"
ON public.station_assignments FOR UPDATE
TO authenticated
USING (
    public.is_admin_or_super()
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_assignments.station_id)
    )
)
WITH CHECK (
    public.is_admin_or_super()
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_assignments.station_id)
    )
);

CREATE POLICY "Station assignments deletable by super admins"
ON public.station_assignments FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- =============================================================================
-- 5.6 STATION ASSETS
-- =============================================================================
ALTER TABLE public.station_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Station assets viewable by authorized station staff" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets insertable by authorized managers" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets updatable by authorized managers" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets deletable by super admins" ON public.station_assets;

CREATE POLICY "Station assets viewable by authorized station staff"
ON public.station_assets FOR SELECT
TO authenticated
USING (public.user_has_station_access(station_id));

CREATE POLICY "Station assets insertable by authorized managers"
ON public.station_assets FOR INSERT
TO authenticated
WITH CHECK (
    public.is_admin_or_super()
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_assets.station_id)
    )
);

CREATE POLICY "Station assets updatable by authorized managers"
ON public.station_assets FOR UPDATE
TO authenticated
USING (
    public.is_admin_or_super()
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_assets.station_id)
    )
)
WITH CHECK (
    public.is_admin_or_super()
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_assets.station_id)
    )
);

CREATE POLICY "Station assets deletable by super admins"
ON public.station_assets FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- =============================================================================
-- 5.7 STATION READINGS
-- =============================================================================
ALTER TABLE public.station_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Readings viewable by authorized station staff" ON public.station_readings;
DROP POLICY IF EXISTS "Authorized personnel can record readings" ON public.station_readings;
DROP POLICY IF EXISTS "Super admins can delete readings" ON public.station_readings;

CREATE POLICY "Readings viewable by authorized station staff"
ON public.station_readings FOR SELECT
TO authenticated
USING (public.user_has_station_access(station_id));

CREATE POLICY "Authorized personnel can record readings"
ON public.station_readings FOR INSERT
TO authenticated
WITH CHECK (
    public.user_has_station_access(station_id)
    AND recorded_by = (SELECT auth.uid())
);

CREATE POLICY "Super admins can delete readings"
ON public.station_readings FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- =============================================================================
-- 5.8 FAULT REPORTS
-- =============================================================================
ALTER TABLE public.fault_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fault reports viewable by station personnel" ON public.fault_reports;
DROP POLICY IF EXISTS "Station personnel can submit fault reports" ON public.fault_reports;
DROP POLICY IF EXISTS "Supervisors and Admins can update fault status" ON public.fault_reports;
DROP POLICY IF EXISTS "Fault reports deletable by super admins" ON public.fault_reports;

CREATE POLICY "Fault reports viewable by station personnel"
ON public.fault_reports FOR SELECT
TO authenticated
USING (public.user_has_station_access(station_id));

CREATE POLICY "Station personnel can submit fault reports"
ON public.fault_reports FOR INSERT
TO authenticated
WITH CHECK (
    public.user_has_station_access(station_id)
    AND reported_by = (SELECT auth.uid())
);

CREATE POLICY "Supervisors and Admins can update fault status"
ON public.fault_reports FOR UPDATE
TO authenticated
USING (
    public.user_has_station_access(station_id)
    AND (
        public.is_admin_or_super()
        OR public.get_current_user_role() = 'supervisor'::user_role
    )
)
WITH CHECK (
    public.user_has_station_access(station_id)
    AND (
        public.is_admin_or_super()
        OR public.get_current_user_role() = 'supervisor'::user_role
    )
);

CREATE POLICY "Fault reports deletable by super admins"
ON public.fault_reports FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- =============================================================================
-- 5.9 MAINTENANCE ORDERS
-- =============================================================================
ALTER TABLE public.maintenance_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Maintenance orders viewable by authorized station staff" ON public.maintenance_orders;
DROP POLICY IF EXISTS "Maintenance orders insertable by authorized managers" ON public.maintenance_orders;
DROP POLICY IF EXISTS "Maintenance orders updatable by authorized managers" ON public.maintenance_orders;
DROP POLICY IF EXISTS "Maintenance orders deletable by super admins" ON public.maintenance_orders;

CREATE POLICY "Maintenance orders viewable by authorized station staff"
ON public.maintenance_orders FOR SELECT
TO authenticated
USING (public.user_has_station_access(station_id));

CREATE POLICY "Maintenance orders insertable by authorized managers"
ON public.maintenance_orders FOR INSERT
TO authenticated
WITH CHECK (
    public.is_admin_or_super()
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(maintenance_orders.station_id)
    )
);

CREATE POLICY "Maintenance orders updatable by authorized managers"
ON public.maintenance_orders FOR UPDATE
TO authenticated
USING (
    public.user_has_station_access(station_id)
    AND (
        public.is_admin_or_super()
        OR public.get_current_user_role() = 'supervisor'::user_role
    )
)
WITH CHECK (
    public.user_has_station_access(station_id)
    AND (
        public.is_admin_or_super()
        OR public.get_current_user_role() = 'supervisor'::user_role
    )
);

CREATE POLICY "Maintenance orders deletable by super admins"
ON public.maintenance_orders FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- =============================================================================
-- 5.10 AUDIT LOGS
-- =============================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audit logs viewable only by Admins" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit logs insertable by system or authenticated users" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit logs viewable by central admins" ON public.audit_logs;

CREATE POLICY "Audit logs viewable by central admins"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.is_admin_or_super());

CREATE POLICY "Audit logs insertable by system or authenticated users"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (
    actor_id = (SELECT auth.uid())
    OR actor_id IS NULL
);

-- Note: No UPDATE or DELETE policies are created on audit_logs.
-- They remain strictly immutable and tamper-evident.

-- =============================================================================
-- 5.11 TASKS
-- =============================================================================
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tasks viewable by assignee or station manager" ON public.tasks;
DROP POLICY IF EXISTS "Tasks manageable by authorized managers" ON public.tasks;
DROP POLICY IF EXISTS "Tasks deletable by super admins" ON public.tasks;

CREATE POLICY "Tasks viewable by assignee or station manager"
ON public.tasks FOR SELECT
TO authenticated
USING (
    assigned_to = (SELECT auth.uid())
    OR public.is_admin_or_super()
    OR (station_id IS NOT NULL AND public.user_has_station_access(station_id))
);

CREATE POLICY "Tasks manageable by authorized managers"
ON public.tasks FOR INSERT
TO authenticated
WITH CHECK (
    public.is_admin_or_super()
    OR (
        station_id IS NOT NULL
        AND public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(tasks.station_id)
    )
);

CREATE POLICY "Tasks updatable by assignee or managers"
ON public.tasks FOR UPDATE
TO authenticated
USING (
    assigned_to = (SELECT auth.uid())
    OR public.is_admin_or_super()
    OR (
        station_id IS NOT NULL
        AND public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(tasks.station_id)
    )
)
WITH CHECK (
    assigned_to = (SELECT auth.uid())
    OR public.is_admin_or_super()
    OR (
        station_id IS NOT NULL
        AND public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(tasks.station_id)
    )
);

CREATE POLICY "Tasks deletable by super admins"
ON public.tasks FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- =============================================================================
-- 5.12 NOTIFICATIONS
-- =============================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notifications viewable by recipient" ON public.notifications;
DROP POLICY IF EXISTS "Notifications updatable by recipient" ON public.notifications;
DROP POLICY IF EXISTS "Notifications insertable by system or managers" ON public.notifications;
DROP POLICY IF EXISTS "Notifications deletable by recipient" ON public.notifications;

CREATE POLICY "Notifications viewable by recipient"
ON public.notifications FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Notifications updatable by recipient"
ON public.notifications FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Notifications insertable by system or managers"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (
    public.is_admin_or_super()
    OR user_id = (SELECT auth.uid())
);

CREATE POLICY "Notifications deletable by recipient"
ON public.notifications FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()) OR public.is_super_admin());

-- =============================================================================
-- 5.13 INSPECTIONS (Templates and Records)
-- =============================================================================
ALTER TABLE public.inspection_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inspection templates viewable by authenticated users" ON public.inspection_templates;
DROP POLICY IF EXISTS "Inspection templates manageable by super admins" ON public.inspection_templates;
DROP POLICY IF EXISTS "Inspection records viewable by authorized station staff" ON public.inspection_records;
DROP POLICY IF EXISTS "Inspection records insertable by authorized inspectors" ON public.inspection_records;
DROP POLICY IF EXISTS "Inspection records updatable by authorized managers" ON public.inspection_records;
DROP POLICY IF EXISTS "Inspection records deletable by super admins" ON public.inspection_records;

CREATE POLICY "Inspection templates viewable by authenticated users"
ON public.inspection_templates FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY "Inspection templates manageable by super admins"
ON public.inspection_templates FOR ALL
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Inspection records viewable by authorized station staff"
ON public.inspection_records FOR SELECT
TO authenticated
USING (public.user_has_station_access(station_id));

CREATE POLICY "Inspection records insertable by authorized inspectors"
ON public.inspection_records FOR INSERT
TO authenticated
WITH CHECK (
    public.user_has_station_access(station_id)
    AND inspector_id = (SELECT auth.uid())
);

CREATE POLICY "Inspection records updatable by authorized managers"
ON public.inspection_records FOR UPDATE
TO authenticated
USING (
    public.is_admin_or_super()
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(inspection_records.station_id)
    )
);

CREATE POLICY "Inspection records deletable by super admins"
ON public.inspection_records FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- =============================================================================
-- 5.14 REFERENCE CATALOGS (Asset Types & Measurement Types)
-- =============================================================================
ALTER TABLE public.asset_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Asset types viewable by authenticated users" ON public.asset_types;
DROP POLICY IF EXISTS "Asset types manageable by super admins" ON public.asset_types;
DROP POLICY IF EXISTS "Measurement types viewable by authenticated users" ON public.measurement_types;
DROP POLICY IF EXISTS "Measurement types manageable by super admins" ON public.measurement_types;

CREATE POLICY "Asset types viewable by authenticated users"
ON public.asset_types FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY "Asset types manageable by super admins"
ON public.asset_types FOR ALL
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Measurement types viewable by authenticated users"
ON public.measurement_types FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY "Measurement types manageable by super admins"
ON public.measurement_types FOR ALL
TO authenticated
USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- STEP 6: VERIFICATION NOTICE BLOCK
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'Migration 05: Comprehensive centralized RLS audit and stabilization applied successfully across all 14 tables. Legacy permissive policies dropped, least privilege enforced, and functions secured with search_path.';
END $$;
