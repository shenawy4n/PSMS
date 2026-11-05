# منظومة إدارة محطات الكهرباء (PSMS)
## التقرير الأمني والهندسي الشامل — الهجرة البرمجية 13
### (Migration 13: RLS Exploit Remediation, Audit Integrity & Assignment Isolation)

---

### 1. الملخص التنفيذي (Executive Summary)

تم إنجاز وتوثيق مرحلة الهجرة البرمجية رقم 13 بنجاح داخل مستودع منظومة إدارة محطات الكهرباء (PSMS). تهدف هذه الهجرة إلى إغلاق وسد الثغرات المتبقية التي تم كشفها أثناء المراجعة الدقيقة للهجرة 12، مع الالتزام المطلق بكون هذا الإنجاز محصوراً داخل المستودع البرمجي (Repository-Only) دون أي اتصال أو تنفيذ على بيئة الإنتاج أو قاعدة بيانات Supabase الإنتاجية (`gygksvqqqtjqgcnwfjha`).

تمحورت الهجرة رقم 13 حول ثلاثة أهداف رئيسية عالية الحساسية:
1. **سد ثغرة القفز بين المحطات في المهام (Tasks Station-Hopping Remediation):** إزالة شرط الملكية الفضفاض في سياسات المهام وإلزام التحقق من صلاحية المحطة عبر دالة `user_has_station_access()`، مع تفعيل محفز أمني خادمي `trg_enforce_task_security` يمنع تعديل حقل المنشئ `created_by` أو نقل المهمة إلى محطات قطاعات أخرى.
2. **تحصين نزاهة سجلات التدقيق الأمني (Audit Log Integrity & Non-Repudiation):** منع العميل نهائياً من انتحال هوية الممثل `actor_id` أو تركه فارغاً، وإلزام استخراج البريد من الحساب الموثق، وفرض فحص صلاحية المحطة، وختم التوقيت بساعة الخادم قسرياً، وتوفير دالة RPC أمنية `log_security_event` مسجلة بصلاحيات موثوقة `SECURITY DEFINER`.
3. **عزل وتأمين إسنادات المحطات (Station Assignment Multi-Tenant Isolation):** ترقية دالة `user_has_station_assignment()` للتحقق الإلزامي من نشاط الحساب (`is_active = TRUE`) ومطابقة تبعية المؤسسة، مع تفعيل محفز `trg_enforce_station_assignment_security` لمنع إسناد الموظفين لمحطات خارج نطاق مؤسستهم وضمان ثبات المفاتيح الأساسية.

---

### 2. جرد الثغرات الحرجة المعالجة (Inventory of Remediated Exploits)

#### أ. الثغرة الحرجة (أ): القفز والتهرب بين المحطات في المهام (Tasks Station-Hopping)
- **التشخيص:** في Migration 12، كان شرط التعديل والعرض يحتوي على:
  `(assigned_to = (SELECT auth.uid()) OR created_by = (SELECT auth.uid()))`
  بشكل مجرد في سياسات `UPDATE` و `WITH CHECK`. كان بإمكان المكلف أو المنشئ تنفيذ استعلام تعديل ينقل حقل `station_id` إلى محطة تابعة لمؤسسة أخرى تماماً مع الاحتفاظ بنفسه كمكلف، فيمر الاستعلام دون اعتراض لأن شرط الملكية تحقق!
- **الحل الجذري في Migration 13:**
  1. قصر شرط الملكية المجرد حصرياً على المهام الشخصية المستقلة: `(station_id IS NULL AND (assigned_to = auth.uid() OR created_by = auth.uid()))`.
  2. إلزام فحص صلاحية الوصول للمحطة `public.user_has_station_access(station_id)` في كافة المهام المرتبطة بمحطة.
  3. إنشاء محفز `trg_enforce_task_security` يحظر تعديل `station_id` لغير مدراء النظام العام أو مدراء القطاع المخولين حصراً على كلا المحطتين، ويمنع نهائياً تغيير `created_by`.

#### ب. الثغرة الحرجة (ب): تزوير سجلات التدقيق وانتحال الهوية (Audit Log Forgery & Incomplete Non-Repudiation)
- **التشخيص:** كانت سياسة الإدراج في Migration 12 تسمح بـ `actor_id = (SELECT auth.uid()) OR actor_id IS NULL`، مما فتح المجال للعميل لتمرير سجلات بدون هوية فاعل، أو إرسال بريد إلكتروني زائف `actor_email`، أو تسجيل أحداث لمحطات قطاعات أخرى لا يملك صلاحية عليها.
- **الحل الجذري في Migration 13:**
  1. تعديل سياسة الإدراج لإلزام `actor_id = (SELECT auth.uid())` واشتراط صلاحية المحطة `station_id IS NULL OR user_has_station_access(station_id)`.
  2. إنشاء محفز `trg_enforce_audit_log_integrity` يفحص مطابقة `actor_id` للجلسة الموثقة، ويشتق `actor_email` مباشرة من جدول `profiles` خادمياً، ويختم `created_at = NOW()`.
  3. بناء وتوفير دالة إجراء مخزن `public.log_security_event()` كواجهة آمنة ومعيارية لتسجيل العمليات التشغيلية دون تمكين العميل من صياغة الحقول الحساسة يدوياً.

#### ج. الثغرة الحرجة (ج): عزل إسنادات المحطات (Station Assignment Isolation Defect)
- **التشخيص:** كانت دالة `user_has_station_assignment()` تفحص فقط وجود سجل نشط في `station_assignments` للمستخدم والمحطة دون التحقق من حالة الحساب في `profiles`، ودون فحص ما إذا كانت المحطة تتبع مؤسسة مطابقة للمستخدم، مما قد يسمح للحسابات المعطلة أو الإسنادات الشاذة العابرة للمؤسسات بتجاوز RLS.
- **الحل الجذري في Migration 13:**
  1. ترقية دالة `user_has_station_assignment()` لتتحقق أولاً من `is_active = TRUE` للمستخدم، ووجود المحطة، وتطابق `organization_id` بين المحطة والمستخدم.
  2. تحصين محفز `trg_enforce_station_assignment_security` لمنع إدراج أي إسناد لموظف معطل، أو لموظف تابع لمؤسسة تختلف عن مؤسسة المحطة، مع فرض ثبات كامل لمعرفات `station_id` و `user_id` عند التعديل.

---

### 3. جدول جرد السياسات الشامل (Complete RLS Inventory)

| الجدول المستهدف | العملية | السياسة بعد Migration 12 | السياسة المحصنة في Migration 13 | تقييم الأمان والمطابقة |
|:---|:---|:---|:---|:---:|
| `public.tasks` | `SELECT` | سمحت بالملكية المجردة مع احتمالية تسريب مهام المحطات | حصر شرط الملكية المجرد بالمهام الشخصية (`station_id IS NULL`) واشتراط `user_has_station_access` لمهام المحطات | محصن تماماً ضد التسريب |
| `public.tasks` | `INSERT` | سمحت بإدراج مهام من المشرفين والمكلفين | إلزام `user_has_station_access` ومطابقة المؤسسة ومحفز فرض `created_by = auth.uid()` | محصن ضد التزييف |
| `public.tasks` | `UPDATE` | احتوت على ثغرة القفز بين المحطات عبر شرط الملكية المجرد | مطابقة صارمة بين `USING` و `WITH CHECK`، إلزام صلاحية المحطة، ومحفز لمنع تعديل المحطة لغير الإداريين | محصن ضد Station-Hopping |
| `public.tasks` | `DELETE` | مقتصرة على مدير النظام العام | السماح لمدير النظام ومدير القطاع والمشرف على محطته ومنشئ المهمة الشخصية، مع حماية المهام الحساسة | متوازن ومحصن |
| `public.audit_logs` | `SELECT` | مقيدة بمدراء القطاع حسب مؤسستهم ولمدير النظام | كما هي (سليمة ومحصنة) | محصن |
| `public.audit_logs` | `INSERT` | `actor_id = auth.uid() OR actor_id IS NULL` | سياسة محصنة تشترط `actor_id = auth.uid()` وصلاحية المحطة، مدعومة بمحفز تكاملي | محصن ضد انتحال الهوية |
| `public.audit_logs` | `UPDATE` | غير موجودة نهائياً | غير موجودة نهائياً (حظر قطعي للتعديل) | سجلات ثابتة (Immutable) |
| `public.audit_logs` | `DELETE` | غير موجودة نهائياً | غير موجودة نهائياً (حظر قطعي للحذف) | سجلات غير قابلة للحذف |
| `public.station_assignments` | `INSERT/UPDATE` | معتمدة على سياسات 11 و 12 | إضافة محفز `trg_enforce_station_assignment_security` لمنع الإسنادات العابرة وتجميد المفاتيح | عزل مؤسسي صارم |

---

### 4. الملفات المضافة والمعدلة (Added & Modified Files)

1. **الملفات المضافة (New Files):**
   - `supabase/migrations/13_rls_exploit_remediation_and_audit_integrity.sql`: ملف الهجرة البرمجية رقم 13 المتضمن لسد الثغرات وإعادة تعريف الدوال والمحفزات والسياسات.
   - `src/test/migration_13_rls_exploit_remediation.test.ts`: جناح اختبارات شامل يغطي 27 سيناريو للتحقق السلوكي والساكن من تحصينات Migration 13 وأداة تدقيق السياسات.
2. **الملفات المعدلة والمحسنة:**
   - `scripts/audit_policies.cjs`: ترقية الأداة بخوارزمية تعقب الأقواس المتوازنة واستبعاد التعليقات والنصوص البرمجية بدقة تامة ورصد الأخطاء الفادحة.
   - بقاء ملفات الهجرة السابقة من `01` إلى `12` مصونة ودون أي تعديل تاريخي رجعي.

---

### 5. التفصيل التقني لملف الهجرة 13 (Migration 13 Technical Structure)

- **الأسطر 1 - 25:** توثيق الغرض والمحاور الأمنية الثلاثة.
- **الأسطر 27 - 99:** ترقية دالة `user_has_station_assignment(UUID)` لفرض التحقق من نشاط المستخدم واستبعاد الحسابات المعطلة، والتحقق من وجود المحطة ومطابقة تبعيتها لمؤسسة المستخدم.
- **الأسطر 101 - 207:** إنشاء دالة ومحفز `enforce_station_assignment_security()` على جدول `station_assignments` لتأكيد ثبات `station_id` و `user_id` ومنع إسناد موظف لمحطة مؤسسة أخرى.
- **الأسطر 209 - 310:** إنشاء دالة ومحفز `enforce_task_security()` على جدول `tasks` لفرض ثبات `created_by`، والتحقق من صلاحية المحطة، وحظر قفز المحطات لغير الإداريين.
- **الأسطر 312 - 455:** إسقاط وإعادة إنشاء السياسات الأمنية الأربع على جدول `tasks` (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) مع المطابقة الصارمة بين `USING` و `WITH CHECK`.
- **الأسطر 457 - 518:** إنشاء دالة ومحفز `enforce_audit_log_integrity()` على جدول `audit_logs` لحظر التزوير والاشتقاق الخادمي للبريد الإلكتروني والختم الزمني بساعة السيرفر.
- **الأسطر 520 - 580:** دالة RPC الآمنة `log_security_event()` الموثوقة بصلاحيات `SECURITY DEFINER` ومقيدة الاستدعاء بـ `authenticated`.
- **الأسطر 582 - 605:** تحديث سياسة إدراج سجلات التدقيق لتلزم مطابقة `actor_id = auth.uid()` مع خلو الجدول التام من أي سياسات تعديل أو حذف.

---

### 6. تحصين الدوال المساعدة والمحفزات الأمنية (Hardened Helpers & Triggers)

```sql
-- عينة من تحصين دالة فحص إسناد المحطة لمنع التجاوز العابر للمؤسسات
IF v_station_org IS NOT NULL THEN
    IF v_user_org IS NULL OR v_user_org != v_station_org THEN
        RETURN FALSE; -- حظر قطعي لأي إسناد شاذ عابر للمؤسسات
    END IF;
END IF;
```

```sql
-- عينة من محفز منع القفز بين المحطات في المهام
IF NEW.station_id IS DISTINCT FROM OLD.station_id THEN
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Security violation: Only authorized station administrators can reassign task stations.';
    END IF;
    IF OLD.station_id IS NOT NULL AND NOT public.station_belongs_to_user_org(OLD.station_id) THEN
        RAISE EXCEPTION 'Security violation: Cannot reassign task from an unauthorized station.';
    END IF;
    IF NEW.station_id IS NOT NULL AND NOT public.station_belongs_to_user_org(NEW.station_id) THEN
        RAISE EXCEPTION 'Security violation: Cannot reassign task to an unauthorized station.';
    END IF;
END IF;
```

---

### 7. بنية أمان المهام ومنع القفز بين المحطات (Tasks Security Architecture)

1. **المهام الشخصية (Personal Tasks):** عندما يكون `station_id IS NULL`، يقتصر الوصول والتعديل والإدراج على منشئ المهمة والمكلف بها.
2. **مهام المحطات (Station-Linked Tasks):** تشترط دوماً وأبداً تحقق `public.user_has_station_access(station_id)` في عمليتي القراءة والتعديل، مما يقطع الطريق على أي محاولة لتمرير استعلام استناداً لمجرد كونه مكلفاً بالمهمة.
3. **تغيير محطة المهمة:** مقصور خادمياً على مدراء النظام العام ومدراء القطاع المالكين للمحطتين (القديمة والجديدة) معاً.

---

### 8. بنية نزاهة التدقيق ودالة التسجيل الموثوقة (Audit Non-Repudiation Architecture)

1. **استحالة الانتحال:** لا يمكن لأي مستخدم تسجيل حدث باسم مستخدم آخر لأن المحفز يفحص فوراً `NEW.actor_id != auth.uid()`.
2. **استحالة إخفاء الهوية:** يرفض المحفز وقاعدة البيانات أي قيمة فارغة `NULL` في حقل `actor_id` قادمة من العميل.
3. **موثوقية البريد:** يتم استخراج `actor_email` مباشرة من سجل الحساب في `profiles` خادمياً، متجاهلاً أي بريد قد يحاول العميل تمريره في الطلب.
4. **توقيت الخادم الموثوق:** يتم الكتابة فوق حقل `created_at` بقيمة `NOW()` لحرمان العميل من التلاعب بتاريخ الحدث.
5. **دالة `log_security_event()`:** واجهة الإدخال المعتمدة لتسجيل الأحداث الأمنية دون التعاطي المباشر مع جداول النظام.

---

### 9. العزل المتعدد للمستأجرين في إسناد المحطات (Station Assignment Isolation)

- تم حظر إنشاء أي إسناد في جدول `station_assignments` يربط بين موظف ينتمي للمؤسسة (أ) ومحطة تنتمي للمؤسسة (ب).
- الاستثناء الوحيد هو مدير النظام العام (`super_admin`) الذي يمتلك صلاحيات الإشراف الوطني الشامل.
- تم تجميد معرّفات الربط في السجلات القائمة، بحيث لا يمكن تعديل `station_id` أو `user_id` لسجل قائم؛ ولإجراء أي تغيير يجب إلغاء تفعيل السجل القديم وإنشاء سجل جديد خاضع لكافة شروط التحقق الأمني.

---

### 10. بنية وتطوير أداة تدقيق السياسات (Policy Audit Tool Architecture)

تم تطوير وتحديث الأداة `scripts/audit_policies.cjs` لتتجاوز التعبيرات النمطية البسيطة (Regex) التي قد تفشل عند وجود أقواس متداخلة معقدة مثل:
`((station_id IS NOT NULL AND (assigned_to = (SELECT auth.uid()))) OR ...)`

**الميزات المضافة للأداة:**
- دالة `extractBalanced()` تقوم بمسح الحروف حرفاً بحرف مع تتبع عمق الأقواس بدقة.
- تجاهل التعليقات الخطية (`--`) والكتلية (`/* ... */`) داخل عبارات السياسات.
- تجاهل علامات التنصيص والنصوص المعقدة ومحارف الهروب (`''`).
- تتبع تاريخ إسقاط السياسات (`DROP POLICY`) لضمان تقديم الجرد الحقيقي للسياسات النشطة فقط.
- التوقف الفوري بإرجاع خطأ فادح (`exit code 1`) عند اكتشاف أي سياسة غير متوازنة الأقواس أو فاسدة البنية.

---

### 11. نتائج تنفيذ جناح الاختبارات المؤتمتة (Automated Test Execution)

تم تشغيل كامل أجنحة الاختبارات عبر محرك Vitest، وجاءت النتائج ناجحة بنسبة 100%:

```text
Test Files:  18 passed (18)
Tests:       261 passed (261)
Duration:    5.61s

تفصيل الملفات:
✓ src/test/migration_13_rls_exploit_remediation.test.ts  (27 tests)
✓ src/test/migration_12_rls_and_multi_tenant.test.ts      (21 tests)
✓ src/test/migration_11_authorization_hardening.test.ts   (18 tests)
✓ src/test/employee_creation_and_auth.test.ts             (21 tests)
✓ src/test/password_management.test.ts                    (20 tests)
✓ src/test/centralized_architecture_and_auth.test.ts      (27 tests)
✓ src/test/employee_lifecycle_and_rbac.test.ts            (17 tests)
✓ src/test/production_readiness_patch.test.ts             (15 tests)
✓ src/test/phase2_operations.test.ts                      (13 tests)
✓ src/test/connection_and_responsive_audit.test.ts        (13 tests)
✓ src/test/auth_startup_flow.test.ts                      (13 tests)
✓ src/test/permissions.test.ts                            (12 tests)
✓ src/test/maintenance_and_ptw.test.ts                    (9 tests)
✓ src/test/station_update_and_region.test.ts              (8 tests)
✓ src/test/super_admin_auth.test.ts                       (8 tests)
✓ src/test/fault_and_reading_operations.test.ts            (7 tests)
✓ src/test/validations.test.ts                            (6 tests)
✓ src/test/phase3_station_admin_hardening.test.ts         (6 tests)

التحقق البرمجي الإضافي:
- TypeScript Compilation: $ tsc --noEmit (0 errors)
- Vite Production Build: vite build (Succeeded in 3.65s)
```

---

### 12. توافقية العمليات التشغيلية وواجهة المستخدم العربية (RTL & Operational Compatibility)

- **الواجهة التشغيلية:** لم يطرأ أي مساس بالواجهة العربية أو دعم RTL أو تصاميم النماذج في `src/`؛ التعديلات محصورة بقواعد حماية قاعدة البيانات واختبارات الجودة.
- **سير عمل الموظفين:** يستمر الفنيون والمشرفون في تسجيل القراءات ورفع تقارير الأعطال ومتابعة المهام الموكلة إليهم بشكل طبيعي وسلس دون أي انقطاع.
- **التوافق العكسي:** تم الحفاظ على أسماء الحقول والمخططات دون حذف أي أعمدة، مما يضمن التوافق التام مع الشفرة المصدرية لتطبيق الواجهة الأمامية.

---

### 13. المخاطر المتبقية وضوابط ما قبل النشر (Remaining Risks & Verification Prerequisites)

1. **غياب بيئة PostgreSQL حية معزولة (Lack of Live Disposable PostgreSQL Engine):**
   - تم التحقق من سلامة كافة الاستعلامات والمحفزات والسياسات عبر التحليل الساكن ومحاكاة Vitest السلوكية.
   - لا توفر بيئة التطوير الحالية حاوية Docker أو خادم PostgreSQL حي لتشغيل محرك RLS الفعلي أثناء الاختبارات.
2. **شرط النشر في بيئة الاختبار (Staging Dry-Run Requirement):**
   - يلزم قبل تطبيق Migration 13 على بيئة الإنتاج تنفيذ ملف الهجرة على بيئة تجريبية مطابقة (Staging) ومراقبة سجلات خادم PostgreSQL للتأكد من عدم وجود تعارض مع بيانات تاريخية شاذة.

---

### 14. إقرار السلامة الصارمة للإنتاج (Production Safety Declaration)

نقر ونتعهد بالتزامنا التام بكافة المحددات والقيود الأمنية الصارمة:
- لم يتم الاتصال بقاعدة بيانات الإنتاج أو تشغيل أي أمر استعلام ضد مشروع Supabase `gygksvqqqtjqgcnwfjha`.
- لم يتم تطبيق أو نشر أي هجرة على البيئة السحابية.
- لم يتم التعديل على أي من ملفات الهجرات التاريخية السابقة (01 - 12).
- لم يتم إنشاء أو تعديل أو حذف أي مستخدم في خدمة Supabase Auth.
- لم يتم نشر أو تعديل أي من دوال الحافة (Edge Functions) على السحابة.
- لم يتم تسريب أي مفاتيح أمان أو أسرار أو رموز وصول (Tokens/Secrets).

---

### 15. الحكم الأمني النهائي (Final Verdict)

# الحكم الأمني النهائي: معتمد مع مخاطر غير محققة وقت التشغيل
### (PASS WITH UNRESOLVED RISKS)

**التعليل الهندسي المعتمد:**
تم استيفاء جميع المتطلبات البرمجية والمعمارية بنجاح 100%، وسد ثغرات القفز بين المحطات، وتأمين نزاهة التدقيق، وتطبيق العزل المتعدد للمستأجرين، واجتياز كافة الاختبارات المؤتمتة (261 اختباراً) والتحقق النمطي (TypeScript Lint & Vite Build) بنجاح كامل.
ومع ذلك، ونظراً لكون العمليات قد تمت حصرياً داخل المستودع (Repository-Only) بالاعتماد على الفحص الساكن والمحاكاة المنطقية دون توفر بيئة PostgreSQL حية لاختبار أداء RLS وسلوك المحفزات تحت أحمال تشغيلية حقيقية، فإن المعيار الهندسي الصارم يفرض تصنيف النتيجة بـ **PASS WITH UNRESOLVED RISKS** حتى يتم إجراء اختبار قبول تشغيلي (Runtime Dry-Run) على خادم تجريبي معزول قبل النشر النهائي.
