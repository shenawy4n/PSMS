/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Supabase Edge Function: create-employee
 * 
 * Securely provisions a new employee in Supabase Auth (auth.users) and creates
 * the corresponding functional profile (public.profiles) and station assignments
 * in a single atomic database transaction.
 * 
 * Security Guardrails:
 * 1. Validates caller Bearer JWT via Supabase Auth server-side.
 * 2. Enforces RBAC on server: caller must be an active 'super_admin' or 'admin'.
 * 3. Prevents privilege escalation: 'admin' cannot create or promote to 'super_admin'.
 * 4. Enforces organization scope: 'admin' cannot create employees outside their organization.
 * 5. NO ACCOUNT REUSE: Rejects duplicate emails immediately; prevents silent account takeover.
 * 6. Deduplicates and validates station IDs format before invocation.
 * 7. Calls atomic, server-only RPC provision_employee_profile_and_assignments.
 * 8. Automatic rollback: Deletes ONLY the newly created Auth user if database provisioning fails.
 * 9. Accurately reports invite status without false delivery claims.
 * 10. Masks sensitive database internals from client responses while maintaining audit logs.
 */

// @ts-ignore: Deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// @ts-ignore: Deno runtime
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || '*';
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'طريقة الطلب غير معتمدة (يجب استخدام POST).' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Validate environment configuration
    // @ts-ignore: Deno env
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    // @ts-ignore: Deno env
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    // @ts-ignore: Deno env
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Missing Supabase server-side environment variables');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'إعدادات خادم Supabase غير مكتملة (SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY غير مضبوطة).',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Authenticate the caller using their Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'غير مصرح: يجب تسجيل الدخول كمسؤول في النظام.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerClient = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user: callerUser }, error: callerAuthError } = await callerClient.auth.getUser();

    if (callerAuthError || !callerUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'جلسة العمل غير صالحة أو منتهية، يرجى تسجيل الدخول مجدداً.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Verify caller authorization and role in public.profiles using admin client
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('profiles')
      .select('id, role, organization_id, full_name, is_active')
      .eq('id', callerUser.id)
      .maybeSingle();

    if (callerProfileError || !callerProfile) {
      return new Response(
        JSON.stringify({ success: false, error: 'الملف الوظيفي للمسؤول غير موجود في قاعدة البيانات.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!callerProfile.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: 'حساب المسؤول معطل حالياً.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerRole = callerProfile.role;
    if (callerRole !== 'super_admin' && callerRole !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'ليس لديك صلاحية لإضافة موظفين (الصلاحية تقتصر على المشرفين العامين والمديرين).' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Parse request payload
    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response(
        JSON.stringify({ success: false, error: 'بيانات الطلب غير صالحة أو فارغة.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const {
      employee_number,
      full_name,
      email,
      phone,
      role = 'employee',
      department,
      job_title,
      organization_id,
      is_active = true,
      assigned_station_ids = [],
    } = body;

    // 5. Validate input fields
    if (!employee_number || typeof employee_number !== 'string' || employee_number.trim().length < 3) {
      return new Response(
        JSON.stringify({ success: false, error: 'الرقم الوظيفي يجب أن لا يقل عن 3 رموز.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 3) {
      return new Response(
        JSON.stringify({ success: false, error: 'الاسم الكامل يجب أن يتكون من 3 أحرف على الأقل.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return new Response(
        JSON.stringify({ success: false, error: 'يرجى إدخال بريد إلكتروني رسمي صالح ومطابق للمواصفات القياسية.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validRoles = ['employee', 'supervisor', 'admin', 'super_admin'];
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ success: false, error: 'الرتبة المحددة غير صالحة.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Privilege escalation & organization scope checks
    if (callerRole === 'admin') {
      if (role === 'super_admin') {
        return new Response(
          JSON.stringify({ success: false, error: 'غير مسموح لمدير القطاع بإنشاء أو ترقية حساب إلى مدير نظام عام (Super Admin).' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!callerProfile.organization_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'حساب مدير القطاع غير مرتبط بمنظمة محددة، يرجى مراجعة إدارة المنظومة.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (organization_id && organization_id !== callerProfile.organization_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'غير مسموح لمدير القطاع بإنشاء موظفين خارج قطاعه التشغيلي.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate and deduplicate station IDs
    let uniqueStationIds: string[] = [];
    if (Array.isArray(assigned_station_ids) && assigned_station_ids.length > 0) {
      const invalidStationId = assigned_station_ids.find((id: any) => typeof id !== 'string' || !UUID_REGEX.test(id));
      if (invalidStationId) {
        return new Response(
          JSON.stringify({ success: false, error: `معرّف المحطة غير صالح (يجب أن يكون UUID): ${invalidStationId}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      uniqueStationIds = Array.from(new Set(assigned_station_ids));
    }

    const cleanEmpNumber = employee_number.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();

    // 7. Check duplicates in public.profiles first
    const { data: existingEmp } = await adminClient
      .from('profiles')
      .select('id')
      .ilike('employee_number', cleanEmpNumber)
      .maybeSingle();

    if (existingEmp) {
      return new Response(
        JSON.stringify({ success: false, error: 'الرقم الوظيفي مسجل مسبقاً لموظف آخر في المنظومة.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: existingProfileEmail } = await adminClient
      .from('profiles')
      .select('id')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (existingProfileEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'البريد الإلكتروني مسجل مسبقاً لموظف آخر في المنظومة.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8. Provision user account in Supabase Auth (auth.users)
    // Strictly NO account reuse: If email exists in auth, fail immediately with 409 Conflict.
    let authUserId: string | null = null;
    let newlyCreatedAuth = false;
    let inviteDelivered = false;

    const userMetadata = {
      full_name: full_name.trim(),
      employee_number: cleanEmpNumber,
      role: role,
    };

    // First attempt: Invite user by email
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(cleanEmail, {
      data: userMetadata,
    });

    if (!inviteError && inviteData?.user) {
      authUserId = inviteData.user.id;
      newlyCreatedAuth = true;
      inviteDelivered = true;
    } else {
      if (inviteError?.message?.toLowerCase().includes('already registered')) {
        return new Response(
          JSON.stringify({ success: false, error: 'البريد الإلكتروني مسجل مسبقاً في نظام المصادقة.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If invite fails due to mail provider/SMTP config in dev, create user with email_confirm: true
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        email_confirm: true,
        user_metadata: userMetadata,
      });

      if (!createError && createData?.user) {
        authUserId = createData.user.id;
        newlyCreatedAuth = true;
        inviteDelivered = false;
      } else if (createError?.message?.toLowerCase().includes('already registered')) {
        return new Response(
          JSON.stringify({ success: false, error: 'البريد الإلكتروني مسجل مسبقاً في نظام المصادقة.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: `تعذر إنشاء حساب المصادقة في Supabase: ${createError?.message || inviteError?.message || 'خطأ غير معروف'}`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!authUserId) {
      return new Response(
        JSON.stringify({ success: false, error: 'تعذر تحديد معرّف المستخدم من Supabase Auth.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 9. Provision profile and station assignments atomically via database RPC
    const targetOrgId = callerRole === 'admin'
      ? callerProfile.organization_id
      : (organization_id || null);

    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      'provision_employee_profile_and_assignments',
      {
        p_user_id: authUserId,
        p_employee_number: cleanEmpNumber,
        p_full_name: full_name.trim(),
        p_email: cleanEmail,
        p_phone: phone ? phone.trim() : null,
        p_role: role,
        p_department: department ? department.trim() : null,
        p_job_title: job_title ? job_title.trim() : null,
        p_organization_id: targetOrgId,
        p_is_active: Boolean(is_active),
        p_station_ids: uniqueStationIds,
        p_assigned_by: callerUser.id,
      }
    );

    if (rpcError) {
      console.error('RPC provision_employee_profile_and_assignments error:', rpcError);

      // Rollback: delete ONLY the user created in this request
      if (newlyCreatedAuth && authUserId) {
        await adminClient.auth.admin.deleteUser(authUserId).catch((err: any) => {
          console.error('Rollback auth user deletion error:', err);
        });
      }

      // Safe user-friendly Arabic error mapping without leaking internal database schema/code
      let clientErrorMessage = 'تعذر إتمام تسجيل الملف الوظيفي في قاعدة البيانات.';
      const rawMsg = rpcError.message || '';

      if (rawMsg.includes('Conflict') || rawMsg.includes('already exists')) {
        clientErrorMessage = 'الرقم الوظيفي أو البريد الإلكتروني مسجل مسبقاً في قاعدة البيانات.';
      } else if (rawMsg.includes('Station scope violation')) {
        clientErrorMessage = 'المحطات المحددة تقع خارج النطاق التشغيلي المصرح به لمدير القطاع.';
      } else if (rawMsg.includes('Organization scope violation')) {
        clientErrorMessage = 'غير مصرح لمدير القطاع بإنشاء موظفين خارج منظمته.';
      } else if (rawMsg.includes('Validation error: One or more assigned station IDs do not exist')) {
        clientErrorMessage = 'إحدى المحطات المحددة غير موجودة في قاعدة البيانات.';
      } else if (rawMsg.includes('Privilege escalation violation')) {
        clientErrorMessage = 'لا يمكن منح رتبة مدير نظام عام (Super Admin) إلا من خلال المشرف العام.';
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: clientErrorMessage,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const successMessage = inviteDelivered
      ? 'تم إرسال دعوة البريد الإلكتروني وإنشاء حساب الموظف وتعيين المحطات بنجاح.'
      : 'تم إنشاء حساب الموظف وملفه الوظيفي وتعيين المحطات بنجاح (جاهز لتسجيل الدخول).';

    return new Response(
      JSON.stringify({
        success: true,
        user_id: authUserId,
        profile: rpcResult,
        message: successMessage,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Unhandled exception in create-employee Edge Function:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'حدث خطأ خادمي غير متوقع أثناء معالجة الطلب.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
