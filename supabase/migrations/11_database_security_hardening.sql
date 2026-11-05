-- ==============================================================================
-- نظام إدارة محطات الكهرباء (Power Station Management System - PSMS)
-- Database Migration: 11_database_security_hardening.sql
-- ==============================================================================
-- الغرض والمهام الأمنية (Security Objectives):
-- تحصين شامل لحدود الأمان وقواعد التحكم في الوصول (RBAC & Multi-Tenant Isolation)
-- على مستوى قاعدة البيانات PostgreSQL وسياسات RLS والدوال ومحفزات Triggers:
--
-- 1. القضاء التام على ثغرة الفتح عند الفشل (Fail-Open) في سياسات profiles و stations:
--    - إزالة أي شرط يعتمد على كون معرف المؤسسة فارغاً لمدراء القطاعات (NULL Org Bypass).
--    - تطبيق مبدأ الإغلاق عند الفشل (Fail-Closed): إذا كان حساب الإداري غير مقيد بمؤسسة
--      يتم حظره فوراً من تعديل أو قراءة أو إسناد أي موظف أو محطة خارج صلاحياته المباشرة.
--
-- 2. عزل بيانات الموظفين ومنع التسريب متعدد المستأجرين (Cross-Tenant Data Leakage):
--    - تقييد سياسة قراءة الملفات "Profiles viewable by authorized users" بحيث يقتصر إداري
--      القطاع على رؤية موظفي قطاعه التشغيلي فقط، بالإضافة لملفه الشخصي والزملاء المشتركين
--      في نفس المحطة، مع احتفاظ مدير النظام العام (Super Admin) بالرؤية الشاملة.
--
-- 3. الدفاع في العمق لتحديث الملفات الشخصية (Profiles UPDATE):
--    - تحصين سياسة "Admins can update profiles" على مستوى RLS باشتراط عدم كون الحساب
--      المستهدف Super Admin، ومطابقة معرّف المؤسسة غير الفارغ.
--    - ترقية دالة المحفز trg_enforce_profile_update_security للتحقق من نشاط حساب الإداري،
--      وحظر تعديل حسابات مدراء النظام العام أو الترقية إليها، وفرض تطابق المؤسسة.
--
-- 4. تقييد صلاحيات إدارة المحطات (Stations RLS Hardening):
--    - إسقاط سياسة "Admins can manage stations" العامة الشاملة واستبدالها بسياسات محددة.
--    - حصر حذف المحطات حصرياً على مدير النظام العام (Super Admin).
--    - تقييد تعديل وإدراج المحطات لمدراء القطاعات بحيث تقتصر على محطات مؤسستهم فقط.
--
-- 5. تحصين إسناد المحطات (Station Assignments):
--    - تقييد قراءة وإدراج وتعديل إسناد المحطات لمدراء القطاعات بالمحطات التابعة لمؤسستهم.
--
-- 6. تحصين دالة التزويد الذري للموظفين (Atomic Provisioning RPC):
--    - فرض الفحص المغلق (Fail-Closed) في RPC بحيث يُرفض إداري القطاع فوراً إذا كان
--      معرف مؤسسته فارغاً (NULL) أو حاول إسناد محطات لا تتبع مؤسسته.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- الخطوة 1: تحديث وتحصين الدوال الأمنية المساعدة (Security Helper Functions)
-- -----------------------------------------------------------------------------

-- 1.1 دالة فحص صلاحية الوصول للمحطة (user_has_station_access)
-- إزالة أي ثغرة تجاوز عند كون مؤسسة الإداري فارغة، وحصر وصول إداري القطاع بمحطات مؤسسته فقط
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
    -- 1. مدير النظام العام: وصول شامل غير مقيد لكافة المحطات المركزية والفرعية
    IF public.is_super_admin() THEN
        RETURN TRUE;
    END IF;

    v_user_role := public.get_current_user_role();
    v_user_org := public.get_current_user_org_id();

    -- 2. مدير القطاع التشغيلي (admin):
    IF v_user_role = 'admin'::user_role THEN
        -- إذا كان للإداري مؤسسة محددة، له حق الوصول فقط للمحطات التابعة لمؤسسته
        IF v_user_org IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM public.stations
                WHERE id = station_uuid 
                  AND organization_id IS NOT NULL
                  AND organization_id = v_user_org
            ) THEN
                RETURN TRUE;
            END IF;
        END IF;

        -- فحص الإسناد المباشر كاحتياط
        RETURN public.user_has_station_assignment(station_uuid);
    END IF;

    -- 3. المشرفون والمهندسون والفنيون: مقيدون تماماً بالإسناد النشط المباشر للمحطة
    RETURN public.user_has_station_assignment(station_uuid);
END;
$$;

REVOKE ALL ON FUNCTION public.user_has_station_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_station_access(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- الخطوة 2: ترقية وتحصين محفزات ودوال تعديل وإدراج الموظفين (Triggers)
-- -----------------------------------------------------------------------------

-- 2.1 دالة محفز حماية تعديل الملف الشخصي (trg_enforce_profile_update_security)
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
    v_caller_active BOOLEAN;
BEGIN
    v_current_uid := (SELECT auth.uid());
    v_is_super := public.is_super_admin();
    v_is_admin := public.is_admin_or_super();
    v_current_org_id := public.get_current_user_org_id();

    -- 1. مدير النظام العام: صلاحيات كاملة للتحديث والتعديل
    IF v_is_super THEN
        RETURN NEW;
    END IF;

    -- التحقق الإلزامي من نشاط حساب المستخدم المنفّذ لأي عملية تعديل
    SELECT is_active INTO v_caller_active
    FROM public.profiles
    WHERE id = v_current_uid;

    IF v_caller_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Security violation: Inactive account cannot perform profile modifications.';
    END IF;

    -- 2. ثبات الحقول الهيكلية الحساسة لجميع المستخدمين غير مدير النظام العام
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
        -- يسمح بتعديل الحقول غير السيادية: full_name, phone, department, job_title, updated_at
        RETURN NEW;
    END IF;

    -- 4. تعديل مدراء القطاعات التشغيلية (admin) لملفات الموظفين التابعين لهم:
    IF v_is_admin THEN
        -- منع ترقية أي موظف إلى رتبة مدير نظام عام (super_admin)
        IF NEW.role = 'super_admin'::user_role AND OLD.role != 'super_admin'::user_role THEN
            RAISE EXCEPTION 'Privilege escalation violation: Administrators cannot promote users to super_admin.';
        END IF;

        -- حظر قطعي لتعديل أي بيانات تخص حساب مدير نظام عام (super_admin)
        IF OLD.role = 'super_admin'::user_role THEN
            RAISE EXCEPTION 'Security violation: Administrators cannot modify Super Admin profiles.';
        END IF;

        -- الإغلاق عند الفشل (Fail-Closed) لقيود نطاق المؤسسة:
        -- أ. يجب أن يكون لحساب الإداري مؤسسة مسندة وغير فارغة
        IF v_current_org_id IS NULL THEN
            RAISE EXCEPTION 'Organization boundary violation: Operational administrator has no assigned organization.';
        END IF;

        -- ب. يجب أن يكون للموظف المستهدف مؤسسة مسندة وغير فارغة وتطابق مؤسسة الإداري
        IF OLD.organization_id IS NULL OR OLD.organization_id != v_current_org_id THEN
            RAISE EXCEPTION 'Organization boundary violation: Administrators cannot modify profiles outside their organization.';
        END IF;

        -- ج. يمنع الإداري منعاً باتاً من إعادة تعيين أو نقل الموظف لمؤسسة أخرى
        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
            RAISE EXCEPTION 'Tenant violation: Administrators cannot reassign employee organization.';
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

-- 2.2 دالة محفز حماية الإدراج المباشر في profiles (trg_enforce_profile_insert_security)
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
    v_jwt_role TEXT;
    v_current_uid UUID;
    v_current_org_id UUID;
    v_is_trusted_backend BOOLEAN;
BEGIN
    v_jwt_role := NULLIF(auth.role(), '');
    v_current_uid := (SELECT auth.uid());
    v_is_trusted_backend := (
        v_jwt_role = 'service_role' OR 
        (session_user = 'postgres' AND v_jwt_role IS NULL)
    );

    -- توحيد صيغة البيانات
    NEW.employee_number := UPPER(TRIM(NEW.employee_number));
    NEW.email := LOWER(TRIM(NEW.email));

    -- السماح للخدمات الموثوقة (Backend RPC / Edge Functions)
    IF v_is_trusted_backend THEN
        IF NEW.id IS NULL THEN
            RAISE EXCEPTION 'Validation error: Profile ID cannot be null and must correspond to an authenticated Supabase user.';
        END IF;
        RETURN NEW;
    END IF;

    -- رفض المستخدمين غير الموثقين
    IF v_current_uid IS NULL OR v_jwt_role = 'anon' THEN
        RAISE EXCEPTION 'Authentication required: Anonymous profile creation is strictly forbidden.';
    END IF;

    v_is_super := public.is_super_admin();
    v_is_admin := public.is_admin_or_super();
    v_caller_role := public.get_current_user_role();

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Permission denied: Only administrators are permitted to create employee profiles.';
    END IF;

    -- منع تصعيد الصلاحيات
    IF NOT v_is_super AND NEW.role = 'super_admin'::user_role THEN
        RAISE EXCEPTION 'Privilege escalation violation: Only Super Admins can create Super Admin accounts.';
    END IF;

    -- فرض نطاق المؤسسة المغلق عند الفشل (Fail-Closed) لإداريي القطاعات
    IF NOT v_is_super THEN
        v_current_org_id := public.get_current_user_org_id();
        IF v_current_org_id IS NULL THEN
            RAISE EXCEPTION 'Organization boundary violation: Operational administrator has no assigned organization.';
        END IF;
        IF NEW.organization_id IS NULL OR NEW.organization_id != v_current_org_id THEN
            RAISE EXCEPTION 'Organization boundary violation: Administrators cannot create profiles outside their organization.';
        END IF;
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

-- -----------------------------------------------------------------------------
-- الخطوة 3: تحصين دالة التزويد الذري للموظفين (Atomic Provisioning RPC)
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
    -- 1. التحقق من سياق الاستدعاء: حصري للواجهة الخلفية الموثوقة service_role
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

    -- منع تصعيد الصلاحيات: مدير القطاع لا ينشئ حسابات Super Admin
    IF v_admin_role = 'admin'::user_role AND p_role = 'super_admin'::user_role THEN
        RAISE EXCEPTION 'Privilege escalation violation: Operational admins cannot create Super Admin accounts.';
    END IF;

    -- التحقق من نطاق المؤسسة لإداريي القطاعات (Fail-Closed Enforcement):
    -- أ. يُرفض فوراً أي إداري قطاع غير مقيد بمؤسسة محددة
    IF v_admin_role = 'admin'::user_role THEN
        IF v_admin_org_id IS NULL THEN
            RAISE EXCEPTION 'Organization scope violation: Operational administrator profile is not assigned to an organization.';
        END IF;

        -- ب. يُرفض تحديد أي مؤسسة تختلف عن مؤسسة الإداري
        IF v_effective_org_id IS NOT NULL AND v_effective_org_id != v_admin_org_id THEN
            RAISE EXCEPTION 'Organization scope violation: Operational admins cannot create profiles outside their organization.';
        END IF;

        -- ج. إلزام المؤسسة الفعالة بمؤسسة الإداري
        v_effective_org_id := v_admin_org_id;
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

        -- التحقق من صلاحية الإداري على المحطات (Fail-Closed):
        -- إداري القطاع لا يسند إلا محطات مؤسسته حصراً
        IF v_admin_role = 'admin'::user_role THEN
            IF v_admin_org_id IS NULL THEN
                RAISE EXCEPTION 'Station scope violation: Operational administrator has no assigned organization.';
            END IF;

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

REVOKE ALL ON FUNCTION public.provision_employee_profile_and_assignments(UUID, TEXT, TEXT, TEXT, TEXT, user_role, TEXT, TEXT, UUID, BOOLEAN, UUID[], UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_employee_profile_and_assignments(UUID, TEXT, TEXT, TEXT, TEXT, user_role, TEXT, TEXT, UUID, BOOLEAN, UUID[], UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_employee_profile_and_assignments(UUID, TEXT, TEXT, TEXT, TEXT, user_role, TEXT, TEXT, UUID, BOOLEAN, UUID[], UUID) TO postgres;

-- -----------------------------------------------------------------------------
-- الخطوة 4: تجديد وتحصين سياسات الأمان RLS للجداول الحساسة
-- -----------------------------------------------------------------------------

-- 4.1 تحصين سياسات جدول profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- إسقاط السياسات السابقة التي تحتوي على تسريب بيانات أو ثغرات الفتح عند الفشل
DROP POLICY IF EXISTS "Profiles viewable by authorized users" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;

-- سياسة العرض المحصنة:
-- 1. المستخدم يرى ملفه الشخصي دائماً
-- 2. مدير النظام العام يرى كافة الملفات
-- 3. مدير القطاع التشغيلي يرى حصراً ملفات موظفي قطاعه (مع اشتراط عدم كون المؤسسة NULL)
-- 4. المشرفون والمهندسون يرون الزملاء المشتركين معهم في المحطات المسندة بنشاط
CREATE POLICY "Profiles viewable by authorized users"
ON public.profiles FOR SELECT
TO authenticated
USING (
    id = (SELECT auth.uid())
    OR public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.get_current_user_org_id() IS NOT NULL
        AND organization_id IS NOT NULL
        AND organization_id = public.get_current_user_org_id()
    )
    OR public.user_shares_station_with(id)
);

-- سياسة التعديل المحصنة لإداريي النظام والقطاعات (Fail-Closed):
-- 1. مدير النظام العام يعدل كافة الملفات
-- 2. مدير القطاع التشغيلي يعدل موظفي قطاعه فقط مع الشروط الصارمة:
--    أ. معرف مؤسسة الإداري غير فارغ (NOT NULL)
--    ب. معرف مؤسسة الموظف غير فارغ ويطابق مؤسسة الإداري
--    ج. حظر تعديل حساب مدير النظام العام قطيعاً على مستوى RLS (role != 'super_admin')
CREATE POLICY "Admins can update profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.get_current_user_org_id() IS NOT NULL
        AND organization_id IS NOT NULL
        AND organization_id = public.get_current_user_org_id()
        AND role != 'super_admin'::user_role
    )
)
WITH CHECK (
    public.is_super_admin()
    OR (
        public.is_admin_or_super()
        AND public.get_current_user_org_id() IS NOT NULL
        AND organization_id IS NOT NULL
        AND organization_id = public.get_current_user_org_id()
        AND role != 'super_admin'::user_role
    )
);

-- 4.2 تحصين سياسات جدول stations
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

-- إسقاط السياسة العامة الشاملة السابقة
DROP POLICY IF EXISTS "Admins can manage stations" ON public.stations;
DROP POLICY IF EXISTS "Super admins can manage all stations" ON public.stations;
DROP POLICY IF EXISTS "Admins can insert stations in their organization" ON public.stations;
DROP POLICY IF EXISTS "Admins can update stations in their organization" ON public.stations;
DROP POLICY IF EXISTS "Super admins can delete stations" ON public.stations;

-- أ. مدير النظام العام: إدارة شاملة لكافة المحطات (المركزية والوطنية ومحطات الشركات)
CREATE POLICY "Super admins can manage all stations"
ON public.stations FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- ب. مدراء القطاعات: إدراج محطات تابعة حصراً لمؤسستهم المسندة
CREATE POLICY "Admins can insert stations in their organization"
ON public.stations FOR INSERT
TO authenticated
WITH CHECK (
    public.is_admin_or_super()
    AND public.get_current_user_org_id() IS NOT NULL
    AND organization_id IS NOT NULL
    AND organization_id = public.get_current_user_org_id()
);

-- ج. مدراء القطاعات: تعديل محطات تابعة حصراً لمؤسستهم المسندة
CREATE POLICY "Admins can update stations in their organization"
ON public.stations FOR UPDATE
TO authenticated
USING (
    public.is_admin_or_super()
    AND public.get_current_user_org_id() IS NOT NULL
    AND organization_id IS NOT NULL
    AND organization_id = public.get_current_user_org_id()
)
WITH CHECK (
    public.is_admin_or_super()
    AND public.get_current_user_org_id() IS NOT NULL
    AND organization_id IS NOT NULL
    AND organization_id = public.get_current_user_org_id()
);

-- د. حذف المحطات: مقصور حصرياً على مدير النظام العام لمنع الفقد الكارثي للبيانات التشغيلية
CREATE POLICY "Super admins can delete stations"
ON public.stations FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- 4.3 تحصين سياسات جدول station_assignments
ALTER TABLE public.station_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Station assignments viewable by authorized users" ON public.station_assignments;
DROP POLICY IF EXISTS "Station assignments insertable by authorized managers" ON public.station_assignments;
DROP POLICY IF EXISTS "Station assignments updatable by authorized managers" ON public.station_assignments;

-- أ. عرض إسناد المحطات:
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

-- ب. إضافة إسناد المحطات:
CREATE POLICY "Station assignments insertable by authorized managers"
ON public.station_assignments FOR INSERT
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

-- ج. تعديل إسناد المحطات:
CREATE POLICY "Station assignments updatable by authorized managers"
ON public.station_assignments FOR UPDATE
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

-- ==============================================================================
-- نهاية ملف الهجرة: 11_database_security_hardening.sql
-- ==============================================================================
