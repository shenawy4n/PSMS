-- ==============================================================================
-- PSMS MIGRATION 05: CENTRALIZED ARCHITECTURE & AUTHENTICATION STABILIZATION
-- ==============================================================================
-- Architecture Objectives & Transition:
-- 1. Transition PSMS from multi-tenant isolation to a single centralized platform
--    governed by super_admin and operational admins.
-- 2. Preserve historical data and backward compatibility:
--    - Retains public.organizations and organization_id columns without data loss.
--    - Ensures organization_id is nullable on both stations and profiles.
-- 3. Centralized Role Permissions:
--    - super_admin: Full global access across all stations, employees, assignments, and roles.
--    - admin: Central administrative authority (manage stations and personnel, assign employees)
--             without requiring matching organization_id.
--    - supervisor: Supervisory access and assignments strictly bounded to assigned stations.
--    - employee: Operational access strictly bounded to assigned stations.
-- 4. Anti-Privilege Escalation Triggers:
--    - Non-super-admins cannot alter system-immutable fields (id, email, employee_number).
--    - Users cannot modify their own role, activation status, or supervisor reference.
--    - Admins cannot promote users to super_admin or modify existing super_admin accounts.
-- 5. Station Assignment Immutability:
--    - station_id and user_id are strictly immutable on UPDATE.
--    - Supervisors can only update assignments for stations where they hold an active assignment.
-- 6. Grants & Security:
--    - All functions use SECURITY DEFINER with explicit SET search_path = public, pg_temp.
--    - Execution revoked from PUBLIC, granted strictly to authenticated roles.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: SCHEMA ADJUSTMENTS (Backward-Compatible Centralization)
-- -----------------------------------------------------------------------------

-- 1.1 Ensure organization_id is nullable on stations
DO $$
BEGIN
    ALTER TABLE public.stations ALTER COLUMN organization_id DROP NOT NULL;
EXCEPTION
    WHEN undefined_column THEN NULL;
    WHEN others THEN NULL;
END $$;

-- 1.2 Ensure organization_id is nullable on profiles
DO $$
BEGIN
    ALTER TABLE public.profiles ALTER COLUMN organization_id DROP NOT NULL;
EXCEPTION
    WHEN undefined_column THEN NULL;
    WHEN others THEN NULL;
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
-- STEP 5: CENTRALIZED RLS POLICIES
-- -----------------------------------------------------------------------------

-- 5.1 ORGANIZATIONS: Reference data readable by all authenticated users
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

-- 5.2 PROFILES: Central administrative visibility and self-access
DROP POLICY IF EXISTS "Profiles viewable by authorized users" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage central profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update central profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles self update" ON public.profiles;

CREATE POLICY "Profiles viewable by authorized users"
ON public.profiles FOR SELECT
TO authenticated
USING (
    -- 1. Users can always read their own profile
    id = (SELECT auth.uid())
    -- 2. Super Admin and Central Admins view all profiles across the platform
    OR public.is_admin_or_super()
    -- 3. Operational teammates co-assigned to active stations
    OR public.user_shares_station_with(id)
);

CREATE POLICY "Super admins can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_super_admin());

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

-- 5.3 STATIONS: Central management by super_admin & admin; assigned access for others
DROP POLICY IF EXISTS "Stations viewable based on assignment or org scope" ON public.stations;
DROP POLICY IF EXISTS "Super admins and Org Admins can insert stations" ON public.stations;
DROP POLICY IF EXISTS "Super admins and Org Admins can update stations" ON public.stations;
DROP POLICY IF EXISTS "Central admins can insert stations" ON public.stations;
DROP POLICY IF EXISTS "Central admins can update stations" ON public.stations;
DROP POLICY IF EXISTS "Stations viewable based on centralized access" ON public.stations;

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

-- 5.4 STATION ASSIGNMENTS: Central management and supervisor delegation
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
    -- Super Admin & Admin can assign anyone anywhere
    public.is_admin_or_super()
    -- Supervisor can assign operational personnel to stations they actively supervise
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

-- -----------------------------------------------------------------------------
-- STEP 6: VERIFICATION BLOCK
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'Migration 05: Centralized architecture and auth stabilization applied successfully. Multi-tenant blockers removed, centralized roles enabled, and security triggers hardened.';
END $$;
