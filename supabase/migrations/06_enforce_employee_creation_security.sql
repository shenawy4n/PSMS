-- ==============================================================================
-- PSMS MIGRATION 06: EMPLOYEE PROFILE INSERT SECURITY & PRIVILEGE HARDENING
-- ==============================================================================
-- Objective:
--   1. Harden public.profiles against unauthorized profile creation and privilege
--      escalation at the PostgreSQL database level.
--   2. Enforce that only authorized administrators (Super Admin / Admin) or trusted
--      server-side service_role functions can insert profiles.
--   3. Strictly forbid 'admin' users from inserting a profile with role 'super_admin'.
--   4. Standardize and protect unique employee_number and email columns with
--      case-insensitive unique indexing.
--   5. Maintain 100% backward-compatibility with Migration 01-05 and the centralized model.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. CASE-INSENSITIVE UNIQUE INDEXES FOR EMPLOYEES
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_employee_number_ci 
ON public.profiles (LOWER(TRIM(employee_number)));

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_ci 
ON public.profiles (LOWER(TRIM(email)));

-- -----------------------------------------------------------------------------
-- 2. PROFILE INSERT SECURITY ENFORCEMENT FUNCTION
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
BEGIN
    -- 1. Extract calling user UID
    v_current_uid := auth.uid();

    -- 2. Normalize fields
    NEW.employee_number := UPPER(TRIM(NEW.employee_number));
    NEW.email := LOWER(TRIM(NEW.email));

    -- 3. If executed via trusted service_role or bootstrap context (auth.uid() IS NULL)
    IF v_current_uid IS NULL THEN
        -- Allow privileged backend functions / Edge Functions with service_role to proceed
        RETURN NEW;
    END IF;

    -- 4. Check caller role in public.profiles
    v_is_super := public.is_super_admin();
    v_is_admin := public.is_admin_or_super();
    v_caller_role := public.get_current_user_role();

    -- 5. Only super_admin or admin can insert profiles
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Permission denied: Only central administrators are permitted to create employee profiles.';
    END IF;

    -- 6. Prevent privilege escalation: Admin cannot insert a profile with super_admin role
    IF NOT v_is_super AND NEW.role = 'super_admin'::user_role THEN
        RAISE EXCEPTION 'Privilege escalation violation: Only Super Admins can create Super Admin accounts.';
    END IF;

    -- 7. Validate that ID is provided (must reference auth.users)
    IF NEW.id IS NULL THEN
        RAISE EXCEPTION 'Validation error: Profile ID cannot be null and must correspond to an authenticated Supabase user.';
    END IF;

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. ATTACH TRIGGER TO public.profiles
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_enforce_profile_insert_security ON public.profiles;

CREATE TRIGGER trg_enforce_profile_insert_security
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_insert_security();

-- -----------------------------------------------------------------------------
-- 4. PERMISSIONS & VERIFICATION
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.enforce_profile_insert_security() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_profile_insert_security() TO authenticated, service_role;

COMMENT ON FUNCTION public.enforce_profile_insert_security() IS 
'Enforces RBAC authorization, case normalization, and privilege escalation prevention on profile creation.';
