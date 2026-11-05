-- ==============================================================================
-- نظام إدارة محطات الكهرباء (Power Station Management System - PSMS)
-- Database Migration: 12_complete_rls_multi_tenant_hardening.sql
-- ==============================================================================
-- الغرض والمهام الأمنية (Security Objectives):
-- مراجعة وتحصين شامل لكافة سياسات أمان مستوى الصف (Row-Level Security - RLS)
-- وعزل المستأجرين (Multi-Tenant Isolation) وقواعد الوصول عبر كافة جداول المنظومة التشغيلية:
--
-- 1. تحصين دوال الصلاحيات المركزية (Helper Functions):
--    - اشتراط نشاط الحساب (is_active = TRUE) في get_current_user_role() و get_current_user_org_id().
--    - حظر الحسابات المعطلة والملغاة فوراً من الحصول على أي أدوار أو استعلام أي بيانات.
--    - حسم مسألة الوصول العابر للمحطات في user_has_station_access(): حظر تام لأي إداري
--      ذو مؤسسة فارغة (Fail-Closed)، وحظر تجاوز حدود المؤسسة عبر جدول station_assignments.
--
-- 2. تحصين الجداول التشغيلية (Operational Tables RLS Hardening):
--    - station_assets: قصر الإدراج والتحديث لإداري القطاع على محطات قطاعه فقط.
--    - maintenance_orders: قصر إنشاء وتعديل أوامر الصيانة على محطات نفس المؤسسة.
--    - station_readings: حظر تعديل القراءات لمدراء القطاعات خارج نطاق مؤسستهم.
--    - fault_reports: حظر تعديل بلاغات الأعطال لمدراء القطاعات خارج نطاق مؤسستهم.
--    - inspection_records: قصر التحديث على محطات نفس المؤسسة وإضافة WITH CHECK متطابقة.
--    - tasks: حظر تسريب المهام عبر القطاعات (حذف شرط is_admin_or_super() الفضفاض في SELECT).
--    - notifications: قصر إرسال الإشعارات على مستخدمي نفس المؤسسة.
--    - audit_logs: قصر رؤية السجلات لإداري القطاع على عملياته ومحطات قطاعه فقط، ومنع التعديل والحذف تماماً.
--    - permits_to_work (PTW): تحصين التعديل باشتراط تبعية المحطة للمؤسسة وإضافة WITH CHECK صارمة.
--    - insulation_tests: إضافة شرط WITH CHECK المتطابق وحظر التعديل خارج نطاق المؤسسة.
--
-- 3. الدفاع في العمق وتطهير السياسات القديمة:
--    - إسقاط كافة السياسات الفضفاضة المتوارثة من الهجرات السابقة لمنع دمجها عبر OR في PostgreSQL.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- الخطوة 1: ترقية وتحصين دوال التحقق الأمنية الأساسية (Core Helper Functions)
-- -----------------------------------------------------------------------------

-- 1.1 استخراج رتبة المستخدم الحالي باشتراط النشاط (is_active = TRUE)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()) AND is_active = TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;

-- 1.2 استخراج معرّف المؤسسة التابع لها المستخدم باشتراط النشاط (is_active = TRUE)
CREATE OR REPLACE FUNCTION public.get_current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid()) AND is_active = TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_org_id() TO authenticated;

-- 1.3 التحقق من صفة مدير النظام العام (Super Admin)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((public.get_current_user_role() = 'super_admin'::user_role), FALSE);
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- 1.4 التحقق من صفة مدير نظام (Admin أو Super Admin)
CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((public.get_current_user_role() IN ('super_admin'::user_role, 'admin'::user_role)), FALSE);
$$;

REVOKE ALL ON FUNCTION public.is_admin_or_super() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super() TO authenticated;

-- 1.5 التحقق الصارم من تبعية المحطة لمؤسسة المستخدم الحالي (Fail-Closed)
CREATE OR REPLACE FUNCTION public.station_belongs_to_user_org(target_station_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.is_super_admin() OR EXISTS (
        SELECT 1 FROM public.stations
        WHERE id = target_station_id
          AND organization_id IS NOT NULL
          AND public.get_current_user_org_id() IS NOT NULL
          AND organization_id = public.get_current_user_org_id()
    );
$$;

REVOKE ALL ON FUNCTION public.station_belongs_to_user_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.station_belongs_to_user_org(UUID) TO authenticated;

-- 1.6 التحقق الصارم من تبعية الملف الوظيفي لمؤسسة المستخدم الحالي
CREATE OR REPLACE FUNCTION public.profile_belongs_to_user_org(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT (public.is_super_admin()) OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = target_user_id
          AND organization_id IS NOT NULL
          AND public.get_current_user_org_id() IS NOT NULL
          AND organization_id = public.get_current_user_org_id()
          AND role != 'super_admin'::user_role
    );
$$;

REVOKE ALL ON FUNCTION public.profile_belongs_to_user_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_belongs_to_user_org(UUID) TO authenticated;

-- 1.7 التحقق الشامل والمحصن من صلاحية الوصول للمحطة (user_has_station_access)
-- حظر الوصول العابر للمؤسسات لمدراء القطاعات (حتى في حال وجود إسناد شاذ في station_assignments)
CREATE OR REPLACE FUNCTION public.user_has_station_access(station_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_role user_role;
    v_user_org UUID;
BEGIN
    -- 1. مدير النظام العام: وصول شامل غير مقيد لكافة المحطات
    IF public.is_super_admin() THEN
        RETURN TRUE;
    END IF;

    v_user_role := public.get_current_user_role();
    v_user_org := public.get_current_user_org_id();

    -- رفض الحسابات المعطلة أو غير الموثقة فوراً
    IF v_user_role IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 2. مدير القطاع التشغيلي (admin):
    IF v_user_role = 'admin'::user_role THEN
        -- يمنع الإداري ذو المؤسسة الفارغة من الوصول لأي محطة (Fail-Closed)
        IF v_user_org IS NULL THEN
            RETURN FALSE;
        END IF;

        -- التحقق الصارم من تبعية المحطة لنفس مؤسسة الإداري
        IF EXISTS (
            SELECT 1 FROM public.stations
            WHERE id = station_uuid 
              AND organization_id IS NOT NULL
              AND organization_id = v_user_org
        ) THEN
            RETURN TRUE;
        END IF;

        -- لا يُسمح للإداري بتجاوز حدود مؤسسته عبر جدول الإسنادات
        RETURN FALSE;
    END IF;

    -- 3. المشرفون والمهندسون والفنيون: مقيدون تماماً بالإسناد النشط المباشر للمحطة
    RETURN public.user_has_station_assignment(station_uuid);
END;
$$;

REVOKE ALL ON FUNCTION public.user_has_station_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_station_access(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- الخطوة 2: تحصين سياسات RLS لجدول أصول ومعدات المحطات (station_assets)
-- -----------------------------------------------------------------------------
ALTER TABLE public.station_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Station assets viewable by authorized station staff" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets viewable by station operators" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets insertable by authorized managers" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets insertable by managers" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets updatable by authorized managers" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets updatable by managers" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets deletable by super admins" ON public.station_assets;

-- أ. عرض الأصول: مقتصر على المصرح لهم بالوصول للمحطة
CREATE POLICY "Station assets viewable by station operators"
ON public.station_assets FOR SELECT
TO authenticated
USING (public.user_has_station_access(station_id));

-- ب. إضافة الأصول: مقصور على Super Admin، أو إداري محطات قطاعه، أو مشرف المحطة المسند لها
CREATE POLICY "Station assets insertable by managers"
ON public.station_assets FOR INSERT
TO authenticated
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
);

-- ج. تعديل الأصول: مقصور على Super Admin، أو إداري محطات قطاعه، أو مشرف المحطة المسند لها
CREATE POLICY "Station assets updatable by managers"
ON public.station_assets FOR UPDATE
TO authenticated
USING (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
)
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
);

-- د. حذف الأصول: مقصور حصرياً على مدير النظام العام
CREATE POLICY "Station assets deletable by super admins"
ON public.station_assets FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- الخطوة 3: تحصين سياسات RLS لجدول أوامر الصيانة (maintenance_orders)
-- -----------------------------------------------------------------------------
ALTER TABLE public.maintenance_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Maintenance orders viewable by authorized station staff" ON public.maintenance_orders;
DROP POLICY IF EXISTS "Maintenance orders viewable by station operators" ON public.maintenance_orders;
DROP POLICY IF EXISTS "Maintenance orders insertable by authorized managers" ON public.maintenance_orders;
DROP POLICY IF EXISTS "Maintenance orders insertable by managers" ON public.maintenance_orders;
DROP POLICY IF EXISTS "Maintenance orders updatable by authorized managers" ON public.maintenance_orders;
DROP POLICY IF EXISTS "Maintenance orders updatable by managers" ON public.maintenance_orders;
DROP POLICY IF EXISTS "Maintenance orders manageable by admins" ON public.maintenance_orders;
DROP POLICY IF EXISTS "Maintenance orders deletable by super admins" ON public.maintenance_orders;

CREATE POLICY "Maintenance orders viewable by station operators"
ON public.maintenance_orders FOR SELECT
TO authenticated
USING (public.user_has_station_access(station_id));

CREATE POLICY "Maintenance orders insertable by managers"
ON public.maintenance_orders FOR INSERT
TO authenticated
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
);

CREATE POLICY "Maintenance orders updatable by managers"
ON public.maintenance_orders FOR UPDATE
TO authenticated
USING (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
)
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
);

CREATE POLICY "Maintenance orders deletable by super admins"
ON public.maintenance_orders FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- الخطوة 4: تحصين سياسات RLS لجدول القراءات التشغيلية (station_readings)
-- -----------------------------------------------------------------------------
ALTER TABLE public.station_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Readings viewable by authorized station staff" ON public.station_readings;
DROP POLICY IF EXISTS "Authorized personnel can record readings" ON public.station_readings;
DROP POLICY IF EXISTS "Station readings viewable by station operators" ON public.station_readings;
DROP POLICY IF EXISTS "Station readings insertable by station operators" ON public.station_readings;
DROP POLICY IF EXISTS "Super admins and supervisors can update readings" ON public.station_readings;
DROP POLICY IF EXISTS "Super admins and station supervisors can update readings" ON public.station_readings;
DROP POLICY IF EXISTS "Super admins can delete readings" ON public.station_readings;

CREATE POLICY "Station readings viewable by station operators"
ON public.station_readings FOR SELECT
TO authenticated
USING (public.user_has_station_access(station_id));

CREATE POLICY "Station readings insertable by station operators"
ON public.station_readings FOR INSERT
TO authenticated
WITH CHECK (
    public.user_has_station_access(station_id)
    AND recorded_by = (SELECT auth.uid())
);

CREATE POLICY "Super admins and station supervisors can update readings"
ON public.station_readings FOR UPDATE
TO authenticated
USING (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
)
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
);

CREATE POLICY "Super admins can delete readings"
ON public.station_readings FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- الخطوة 5: تحصين سياسات RLS لجدول بلاغات الأعطال والحوادث (fault_reports)
-- -----------------------------------------------------------------------------
ALTER TABLE public.fault_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fault reports viewable by station personnel" ON public.fault_reports;
DROP POLICY IF EXISTS "Station personnel can submit fault reports" ON public.fault_reports;
DROP POLICY IF EXISTS "Supervisors and Admins can update fault status" ON public.fault_reports;
DROP POLICY IF EXISTS "Fault reports viewable by station operators" ON public.fault_reports;
DROP POLICY IF EXISTS "Fault reports insertable by station operators" ON public.fault_reports;
DROP POLICY IF EXISTS "Fault reports updatable by authorized operators" ON public.fault_reports;
DROP POLICY IF EXISTS "Fault reports deletable by super admins" ON public.fault_reports;

CREATE POLICY "Fault reports viewable by station operators"
ON public.fault_reports FOR SELECT
TO authenticated
USING (public.user_has_station_access(station_id));

CREATE POLICY "Fault reports insertable by station operators"
ON public.fault_reports FOR INSERT
TO authenticated
WITH CHECK (
    public.user_has_station_access(station_id)
    AND reported_by = (SELECT auth.uid())
);

CREATE POLICY "Fault reports updatable by authorized operators"
ON public.fault_reports FOR UPDATE
TO authenticated
USING (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.user_has_station_access(station_id)
        AND (
            public.get_current_user_role() = 'supervisor'::user_role
            OR reported_by = (SELECT auth.uid())
            OR assigned_technician_id = (SELECT auth.uid())
        )
    )
)
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.user_has_station_access(station_id)
        AND (
            public.get_current_user_role() = 'supervisor'::user_role
            OR reported_by = (SELECT auth.uid())
            OR assigned_technician_id = (SELECT auth.uid())
        )
    )
);

CREATE POLICY "Fault reports deletable by super admins"
ON public.fault_reports FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- الخطوة 6: تحصين سياسات RLS لجدول سجلات التفتيش الفني (inspection_records)
-- -----------------------------------------------------------------------------
ALTER TABLE public.inspection_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inspection records viewable by authorized station staff" ON public.inspection_records;
DROP POLICY IF EXISTS "Inspection records insertable by authorized inspectors" ON public.inspection_records;
DROP POLICY IF EXISTS "Inspection records updatable by authorized managers" ON public.inspection_records;
DROP POLICY IF EXISTS "Inspection records deletable by super admins" ON public.inspection_records;

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
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
    OR (
        inspector_id = (SELECT auth.uid())
        AND status = 'draft'
    )
)
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
    OR (
        inspector_id = (SELECT auth.uid())
        AND status IN ('draft', 'completed')
    )
);

CREATE POLICY "Inspection records deletable by super admins"
ON public.inspection_records FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- الخطوة 7: تحصين سياسات RLS لجدول المهام التشغيلية (tasks)
-- -----------------------------------------------------------------------------
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tasks viewable by assignee or station manager" ON public.tasks;
DROP POLICY IF EXISTS "Tasks manageable by authorized managers" ON public.tasks;
DROP POLICY IF EXISTS "Tasks insertable by authorized managers" ON public.tasks;
DROP POLICY IF EXISTS "Tasks updatable by assignee or managers" ON public.tasks;
DROP POLICY IF EXISTS "Tasks deletable by super admins" ON public.tasks;

-- أ. عرض المهام: منع تسريب المهام عبر القطاعات (إلغاء شرط is_admin_or_super العام)
CREATE POLICY "Tasks viewable by assignee or station manager"
ON public.tasks FOR SELECT
TO authenticated
USING (
    assigned_to = (SELECT auth.uid())
    OR created_by = (SELECT auth.uid())
    OR public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND station_id IS NOT NULL
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        station_id IS NOT NULL
        AND public.user_has_station_access(station_id)
    )
);

-- ب. إضافة المهام: مقصورة على المحطات التابعة للمؤسسة أو المهام الشخصية
CREATE POLICY "Tasks insertable by authorized managers"
ON public.tasks FOR INSERT
TO authenticated
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND (
            (station_id IS NOT NULL AND public.station_belongs_to_user_org(station_id))
            OR (station_id IS NULL AND created_by = (SELECT auth.uid()))
        )
    )
    OR (
        station_id IS NOT NULL
        AND public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
);

-- ج. تعديل المهام:
CREATE POLICY "Tasks updatable by assignee or managers"
ON public.tasks FOR UPDATE
TO authenticated
USING (
    assigned_to = (SELECT auth.uid())
    OR created_by = (SELECT auth.uid())
    OR public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND station_id IS NOT NULL
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        station_id IS NOT NULL
        AND public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
)
WITH CHECK (
    assigned_to = (SELECT auth.uid())
    OR created_by = (SELECT auth.uid())
    OR public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND station_id IS NOT NULL
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        station_id IS NOT NULL
        AND public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
);

-- د. حذف المهام: مقصور حصرياً على مدير النظام العام
CREATE POLICY "Tasks deletable by super admins"
ON public.tasks FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- الخطوة 8: تحصين سياسات RLS لجدول الإشعارات (notifications)
-- -----------------------------------------------------------------------------
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

-- إدراج الإشعارات: مقيد بنفس المؤسسة لإداريي القطاعات، أو ذاتي
CREATE POLICY "Notifications insertable by system or managers"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (
    public.is_super_admin()
    OR user_id = (SELECT auth.uid())
    OR (
        public.is_admin_or_super()
        AND public.profile_belongs_to_user_org(user_id)
    )
);

CREATE POLICY "Notifications deletable by recipient"
ON public.notifications FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()) OR public.is_super_admin());

-- -----------------------------------------------------------------------------
-- الخطوة 9: تحصين سجلات التدقيق الأمني (audit_logs)
-- -----------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audit logs viewable by central admins" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit logs viewable by authorized admins" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit logs insertable by system or authenticated users" ON public.audit_logs;

-- عرض سجلات التدقيق: حصر إداري القطاع بسجلات عملياته ومحطات قطاعه فقط
CREATE POLICY "Audit logs viewable by authorized admins"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND (
            actor_id = (SELECT auth.uid())
            OR (station_id IS NOT NULL AND public.station_belongs_to_user_org(station_id))
        )
    )
);

-- إدراج سجل التدقيق عبر النظام والمحفزات
CREATE POLICY "Audit logs insertable by system or authenticated users"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (actor_id = (SELECT auth.uid()) OR actor_id IS NULL);

-- التأكيد الصارم على ثبات السجلات وعدم إتاحة أي سياسة UPDATE أو DELETE إطلاقاً
DROP POLICY IF EXISTS "Audit logs updatable by super admins" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit logs deletable by super admins" ON public.audit_logs;

-- -----------------------------------------------------------------------------
-- الخطوة 10: تحصين تصاريح العمل (permits_to_work) وفحوصات العوازل (insulation_tests)
-- -----------------------------------------------------------------------------
ALTER TABLE public.permits_to_work ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PTW viewable by station operators" ON public.permits_to_work;
DROP POLICY IF EXISTS "PTW insertable by authorized station staff" ON public.permits_to_work;
DROP POLICY IF EXISTS "PTW updatable by managers or requesters" ON public.permits_to_work;
DROP POLICY IF EXISTS "PTW deletable by super admins" ON public.permits_to_work;

CREATE POLICY "PTW viewable by station operators"
ON public.permits_to_work FOR SELECT
TO authenticated
USING (public.user_has_station_access(station_id));

CREATE POLICY "PTW insertable by authorized station staff"
ON public.permits_to_work FOR INSERT
TO authenticated
WITH CHECK (
    public.user_has_station_access(station_id)
    AND requested_by = (SELECT auth.uid())
);

CREATE POLICY "PTW updatable by managers or requesters"
ON public.permits_to_work FOR UPDATE
TO authenticated
USING (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.user_has_station_access(station_id)
        AND (
            public.get_current_user_role() = 'supervisor'::user_role
            OR (requested_by = (SELECT auth.uid()) AND status = 'draft'::ptw_status)
        )
    )
)
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.user_has_station_access(station_id)
        AND (
            public.get_current_user_role() = 'supervisor'::user_role
            OR (requested_by = (SELECT auth.uid()) AND status IN ('draft'::ptw_status, 'submitted'::ptw_status))
        )
    )
);

CREATE POLICY "PTW deletable by super admins"
ON public.permits_to_work FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- فحوصات العوازل insulation_tests
ALTER TABLE public.insulation_tests ENABLE ROW LEVEL SECURITY;

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
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.user_has_station_access(station_id)
        AND (
            public.get_current_user_role() = 'supervisor'::user_role
            OR tested_by = (SELECT auth.uid())
        )
    )
)
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.station_belongs_to_user_org(station_id)
    )
    OR (
        public.user_has_station_access(station_id)
        AND (
            public.get_current_user_role() = 'supervisor'::user_role
            OR tested_by = (SELECT auth.uid())
        )
    )
);

CREATE POLICY "Insulation tests deletable by super admins"
ON public.insulation_tests FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- ==============================================================================
-- نهاية ملف الهجرة: 12_complete_rls_multi_tenant_hardening.sql
-- ==============================================================================
