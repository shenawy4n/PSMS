-- ==============================================================================
-- PSMS MIGRATION 07: ATOMIC & SECURE EMPLOYEE PROVISIONING WITH STATION VALIDATION
-- ==============================================================================
-- STATUS: PREPARED & TESTED LOCALLY — NOT YET APPLIED TO PRODUCTION
-- Target Database: https://gygksvqqqtjqgcnwfjha.supabase.co (Ref: gygksvqqqtjqgcnwfjha)
-- Execution Note: Direct SQL tool integration is unavailable in this environment.
--                 Apply via Supabase Dashboard SQL Editor or Supabase CLI.
-- ==============================================================================
-- Objectives & Security Boundary Hardening:
--   1. Fix flawed security trigger logic in enforce_profile_insert_security():
--      - Eliminate dangerous reliance on (current_user = 'postgres') or (auth.uid() IS NULL).
--        In PostgreSQL SECURITY DEFINER functions, current_user is always the owner ('postgres').
--      - Restrict trusted execution strictly to (request.jwt.claim.role = 'service_role')
--        or direct DBA console execution (session_user = 'postgres' AND request.jwt.claim.role IS NULL).
--      - Strictly reject unauthenticated (anon) callers and unauthorized users.
--   2. Safe, Conflict-Checked Case-Insensitive Unique Indexes:
--      - Checks existing data for duplicate employee_number and email before indexing.
--      - Protects against data corruption and never truncates or alters existing rows.
--   3. Transactional, Least-Privilege Provisioning RPC:
--      - Function: public.provision_employee_profile_and_assignments(...)
--      - Restricts EXECUTE strictly to service_role (revoked from PUBLIC, anon, authenticated).
--      - Enforces strict administrator validation and organizational scope:
--        * p_assigned_by is mandatory and validated against public.profiles (must be active admin/super_admin).
--        * Admins cannot grant super_admin or assign employees outside their organization.
--        * Operational admins must have an assigned organization and can ONLY assign stations
--          strictly belonging to their organization. Stations with organization_id IS NULL
--          represent national/central grid assets and can ONLY be assigned by super_admin.
--        * Employee organization and station organization must be compatible.
--      - Atomic execution: Inserts profile and station assignments within a single transaction.
--        Any constraint violation rolls back the entire database operation cleanly.
--   4. Fully idempotent & forward-only. Protects existing data, stations, and users.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. SAFE CASE-INSENSITIVE UNIQUE INDEXING WITH DUPLICATE DETECTION
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    -- Check and create unique index on employee_number only if no duplicates exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'idx_profiles_employee_number_ci' AND n.nspname = 'public'
    ) THEN
        IF NOT EXISTS (
            SELECT LOWER(TRIM(employee_number))
            FROM public.profiles
            WHERE employee_number IS NOT NULL
            GROUP BY LOWER(TRIM(employee_number))
            HAVING COUNT(*) > 1
        ) THEN
            CREATE UNIQUE INDEX idx_profiles_employee_number_ci 
            ON public.profiles (LOWER(TRIM(employee_number)));
        ELSE
            RAISE WARNING 'Duplicate employee numbers detected in existing profiles; unique index creation deferred to protect existing data.';
        END IF;
    END IF;

    -- Check and create unique index on email only if no duplicates exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'idx_profiles_email_ci' AND n.nspname = 'public'
    ) THEN
        IF NOT EXISTS (
            SELECT LOWER(TRIM(email))
            FROM public.profiles
            WHERE email IS NOT NULL
            GROUP BY LOWER(TRIM(email))
            HAVING COUNT(*) > 1
        ) THEN
            CREATE UNIQUE INDEX idx_profiles_email_ci 
            ON public.profiles (LOWER(TRIM(email)));
        ELSE
            RAISE WARNING 'Duplicate emails detected in existing profiles; unique index creation deferred to protect existing data.';
        END IF;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. HARDENED PROFILE INSERT SECURITY TRIGGER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_insert_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role user_role;
    v_is_super BOOLEAN;
    v_is_admin BOOLEAN;
    v_current_uid UUID;
    v_jwt_role TEXT;
    v_is_trusted_backend BOOLEAN;
BEGIN
    -- Extract caller context from JWT claim and session
    v_current_uid := auth.uid();
    v_jwt_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
    
    -- Trusted context definition:
    -- 1. PostgREST request using service_role key (Edge Function)
    -- 2. Direct DBA interactive session in psql / SQL Editor (session_user = 'postgres' without JWT)
    -- NOTE: current_user inside a SECURITY DEFINER function is always the function owner ('postgres'),
    -- so checking current_user = 'postgres' is dangerously insecure. We check session_user and v_jwt_role.
    v_is_trusted_backend := (
        v_jwt_role = 'service_role' OR 
        (session_user = 'postgres' AND v_jwt_role IS NULL)
    );

    -- Normalize incoming text fields
    NEW.employee_number := UPPER(TRIM(NEW.employee_number));
    NEW.email := LOWER(TRIM(NEW.email));

    -- If executed via trusted backend service_role, validate mandatory fields and allow
    IF v_is_trusted_backend THEN
        IF NEW.id IS NULL THEN
            RAISE EXCEPTION 'Validation error: Profile ID cannot be null and must correspond to an authenticated Supabase user.';
        END IF;
        RETURN NEW;
    END IF;

    -- Reject unauthenticated (anon) callers immediately
    IF v_current_uid IS NULL OR v_jwt_role = 'anon' THEN
        RAISE EXCEPTION 'Authentication required: Anonymous profile creation is strictly forbidden.';
    END IF;

    -- Check caller permissions in public.profiles
    v_is_super := public.is_super_admin();
    v_is_admin := public.is_admin_or_super();
    v_caller_role := public.get_current_user_role();

    -- Only super_admin or admin can insert profiles
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Permission denied: Only central administrators are permitted to create employee profiles.';
    END IF;

    -- Prevent privilege escalation: Admin cannot insert a profile with super_admin role
    IF NOT v_is_super AND NEW.role = 'super_admin'::user_role THEN
        RAISE EXCEPTION 'Privilege escalation violation: Only Super Admins can create Super Admin accounts.';
    END IF;

    -- Validate ID is provided (must reference auth.users)
    IF NEW.id IS NULL THEN
        RAISE EXCEPTION 'Validation error: Profile ID cannot be null and must correspond to an authenticated Supabase user.';
    END IF;

    RETURN NEW;
END;
$$;

-- Reattach trigger
DROP TRIGGER IF EXISTS trg_enforce_profile_insert_security ON public.profiles;

CREATE TRIGGER trg_enforce_profile_insert_security
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_insert_security();

REVOKE ALL ON FUNCTION public.enforce_profile_insert_security() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_profile_insert_security() TO authenticated, service_role;

COMMENT ON FUNCTION public.enforce_profile_insert_security() IS 
'Hardened trigger function enforcing RBAC, service_role verification, and privilege escalation prevention.';

-- -----------------------------------------------------------------------------
-- 3. ATOMIC PROVISIONING RPC (PROFILE + STATION ASSIGNMENTS + SCOPE ENFORCEMENT)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_employee_profile_and_assignments(
    p_user_id UUID,
    p_employee_number TEXT,
    p_full_name TEXT,
    p_email TEXT,
    p_phone TEXT DEFAULT NULL,
    p_role user_role DEFAULT 'employee',
    p_department TEXT DEFAULT NULL,
    p_job_title TEXT DEFAULT NULL,
    p_organization_id UUID DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_station_ids UUID[] DEFAULT ARRAY[]::UUID[],
    p_assigned_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_role user_role;
    v_admin_org_id UUID;
    v_jwt_role TEXT;
    v_is_trusted_backend BOOLEAN;
    v_clean_emp_no TEXT;
    v_clean_email TEXT;
    v_inserted_profile public.profiles%ROWTYPE;
    v_unique_station_ids UUID[];
    v_valid_station_count INT;
    v_target_station_id UUID;
    v_effective_org_id UUID := p_organization_id;
    v_result JSONB;
BEGIN
    -- 1. Identify caller context
    v_jwt_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
    v_is_trusted_backend := (
        v_jwt_role = 'service_role' OR 
        (session_user = 'postgres' AND v_jwt_role IS NULL)
    );

    -- This function MUST only be callable by trusted backend execution
    IF NOT v_is_trusted_backend THEN
        RAISE EXCEPTION 'Access denied: provision_employee_profile_and_assignments is restricted to trusted service_role execution.';
    END IF;

    -- 2. Input validation & normalization
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Validation error: User ID is required and must match Supabase Auth.';
    END IF;

    v_clean_emp_no := UPPER(TRIM(p_employee_number));
    IF LENGTH(v_clean_emp_no) < 3 THEN
        RAISE EXCEPTION 'Validation error: Employee number must be at least 3 characters.';
    END IF;

    v_clean_email := LOWER(TRIM(p_email));
    -- Strict email format regex check
    IF v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'Validation error: Invalid email format.';
    END IF;

    IF p_full_name IS NULL OR LENGTH(TRIM(p_full_name)) < 3 THEN
        RAISE EXCEPTION 'Validation error: Full name must be at least 3 characters.';
    END IF;

    -- 3. Check requesting administrator authorization and boundaries
    -- Administrator ID is mandatory for accountability and organizational boundary checks
    IF p_assigned_by IS NULL THEN
        RAISE EXCEPTION 'Validation error: Requesting administrator ID (assigned_by) is required.';
    END IF;

    SELECT role, organization_id INTO v_admin_role, v_admin_org_id
    FROM public.profiles
    WHERE id = p_assigned_by AND is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Authorization error: Requesting administrator profile not found or inactive.';
    END IF;

    IF v_admin_role NOT IN ('super_admin'::user_role, 'admin'::user_role) THEN
        RAISE EXCEPTION 'Permission denied: Requesting user is not authorized to create employees.';
    END IF;

    -- Privilege escalation check
    IF v_admin_role = 'admin'::user_role AND p_role = 'super_admin'::user_role THEN
        RAISE EXCEPTION 'Privilege escalation violation: Operational admins cannot create Super Admin accounts.';
    END IF;

    -- Organization scope check for operational admins
    IF v_admin_role = 'admin'::user_role THEN
        -- An operational admin must have an assigned organization
        IF v_admin_org_id IS NULL THEN
            RAISE EXCEPTION 'Authorization error: Operational admin must be assigned to an organization to provision personnel.';
        END IF;

        IF v_effective_org_id IS NOT NULL AND v_effective_org_id != v_admin_org_id THEN
            RAISE EXCEPTION 'Organization scope violation: Operational admins cannot create profiles outside their organization.';
        END IF;

        -- Automatically bind employee to administrator's organization
        v_effective_org_id := v_admin_org_id;
    END IF;

    -- 4. Check uniqueness in public.profiles
    IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(TRIM(employee_number)) = LOWER(v_clean_emp_no)) THEN
        RAISE EXCEPTION 'Conflict: Employee number % already exists in the system.', v_clean_emp_no;
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(TRIM(email)) = v_clean_email) THEN
        RAISE EXCEPTION 'Conflict: Email address % is already registered.', v_clean_email;
    END IF;

    -- 5. Deduplicate and validate station assignments
    IF p_station_ids IS NOT NULL AND cardinality(p_station_ids) > 0 THEN
        SELECT array_agg(DISTINCT sid) INTO v_unique_station_ids
        FROM unnest(p_station_ids) AS sid
        WHERE sid IS NOT NULL;
    ELSE
        v_unique_station_ids := ARRAY[]::UUID[];
    END IF;

    IF cardinality(v_unique_station_ids) > 0 THEN
        -- Verify existence of all requested stations
        SELECT COUNT(*) INTO v_valid_station_count
        FROM public.stations
        WHERE id = ANY(v_unique_station_ids);

        IF v_valid_station_count != cardinality(v_unique_station_ids) THEN
            RAISE EXCEPTION 'Validation error: One or more assigned station IDs do not exist in the database.';
        END IF;

        -- Verify administrator station scope:
        -- Operational admins can ONLY assign stations strictly belonging to their organization.
        -- Stations where organization_id IS NULL (national/grid assets) require super_admin privileges.
        IF v_admin_role = 'admin'::user_role THEN
            IF EXISTS (
                SELECT 1 FROM public.stations
                WHERE id = ANY(v_unique_station_ids)
                  AND (organization_id IS NULL OR organization_id != v_admin_org_id)
            ) THEN
                RAISE EXCEPTION 'Station scope violation: Operational admins can only assign stations belonging strictly to their organization.';
            END IF;
        END IF;

        -- Verify compatibility between employee organization and station organization
        IF v_effective_org_id IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM public.stations
                WHERE id = ANY(v_unique_station_ids)
                  AND organization_id IS NOT NULL
                  AND organization_id != v_effective_org_id
            ) THEN
                RAISE EXCEPTION 'Incompatible assignment: Selected stations belong to a different organization than the employee.';
            END IF;
        END IF;
    END IF;

    -- 6. Insert profile
    INSERT INTO public.profiles (
        id,
        employee_number,
        full_name,
        email,
        phone,
        role,
        department,
        job_title,
        organization_id,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        v_clean_emp_no,
        TRIM(p_full_name),
        v_clean_email,
        NULLIF(TRIM(p_phone), ''),
        p_role,
        NULLIF(TRIM(p_department), ''),
        NULLIF(TRIM(p_job_title), ''),
        v_effective_org_id,
        COALESCE(p_is_active, TRUE),
        NOW(),
        NOW()
    ) RETURNING * INTO v_inserted_profile;

    -- 7. Insert station assignments atomically
    IF cardinality(v_unique_station_ids) > 0 THEN
        FOREACH v_target_station_id IN ARRAY v_unique_station_ids
        LOOP
            INSERT INTO public.station_assignments (
                station_id,
                user_id,
                assignment_role,
                assigned_by,
                is_active,
                assigned_at
            ) VALUES (
                v_target_station_id,
                p_user_id,
                COALESCE(NULLIF(TRIM(p_job_title), ''), 'مشغل محطة'),
                p_assigned_by,
                TRUE,
                NOW()
            ) ON CONFLICT (station_id, user_id) 
            DO UPDATE SET 
                is_active = TRUE,
                assignment_role = EXCLUDED.assignment_role,
                assigned_by = EXCLUDED.assigned_by,
                assigned_at = NOW();
        END LOOP;
    END IF;

    -- 8. Build JSON response
    v_result := jsonb_build_object(
        'id', v_inserted_profile.id,
        'employee_number', v_inserted_profile.employee_number,
        'full_name', v_inserted_profile.full_name,
        'email', v_inserted_profile.email,
        'phone', v_inserted_profile.phone,
        'role', v_inserted_profile.role,
        'department', v_inserted_profile.department,
        'job_title', v_inserted_profile.job_title,
        'organization_id', v_inserted_profile.organization_id,
        'is_active', v_inserted_profile.is_active,
        'created_at', v_inserted_profile.created_at,
        'assigned_station_ids', COALESCE(v_unique_station_ids, ARRAY[]::UUID[])
    );

    RETURN v_result;
END;
$$;

-- Restrict RPC execution strictly to service_role (revoked from PUBLIC, anon, authenticated)
REVOKE ALL ON FUNCTION public.provision_employee_profile_and_assignments(UUID, TEXT, TEXT, TEXT, TEXT, user_role, TEXT, TEXT, UUID, BOOLEAN, UUID[], UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_employee_profile_and_assignments(UUID, TEXT, TEXT, TEXT, TEXT, user_role, TEXT, TEXT, UUID, BOOLEAN, UUID[], UUID) TO service_role;

COMMENT ON FUNCTION public.provision_employee_profile_and_assignments IS 
'Transactional, server-only RPC that validates station existence, enforces organization boundaries, and atomically creates profile and station assignments.';
