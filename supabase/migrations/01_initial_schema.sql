-- ============================================================================
-- نظام إدارة محطات الكهرباء (Power Station Management System - PSMS)
-- Database Migration: 01_initial_schema.sql
-- Description: Complete production schema with RLS, enums, tables, and audit logs.
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CUSTOM TYPES / ENUMS
CREATE TYPE user_role AS ENUM (
    'super_admin',
    'admin',
    'supervisor',
    'employee'
);

CREATE TYPE station_type AS ENUM (
    'generation',      -- محطة توليد
    'transmission',    -- محطة نقل / تحويل رئيسية
    'distribution',    -- محطة توزيع
    'substation',      -- محطة فرعية
    'solar_hybrid'     -- محطة طاقة متجددة هجينة
);

CREATE TYPE station_status AS ENUM (
    'operational',          -- تشغيلية
    'under_maintenance',    -- تحت الصيانة
    'out_of_service',       -- خارج الخدمة
    'temporarily_stopped',  -- متوقفة مؤقتاً
    'under_review'          -- قيد المراجعة الفنية
);

CREATE TYPE asset_status AS ENUM (
    'healthy',
    'warning',
    'critical',
    'in_maintenance',
    'decommissioned'
);

CREATE TYPE fault_severity AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);

CREATE TYPE fault_status AS ENUM (
    'open',
    'under_investigation',
    'in_progress',
    'resolved',
    'closed'
);

CREATE TYPE maintenance_type AS ENUM (
    'preventive',   -- صيانة وقائية دورية
    'corrective',   -- صيانة تصحيحية
    'emergency',    -- صيانة طارئة
    'overhaul'      -- عمرة شاملة
);

CREATE TYPE maintenance_status AS ENUM (
    'scheduled',
    'in_progress',
    'pending_parts',
    'completed',
    'cancelled'
);

CREATE TYPE task_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);

CREATE TYPE task_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
);

-- 3. CORE TABLES

-- 3.1 Organizations (Operating sectors / Regional electricity companies)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2 Regions and Governorates
CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    governorate VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.3 User Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_number VARCHAR(50) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    role user_role NOT NULL DEFAULT 'employee',
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    department VARCHAR(100),
    job_title VARCHAR(100),
    supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.4 Power Stations
CREATE TABLE stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type station_type NOT NULL DEFAULT 'distribution',
    organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
    region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
    governorate VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    voltage_level_kv NUMERIC(8, 2) NOT NULL DEFAULT 11.0, -- الجهد التشغيلي بالكيلوفولت (مثل 11kV, 33kV, 132kV, 400kV)
    installed_capacity_mw NUMERIC(10, 2) NOT NULL DEFAULT 10.0, -- القدرة المركبة بالميجاواط
    status station_status NOT NULL DEFAULT 'operational',
    commissioning_date DATE,
    description TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.5 Station Assignments (Associates Supervisors and Employees to specific stations)
CREATE TABLE station_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    assignment_role VARCHAR(100) NOT NULL DEFAULT 'مشغل محطة', -- e.g. مدير محطة, مهندس تشغيل, فني صيانة
    assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (station_id, user_id)
);

-- 3.6 Asset Types (Transformers, Switchgears, Busbars, Circuit Breakers, etc.)
CREATE TABLE asset_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- 'محولات', 'قواطع', 'مفاتيح عزل', 'لوحات تحكم'
    maintenance_interval_days INTEGER NOT NULL DEFAULT 90
);

-- 3.7 Station Assets (Physical Equipment installed in stations)
CREATE TABLE station_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    asset_type_id UUID NOT NULL REFERENCES asset_types(id) ON DELETE RESTRICT,
    serial_number VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    manufacturer VARCHAR(150),
    model_number VARCHAR(100),
    rated_capacity VARCHAR(100), -- e.g. 40 MVA, 1250 A
    voltage_rating VARCHAR(50),  -- e.g. 132/33 kV
    installation_date DATE,
    status asset_status NOT NULL DEFAULT 'healthy',
    last_inspected_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (station_id, serial_number)
);

-- 3.8 Measurement Types
CREATE TABLE measurement_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL, -- e.g. الجهد, الحمل الفعال, التردد, حرارة الزيت
    unit VARCHAR(30) NOT NULL,  -- e.g. kV, MW, Hz, °C, bar
    min_warning_threshold NUMERIC(10, 2),
    max_warning_threshold NUMERIC(10, 2),
    min_critical_threshold NUMERIC(10, 2),
    max_critical_threshold NUMERIC(10, 2)
);

-- 3.9 Station Operational Readings (Recorded hourly or per shift)
CREATE TABLE station_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    recorded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    reading_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    voltage_kv NUMERIC(8, 2) NOT NULL,
    active_power_mw NUMERIC(10, 2) NOT NULL,
    reactive_power_mvar NUMERIC(10, 2),
    frequency_hz NUMERIC(5, 2) NOT NULL DEFAULT 50.00,
    power_factor NUMERIC(4, 3) NOT NULL DEFAULT 0.95,
    transformer_temp_celsius NUMERIC(5, 2),
    sf6_gas_pressure_bar NUMERIC(5, 2),
    ambient_temp_celsius NUMERIC(5, 2),
    is_anomaly BOOLEAN NOT NULL DEFAULT FALSE,
    anomaly_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.10 Fault and Incident Reports
CREATE TABLE fault_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_code VARCHAR(50) UNIQUE NOT NULL,
    station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES station_assets(id) ON DELETE SET NULL,
    reported_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    severity fault_severity NOT NULL DEFAULT 'medium',
    status fault_status NOT NULL DEFAULT 'open',
    assigned_technician_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    root_cause TEXT,
    resolution_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.11 Maintenance Work Orders
CREATE TABLE maintenance_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_code VARCHAR(50) UNIQUE NOT NULL,
    station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES station_assets(id) ON DELETE SET NULL,
    fault_report_id UUID REFERENCES fault_reports(id) ON DELETE SET NULL,
    maintenance_type maintenance_type NOT NULL DEFAULT 'preventive',
    status maintenance_status NOT NULL DEFAULT 'scheduled',
    title VARCHAR(255) NOT NULL,
    scope_of_work TEXT NOT NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    lead_technician_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    safety_clearance_number VARCHAR(100), -- تصريح العمل والسلامة المهنية
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.12 Inspection Templates and Records
CREATE TABLE inspection_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    target_station_type station_type,
    checklist_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inspection_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    template_id UUID REFERENCES inspection_templates(id) ON DELETE SET NULL,
    inspector_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    inspection_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    overall_rating VARCHAR(50) NOT NULL DEFAULT 'مرضي', -- ممتاز, مرضي, يحتاج إجراء, حرج
    findings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    recommendations TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.13 Tasks & Work Items
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_id UUID REFERENCES stations(id) ON DELETE CASCADE,
    assigned_to UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority task_priority NOT NULL DEFAULT 'medium',
    status task_status NOT NULL DEFAULT 'pending',
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.14 Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'operational', -- 'alarm', 'task', 'maintenance', 'system'
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    reference_url VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.15 Audit Logs (Tamper-evident system activity)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    actor_email VARCHAR(255),
    action VARCHAR(100) NOT NULL, -- e.g. 'STATION_CREATED', 'ROLE_CHANGED', 'FAULT_RESOLVED'
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    station_id UUID REFERENCES stations(id) ON DELETE SET NULL,
    old_data JSONB,
    new_data JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.16 System Settings
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PERFORMANCE INDEXES
CREATE INDEX idx_stations_org ON stations(organization_id);
CREATE INDEX idx_stations_status ON stations(status);
CREATE INDEX idx_stations_type ON stations(type);
CREATE INDEX idx_station_assignments_user ON station_assignments(user_id);
CREATE INDEX idx_station_assignments_station ON station_assignments(station_id);
CREATE INDEX idx_station_readings_station ON station_readings(station_id, reading_timestamp DESC);
CREATE INDEX idx_fault_reports_station ON fault_reports(station_id, status);
CREATE INDEX idx_maintenance_orders_station ON maintenance_orders(station_id, status);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_station ON audit_logs(station_id, created_at DESC);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES & HELPER FUNCTIONS

-- Helper function: Get current user role from profiles
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function: Check if current user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
    SELECT (get_current_user_role() = 'super_admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function: Check if user is admin or super admin
CREATE OR REPLACE FUNCTION is_admin_or_super()
RETURNS BOOLEAN AS $$
    SELECT (get_current_user_role() IN ('super_admin', 'admin'));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function: Check if user has explicit station access
CREATE OR REPLACE FUNCTION user_has_station_access(station_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Super admins have global access
    IF is_super_admin() THEN
        RETURN TRUE;
    END IF;

    -- Admins have access to stations in their organization
    IF EXISTS (
        SELECT 1 FROM profiles p
        JOIN stations s ON s.organization_id = p.organization_id
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
          AND s.id = station_uuid
    ) THEN
        RETURN TRUE;
    END IF;

    -- Supervisors and employees must be explicitly assigned to the station
    RETURN EXISTS (
        SELECT 1 FROM station_assignments sa
        WHERE sa.user_id = auth.uid()
          AND sa.station_id = station_uuid
          AND sa.is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Enable RLS on all sensitive tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fault_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 5.1 RLS: PROFILES
CREATE POLICY "Profiles viewable by authenticated users"
ON profiles FOR SELECT
TO authenticated
USING (
    id = auth.uid()
    OR is_admin_or_super()
    OR EXISTS (
        SELECT 1 FROM station_assignments sa1
        JOIN station_assignments sa2 ON sa1.station_id = sa2.station_id
        WHERE sa1.user_id = auth.uid() AND sa2.user_id = profiles.id
    )
);

CREATE POLICY "Super admins can manage all profiles"
ON profiles FOR ALL
TO authenticated
USING (is_super_admin());

CREATE POLICY "Admins can update profiles in their organization"
ON profiles FOR UPDATE
TO authenticated
USING (
    is_admin_or_super()
    AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

-- 5.2 RLS: STATIONS
CREATE POLICY "Stations viewable based on assignment or org scope"
ON stations FOR SELECT
TO authenticated
USING (user_has_station_access(id));

CREATE POLICY "Super admins and Org Admins can insert stations"
ON stations FOR INSERT
TO authenticated
WITH CHECK (
    is_super_admin()
    OR (
        is_admin_or_super()
        AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "Super admins and Org Admins can update stations"
ON stations FOR UPDATE
TO authenticated
USING (
    is_super_admin()
    OR (
        is_admin_or_super()
        AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- 5.3 RLS: STATION READINGS
CREATE POLICY "Readings viewable by authorized station staff"
ON station_readings FOR SELECT
TO authenticated
USING (user_has_station_access(station_id));

CREATE POLICY "Authorized personnel can record readings"
ON station_readings FOR INSERT
TO authenticated
WITH CHECK (
    user_has_station_access(station_id)
    AND recorded_by = auth.uid()
);

-- 5.4 RLS: FAULT REPORTS
CREATE POLICY "Fault reports viewable by station personnel"
ON fault_reports FOR SELECT
TO authenticated
USING (user_has_station_access(station_id));

CREATE POLICY "Station personnel can submit fault reports"
ON fault_reports FOR INSERT
TO authenticated
WITH CHECK (
    user_has_station_access(station_id)
    AND reported_by = auth.uid()
);

CREATE POLICY "Supervisors and Admins can update fault status"
ON fault_reports FOR UPDATE
TO authenticated
USING (
    user_has_station_access(station_id)
    AND get_current_user_role() IN ('super_admin', 'admin', 'supervisor')
);

-- 5.5 RLS: AUDIT LOGS (Read-only for Admins, no client direct modification)
CREATE POLICY "Audit logs viewable only by Admins"
ON audit_logs FOR SELECT
TO authenticated
USING (is_admin_or_super());

CREATE POLICY "Audit logs insertable by system or authenticated users"
ON audit_logs FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

-- 6. INITIAL SEED DATA FOR REFERENCE

INSERT INTO asset_types (code, name, category, maintenance_interval_days) VALUES
('TR-PWR-400', 'محول قدرة فائق 400/132 ك.ف', 'محولات رئيسية', 90),
('TR-DIST-33', 'محول توزيع 33/11 ك.ف', 'محولات توزيع', 180),
('CB-SF6-132', 'قاطع دورة غازي SF6 132 ك.ف', 'قواطع كهربائية', 90),
('SW-DISC-33', 'سكينة عزل هوائية 33 ك.ف', 'مفاتيح عزل', 120),
('REL-PROT-NUM', 'مرحل وقاية رقمي متكامل', 'أنظمة وقاية وتحكم', 60),
('BAT-SYS-110', 'منظومة بطاريات التيار المستمر 110V DC', 'تغذية مساعدة', 30);

INSERT INTO measurement_types (code, name, unit, min_warning_threshold, max_warning_threshold, min_critical_threshold, max_critical_threshold) VALUES
('VOLT_KV', 'الجهد التشغيلي', 'kV', 10.5, 11.8, 10.0, 12.2),
('LOAD_MW', 'الحمل الفعال', 'MW', 0.0, 35.0, 0.0, 42.0),
('FREQ_HZ', 'التردد الشبكي', 'Hz', 49.80, 50.20, 49.50, 50.50),
('OIL_TEMP_C', 'حرارة زيت المحول', '°C', 20.0, 75.0, 15.0, 85.0),
('GAS_SF6_BAR', 'ضغط غاز سداسي فلوريد الكبريت', 'bar', 5.8, 6.5, 5.2, 7.0);
