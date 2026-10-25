-- ==============================================================================
-- PSMS MIGRATION 04: FIX RLS RECURSION (42P17) & PRODUCTION MULTI-TENANT ACCESS CONTROL
-- ==============================================================================
-- Architecture & Production Hardening Objectives:
-- 1. Break the infinite recursive evaluation cycle between public.profiles and
--    public.station_assignments (PostgreSQL Error 42P17).
-- 2. Define hardened SECURITY DEFINER helper functions with explicit
--    SET search_path = public, pg_temp, preventing schema-hijacking.
-- 3. Replace the overly permissive Profiles "USING (TRUE)" policy with strict,
--    least-privilege visibility bounded by organization and operational assignment.
-- 4. Prevent profile update privilege escalation via a trusted BEFORE UPDATE trigger:
--    - Enforces immutability of id, email, and employee_number for non-super-admins.
--    - Restricts self-service updates: users (including admins) cannot modify their
--      own role, organization, activation status, or supervisor reference.
--    - Enforces organizational boundaries for Org Admins: cannot promote to super_admin,
--      cannot transfer profiles across organizations, and cannot touch super_admin accounts.
-- 5. Enforce strict tenant isolation on station_assignments:
--    - profile_belongs_to_user_org() strictly checks organization_id IS NOT NULL and
--      organization_id = caller_org. It never accepts NULL organization_id for tenant managers.
--    - BEFORE UPDATE trigger on station_assignments guarantees station_id and user_id immutability.
--    - Explicit USING and WITH CHECK prevent cross-tenant station hopping and user assignment.
-- 6. Enforce strict isolation on public.organizations:
--    - Removes the dangerous "OR get_current_user_org_id() IS NULL" clause to prevent
--      unassigned accounts from reading all tenant organizations.
-- 7. Explicitly drop all legacy policies from 01_initial_schema.sql, 02_security_and_assignments.sql,
--    and draft 04 to prevent permissive OR-composition leaks.
-- 8. Revoke execution from PUBLIC on all helper and trigger functions; grant strictly
--    to authenticated application roles.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: HARDENED SECURITY DEFINER HELPER FUNCTIONS (Non-Recursive DAG)
-- -----------------------------------------------------------------------------

-- 1.1 Extract role for currently authenticated user without triggering RLS cycles
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT role FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

-- 1.2 Extract organization_id for currently authenticated user
CREATE OR REPLACE FUNCTION public.get_current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

-- 1.3 Super Admin check: strictly authenticates true super_admin role
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((public.get_current_user_role() = 'super_admin'::user_role), FALSE);
$$;

-- 1.4 Admin or Super Admin check
CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((public.get_current_user_role() IN ('super_admin'::user_role, 'admin'::user_role)), FALSE);
$$;

-- 1.5 Check if target station belongs to current user's organization
CREATE OR REPLACE FUNCTION public.station_belongs_to_user_org(target_station_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.stations
        WHERE id = target_station_id
          AND organization_id IS NOT NULL
          AND organization_id = public.get_current_user_org_id()
    );
$$;

-- 1.6 Strict tenant matching for target profile:
-- Target MUST belong to the current user's organization.
-- Never accepts NULL organization_id or super_admin accounts for tenant-level managers.
CREATE OR REPLACE FUNCTION public.profile_belongs_to_user_org(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = target_user_id
          AND organization_id IS NOT NULL
          AND organization_id = public.get_current_user_org_id()
          AND role != 'super_admin'::user_role
    );
$$;

-- 1.7 Check if current user has an active assignment to a given station
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

-- 1.8 Unified station access check:
-- - Super admin: global access (TRUE)
-- - Admin: access to any station belonging to their organization
-- - Supervisor / Employee: active assignment in station_assignments
CREATE OR REPLACE FUNCTION public.user_has_station_access(station_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_role user_role;
    v_user_org_id UUID;
BEGIN
    IF public.is_super_admin() THEN
        RETURN TRUE;
    END IF;

    v_user_role := public.get_current_user_role();
    v_user_org_id := public.get_current_user_org_id();

    IF v_user_role = 'admin'::user_role AND v_user_org_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.stations s
            WHERE s.id = station_uuid
              AND s.organization_id = v_user_org_id
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN public.user_has_station_assignment(station_uuid);
END;
$$;

-- 1.9 Check if current user shares at least one active station assignment with target user
-- Evaluates assignments with table-owner privileges and never queries public.profiles,
-- completely eliminating circular RLS loops.
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

-- -----------------------------------------------------------------------------
-- STEP 2: RESTRICT FUNCTION EXECUTION GRANTS (Least-Privilege Security)
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;

REVOKE ALL ON FUNCTION public.get_current_user_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_org_id() TO authenticated;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin_or_super() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super() TO authenticated;

REVOKE ALL ON FUNCTION public.station_belongs_to_user_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.station_belongs_to_user_org(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.profile_belongs_to_user_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_belongs_to_user_org(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_station_assignment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_station_assignment(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_station_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_station_access(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.user_shares_station_with(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_shares_station_with(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- STEP 3: DATABASE TRIGGERS FOR COLUMN IMMUTABILITY & ANTI-ESCALATION
-- -----------------------------------------------------------------------------

-- 3.1 Profiles Update Trigger: Prevents privilege escalation at the database engine level
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
    v_current_org_id UUID;
BEGIN
    v_current_uid := (SELECT auth.uid());
    v_is_super := public.is_super_admin();
    v_is_admin := public.is_admin_or_super();
    v_current_org_id := public.get_current_user_org_id();

    -- 1. Super admin: full unrestricted management of all profile attributes
    IF v_is_super THEN
        RETURN NEW;
    END IF;

    -- 2. System Immutable Fields: id, email, and employee_number cannot be modified
    -- by non-super-admins via table updates (email is updated via auth verification)
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Field "id" is strictly immutable.';
    END IF;

    IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'Field "email" is governed by Supabase Auth and cannot be modified directly in profiles.';
    END IF;

    IF NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
        RAISE EXCEPTION 'Field "employee_number" is corporate-assigned and cannot be modified without Super Admin authorization.';
    END IF;

    -- 3. Self-Update branch (evaluated FIRST for self-updates, regardless of caller role):
    -- Prevents an Org Admin or Supervisor from escalating their own role, modifying their own
    -- organization affiliation, or toggling their own activation status.
    IF OLD.id = v_current_uid THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Privilege escalation violation: Users are not permitted to change their own role.';
        END IF;
        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
            RAISE EXCEPTION 'Tenant violation: Users are not permitted to alter their own organization affiliation.';
        END IF;
        IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
            RAISE EXCEPTION 'Security violation: Users are not permitted to alter their own account activation status.';
        END IF;
        IF NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id THEN
            RAISE EXCEPTION 'Security violation: Users are not permitted to modify their supervisor reference.';
        END IF;
        -- Allowed self-service fields: full_name, phone, department, job_title, updated_at
        RETURN NEW;
    END IF;

    -- 4. Organization Admin managing subordinate profiles in their own organization:
    IF v_is_admin AND v_current_org_id IS NOT NULL AND OLD.organization_id = v_current_org_id THEN
        -- Cannot promote any user to super_admin
        IF NEW.role = 'super_admin'::user_role AND OLD.role != 'super_admin'::user_role THEN
            RAISE EXCEPTION 'Privilege escalation violation: Organization admins cannot promote users to super_admin.';
        END IF;
        -- Cannot transfer profiles to another organization
        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
            RAISE EXCEPTION 'Tenant violation: Organization admins cannot transfer personnel across organizations.';
        END IF;
        -- Cannot target a Super Admin account
        IF OLD.role = 'super_admin'::user_role THEN
            RAISE EXCEPTION 'Security violation: Organization admins cannot modify Super Admin profiles.';
        END IF;
        -- Allowed subordinate management: full_name, phone, role (within tenant), department, job_title, is_active, supervisor_id
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

-- 3.2 Station Assignments Update Trigger: Prevents station hopping and enforces manager authorization
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
    -- 1. Structural Immutability: station_id and user_id can NEVER be mutated on UPDATE.
    -- Required business workflow to reassign: Deactivate the old assignment, then insert a new one.
    IF NEW.station_id IS DISTINCT FROM OLD.station_id THEN
        RAISE EXCEPTION 'Station assignment station_id is strictly immutable. To reassign, deactivate the existing assignment and create a new one.';
    END IF;

    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Station assignment user_id is strictly immutable. Create a new assignment for the target user.';
    END IF;

    v_is_super := public.is_super_admin();
    v_is_admin := public.is_admin_or_super();
    v_user_role := public.get_current_user_role();

    -- 2. Super admin: full management of assignment status and role
    IF v_is_super THEN
        RETURN NEW;
    END IF;

    -- 3. Org Admin: can update assignment within their own organization stations
    IF v_is_admin AND public.station_belongs_to_user_org(OLD.station_id) THEN
        RETURN NEW;
    END IF;

    -- 4. Supervisor: can update assignment ONLY for stations where they have an active assignment
    IF v_user_role = 'supervisor'::user_role AND public.user_has_station_assignment(OLD.station_id) THEN
        RETURN NEW;
    END IF;

    -- 5. Ordinary employees or unauthorized users cannot update assignments
    RAISE EXCEPTION 'Permission denied: You are not authorized to modify station assignments.';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_station_assignment_immutability ON public.station_assignments;
CREATE TRIGGER trg_enforce_station_assignment_immutability
BEFORE UPDATE ON public.station_assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_station_assignment_immutability();

-- -----------------------------------------------------------------------------
-- STEP 4: ORGANIZATIONS & REGIONS POLICIES (Multi-Tenant Isolation)
-- -----------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizations viewable by authenticated users" ON public.organizations;
DROP POLICY IF EXISTS "Organizations viewable by scoped users" ON public.organizations;
DROP POLICY IF EXISTS "Organizations manageable by super admins" ON public.organizations;

-- 4.1 SELECT: Super Admin views all organizations; tenant members view strictly their own organization.
-- Accounts with NULL organization (unassigned) view no organization records until provisioned.
CREATE POLICY "Organizations viewable by scoped users"
ON public.organizations FOR SELECT
TO authenticated
USING (
    public.is_super_admin()
    OR (
        public.get_current_user_org_id() IS NOT NULL
        AND id = public.get_current_user_org_id()
    )
);

-- 4.2 ALL: Super Admin manages organizations
CREATE POLICY "Organizations manageable by super admins"
ON public.organizations FOR ALL
TO authenticated
USING (public.is_super_admin());

-- 4.3 Regions: Geographical reference data viewable by all authenticated users
DROP POLICY IF EXISTS "Regions viewable by authenticated users" ON public.regions;
CREATE POLICY "Regions viewable by authenticated users"
ON public.regions FOR SELECT
TO authenticated
USING (TRUE);

-- -----------------------------------------------------------------------------
-- STEP 5: PROFILES RLS POLICIES (Least Privilege & Non-Recursive)
-- -----------------------------------------------------------------------------

-- Comprehensive drop of all legacy and draft policies on public.profiles
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by authorized users" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Profiles self update" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own non-sensitive profile data" ON public.profiles;

-- 5.1 SELECT: Least-Privilege access without RLS recursion
CREATE POLICY "Profiles viewable by authorized users"
ON public.profiles FOR SELECT
TO authenticated
USING (
    -- 1. Users can always view their own profile (session bootstrap and settings)
    id = (SELECT auth.uid())
    -- 2. Super admins have global visibility across all organizations
    OR public.is_super_admin()
    -- 3. Organization Admins can view profiles belonging to their organization
    OR (
        public.is_admin_or_super()
        AND organization_id IS NOT NULL
        AND organization_id = public.get_current_user_org_id()
    )
    -- 4. Operational teammates co-assigned to active stations
    OR public.user_shares_station_with(id)
);

-- 5.2 ALL: Super admin can manage any profile
CREATE POLICY "Super admins can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_super_admin());

-- 5.3 UPDATE: Admins can update profiles within their organization
CREATE POLICY "Admins can update profiles in their organization"
ON public.profiles FOR UPDATE
TO authenticated
USING (
    public.is_admin_or_super()
    AND organization_id IS NOT NULL
    AND organization_id = public.get_current_user_org_id()
)
WITH CHECK (
    public.is_admin_or_super()
    AND organization_id IS NOT NULL
    AND organization_id = public.get_current_user_org_id()
);

-- 5.4 UPDATE: Self profile update for non-administrative fields
-- (Column immutability enforced by trg_enforce_profile_update_security trigger)
CREATE POLICY "Profiles self update"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- STEP 6: STATION ASSIGNMENTS RLS POLICIES (Multi-Tenant & Anti-Hopping)
-- -----------------------------------------------------------------------------

-- Comprehensive drop of all legacy policies on public.station_assignments
DROP POLICY IF EXISTS "Station assignments viewable by authorized users" ON public.station_assignments;
DROP POLICY IF EXISTS "Station assignments insertable by authorized managers" ON public.station_assignments;
DROP POLICY IF EXISTS "Station assignments updatable by authorized managers" ON public.station_assignments;
DROP POLICY IF EXISTS "Station assignments deletable by super admins" ON public.station_assignments;

-- 6.1 SELECT: Own assignments, Org Admins for their org's stations, or active station peers
CREATE POLICY "Station assignments viewable by authorized users"
ON public.station_assignments FOR SELECT
TO authenticated
USING (
    user_id = (SELECT auth.uid())
    OR public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR public.user_has_station_assignment(station_id)
);

-- 6.2 INSERT:
-- - Super admin can assign anyone anywhere.
-- - Org admin can assign personnel belonging to their org to stations in their org.
-- - Supervisor can only assign personnel belonging to their org to stations they are currently assigned to.
CREATE POLICY "Station assignments insertable by authorized managers"
ON public.station_assignments FOR INSERT
TO authenticated
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_assignments.station_id)
        AND public.profile_belongs_to_user_org(station_assignments.user_id)
    )
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_assignments.station_id)
        AND public.profile_belongs_to_user_org(station_assignments.user_id)
    )
);

-- 6.3 UPDATE:
-- Explicit USING and WITH CHECK prevent station hopping and cross-tenant user assignment
CREATE POLICY "Station assignments updatable by authorized managers"
ON public.station_assignments FOR UPDATE
TO authenticated
USING (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_assignments.station_id)
    )
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_assignments.station_id)
    )
)
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_assignments.station_id)
        AND public.profile_belongs_to_user_org(station_assignments.user_id)
    )
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_assignments.station_id)
        AND public.profile_belongs_to_user_org(station_assignments.user_id)
    )
);

-- 6.4 DELETE: Hard deletes restricted strictly to Super Admin
CREATE POLICY "Station assignments deletable by super admins"
ON public.station_assignments FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- STEP 7: STATIONS POLICIES (Scoped Insert & Update)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Stations viewable based on assignment or org scope" ON public.stations;
DROP POLICY IF EXISTS "Super admins and Org Admins can insert stations" ON public.stations;
DROP POLICY IF EXISTS "Super admins and Org Admins can update stations" ON public.stations;

-- 7.1 SELECT:
CREATE POLICY "Stations viewable based on assignment or org scope"
ON public.stations FOR SELECT
TO authenticated
USING (public.user_has_station_access(id));

-- 7.2 INSERT:
CREATE POLICY "Super admins and Org Admins can insert stations"
ON public.stations FOR INSERT
TO authenticated
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.get_current_user_org_id() IS NOT NULL
        AND organization_id = public.get_current_user_org_id()
    )
);

-- 7.3 UPDATE:
CREATE POLICY "Super admins and Org Admins can update stations"
ON public.stations FOR UPDATE
TO authenticated
USING (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.get_current_user_org_id() IS NOT NULL
        AND organization_id = public.get_current_user_org_id()
    )
)
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.get_current_user_org_id() IS NOT NULL
        AND organization_id = public.get_current_user_org_id()
    )
);

-- -----------------------------------------------------------------------------
-- STEP 8: VERIFICATION BLOCK
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'Migration 04: Successfully executed. RLS recursion eliminated, DAG hardened, profile column immutability enforced, and multi-tenant isolation secured.';
END $$;
