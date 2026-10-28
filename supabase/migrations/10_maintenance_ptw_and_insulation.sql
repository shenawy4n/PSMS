-- ==============================================================================
-- نظام إدارة محطات الكهرباء (Power Station Management System - PSMS)
-- Database Migration: 10_maintenance_ptw_and_insulation.sql
-- ==============================================================================
-- الغرض والمهام:
-- 1. إنشاء جدول تصاريح العمل والسلامة الكهربائية (permits_to_work - PTW) مع ضوابط العزل والقفل (LOTO).
-- 2. إنشاء جدول فحوصات العوازل والمحولات والمعدات (insulation_tests) لقياسات الميجر والزيت والغاز.
-- 3. تطبيق سياسات الأمان RLS المعتمدة والمتوافقة كلياً مع معمارية Migration 09 غير التكرارية.
-- 4. ربط سجلات التدقيق الآلية (Audit Logs) عبر Trigger دالة audit_record_change().
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. الأنواع والتصنيفات (Custom Enums)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ptw_work_type') THEN
        CREATE TYPE ptw_work_type AS ENUM (
            'electrical_isolation', -- عزل كهربائي وفصل قواطع
            'hot_work',             -- أعمال حرارية ولحام
            'height_work',          -- عمل على ارتفاعات وأبراج
            'confined_space',       -- أماكن مغلقة وخنادق كابلات
            'general'               -- صيانة عامة وميكانيكية
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ptw_status') THEN
        CREATE TYPE ptw_status AS ENUM (
            'draft',       -- مسودة تحت الإعداد
            'submitted',   -- مرفوع للاعتماد الفني
            'approved',    -- معتمد من مسؤول السلامة والمشرف
            'active',      -- ساري ومفعل ميدانياً
            'closed',      -- منتهي ومغلق بعد إكمال العمل
            'cancelled'    -- ملغي
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insulation_test_type') THEN
        CREATE TYPE insulation_test_type AS ENUM (
            'insulation_resistance', -- فحص مقاومة العزل بالميجر (Megger Test)
            'oil_bdv',               -- فحص جهد انهيار زيت المحول (Breakdown Voltage)
            'sf6_pressure',          -- فحص ضغط ونقاء غاز SF6 للقواطع
            'contact_resistance',    -- فحص مقاومة التلامس لقواطع الدورة (Micro-ohm)
            'tan_delta'              -- فحص معامل الفقد العزلي (Tan Delta / DDF)
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'test_rating') THEN
        CREATE TYPE test_rating AS ENUM (
            'satisfactory', -- سليم ومطابق للمواصفة القياسية
            'warning',      -- تحذير يتطلب متابعة وتقريب موعد الفحص
            'critical'      -- حرج يتطلب عزل فوري أو استبدال
        );
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. جدول تصاريح العمل والسلامة المهنية (permits_to_work)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permits_to_work (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    permit_code VARCHAR(50) UNIQUE NOT NULL,
    order_id UUID REFERENCES public.maintenance_orders(id) ON DELETE SET NULL,
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    work_type ptw_work_type NOT NULL DEFAULT 'electrical_isolation',
    status ptw_status NOT NULL DEFAULT 'draft',
    voltage_level_kv NUMERIC(8, 2),
    equipment_isolated TEXT NOT NULL,
    loto_applied BOOLEAN NOT NULL DEFAULT FALSE,          -- تأكيد تطبيق القفل والوسم Lockout / Tagout
    grounding_applied BOOLEAN NOT NULL DEFAULT FALSE,     -- تأكيد تركيب التأريض الميداني Earth Grounding
    zero_voltage_verified BOOLEAN NOT NULL DEFAULT FALSE, -- التحقق من انعدام الجهد Voltage-free verification
    safety_precautions TEXT,
    requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. جدول فحوصات العوازل والمعدات (insulation_tests)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.insulation_tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_code VARCHAR(50) UNIQUE NOT NULL,
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES public.station_assets(id) ON DELETE SET NULL,
    test_type insulation_test_type NOT NULL DEFAULT 'insulation_resistance',
    tested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    test_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_voltage_kv NUMERIC(8, 2),                      -- جهد الفحص المطبق (e.g. 2.5 kV, 5.0 kV, 10 kV)
    measured_value NUMERIC(10, 2) NOT NULL,                -- القيمة المقاسة
    measurement_unit VARCHAR(20) NOT NULL DEFAULT 'MΩ',     -- الوحدة: MΩ, GΩ, kV, bar, µΩ
    temperature_celsius NUMERIC(5, 2),                     -- درجة الحرارة عند الفحص
    status_rating test_rating NOT NULL DEFAULT 'satisfactory',
    remarks TEXT,
    recommendations TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. فهارس تحسين الأداء (Performance Indexes)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_permits_to_work_station ON public.permits_to_work(station_id, status);
CREATE INDEX IF NOT EXISTS idx_permits_to_work_order ON public.permits_to_work(order_id);
CREATE INDEX IF NOT EXISTS idx_permits_to_work_requested ON public.permits_to_work(requested_by);
CREATE INDEX IF NOT EXISTS idx_insulation_tests_station ON public.insulation_tests(station_id, test_type);
CREATE INDEX IF NOT EXISTS idx_insulation_tests_asset ON public.insulation_tests(asset_id);
CREATE INDEX IF NOT EXISTS idx_insulation_tests_date ON public.insulation_tests(test_date DESC);

-- -----------------------------------------------------------------------------
-- 5. تفعيل أمان الصفوف (Row Level Security) وسياسات الوصول
-- -----------------------------------------------------------------------------
ALTER TABLE public.permits_to_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insulation_tests ENABLE ROW LEVEL SECURITY;

-- 5.1 سياسات جدول تصاريح العمل (permits_to_work)
DROP POLICY IF EXISTS "PTW viewable by station operators" ON public.permits_to_work;
DROP POLICY IF EXISTS "PTW insertable by authorized station staff" ON public.permits_to_work;
DROP POLICY IF EXISTS "PTW updatable by managers or requesters" ON public.permits_to_work;
DROP POLICY IF EXISTS "PTW deletable by super admins" ON public.permits_to_work;

-- العرض: متاح لكل من يملك صلاحية وصول للمحطة المعنية
CREATE POLICY "PTW viewable by station operators"
ON public.permits_to_work FOR SELECT
TO authenticated
USING (public.user_has_station_access(station_id));

-- الإضافة: متاحة لطاقم المحطة المصرح لهم
CREATE POLICY "PTW insertable by authorized station staff"
ON public.permits_to_work FOR INSERT
TO authenticated
WITH CHECK (
    public.user_has_station_access(station_id)
    AND requested_by = (SELECT auth.uid())
);

-- التعديل والاعتماد: الإداريون ومشرفو المحطة، أو طالب التصريح طالما التصريح مسودة
CREATE POLICY "PTW updatable by managers or requesters"
ON public.permits_to_work FOR UPDATE
TO authenticated
USING (
    public.user_has_station_access(station_id)
    AND (
        public.is_admin_or_super()
        OR public.get_current_user_role() = 'supervisor'::user_role
        OR (requested_by = (SELECT auth.uid()) AND status = 'draft'::ptw_status)
    )
)
WITH CHECK (
    public.user_has_station_access(station_id)
    AND (
        public.is_admin_or_super()
        OR public.get_current_user_role() = 'supervisor'::user_role
        OR (requested_by = (SELECT auth.uid()) AND status IN ('draft'::ptw_status, 'submitted'::ptw_status))
    )
);

-- الحذف: محصور حصراً بمدير النظام العام (super_admin)
CREATE POLICY "PTW deletable by super admins"
ON public.permits_to_work FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- 5.2 سياسات جدول فحوصات العوازل (insulation_tests)
DROP POLICY IF EXISTS "Insulation tests viewable by station operators" ON public.insulation_tests;
DROP POLICY IF EXISTS "Insulation tests insertable by station operators" ON public.insulation_tests;
DROP POLICY IF EXISTS "Insulation tests updatable by supervisors or tester" ON public.insulation_tests;
DROP POLICY IF EXISTS "Insulation tests deletable by super admins" ON public.insulation_tests;

CREATE POLICY "Insulation tests viewable by station operators"
ON public.insulation_tests FOR SELECT
TO authenticated
USING (public.user_has_station_access(station_id));

CREATE POLICY "Insulation tests insertable by station operators"
ON public.insulation_tests FOR INSERT
TO authenticated
WITH CHECK (
    public.user_has_station_access(station_id)
    AND tested_by = (SELECT auth.uid())
);

CREATE POLICY "Insulation tests updatable by supervisors or tester"
ON public.insulation_tests FOR UPDATE
TO authenticated
USING (
    public.user_has_station_access(station_id)
    AND (
        public.is_admin_or_super()
        OR public.get_current_user_role() = 'supervisor'::user_role
        OR tested_by = (SELECT auth.uid())
    )
);

CREATE POLICY "Insulation tests deletable by super admins"
ON public.insulation_tests FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 6. ربط سجلات التدقيق التلقائي (Audit Triggers)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_permits_to_work ON public.permits_to_work;
CREATE TRIGGER trg_audit_permits_to_work
AFTER INSERT OR UPDATE OR DELETE ON public.permits_to_work
FOR EACH ROW EXECUTE FUNCTION public.audit_record_change();

DROP TRIGGER IF EXISTS trg_audit_insulation_tests ON public.insulation_tests;
CREATE TRIGGER trg_audit_insulation_tests
AFTER INSERT OR UPDATE OR DELETE ON public.insulation_tests
FOR EACH ROW EXECUTE FUNCTION public.audit_record_change();
