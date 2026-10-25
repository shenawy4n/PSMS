-- ============================================================================
-- نظام إدارة محطات الكهرباء (Power Station Management System - PSMS)
-- Database Migration: 02_security_and_assignments.sql
-- Description: Hardening station assignments RLS, organizational scope enforcement,
--              partial unique indexes, and automated database-side audit triggers.
-- ============================================================================

-- 1. ENFORCE PARTIAL UNIQUE INDEX ON ACTIVE STATION ASSIGNMENTS
-- Prevents a user from having multiple active assignments to the exact same station
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_station_user 
ON station_assignments(station_id, user_id) 
WHERE is_active = TRUE;

-- 2. STATION ASSIGNMENTS RLS POLICIES

-- Drop any previous placeholder policies on station_assignments if any exist
DROP POLICY IF EXISTS "Station assignments viewable by authorized users" ON station_assignments;
DROP POLICY IF EXISTS "Station assignments insertable by authorized managers" ON station_assignments;
DROP POLICY IF EXISTS "Station assignments updatable by authorized managers" ON station_assignments;
DROP POLICY IF EXISTS "Station assignments deletable by super admins" ON station_assignments;

-- 2.1 SELECT POLICY:
-- Users can see their own assignments;
-- Super admins & Org admins can see assignments within their scope;
-- Supervisors can see assignments for stations they manage.
CREATE POLICY "Station assignments viewable by authorized users"
ON station_assignments FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR is_admin_or_super()
    OR EXISTS (
        SELECT 1 FROM station_assignments sa
        WHERE sa.user_id = auth.uid()
          AND sa.station_id = station_assignments.station_id
          AND sa.is_active = TRUE
    )
);

-- 2.2 INSERT POLICY:
-- Super Admin can assign anyone anywhere.
-- Admin can only assign personnel within their organization to stations in their organization.
-- Supervisors can only assign personnel to stations they are currently assigned to.
CREATE POLICY "Station assignments insertable by authorized managers"
ON station_assignments FOR INSERT
TO authenticated
WITH CHECK (
    is_super_admin()
    OR (
        -- Admin: station must belong to admin's organization AND target user must belong to same organization
        is_admin_or_super()
        AND EXISTS (
            SELECT 1 FROM stations s
            JOIN profiles admin_p ON admin_p.id = auth.uid()
            JOIN profiles target_p ON target_p.id = station_assignments.user_id
            WHERE s.id = station_assignments.station_id
              AND s.organization_id = admin_p.organization_id
              AND (target_p.organization_id IS NULL OR target_p.organization_id = admin_p.organization_id)
        )
    )
    OR (
        -- Supervisor: must be an active supervisor in this station
        get_current_user_role() = 'supervisor'
        AND EXISTS (
            SELECT 1 FROM station_assignments sa
            WHERE sa.user_id = auth.uid()
              AND sa.station_id = station_assignments.station_id
              AND sa.is_active = TRUE
        )
    )
);

-- 2.3 UPDATE POLICY (for deactivation or role title adjustment):
CREATE POLICY "Station assignments updatable by authorized managers"
ON station_assignments FOR UPDATE
TO authenticated
USING (
    is_super_admin()
    OR (
        is_admin_or_super()
        AND EXISTS (
            SELECT 1 FROM stations s
            JOIN profiles admin_p ON admin_p.id = auth.uid()
            WHERE s.id = station_assignments.station_id
              AND s.organization_id = admin_p.organization_id
        )
    )
    OR (
        get_current_user_role() = 'supervisor'
        AND EXISTS (
            SELECT 1 FROM station_assignments sa
            WHERE sa.user_id = auth.uid()
              AND sa.station_id = station_assignments.station_id
              AND sa.is_active = TRUE
        )
    )
);

-- 2.4 DELETE POLICY:
-- Hard deletes are strictly forbidden; only super_admin can delete if needed for purging
CREATE POLICY "Station assignments deletable by super admins"
ON station_assignments FOR DELETE
TO authenticated
USING (is_super_admin());

-- 3. AUTOMATED DATABASE-SIDE AUDIT LOGGING FUNCTION
-- Generates audit trails for stations, assignments, and profiles directly in PostgreSQL
CREATE OR REPLACE FUNCTION audit_record_change()
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

-- 4. ATTACH AUDIT TRIGGERS TO STATIONS AND ASSIGNMENTS
DROP TRIGGER IF EXISTS trg_audit_stations ON stations;
CREATE TRIGGER trg_audit_stations
AFTER INSERT OR UPDATE OR DELETE ON stations
FOR EACH ROW EXECUTE FUNCTION audit_record_change();

DROP TRIGGER IF EXISTS trg_audit_station_assignments ON station_assignments;
CREATE TRIGGER trg_audit_station_assignments
AFTER INSERT OR UPDATE OR DELETE ON station_assignments
FOR EACH ROW EXECUTE FUNCTION audit_record_change();

DROP TRIGGER IF EXISTS trg_audit_profiles ON profiles;
CREATE TRIGGER trg_audit_profiles
AFTER INSERT OR UPDATE OR DELETE ON profiles
FOR EACH ROW EXECUTE FUNCTION audit_record_change();
