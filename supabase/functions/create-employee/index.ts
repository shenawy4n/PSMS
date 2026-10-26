/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Supabase Edge Function: create-employee
 * 
 * Securely provisions a new employee in Supabase Auth (auth.users) and creates
 * the corresponding functional profile (public.profiles) in a single atomic flow.
 * 
 * Security Guardrails:
 * 1. Validates the caller's Bearer JWT via Supabase Auth.
 * 2. Enforces RBAC on the server: caller must have role 'super_admin' or 'admin'.
 * 3. Prevents privilege escalation: 'admin' cannot create or promote to 'super_admin'.
 * 4. Checks unique constraints for email and employee_number in public.profiles.
 * 5. Uses Supabase Admin API with SUPABASE_SERVICE_ROLE_KEY securely on the server.
 * 6. Implements rollback: if profile insertion fails, deletes the newly created auth user.
 * 7. Supports station assignments linkage.
 */

// @ts-ignore: Deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// @ts-ignore: Deno runtime
Deno.serve(async (req: Request) => {
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
      .select('id, role, full_name, is_active')
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

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return new Response(
        JSON.stringify({ success: false, error: 'يرجى إدخال بريد إلكتروني رسمي صالح.' }),
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

    // 6. Privilege escalation check: Admins cannot create Super Admins
    if (callerRole === 'admin' && role === 'super_admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'غير مسموح لمدير القطاع بإنشاء أو ترقية حساب إلى مدير نظام عام (Super Admin).' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanEmpNumber = employee_number.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();

    // 7. Check duplicates in public.profiles
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
    let authUserId: string | null = null;
    let newlyCreatedAuth = false;

    const userMetadata = {
      full_name: full_name.trim(),
      employee_number: cleanEmpNumber,
      role: role,
    };

    // First attempt: Invite user by email (sends an invitation email for secure password creation)
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(cleanEmail, {
      data: userMetadata,
    });

    if (!inviteError && inviteData?.user) {
      authUserId = inviteData.user.id;
      newlyCreatedAuth = true;
    } else {
      // If invite fails (e.g. SMTP not configured in development or mail provider off),
      // create user directly with email_confirm: true so account is ready for password reset / sign-in
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        email_confirm: true,
        user_metadata: userMetadata,
      });

      if (!createError && createData?.user) {
        authUserId = createData.user.id;
        newlyCreatedAuth = true;
      } else if (createError?.message?.includes('already registered')) {
        // User exists in auth.users, check if they are orphaned (no profile)
        const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
        const existingAuthUser = listData?.users?.find((u: any) => u.email?.toLowerCase() === cleanEmail);

        if (existingAuthUser) {
          authUserId = existingAuthUser.id;
        } else {
          return new Response(
            JSON.stringify({ success: false, error: 'البريد الإلكتروني مسجل مسبقاً في نظام المصادقة.' }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
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

    // 9. Insert profile into public.profiles
    const { data: insertedProfile, error: profileInsertError } = await adminClient
      .from('profiles')
      .insert([
        {
          id: authUserId,
          employee_number: cleanEmpNumber,
          full_name: full_name.trim(),
          email: cleanEmail,
          phone: phone ? phone.trim() : null,
          role: role,
          department: department ? department.trim() : null,
          job_title: job_title ? job_title.trim() : null,
          organization_id: organization_id || null,
          is_active: Boolean(is_active),
        },
      ])
      .select()
      .single();

    if (profileInsertError) {
      console.error('Failed to insert into public.profiles:', profileInsertError);

      // Rollback: delete the created auth user so we don't leave an orphaned auth user
      if (newlyCreatedAuth && authUserId) {
        await adminClient.auth.admin.deleteUser(authUserId).catch((err: any) => {
          console.error('Rollback auth user deletion error:', err);
        });
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: `تعذر حفظ الملف الوظيفي في قاعدة البيانات (${profileInsertError.message}).`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 10. Process initial station assignments if supplied
    if (Array.isArray(assigned_station_ids) && assigned_station_ids.length > 0) {
      const assignmentRows = assigned_station_ids.map((stnId: string) => ({
        station_id: stnId,
        user_id: authUserId,
        assignment_role: job_title ? job_title.trim() : 'مشغل محطة',
        assigned_by: callerUser.id,
        is_active: true,
      }));

      await adminClient.from('station_assignments').insert(assignmentRows).catch((asgErr: any) => {
        console.warn('Initial station assignment warning (non-fatal):', asgErr);
      });
    }

    // 11. Return created profile response
    const finalProfile = {
      ...insertedProfile,
      assigned_station_ids: assigned_station_ids || [],
    };

    return new Response(
      JSON.stringify({
        success: true,
        user_id: authUserId,
        profile: finalProfile,
        message: 'تم إنشاء حساب الموظف وملفه الوظيفي بنجاح.',
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Unhandled exception in create-employee Edge Function:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'حدث خطأ خادمي غير متوقع أثناء معالجة الطلب.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
