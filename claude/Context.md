# Context — البنية التقنية

كل الكود في ملف واحد: `MOON-JOURNEY-02-VR.html` (~6.5MB، ~5400 سطر منطق + نماذج base64). Three.js **r128** من cdnjs + GLTFLoader مضمّن يدوياً في أول الملف.

## الأنظمة الرئيسية (بترتيب وجودها في الملف)

| النظام | الوصف |
|--------|-------|
| `GLTFLoader` مضمّن | نسخة r128 كاملة داخل IIFE |
| `language` / `DICT` | ثنائية اللغة ar/en، `language.t(key)`، `language.toggle()` |
| `xapi` | تسجيل أحداث تعلم (initialized/discovered/…) |
| `sm` (state machine) | حالة المراحل: `stageDef/stageState/markDiscovery/performStep/nextLesson/answerQuiz/advance/canAdvance` — **`markDiscovery` يرفض قبل إتمام الدرس (locked)** |
| `audio` | أصوات مولدة (click/chime/error/success/boom/countdown/rumble + ambient) |
| `MDL_*` base64 | النماذج المضمنة: `MDL_SLS/SRBL/SRBR/LAS/CORE/ICPS/ORION` (عتاد حديث من المستخدم) + `MDL_LANDER/MOONFLOOR` (سطح القمر: لاندر + أرضية منحوتة 36×36م فيها الفوهة/البحر/الريغوليث) + `MDL_MOON` (LRO). تُفك في `loadModels()` → `MODELS.*` |
| `MAT_TINTS` / `applyMatTints` | إصلاح ألوان مواد بالاسم بعد التحميل (`Mat_Mare`/`Mat_Lunar_Floor`/`Mat_LM_Gold_Foil`/`Mat_Dark_Nozzle`) — ملفات GLB الأصلية تُركت كما سلّمها المستخدم. **و`Mat_Invisible_Trigger` يُجعل شفافاً بالكود** (opacity 0 + transparent) لأن `visible=false` كان سيعطّل الـ raycast على التريغرات |
| `app` | الحالة العامة: renderer، camera، **player (rig)**، controllers، raycaster، anim[]، stepTargets[]، **actionTargets[]**، hud{} |
| `initGL()` | renderer + rig + كنترولرز (ray+tip) + `initHudPanels()` + `addVRButton()` |
| `addVRButton()` | زر ENTER VR: معطل حتى `loadModels` يخلص، يطلب الجلسة، وأول دخول ناجح يستدعي `start()`. فيه `runDiagnostics()` يعرض تشخيص WebXR كامل على الشاشة عند أي فشل |
| لوحة المعصم | إحداثيات منطقية 512×400 لكن الكانفس يرسم بدقة مضاعفة (1024×800 مع `ctx.scale(2,2)` — لا تغيّر الإحداثيات المنطقية، الوضوح يجي من دقة التكستشر) → `CanvasTexture` على plane 0.21×0.164م بيد **يسرى** (تُكشف بـ handedness من حدث `connected`). أوضاع: stage/lesson/quiz/cert عبر `app.hud.mode`، أزرار عبر `hitRects` + UV (بالإحداثيات المنطقية)، و`app.hud.blocking` يمنع التفاعل مع المشهد وقت الدرس/الاختبار |
| toast | canvas 512×128 على plane ابن الكاميرا، يختفي بعد 2.8s |
| `handleRaycastHit()` | ترتيب الفحص: **actionTargets ← stepTargets (procedure) ← interactables (discoveries)** |
| `snapPlayerYaw(target)` | يلف الـ rig مرة واحدة ليتطابق اتجاه نظر اللاعب الفعلي مع اتجاه المشهد — يُستدعى عند دخول كل مشهد فقط |
| `freshScene(bg)` | يبني scene جديدة: يصفّر anim/stepTargets/actionTargets/liveStat، يضيف إضاءة افتراضية + نجوم، **ويعيد ربط `app.player` بالمشهد الجديد** |
| `SCENE_BUILDERS[0..4]` | المشاهد الخمسة s1–s5 |
| `tick()` | حلقة الرسم: anim callbacks + baseLookTarget (ديسكتوب فقط، معطل وقت `xr.isPresenting`) + render |

## نقاط دقيقة يسهل كسرها

- **`app.player.position.y = 0` في المشاهد الداخلية** (S2) — طول الرأس الحقيقي يُضاف فوقه مع local-floor. المشاهد الخارجية (S1/S3/S4/S5) مرفوعة عمداً (منصة مشاهدة).
- كل teleport بين المشاهد: `app.player.position.set(...)` + `app.camera.position.set(0,0,0)` + `snapPlayerYaw(...)`.
- **S2 يشيل إضاءة `freshScene` الافتراضية** ويستبدلها بإضاءة معتمة (ambient خافت + point دافئ + cyan fill) — لا تضيف إضاءة عامة له.
- **GROUND CAM** (S2): `WebGLRenderTarget` 256² + كاميرا `downCam` تحت الكبسولة تصوّر `earthG` — التقنية: عطّل `renderer.xr.enabled` → `setRenderTarget(camRT)` → render → رجّع كل شي. طبقة HUD نصية شفافة فوق الشاشة.
- **`updateEarth(alt)`** (S2): الأرض كرة R=180 تبدأ تحت الكبسولة وتبتعد `dist = R + alt^1.6 × 1.1` مع lerp لاتجاه أمامي-سفلي (gravity turn) — النهاية كوكب كامل في الزجاج. الـ sky dome كبيرة (2600) عشان الأرض تبقى جواها.
- **S4 المهام**: متغير `task` (1 مسافة → 2 تصحيح → 3 كبح → 4 مدار). السرعة `dt*0.042`. نافذة الكبح `travel ∈ [0.84, 0.92]` — نقاطها تتلون **أحمر** (أحمر = مكابح، ونصوص التوجيه تقول "النقاط الحمراء" — غيّر الاثنين معاً لو عدّلت اللون). فوات القمر عند 0.97 → إعادة من 0.62. **`award()` لازم يُستدعى قبل تقدم المهمة** (يفشل locked لو الدرس ما خلص). دفعة التصحيح: لهب `startCorrectionBurn()` والمكوك يثبت مكانه ويرتفع حتى `drift=0` ثم `task=3`.
- الكونسول في S2 ينسحب تحت الأرض بعد إتمام الخطوات (anim ينزل `consoleG` ثم يصفّر `stepTargets`).
- **أحداث الانفصال في S2** (`jettison()` داخل s2): بعد طبقة index 1 (ستراتو) ينفصل المعززان، بعد index 3 (ثيرمو) برج الهروب، وعند المدار المرحلة الأساسية — الـ toast مؤجل ~3s حتى لا يطمس toast الاكتشاف (لوحة toast واحدة).
- **مناطق S1** مضبوطة بالنسب المئوية من ارتفاع نموذج SLS (مقاسة من لقطة شاشة فعلية): محركات 0–7% r=0.62، مرحلة أساسية 8–67% r=0.42، معززان أسطوانتان r=0.28 عند x=±0.75 من 0.5–63%، القسم العلوي 69–100%. **الأنصاف مضبوطة بحيث لا تتقاطع الأسطوانات أبداً** — أي تداخل هندسي بين colliders يخلي الراي يصيب "المنطقة الغلط" (حصلت وانصلحت). `bandCyl()` مرتين لنفس المفتاح آمن (تكرار الليبل يمنعه `_labeledKeys`).
- **`pulse()` فيها حارس `_pulsing`** — بدونه الضغط المتكرر وسط النبضة يلتقط الحجم المتضخم كأساس ويكبر الأوبجكت/الليبل تدريجياً مع كل ضغطة (باغ حقيقي انصلح).
- **`hudButton` يعمل `ctx.save()/restore()`** — أي دالة رسم مشتركة على كانفس اللوحة لازم تحفظ/ترجع حالة الـ ctx؛ تسريب `textAlign='center'` منها كان يقصّ بدايات كل سطور اللوحة (باغ حقيقي انصلح 2026-07-08). الهامش الداخلي padX=34 وعرض اللف HUD_W−68.
- **نافذة S2 دائرية** (porthole): bulkhead `RingGeometry(0.85, 3.4)` + إطار torus + حلقة توهج + 8 براغي، بنفس موضع/ميلان الإطار القديم (0, 1.62, −1.55 / rot.x −0.42).
- **S5**: أرضية `MODELS.moonfloor` وحدة (أوفستها صفر — ما تحتاج recenter)، الاكتشافات على أوبجكتات `Trigger_Crater/Mare/Regolith` بالاسم، مواقع الجولة الموجهة تُقرأ ديناميكياً من مواضع التريغرات (لو تحركت في Blender الجولة تتبعها)، واللاندر على منطقة الهبوط عند (0,0).
- **إزاحات GLB الداخلية**: رقع سطح القمر (وأي GLB من Blender بدون تصفير transforms) تحمل مواضع مشهد Blender — `placePatch()` في s5 يعيد التمركز من Box3 قبل الوضع. **حجم النموذج المحمّل ≠ حدود accessors** (نموذج SLS: 50 وحدة في الهيدر لكن 86.25 محمّلاً بسبب node scales) — قِس دايماً بـ Box3 وقت التشغيل.
- `labelPlate(text,w,h,bg,fg)` لوحات نص قابلة للضغط، فيها `userData.repaint(color)` لإعادة الرسم بعلامة ✓.
- **أدوات معاينة النماذج**: viewer.html + shot.js (Playwright headless + سيرفر محلي + مسطرة نسب مئوية) — كانت في scratchpad الجلسة `sls-viewer/`؛ أعد بناءها عند الحاجة: صفحة تحمّل GLB وتصوّره بكاميرا front/angle مع خطوط كل 10% من الارتفاع.

## النشر

- Vercel CLI v50 مثبت. مشروع `moon-vr-deploy` (staging folder بأي مكان فيه `.vercel/project.json`؛ المجلد الحالي في scratchpad الجلسة — لو ضاع، أعد الربط بـ `vercel link` أو انشر بمجلد جديد وسمّ المشروع نفسه).
- الرابط الثابت: https://moon-vr-deploy.vercel.app — عام بدون حماية (مطلوب للنظارة).
- لا يوجد git repo في مجلد المشروع حالياً (انتبه: الـ home directory فيه repo عام آخر — لا تسوي git init/commit هنا بدون طلب).
