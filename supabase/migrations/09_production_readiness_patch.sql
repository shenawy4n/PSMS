-- ==============================================================================
-- نظام إدارة محطات الكهرباء (Power Station Management System - PSMS)
-- Database Migration: 09_production_readiness_patch.sql
-- ==============================================================================
-- الهدف والمهام الأساسية:
-- 1. حل خطأ التكرار اللانهائي في سياسات الأمان (RLS Recursion 42P17) عبر دوال فحص DAG مستقلة.
-- 2. تصحيح استخراج دور JWT في دالة إنشاء الموظفين والـ Trigger باستخدام NULLIF(auth.role(), '').
-- 3. حماية جدول public.profiles من التصعيد والصلاحيات المفرطة والتعديل الذاتي للحقول الحساسة.
-- 4. حماية جدول public.station_assignments وضمان ثبات المعرفات (user_id, station_id) وعدم الالتفاف.
-- 5. تأمين دالة RPC (provision_employee_profile_and_assignments) وحصرها على service_role فقط.
-- 6. تطبيق سياسات RLS متكاملة على جميع الجداول التشغيلية (قراءات، أعطال، صيانة، أصول، مهام، فحوصات، إشعارات، تدقيق).
-- 7. تحصين جميع دوال SECURITY DEFINER عبر مسار آمن SET search_path = public, pg_temp وإلغاء صلاحيات PUBLIC.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- الخطوة 1: معالجة التوافقية الرجعية لهيكل الجداول (Retro-Compatibility)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    -- التأكد من إمكانية ترك organization_id خاليًا (NULL) للمحطات الوطنية والمركزية
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'stations'
          AND column_name = 'organization_id' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.stations ALTER COLUMN organization_id DROP NOT NULL;
    END IF;

    -- التأكد من إمكانية ترك organization_id خاليًا في ملفات المستخدمين المستقلين أو الإدارة العامة
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
          AND column_name = 'organization_id' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.profiles ALTER COLUMN organization_id DROP NOT NULL;
    END IF;
END $$;

-- ضمان فهرس عدم التكرار للإسناد النشط للموظف في المحطة نفسها
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_station_user 
ON public.station_assignments(station_id, user_id) 
WHERE is_active = TRUE;

-- فهارس فريدة وغير حساسة لحالة الأحرف للرقم الوظيفي والبريد الإلكتروني
DO $$
BEGIN
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
        END IF;
    END IF;

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
        END IF;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- الخطوة 2: دوال التحقق الأمنية المحصنة غير التكرارية (Hardened Security Functions)
-- -----------------------------------------------------------------------------

-- 2.1 استخراج رتبة المستخدم الحالي من profiles بأمان ودون إطلاق حلقة RLS
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT role FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

-- 2.2 استخراج المؤسسة التابع لها المستخدم الحالي
CREATE OR REPLACE FUNCTION public.get_current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

-- 2.3 التحقق من صفة مدير النظام العام (Super Admin)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((public.get_current_user_role() = 'super_admin'::user_role), FALSE);
$$;

-- 2.4 التحقق من صفة مدير نظام (Admin أو Super Admin)
CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((public.get_current_user_role() IN ('super_admin'::user_role, 'admin'::user_role)), FALSE);
$$;

-- 2.5 التحقق من وجود إسناد نشط للمستخدم في محطة معينة
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

-- 2.6 التحقق من تبعية المحطة لمؤسسة المستخدم
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
          AND organization_id = public.get_current_user_org_id()
    );
$$;

-- 2.7 التحقق من تبعية الملف الوظيفي لمؤسسة المستخدم الحالي
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
          AND organization_id = public.get_current_user_org_id()
          AND role != 'super_admin'::user_role
    );
$$;

-- 2.8 التحقق الشامل من صلاحية الوصول للمحطة:
-- - super_admin: وصول شامل لجميع المحطات (المركزية، الوطنية، ومحطات الشركات)
-- - admin: وصول لمحطات مؤسسته، وفي النموذج المركزي وصول للإشراف والمتابعة
-- - supervisor و employee: وصول مقتصر على المحطات المسندة بنشاط
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
    IF public.is_super_admin() THEN
        RETURN TRUE;
    END IF;

    v_user_role := public.get_current_user_role();
    v_user_org := public.get_current_user_org_id();

    IF v_user_role = 'admin'::user_role THEN
        -- إذا كانت المحطة تابعة لمؤسسة الإداري أو كانت مركزية بدون مؤسسة وتحت إشرافه
        IF v_user_org IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM public.stations
                WHERE id = station_uuid AND (organization_id = v_user_org OR organization_id IS NULL)
            ) THEN
                RETURN TRUE;
            END IF;
        ELSE
            -- إداري عام مركزي غير مقيد بمؤسسة
            RETURN TRUE;
        END IF;
    END IF;

    RETURN public.user_has_station_assignment(station_uuid);
END;
$$;

-- 2.9 التحقق من اشتراك المستخدمين في إسناد محطة واحدة نشطة على الأقل (يكسر التكرار في profiles)
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

-- تحصين الصلاحيات: إلغاء PUBLIC ومنح authenticated
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

REVOKE ALL ON FUNCTION public.station_belongs_to_user_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.station_belongs_to_user_org(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.profile_belongs_to_user_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_belongs_to_user_org(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_station_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_station_access(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.user_shares_station_with(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_shares_station_with(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- الخطوة 3: حماية التعديل والتصعيد في الجداول عبر Triggers محصنة
-- -----------------------------------------------------------------------------

-- 3.1 منع تصعيد الصلاحيات والتعديل الذاتي للحقول الحساسة في profiles
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

    -- 1. مدير النظام العام: صلاحيات كاملة
    IF v_is_super THEN
        RETURN NEW;
    END IF;

    -- 2. ثبات الحقول الهيكلية للمستخدمين الآخرين
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Field "id" is strictly immutable.';
    END IF;

    IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'Field "email" is governed by Supabase Auth and cannot be modified directly in profiles.';
    END IF;

    IF NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
        RAISE EXCEPTION 'Field "employee_number" is corporate-assigned and cannot be modified without Super Admin authorization.';
    END IF;

    -- 3. التعديل الذاتي للملف الشخصي (Self-Update):
    -- يمنع المستخدم من تغيير دوره، أو تفعيل/تعطيل حسابه، أو تغيير المؤسسة، أو تغيير المشرف
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
        -- يسمح بتعديل: full_name, phone, department, job_title, updated_at
        RETURN NEW;
    END IF;

    -- 4. تعديل مدراء المؤسسات للموظفين التابعين لهم:
    IF v_is_admin THEN
        -- منع ترقية أي موظف إلى super_admin
        IF NEW.role = 'super_admin'::user_role AND OLD.role != 'super_admin'::user_role THEN
            RAISE EXCEPTION 'Privilege escalation violation: Administrators cannot promote users to super_admin.';
        END IF;
        -- منع التعديل على حساب super_admin
        IF OLD.role = 'super_admin'::user_role THEN
            RAISE EXCEPTION 'Security violation: Administrators cannot modify Super Admin profiles.';
        END IF;
        -- إذا كان الإداري مقيدًا بمؤسسة، لا يمكنه نقل الموظف خارجها أو تعديل موظف من مؤسسة أخرى
        IF v_current_org_id IS NOT NULL THEN
            IF OLD.organization_id IS NOT NULL AND OLD.organization_id != v_current_org_id THEN
                RAISE EXCEPTION 'Organization boundary violation: Administrators cannot modify profiles outside their organization.';
            END IF;
            IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
                RAISE EXCEPTION 'Tenant violation: Administrators cannot reassign employee organization.';
            END IF;
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

-- 3.2 منع الالتفاف وتعديل المعرفات الثابتة في station_assignments
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
    -- ثبات station_id و user_id: لا يجوز تعديلهما في سجل قائم، بل يتم إلغاء تنشيطه وإنشاء سجل جديد
    IF NEW.station_id IS DISTINCT FROM OLD.station_id THEN
        RAISE EXCEPTION 'Station assignment station_id is strictly immutable. To reassign, deactivate the existing assignment and create a new one.';
    END IF;

    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Station assignment user_id is strictly immutable. Create a new assignment for the target user.';
    END IF;

    v_is_super := public.is_super_admin();
    v_is_admin := public.is_admin_or_super();
    v_user_role := public.get_current_user_role();

    IF v_is_super THEN
        RETURN NEW;
    END IF;

    IF v_is_admin AND public.station_belongs_to_user_org(OLD.station_id) THEN
        RETURN NEW;
    END IF;

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
-- الخطوة 4: تأمين إنشاء الموظفين واستخراج الدور في Trigger و RPC
-- -----------------------------------------------------------------------------

-- 4.1 دالة trigger حماية الإدراج في profiles مع التحقق الصحيح من auth.role()
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
    v_current_uid := auth.uid();
    -- استخدام auth.role() الآمن المدمج في Supabase
    v_jwt_role := NULLIF(auth.role(), '');
    
    -- السياق الموثوق:
    -- 1. استدعاء عبر مفتاح service_role بواسطة Edge Function
    -- 2. جلسة مدير قاعدة البيانات المباشرة (session_user = 'postgres' وبدون JWT)
    -- ملاحظة أمنية: لا يتم فحص current_user = 'postgres' لأنها تتحقق دائمًا داخل SECURITY DEFINER
    v_is_trusted_backend := (
        v_jwt_role = 'service_role' OR 
        (session_user = 'postgres' AND v_jwt_role IS NULL)
    );

    -- تطهير النصوص
    NEW.employee_number := UPPER(TRIM(NEW.employee_number));
    NEW.email := LOWER(TRIM(NEW.email));

    IF v_is_trusted_backend THEN
        IF NEW.id IS NULL THEN
            RAISE EXCEPTION 'Validation error: Profile ID cannot be null and must correspond to an authenticated Supabase user.';
        END IF;
        RETURN NEW;
    END IF;

    -- رفض المستخدمين غير الموثقين (anon) فوراً
    IF v_current_uid IS NULL OR v_jwt_role = 'anon' THEN
        RAISE EXCEPTION 'Authentication required: Anonymous profile creation is strictly forbidden.';
    END IF;

    v_is_super := public.is_super_admin();
    v_is_admin := public.is_admin_or_super();
    v_caller_role := public.get_current_user_role();

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Permission denied: Only central administrators are permitted to create employee profiles.';
    END IF;

    -- منع تصعيد الصلاحيات: لا يمكن لغير super_admin إنشاء حساب super_admin
    IF NOT v_is_super AND NEW.role = 'super_admin'::user_role THEN
        RAISE EXCEPTION 'Privilege escalation violation: Only Super Admins can create Super Admin accounts.';
    END IF;

    IF NEW.id IS NULL THEN
        RAISE EXCEPTION 'Validation error: Profile ID cannot be null and must correspond to an authenticated Supabase user.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_insert_security ON public.profiles;
CREATE TRIGGER trg_enforce_profile_insert_security
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_insert_security();

-- 4.2 دالة RPC لإنشاء الموظف وإسناد المحطات ذرياً (Atomic Employee Provisioning)
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
    -- 1. التحقق من سياق الاستدعاء: حصري لـ service_role
    v_jwt_role := NULLIF(auth.role(), '');
    v_is_trusted_backend := (
        v_jwt_role = 'service_role' OR 
        (session_user = 'postgres' AND v_jwt_role IS NULL)
    );

    IF NOT v_is_trusted_backend THEN
        RAISE EXCEPTION 'Access denied: provision_employee_profile_and_assignments is restricted to trusted service_role execution.';
    END IF;

    -- 2. التحقق من صحة المدخلات
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Validation error: User ID is required and must match Supabase Auth.';
    END IF;

    v_clean_emp_no := UPPER(TRIM(p_employee_number));
    IF LENGTH(v_clean_emp_no) < 3 THEN
        RAISE EXCEPTION 'Validation error: Employee number must be at least 3 characters.';
    END IF;

    v_clean_email := LOWER(TRIM(p_email));
    IF v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'Validation error: Invalid email format.';
    END IF;

    IF p_full_name IS NULL OR LENGTH(TRIM(p_full_name)) < 3 THEN
        RAISE EXCEPTION 'Validation error: Full name must be at least 3 characters.';
    END IF;

    -- 3. التحقق من هوية وصلاحية الإداري المنفّذ (assigned_by)
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

    -- منع تصعيد الصلاحيات
    IF v_admin_role = 'admin'::user_role AND p_role = 'super_admin'::user_role THEN
        RAISE EXCEPTION 'Privilege escalation violation: Operational admins cannot create Super Admin accounts.';
    END IF;

    -- التحقق من نطاق المؤسسة لإداريي المؤسسات
    IF v_admin_role = 'admin'::user_role THEN
        IF v_admin_org_id IS NOT NULL THEN
            IF v_effective_org_id IS NOT NULL AND v_effective_org_id != v_admin_org_id THEN
                RAISE EXCEPTION 'Organization scope violation: Operational admins cannot create profiles outside their organization.';
            END IF;
            v_effective_org_id := v_admin_org_id;
        END IF;
    END IF;

    -- 4. التحقق من عدم التكرار في profiles
    IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(TRIM(employee_number)) = LOWER(v_clean_emp_no)) THEN
        RAISE EXCEPTION 'Conflict: Employee number % already exists in the system.', v_clean_emp_no;
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(TRIM(email)) = v_clean_email) THEN
        RAISE EXCEPTION 'Conflict: Email address % is already registered.', v_clean_email;
    END IF;

    -- 5. إزالة التكرار والتحقق من وجود المحطات وصلاحية إسنادها
    IF p_station_ids IS NOT NULL AND cardinality(p_station_ids) > 0 THEN
        SELECT array_agg(DISTINCT sid) INTO v_unique_station_ids
        FROM unnest(p_station_ids) AS sid
        WHERE sid IS NOT NULL;
    ELSE
        v_unique_station_ids := ARRAY[]::UUID[];
    END IF;

    IF cardinality(v_unique_station_ids) > 0 THEN
        SELECT COUNT(*) INTO v_valid_station_count
        FROM public.stations
        WHERE id = ANY(v_unique_station_ids);

        IF v_valid_station_count != cardinality(v_unique_station_ids) THEN
            RAISE EXCEPTION 'Validation error: One or more assigned station IDs do not exist in the database.';
        END IF;

        -- التحقق من صلاحية الإداري على المحطات:
        -- إداري المؤسسة لا يسند إلا محطات مؤسسته. المحطات المركزية (organization_id IS NULL) تتطلب super_admin
        IF v_admin_role = 'admin'::user_role AND v_admin_org_id IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM public.stations
                WHERE id = ANY(v_unique_station_ids)
                  AND (organization_id IS NULL OR organization_id != v_admin_org_id)
            ) THEN
                RAISE EXCEPTION 'Station scope violation: Operational admins can only assign stations belonging strictly to their organization.';
            END IF;
        END IF;
    END IF;

    -- 6. إدراج الملف الوظيفي ذرياً
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

    -- 7. إدراج إسناد المحطات ذرياً
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

    -- 8. تكوين استجابة JSON المتوافقة مع Edge Function create-employee
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

-- حصر صلاحيات RPC حصرياً على service_role وإلغاؤها من PUBLIC و anon و authenticated
REVOKE ALL ON FUNCTION public.provision_employee_profile_and_assignments(UUID, TEXT, TEXT, TEXT, TEXT, user_role, TEXT, TEXT, UUID, BOOLEAN, UUID[], UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_employee_profile_and_assignments(UUID, TEXT, TEXT, TEXT, TEXT, user_role, TEXT, TEXT, UUID, BOOLEAN, UUID[], UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_employee_profile_and_assignments(UUID, TEXT, TEXT, TEXT, TEXT, user_role, TEXT, TEXT, UUID, BOOLEAN, UUID[], UUID) TO postgres;

-- -----------------------------------------------------------------------------
-- الخطوة 5: إسقاط وتجديد سياسات RLS عبر الجداول كافة (حل 42P17 نهائياً)
-- -----------------------------------------------------------------------------

-- 5.1 جدول profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by authorized users" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update central profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert central profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles self update" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own non-sensitive profile data" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can delete profiles" ON public.profiles;

-- عرض الملفات: الذات، أو الإداريون، أو الزملاء المشتركون في المحطات (بدون تكرار)
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

CREATE POLICY "Admins can update profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (
    public.is_admin_or_super()
    AND (
        public.is_super_admin()
        OR public.get_current_user_org_id() IS NULL
        OR organization_id = public.get_current_user_org_id()
    )
)
WITH CHECK (
    public.is_admin_or_super()
    AND (
        public.is_super_admin()
        OR public.get_current_user_org_id() IS NULL
        OR organization_id = public.get_current_user_org_id()
    )
);

-- التعديل الذاتي للملف الشخصي (محمي عبر trg_enforce_profile_update_security)
CREATE POLICY "Profiles self update"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

-- 5.2 جدول stations
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Stations viewable based on assignment or org scope" ON public.stations;
DROP POLICY IF EXISTS "Stations viewable based on centralized access" ON public.stations;
DROP POLICY IF EXISTS "Stations viewable based on assignment or admin role" ON public.stations;
DROP POLICY IF EXISTS "Super admins and Org Admins can insert stations" ON public.stations;
DROP POLICY IF EXISTS "Super admins and Org Admins can update stations" ON public.stations;
DROP POLICY IF EXISTS "Central admins can insert stations" ON public.stations;
DROP POLICY IF EXISTS "Central admins can update stations" ON public.stations;
DROP POLICY IF EXISTS "Admins can manage stations" ON public.stations;
DROP POLICY IF EXISTS "Super admins can delete stations" ON public.stations;

CREATE POLICY "Stations viewable based on assignment or admin role"
ON public.stations FOR SELECT
TO authenticated
USING (public.user_has_station_access(id));

CREATE POLICY "Admins can manage stations"
ON public.stations FOR ALL
TO authenticated
USING (public.is_admin_or_super())
WITH CHECK (public.is_admin_or_super());

-- 5.3 جدول station_assignments
ALTER TABLE public.station_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Station assignments viewable by authenticated users" ON public.station_assignments;
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
        AND public.user_has_station_assignment(station_id)
    )
);

CREATE POLICY "Station assignments updatable by authorized managers"
ON public.station_assignments FOR UPDATE
TO authenticated
USING (
    public.is_admin_or_super()
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
)
WITH CHECK (
    public.is_admin_or_super()
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
);

CREATE POLICY "Station assignments deletable by super admins"
ON public.station_assignments FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- 5.4 جدول station_readings
ALTER TABLE public.station_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Readings viewable by authorized station staff" ON public.station_readings;
DROP POLICY IF EXISTS "Authorized personnel can record readings" ON public.station_readings;
DROP POLICY IF EXISTS "Station readings viewable by station operators" ON public.station_readings;
DROP POLICY IF EXISTS "Station readings insertable by station operators" ON public.station_readings;
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

CREATE POLICY "Super admins and supervisors can update readings"
ON public.station_readings FOR UPDATE
TO authenticated
USING (
    public.is_admin_or_super()
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_id)
    )
);

CREATE POLICY "Super admins can delete readings"
ON public.station_readings FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- 5.5 جدول fault_reports
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

-- 5.6 جدول maintenance_orders
ALTER TABLE public.maintenance_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Maintenance orders viewable by authorized station staff" ON public.maintenance_orders;
DROP POLICY IF EXISTS "Maintenance orders insertable by authorized managers" ON public.maintenance_orders;
DROP POLICY IF EXISTS "Maintenance orders updatable by authorized managers" ON public.maintenance_orders;
DROP POLICY IF EXISTS "Maintenance orders viewable by station operators" ON public.maintenance_orders;
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
    public.is_admin_or_super()
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(maintenance_orders.station_id)
    )
);

CREATE POLICY "Maintenance orders updatable by managers"
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

-- 5.7 جدول station_assets
ALTER TABLE public.station_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Station assets viewable by authorized station staff" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets insertable by authorized managers" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets updatable by authorized managers" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets viewable by station operators" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets manageable by admins" ON public.station_assets;
DROP POLICY IF EXISTS "Station assets deletable by super admins" ON public.station_assets;

CREATE POLICY "Station assets viewable by station operators"
ON public.station_assets FOR SELECT
TO authenticated
USING (public.user_has_station_access(station_id));

CREATE POLICY "Station assets insertable by managers"
ON public.station_assets FOR INSERT
TO authenticated
WITH CHECK (
    public.is_admin_or_super()
    OR (
        public.get_current_user_role() = 'supervisor'::user_role
        AND public.user_has_station_assignment(station_assets.station_id)
    )
);

CREATE POLICY "Station assets updatable by managers"
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

-- 5.8 جداول الفحوصات (inspection_templates و inspection_records)
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

-- 5.9 جدول المهام (tasks)
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tasks viewable by assignee or station manager" ON public.tasks;
DROP POLICY IF EXISTS "Tasks manageable by authorized managers" ON public.tasks;
DROP POLICY IF EXISTS "Tasks updatable by assignee or managers" ON public.tasks;
DROP POLICY IF EXISTS "Tasks deletable by super admins" ON public.tasks;

CREATE POLICY "Tasks viewable by assignee or station manager"
ON public.tasks FOR SELECT
TO authenticated
USING (
    assigned_to = (SELECT auth.uid())
    OR public.is_admin_or_super()
    OR (station_id IS NOT NULL AND public.user_has_station_access(station_id))
);

CREATE POLICY "Tasks insertable by authorized managers"
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

-- 5.10 جدول الإشعارات (notifications)
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

-- 5.11 جدول سجل التدقيق (audit_logs): غير قابل للتعديل أو الحذف إطلاقاً
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

-- لا توجد سياسات UPDATE أو DELETE على audit_logs لضمان سلامة السجل القانوني والفني.

-- 5.12 الجداول المرجعية (organizations, regions, asset_types, measurement_types, system_settings)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizations viewable by scoped users" ON public.organizations;
DROP POLICY IF EXISTS "Organizations viewable by authenticated users" ON public.organizations;
DROP POLICY IF EXISTS "Organizations manageable by super admins" ON public.organizations;
CREATE POLICY "Organizations viewable by authenticated users" ON public.organizations FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Organizations manageable by super admins" ON public.organizations FOR ALL TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "Regions viewable by authenticated users" ON public.regions;
DROP POLICY IF EXISTS "Regions manageable by super admins" ON public.regions;
CREATE POLICY "Regions viewable by authenticated users" ON public.regions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Regions manageable by super admins" ON public.regions FOR ALL TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "Asset types viewable by authenticated users" ON public.asset_types;
DROP POLICY IF EXISTS "Asset types manageable by super admins" ON public.asset_types;
CREATE POLICY "Asset types viewable by authenticated users" ON public.asset_types FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Asset types manageable by super admins" ON public.asset_types FOR ALL TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "Measurement types viewable by authenticated users" ON public.measurement_types;
DROP POLICY IF EXISTS "Measurement types manageable by super admins" ON public.measurement_types;
CREATE POLICY "Measurement types viewable by authenticated users" ON public.measurement_types FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Measurement types manageable by super admins" ON public.measurement_types FOR ALL TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "System settings viewable by admins" ON public.system_settings;
DROP POLICY IF EXISTS "System settings manageable by super admins" ON public.system_settings;
CREATE POLICY "System settings viewable by admins" ON public.system_settings FOR SELECT TO authenticated USING (public.is_admin_or_super());
CREATE POLICY "System settings manageable by super admins" ON public.system_settings FOR ALL TO authenticated USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- الخطوة 6: إشعار اكتمال فحص وتطبيق Migration 09
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'Migration 09: Production Readiness & Hotfix Patch Prepared Successfully!';
    RAISE NOTICE '1. RLS Recursion (42P17) permanently resolved with non-recursive DAG functions.';
    RAISE NOTICE '2. Employee creation trigger & RPC secured with NULLIF(auth.role(), '''').';
    RAISE NOTICE '3. Profile self-update protected against privilege escalation.';
    RAISE NOTICE '4. Station assignments locked against key mutation and duplication.';
    RAISE NOTICE '5. Operational tables RLS secured with least-privilege policies.';
    RAISE NOTICE '====================================================================';
END $$;
