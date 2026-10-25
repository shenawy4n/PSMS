-- ==============================================================================
-- PSMS MIGRATION 03: SUPER ADMIN BOOTSTRAP & PRIVILEGED PROVISIONING
-- ==============================================================================
-- Target Supabase Auth UID:
--   45a6a3f5-a01b-4193-a4b9-d2db580380a3
--
-- Operational & Safety Notes:
--   - Intended for one-time manual execution in Supabase Dashboard -> SQL Editor.
--   - Pre-heals the trigger function public.audit_record_change() to prevent
--     non-existent column ('station_name') or unassigned record errors.
--   - Atomic transaction: entire operation commits or rolls back as a single unit.
--   - Validates existence of auth.users account and presence of valid email.
--   - Detects and prevents cross-user email and employee_number collisions.
--   - Preserves existing profile details (name, employee#, phone, org, department).
--   - Automatically coordinates with trg_audit_profiles to enrich audit entries.
--   - Attributed accurately as DBA action (actor_id = NULL, actor_email = 'system:dba:sql_editor').
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- STEP 0: Ensure public.audit_record_change() writes only existing schema columns
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_record_change()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_email VARCHAR(255);
    v_entity_id VARCHAR(100);
    v_station_id UUID := NULL;
    v_old_data JSONB := NULL;
    v_new_data JSONB := NULL;
BEGIN
    -- 1. Identify actor from Supabase auth session if available
    v_actor_id := auth.uid();
    IF v_actor_id IS NOT NULL THEN
        SELECT email INTO v_actor_email 
        FROM public.profiles 
        WHERE id = v_actor_id;
    END IF;

    -- 2. Safely extract entity_id, station_id, and json payloads according to TG_OP
    -- Prevents runtime errors like 'record "new" is not assigned yet' on DELETE
    -- or 'record "old" is not assigned yet' on INSERT.
    IF TG_OP = 'INSERT' THEN
        v_entity_id := NEW.id::TEXT;
        v_old_data := NULL;
        v_new_data := to_jsonb(NEW);

        IF TG_TABLE_NAME = 'stations' THEN
            v_station_id := NEW.id;
        ELSIF TG_TABLE_NAME = 'station_assignments' THEN
            v_station_id := NEW.station_id;
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        v_entity_id := NEW.id::TEXT;
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);

        IF TG_TABLE_NAME = 'stations' THEN
            v_station_id := NEW.id;
        ELSIF TG_TABLE_NAME = 'station_assignments' THEN
            v_station_id := NEW.station_id;
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        v_entity_id := OLD.id::TEXT;
        v_old_data := to_jsonb(OLD);
        v_new_data := NULL;

        IF TG_TABLE_NAME = 'stations' THEN
            v_station_id := OLD.id;
        ELSIF TG_TABLE_NAME = 'station_assignments' THEN
            v_station_id := OLD.station_id;
        END IF;
    END IF;

    -- 3. Insert into public.audit_logs using ONLY confirmed existing schema columns:
    --    (actor_id, actor_email, action, entity_type, entity_id, station_id,
    --     old_data, new_data, created_at)
    INSERT INTO public.audit_logs (
        actor_id,
        actor_email,
        action,
        entity_type,
        entity_id,
        station_id,
        old_data,
        new_data,
        created_at
    ) VALUES (
        v_actor_id,
        v_actor_email,
        TG_TABLE_NAME || '_' || TG_OP,
        TG_TABLE_NAME,
        v_entity_id,
        v_station_id,
        v_old_data,
        v_new_data,
        NOW()
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- STEP 1: Super Admin Provisioning & Verification Block
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    -- Target UID specified for the Super Admin
    target_uid CONSTANT UUID := '45a6a3f5-a01b-4193-a4b9-d2db580380a3'::UUID;

    -- Auth record holding email and metadata
    v_auth_record RECORD;
    v_auth_email VARCHAR(255);
    v_auth_meta JSONB;

    -- Existing profile inspection
    v_profile RECORD;
    v_candidate_emp_num VARCHAR(50) := 'EMP-SUPER-01';
    v_full_name VARCHAR(255);

    -- Audit & trigger coordination
    v_has_audit_trigger BOOLEAN := FALSE;
    v_old_data JSONB := NULL;
    v_new_data JSONB := NULL;
    v_action_performed VARCHAR(50) := NULL;
BEGIN
    -- 1. AUTH USER EXISTENCE & VALIDITY CHECK
    SELECT email, raw_user_meta_data
    INTO v_auth_record
    FROM auth.users
    WHERE id = target_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Auth verification failed: No account exists in auth.users with UID %. Please create this user first in Supabase Dashboard (Authentication -> Users -> Add User).', target_uid;
    END IF;

    v_auth_email := NULLIF(TRIM(v_auth_record.email), '');
    v_auth_meta  := v_auth_record.raw_user_meta_data;

    IF v_auth_email IS NULL THEN
        RAISE EXCEPTION 'Auth verification failed: User with UID % exists in auth.users, but has a NULL or blank email. A valid email is required before provisioning.', target_uid;
    END IF;

    -- 2. EMAIL UNIQUENESS CONFLICT CHECK
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE email = v_auth_email AND id <> target_uid
    ) THEN
        RAISE EXCEPTION 'Email conflict: Email "%" is already assigned to another profile with a different UID. Aborting to prevent constraint violation or unintended modification.', v_auth_email;
    END IF;

    -- 3. PROFILE RETRIEVAL & IDEMPOTENT MUTATION
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = target_uid;

    IF FOUND THEN
        -- Check if already configured as active super_admin with matching email
        IF v_profile.role = 'super_admin'::user_role 
           AND v_profile.is_active = TRUE 
           AND v_profile.email = v_auth_email THEN
            RAISE NOTICE 'IDEMPOTENT NO-OP: Profile for UID % is already an active super_admin with email %. No changes required.', target_uid, v_auth_email;
            RETURN;
        END IF;

        -- Capture previous state for audit log
        v_old_data := to_jsonb(v_profile);

        -- Update ONLY role, active status, email, and updated_at.
        -- Strictly preserve full_name, employee_number, organization_id, department, job_title, and phone.
        UPDATE public.profiles
        SET 
            role = 'super_admin'::user_role,
            is_active = TRUE,
            email = v_auth_email,
            updated_at = NOW()
        WHERE id = target_uid;

        v_action_performed := 'PROMOTED_EXISTING_PROFILE';
        v_new_data := jsonb_build_object(
            'role', 'super_admin',
            'is_active', TRUE,
            'email', v_auth_email,
            'operation', v_action_performed,
            'executed_by', 'system:dba:sql_editor'
        );

        RAISE NOTICE 'SUCCESS: Existing profile for UID % updated to super_admin (is_active = TRUE).', target_uid;
        RAISE NOTICE 'Preserved existing personal data: Name: "%", Employee#: "%"', 
            v_profile.full_name, v_profile.employee_number;
    ELSE
        -- Profile does not exist yet. Check proposed employee_number for conflicts:
        IF EXISTS (SELECT 1 FROM public.profiles WHERE employee_number = v_candidate_emp_num AND id <> target_uid) THEN
            v_candidate_emp_num := 'EMP-SUPER-' || SUBSTRING(REPLACE(target_uid::TEXT, '-', ''), 1, 8);
            
            WHILE EXISTS (SELECT 1 FROM public.profiles WHERE employee_number = v_candidate_emp_num AND id <> target_uid) LOOP
                v_candidate_emp_num := 'EMP-SUPER-' || SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 8);
            END LOOP;
            
            RAISE NOTICE 'Notice: EMP-SUPER-01 was already assigned; using unique candidate %', v_candidate_emp_num;
        END IF;

        -- Extract full name from metadata if available, otherwise use formal Arabic institutional title
        v_full_name := COALESCE(
            NULLIF(TRIM(v_auth_meta->>'full_name'), ''),
            NULLIF(TRIM(v_auth_meta->>'name'), ''),
            NULLIF(TRIM(v_auth_meta->>'display_name'), ''),
            'مدير عام المنظومة الكهربائية'
        );

        BEGIN
            INSERT INTO public.profiles (
                id,
                employee_number,
                full_name,
                email,
                role,
                department,
                job_title,
                is_active,
                created_at,
                updated_at
            ) VALUES (
                target_uid,
                v_candidate_emp_num,
                v_full_name,
                v_auth_email,
                'super_admin'::user_role,
                'الإدارة العامة للتحكم والتشغيل',
                'مدير عام المنظومة الكهربائية',
                TRUE,
                NOW(),
                NOW()
            );
        EXCEPTION WHEN unique_violation THEN
            RAISE EXCEPTION 'Profile insertion aborted due to unique constraint collision: %', SQLERRM;
        END;

        v_action_performed := 'CREATED_SUPER_ADMIN_PROFILE';
        v_new_data := jsonb_build_object(
            'role', 'super_admin',
            'is_active', TRUE,
            'email', v_auth_email,
            'employee_number', v_candidate_emp_num,
            'full_name', v_full_name,
            'operation', v_action_performed,
            'executed_by', 'system:dba:sql_editor'
        );

        RAISE NOTICE 'SUCCESS: Created new Super Admin profile for UID % (email: %, employee#: %).', 
            target_uid, v_auth_email, v_candidate_emp_num;
    END IF;

    -- 4. AUDIT LOGGING & TRIGGER COORDINATION
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_audit_profiles'
          AND tgrelid = 'public.profiles'::regclass
          AND tgenabled <> 'D'
    ) INTO v_has_audit_trigger;

    IF v_has_audit_trigger THEN
        -- The database trigger already recorded an entry for this change into audit_logs.
        -- Enrich that newly created row with the DBA administrative marker to avoid duplicates.
        UPDATE public.audit_logs
        SET 
            actor_id = NULL,
            actor_email = 'system:dba:sql_editor',
            action = 'USER_ROLE_PROMOTED',
            new_data = COALESCE(new_data, '{}'::JSONB) || v_new_data
        WHERE id = (
            SELECT id FROM public.audit_logs 
            WHERE entity_type = 'profiles' AND entity_id = target_uid::TEXT 
            ORDER BY created_at DESC 
            LIMIT 1
        );
        RAISE NOTICE 'SUCCESS: Enriched trigger-generated audit record with administrative DBA metadata.';
    ELSE
        -- No trigger active; insert direct audit record using only confirmed columns from 01_initial_schema
        INSERT INTO public.audit_logs (
            actor_id,
            actor_email,
            action,
            entity_type,
            entity_id,
            station_id,
            old_data,
            new_data,
            ip_address,
            user_agent,
            created_at
        ) VALUES (
            NULL,                                            -- actor_id is NULL for DBA/SQL Editor scripts
            'system:dba:sql_editor',                         -- Honest administrative marker
            'USER_ROLE_PROMOTED',                            -- Action code
            'profiles',                                      -- Entity type
            target_uid::TEXT,                                -- Entity ID
            NULL,                                            -- Not station-scoped
            v_old_data,                                      -- Captured old profile JSON (or NULL)
            v_new_data,                                      -- Structured JSON details
            NULL,                                            -- No web IP in direct DB execution
            'Supabase SQL Editor / Direct DB Migration Script',
            NOW()
        );
        RAISE NOTICE 'SUCCESS: Inserted direct administrative record into public.audit_logs.';
    END IF;

    RAISE NOTICE '======================================================================';
    RAISE NOTICE 'PROVISIONING COMPLETE: Super Admin account ready for verification.';
    RAISE NOTICE '======================================================================';
END $$;

-- -----------------------------------------------------------------------------
-- STEP 2: VERIFICATION QUERIES
-- -----------------------------------------------------------------------------
-- 2.1 Inspect profile status:
SELECT 
    p.id AS profile_id,
    p.employee_number,
    p.full_name,
    p.email,
    p.role,
    p.is_active,
    p.job_title,
    p.department,
    p.created_at,
    p.updated_at,
    CASE 
        WHEN p.role = 'super_admin' AND p.is_active = TRUE THEN 'VERIFIED_ACTIVE_SUPER_ADMIN'
        ELSE 'INVALID_CONFIGURATION'
    END AS verification_status
FROM public.profiles p
WHERE p.id = '45a6a3f5-a01b-4193-a4b9-d2db580380a3';

-- 2.2 Inspect audit trail record:
SELECT 
    id AS audit_log_id,
    actor_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    new_data,
    created_at
FROM public.audit_logs
WHERE entity_type = 'profiles' 
  AND entity_id = '45a6a3f5-a01b-4193-a4b9-d2db580380a3'
ORDER BY created_at DESC
LIMIT 1;
