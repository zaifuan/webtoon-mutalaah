'use strict';

// ===========================================================================
// src/ai/storyDirector.js — Fasa 20: Claude Story Director (Arabic-first)
//
// Otak naratif sistem. SEMUA prompt penaakulan DIBINA SEMULA DARI KOSONG untuk
// Claude — TIDAK menggunakan/menterjemah templat Melayu lama. Bahasa kandungan
// ialah Arab MSA. Bahasa Inggeris HANYA pada Prompt Engine (prompt imej ComfyUI).
//
// Modul ini TIDAK menyentuh DB. Ia hanya:
//   buildMessages(engine, payload) -> [{role:'system'}, {role:'user'}]  (system Arab)
//   parse(engine, rawText, payload) -> objek templat sah (bentuk SAMA dgn engine
//                                      deterministik) ATAU null (isyarat fallback)
//
// Setiap engine MEMILIKI system prompt khusus (character/scene/panel/script/
// visual/prompt/review). Tiada satu prompt gergasi.
//
// PENEMPATAN BAHASA (kerana frontend/export/merge dikunci pada medan *_ms dan
// TIDAK boleh diubah): kandungan Arab ditulis ke medan yang dibaca lapisan
// paparan/eksport — iaitu *_ms untuk tajuk/kapsyen/teks skrip (PDF hanya baca
// *_ms). Medan *_ar dibiar kosong supaya eksport HTML tidak menunjukkan teks
// dua kali. Nama/peranan watak (editor sahaja) guna name_ar utk paparan RTL.
// ===========================================================================

const {
  DEFAULT_STYLE_PRESET, DEFAULT_LANGUAGE, DEFAULT_VERSION,
  NOBLE_PROMPT_LINE, NOBLE_NEGATIVE, BASE_NEGATIVE, styleDescription
} = require('../config/promptStyle');
const { ENUMS } = require('../config/visualDirector');
// Fasa 21: helper konteks padat (DNA watak ringkas, continuity, brief Review).
// Additive — dipanggil secara OPTIONAL; tidak mengubah kontrak buildMessages/parse.
const ctx = require('./contextBuilder');

// ---- Whitelist enum (selaras DB CHECK constraints) -------------------------
const CHARACTER_TYPES = ['ordinary_character', 'noble_figure_no_face', 'background_character'];
const FACE_POLICIES = ['normal', 'glowing_light'];
const SCENE_TYPES = ['intro', 'journey', 'meeting', 'lesson', 'event', 'reveal', 'ending'];
const PANEL_TYPES = ['establishing', 'character', 'dialogue', 'action', 'reaction', 'transition', 'reveal', 'closing'];
const SHOT_TYPES = ['wide', 'medium', 'close_up', 'over_shoulder', 'low_angle', 'high_angle', 'detail'];
const SCRIPT_TYPES = ['narration', 'dialogue', 'thought', 'dua', 'sfx', 'caption', 'reaction'];
const BUBBLE_TYPES = ['speech', 'thought', 'narration', 'dua', 'sfx', 'caption', 'none'];
const EMOTIONS = ['neutral', 'calm', 'solemn', 'sad', 'happy', 'angry', 'fear', 'surprised', 'thinking', 'respectful', 'wonder'];
// Fasa 23: lapisan Narrative Beat (Scene -> Beat -> Panel). Selaras corak
// pemisahan enum sedia ada (setiap fail mengekalkan salinan tempatan sendiri).
const BEAT_TYPES = [
  'orientation', 'question', 'instruction', 'commitment', 'tension_build',
  'incident', 'objection', 'silence', 'reveal', 'reflection', 'dua_moment',
  'farewell', 'transition'
];
const TRANSITION_TYPES = ['none', 'continuous', 'hard_cut', 'contrast', 'escalation', 'release', 'echo'];
// Emosi beat: EMOTIONS sedia ada + tambahan kehalusan lengkung emosi (falsafah pengarahan, Bahagian 2).
const BEAT_EMOTIONS = EMOTIONS.concat(['curiosity', 'anticipation', 'relief']);

// Nota tokoh mulia (Arab) — DIKUATKUASAKAN secara deterministik kemudian.
const NOBLE_NOTE_AR =
  'لا يُظهَر وجه هذه الشخصية المكرّمة؛ يُستبدل الوجه بنور لطيف متوهّج، بلا عينين ولا أنف ولا فم، التزامًا بالأدب الإسلامي في التصوير.';

function s(v) { return (v === undefined || v === null) ? '' : String(v); }
function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}
function pickEnum(v, list, dflt) {
  const x = String(v || '').trim().toLowerCase();
  return list.indexOf(x) !== -1 ? x : dflt;
}
function jstr(obj) { try { return JSON.stringify(obj); } catch (e) { return '{}'; } }
function asArray(v) { return Array.isArray(v) ? v : []; }

// Ekstrak objek/array JSON daripada teks model (toleran terhadap pembungkus).
function extractJson(text) {
  if (!text) return null;
  const t = String(text).trim();
  try { return JSON.parse(t); } catch (e) { /* cuba ekstrak */ }
  // Buang pagar kod ```json ... ```
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) { /* teruskan */ } }
  // Cari objek/array pertama yang seimbang secara kasar.
  const obj = t.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch (e) { /* teruskan */ } }
  const arr = t.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch (e) { return null; } }
  return null;
}

// Senaraikan kod+nama watak untuk konteks (kekalkan ID kanonik).
function charsBrief(characters) {
  const list = asArray(characters);
  return list.map(function (c) {
    return {
      code: c.character_code || c.code,
      name: c.name_ms || c.name_ar || c.name || c.code,
      type: c.character_type || c.type,
      face_policy: c.face_policy,
      role: c.role || '',
      visual_dna: c.visual_dna || {}
    };
  }).filter(function (c) { return c.code; });
}

// ===========================================================================
// SYSTEM PROMPTS (Arab MSA) — dibina khusus untuk Claude.
// ===========================================================================
const COMMON_RULES_AR =
  'أنت المخرج القصصي والمحرّر التربوي لإنتاج «ويبتون» تعليمي إسلامي مأخوذ من نص «المطالعة» العربي. ' +
  'اعمل بالعربية الفصحى الحديثة المناسبة للكتب التعليمية. لا تخترع أحداثًا أو أسماءً أو وقائع ليست في النص المصدر. ' +
  'التزم الأدب الإسلامي: الأنبياء والرسل وبعض الصحابة شخصيات مكرّمة لا يُظهَر وجهها (يُستبدل بنور لطيف). ' +
  // Fasa 21: konsistensi & continuity.
  'حافظ على اتساق الشخصيات: كل شخصية تحتفظ بسماتها البصرية الثابتة (DNA) ورمزها في كل ظهور، فلا يتغيّر مظهرها أو لباسها بين اللوحات. ' +
  'حافظ على استمرارية المكان والزمان والمزاج بين المشاهد واللوحات المتتالية ما لم ينصّ المصدر على تغيّر. ' +
  'اكتب بإيجاز ودقّة دون حشو، وتجنّب التكرار. ' +
  'أعِد JSON صالحًا فقط، بلا أي نص أو شرح أو علامات تنسيق خارج الـ JSON.';

const SYS = {
  character:
    COMMON_RULES_AR + '\n' +
    'مهمتك: استخرج كل الشخصيات من النص. لكل شخصية: رمز ثابت بالإنجليزية بصيغة NAME_001 ' +
    '(مثل MUSA_001, KHIDR_001, YUSHA_001) لا يتغيّر، واسم عربي، ودور موجز بالعربية، ونوع، وسياسة الوجه، ' +
    'و"visual_dna" (وصف بصري ثابت للاتساق: gender, age, height, robe, turban, staff... إلخ). ' +
    'هذا الـ DNA هو ما يضمن ظهور الشخصية بالشكل نفسه في كل لوحة، فاجعله دقيقًا ومستقرًا. ' +
    'النوع (character_type) أحدها فقط: ' + CHARACTER_TYPES.join(' | ') + '. ' +
    'الأنبياء/الرسل/الصحابة المكرّمون = noble_figure_no_face و face_policy = glowing_light. ' +
    'الناس العاديون = ordinary_character (face_policy=normal). الجماعات/الخلفية = background_character.\n' +
    'أعِد: {"characters":[{"character_code":"","name_ar":"","character_type":"","role":"","face_policy":"","appearance_notes":"","visual_dna":{},"canonical_character":true}]}',

  scene:
    COMMON_RULES_AR + '\n' +
    'مهمتك: قسّم القصة إلى مشاهد مرتّبة منطقيًا حسب تسلسل النص. لكل مشهد: عنوان عربي، وملخّص عربي، ' +
    'وهدف تربوي/سردي، ومزاج، ومكان (بالعربية)، ونوع المشهد، والشخصيات الحاضرة (بالرموز الثابتة). ' +
    'اجعل المشاهد متّسقة سرديًا: كل مشهد يبني على ما قبله، والمكان والزمن يتطوّران تدريجيًا. ' +
    'نوع المشهد (scene_type) أحدها: ' + SCENE_TYPES.join(' | ') + '. استخدم رموز الشخصيات المعطاة فقط.\n' +
    'أعِد: {"scenes":[{"scene_no":1,"title_ar":"","summary_ar":"","objective_ar":"","mood":"","location":"","scene_type":"","characters":["CODE"]}]}',

  beat:
    COMMON_RULES_AR + '\n' +
    'مهمتك: قسّم المشهد المعطى إلى وحدات درامية متتالية تسمى "اللقطات السردية" (Narrative Beats) — من 2 إلى 6 لقطات لكل مشهد. ' +
    'كل لقطة سردية تمثّل وظيفة درامية واحدة واضحة (وليست لقطة كاميرا)، ويجب أن تُغيّر شيئًا: عاطفة القارئ، أو فهمه، أو العلاقة بين الشخصيات. ' +
    'لا تُنشئ لقطة سردية بلا وظيفة واضحة. اجعل شدة التوتر (tension_level) تتصاعد أو تهبط بمنطق درامي عبر تسلسل اللقطات داخل المشهد، ' +
    'وإذا تكرر حدث مشابه عبر عدة مشاهد متتالية (كاعتراضات متكررة)، اجعل شدته تتصاعد تدريجيًا وليست متساوية. ' +
    'حدد لكل لقطة عدد اللوحات المقترح كنطاق (حد أدنى وحد أقصى) وليس رقمًا ثابتًا؛ امنح اللقطات الحاسمة (incident, reveal) حدًا أدنى أعلى، ' +
    'وامنح لقطات الهدوء والانتقال (silence, transition) حدًا أقصى منخفضًا (غالبًا لوحة واحدة). ' +
    'حدد أيضًا كيف ترتبط كل لقطة باللقطة السابقة لها (transition_from_previous) — مثل استمرار المزاج أو تصاعده أو انقطاعه أو تناقضه. ' +
    'نوع اللقطة السردية (beat_type) أحد هذه فقط: ' + BEAT_TYPES.join(' | ') + '. ' +
    'العاطفة (emotion) أحدها: ' + BEAT_EMOTIONS.join(' | ') + '. ' +
    'الانتقال من اللقطة السابقة (transition_from_previous) أحدها: ' + TRANSITION_TYPES.join(' | ') + '.\n' +
    'أعِد: {"beats":[{"beat_no":1,"beat_type":"","purpose":"","emotion":"","tension_level":1,"visual_intent":"","suggested_panel_count":{"min":1,"max":2},"transition_from_previous":"none"}]}',

  panel:
    COMMON_RULES_AR + '\n' +
    'مهمتك: حوّل المشهد إلى لوحات (panels) بصرية متسلسلة. أنت تقرّر عدد اللوحات المناسب (٢ إلى ٦) حسب الحدث، ' +
    'ونوع اللقطة، والتكوين، والحركة، والعاطفة، وتدفّق السرد. لكل لوحة: نوعها، ونوع اللقطة، ووصف بصري عربي، ' +
    'وكابتشن عربي مختصر، والشخصيات الحاضرة (بالرموز). لا تعتمد على قوالب «beat» جاهزة؛ قرّر بصريًا حسب النص. ' +
    'احرص على استمرارية اللباس والسمات بين اللوحات (نفس الـ DNA للشخصية)، وعلى تسلسل مكاني منطقي داخل المشهد. ' +
    'نوع اللوحة (panel_type) أحدها: ' + PANEL_TYPES.join(' | ') + '. ' +
    'نوع اللقطة (shot_type) أحدها: ' + SHOT_TYPES.join(' | ') + '.\n' +
    'أعِد: {"panels":[{"panel_no":1,"panel_type":"","shot_type":"","composition":"","camera":"eye_level","visual_ar":"","caption_ar":"","emotion":"","characters":["CODE"]}]}',

  script:
    COMMON_RULES_AR + '\n' +
    'مهمتك: اكتب نص اللوحة كاملًا بالعربية الفصحى: حوار، وسرد، وكابتشن حسب الحاجة (قد يحتوي عنصرًا واحدًا أو أكثر). ' +
    'لكل عنصر: نوعه، والمتحدّث (بالرمز إن كان حوارًا)، والنص العربي، والعاطفة، ونوع الفقاعة. ' +
    'لا تستخدم نصوصًا مكتوبة مسبقًا، ولا اللغة الملايوية. النصوص القرآنية تُنقل بدقّة إن وُجدت في المصدر. ' +
    'حافظ على نبرة كل شخصية وثابتة (لا يتغيّر أسلوب الكلام للشخصية نفسها بين اللوحات). ' +
    'نوع العنصر (script_type) أحدها: ' + SCRIPT_TYPES.join(' | ') + '. ' +
    'العاطفة (emotion) أحدها: ' + EMOTIONS.join(' | ') + '. نوع الفقاعة (bubble_type) أحدها: ' + BUBBLE_TYPES.join(' | ') + '.\n' +
    'أعِد: {"scripts":[{"script_type":"","speaker_code":"","text_ar":"","emotion":"","bubble_type":""}]}',

  visual:
    COMMON_RULES_AR + '\n' +
    'مهمتك (مدير التصوير): حدّد المعالجة البصرية للوحة لمساعدة محرّك الـ prompt. القيم من القوائم المسموحة فقط ' +
    '(بالإنجليزية كرموز تقنية، وليست لغة بشرية). أضف "visual_notes" موجزة بالعربية. ' +
    'وازن بين اختياراتك وبين استمرارية المكان والمزاج الواردة من المشهد السابق حتى لا تتغيّر الإضاءة أو الطقس بلا سبب سردي. ' +
    'إذا حضرت شخصية مكرّمة فاجعل face_policy=glowing_light.\n' +
    'القيم المسموحة: shot=' + ENUMS.shot.join('/') + '؛ angle=' + ENUMS.angle.join('/') + '؛ lens=' + ENUMS.lens.join('/') +
    '؛ composition=' + ENUMS.composition.join('/') + '؛ camera_movement=' + ENUMS.camera_movement.join('/') +
    '؛ lighting=' + ENUMS.lighting.join('/') + '؛ atmosphere=' + ENUMS.atmosphere.join('/') +
    '؛ time_of_day=' + ENUMS.time_of_day.join('/') + '؛ weather=' + ENUMS.weather.join('/') +
    '؛ color_palette=' + ENUMS.color_palette.join('/') + '؛ focus=' + ENUMS.focus.join('/') +
    '؛ depth=' + ENUMS.depth.join('/') + '؛ detail_level=' + ENUMS.detail_level.join('/') +
    '؛ visual_priority=' + ENUMS.visual_priority.join('/') + '.\n' +
    'أعِد: {"visual":{"shot":"","angle":"","lens":"","composition":"","camera_movement":"","lighting":"","atmosphere":"","time_of_day":"","weather":"","color_palette":"","focus":"","depth":"","detail_level":"","visual_priority":"","face_policy":"","visual_notes":""}}',

  // PROMPT ENGINE: مُخرَج إنجليزي فقط (لِـ ComfyUI). لا عربية ولا ملايوية ولا رموز داخلية.
  // Fasa 21: struktur profesional (subject → camera → lighting → style) + quality tags
  // SDXL/Flux + vertical aspect + character consistency + noble-figure safety.
  prompt:
    'You are the Image Prompt Director for an Islamic educational webtoon rendered by a Stable Diffusion model (SDXL / Flux via ComfyUI). ' +
    'Produce ONE professional ENGLISH image prompt and an ENGLISH negative prompt for the given panel. ' +
    'English ONLY — never include Arabic, Malay, internal character codes (e.g. MUSA_001), placeholders, or commentary in the prompt.\n' +
    'STRUCTURE the positive prompt as a clear flow: [subject & action] → [camera: shot/angle/lens] → [composition] → [lighting & atmosphere] → [environment & weather] → [clothing: modest historical] → [style & quality]. ' +
    'Lead with the concrete subject and what it is doing; keep it vertical webtoon framing (tall aspect, portrait orientation). ' +
    'Apply the character DNA given in the context so the SAME character looks identical across panels (age, robe color, headwear, props). ' +
    'For noble figures (prophets/righteous): the face MUST be fully replaced by soft glowing light — no eyes, nose, mouth, or facial features; reflect this in the negative prompt too.\n' +
    'Append concise quality/render tags suited to SDXL/Flux (e.g. highly detailed, sharp focus, clean line art, cinematic lighting, professional illustration), but do NOT pad with redundant words or repeat instructions. ' +
    'Do NOT invent characters or story facts beyond the provided context.\n' +
    'Reply with ONLY valid JSON: {"prompt_text":"","negative_prompt":""}',

  review:
    COMMON_RULES_AR + '\n' +
    'مهمتك (المراجعة): افحص اتساق الشخصيات والمكان والزمن، وصحّة الوقائع، وسلامة الحوار والوصف البصري، ' +
    'والتزام تصوير الشخصيات المكرّمة. صنّف الحالة، واذكر المشكلات بإيجاز بالعربية، واقترح تصحيحًا إن لزم.\n' +
    'qa_status أحدها: ok | warning | error.\n' +
    'أعِد: {"qa_status":"ok","issues":[],"notes":""}'
};

// ===========================================================================
// USER MESSAGE BUILDERS — konteks ringkas (Arab/JSON) untuk setiap engine.
// Fasa 21: guna contextBuilder (DNA ringkas, continuity, brief) supaya setiap
// Director menerima konteks padat & konsisten → kurang token + konsistensi watak
// + continuity lokasi/masa. Bentuk JSON output (instruksi) TIDAK berubah.
// ===========================================================================
function userFor(engine, payload) {
  const p = payload || {};
  switch (engine) {
    case 'character':
      return 'النص المصدر (عربي):\n' + s(p.text_ar) + '\n\nاستخرج كل الشخصيات بصيغة JSON المطلوبة.';
    case 'scene':
      return 'النص المصدر (عربي):\n' + s(p.text_ar) +
        '\n\nالشخصيات المتاحة (استخدم رموزها ولا تخترع رموزًا جديدة): ' + jstr(ctx.charsBrief(p.characters)) +
        '\n\nقسّم القصة إلى مشاهد بصيغة JSON المطلوبة.';
    case 'beat':
      return 'المشهد: ' + jstr({
        scene_no: p.scene && p.scene.scene_no, title_ar: p.scene && (p.scene.title_ar || p.scene.title_ms),
        summary_ar: p.scene && (p.scene.summary_ar || p.scene.summary_ms), mood: p.scene && p.scene.mood,
        location: p.scene && p.scene.location, scene_type: p.scene && p.scene.scene_type,
        characters: asArray(p.scene && p.scene.characters_json)
      }) + '\nالشخصيات: ' + jstr(ctx.charsBrief(p.characters)) +
        '\nاستمرارية من آخر لقطة سردية في المشهد السابق (إن وُجدت): ' + jstr(ctx.continuityFromBeat(p.scene, p.previous_beat)) +
        '\n\nقسّم المشهد إلى لقطات سردية (Narrative Beats) بصيغة JSON المطلوبة.';
    case 'panel':
      return 'المشهد: ' + jstr({
        scene_no: p.scene && p.scene.scene_no, title_ar: p.scene && (p.scene.title_ar || p.scene.title_ms),
        summary_ar: p.scene && (p.scene.summary_ar || p.scene.summary_ms), mood: p.scene && p.scene.mood,
        location: p.scene && p.scene.location, scene_type: p.scene && p.scene.scene_type,
        characters: asArray(p.scene && p.scene.characters_json)
      }) + '\nالشخصيات (DNA ثابت للحفاظ على الاتساق): ' + jstr(ctx.charsBrief(p.characters)) +
        '\n\nحوّل المشهد إلى لوحات بصيغة JSON المطلوبة.';
    case 'script':
      return 'المشهد: ' + jstr({ title: p.scene && (p.scene.title_ar || p.scene.title_ms), mood: p.scene && p.scene.mood, location: p.scene && p.scene.location }) +
        '\nاللوحة: ' + jstr({ panel_no: p.panel && p.panel.panel_no, panel_type: p.panel && p.panel.panel_type, visual: p.panel && (p.panel.visual_ar || p.panel.visual_ms), characters: asArray(p.panel && p.panel.characters_json) }) +
        '\nالشخصيات: ' + jstr(ctx.charsBrief(p.characters)) +
        '\n\nاكتب نص اللوحة بصيغة JSON المطلوبة.';
    case 'visual':
      return 'اللوحة: ' + jstr({ panel_type: p.panel && p.panel.panel_type, shot_type: p.panel && p.panel.shot_type, characters: asArray(p.panel && p.panel.characters_json) }) +
        '\nاستمرارية المكان/المزاج (حافظ عليها ما لم يتغيّر السرد): ' + jstr(ctx.continuityFrom(p.scene, p.panel)) +
        '\nالنص: ' + jstr(ctx.scriptBrief(p.script)) +
        '\nالشخصيات (DNA للحفاظ على الاتساق البصري): ' + jstr(ctx.charsPresent(p.characters, asArray(p.panel && p.panel.characters_json))) +
        '\n\nحدّد المعالجة البصرية بصيغة JSON المطلوبة.';
    case 'prompt':
      return 'Panel context (do not copy codes/Arabic into the prompt):\n' + jstr({
        scene_type: p.scene && p.scene.scene_type, location_hint: p.scene && p.scene.location,
        panel_type: p.panel && p.panel.panel_type, shot: p.visual && p.visual.shot, angle: p.visual && p.visual.angle,
        lens: p.visual && p.visual.lens, lighting: p.visual && p.visual.lighting, atmosphere: p.visual && p.visual.atmosphere,
        composition: p.visual && p.visual.composition, color_palette: p.visual && p.visual.color_palette,
        // DNA ringkas untuk konsistensi watak — tiada kod/komen di prompt akhir.
        characters: ctx.charsPresent(p.characters, asArray(p.panel && p.panel.characters_json)).map(function (c) {
          return { type: c.type, face_policy: c.face_policy, dna: c.dna };
        }),
        emotion: p.script && p.script.emotion
      }) + '\n\nProduce the English image prompt JSON.';
    case 'review':
      // Fasa 21: brief padat (bukan dump penuh) → penjimatan token untuk Review.
      return 'اللوحة (ملخّص): ' + jstr(ctx.panelBrief(p.panel)) +
        '\nالنص: ' + jstr(ctx.scriptBrief(p.script)) +
        '\nالبصري: ' + jstr(ctx.visualBrief(p.visual)) +
        '\nالـ prompt (ملخّص): ' + jstr(ctx.promptBrief(p.prompt)) +
        '\n\nراجِع وأعِد JSON المطلوب.';
    default:
      return jstr(p);
  }
}

function buildMessages(engine, payload) {
  const sys = SYS[engine] || COMMON_RULES_AR;
  return [
    { role: 'system', content: sys },
    { role: 'user', content: userFor(engine, payload) }
  ];
}

// ===========================================================================
// PARSERS / MAPPERS — Claude JSON -> bentuk templat (SAMA dgn engine lama).
// Pulang null jika tidak sah (isyarat fallback deterministik).
// ===========================================================================

// Tentukan tokoh mulia dan kuatkuasakan (deterministik) — JANGAN buang.
function enforceNobleCharacter(c) {
  const noble = c.character_type === 'noble_figure_no_face' || c.face_policy === 'glowing_light';
  if (noble) {
    c.character_type = 'noble_figure_no_face';
    c.face_policy = 'glowing_light';
    if (!s(c.appearance_notes)) c.appearance_notes = NOBLE_NOTE_AR;
  }
  return c;
}

function parseCharacters(json) {
  const arr = asArray(json && json.characters);
  if (!arr.length) return null;
  const out = [];
  const seen = {};
  arr.forEach(function (c) {
    const code = String(c.character_code || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (!code || seen[code]) return;
    seen[code] = true;
    const type = pickEnum(c.character_type, CHARACTER_TYPES, 'ordinary_character');
    const fp = pickEnum(c.face_policy, FACE_POLICIES, type === 'noble_figure_no_face' ? 'glowing_light' : 'normal');
    out.push(enforceNobleCharacter({
      character_code: code,
      name_ar: s(c.name_ar) || code,
      name_ms: '', // Arab-first: medan Melayu dibiar kosong
      character_type: type,
      role: s(c.role),
      face_policy: fp,
      appearance_notes: s(c.appearance_notes),
      visual_dna: (c.visual_dna && typeof c.visual_dna === 'object') ? c.visual_dna : {},
      canonical_character: c.canonical_character !== false
    }));
  });
  return out.length ? out : null;
}

function parseScenes(json) {
  const arr = asArray(json && json.scenes);
  if (!arr.length) return null;
  const out = arr.map(function (sObj, i) {
    const no = clampInt(sObj.scene_no, 1, 999, i + 1);
    const titleAr = s(sObj.title_ar);
    const summaryAr = s(sObj.summary_ar) || s(sObj.objective_ar);
    return {
      scene_no: no,
      // Arab-first: tajuk/ringkasan ke medan paparan/eksport (*_ms), *_ar kosong.
      title_ar: '',
      title_ms: titleAr,
      summary_ms: summaryAr,
      mood: s(sObj.mood),
      location: s(sObj.location),
      source_hint: 'claude:' + (titleAr || ('scene-' + no)),
      scene_type: pickEnum(sObj.scene_type, SCENE_TYPES, 'event'),
      estimated_pages: 1,
      characters_json: asArray(sObj.characters).map(function (x) { return String(x).trim().toUpperCase().replace(/\s+/g, '_'); }).filter(Boolean)
    };
  });
  // scene_no unik & berurutan.
  out.sort(function (a, b) { return a.scene_no - b.scene_no; });
  out.forEach(function (sc, idx) { sc.scene_no = idx + 1; });
  return out.length ? out : null;
}

// Fasa 23: parseBeats — pecahkan satu Scene kepada 2-6 Narrative Beat.
// Beat tanpa 'purpose' (tiada tujuan dramatik) digugurkan (Prinsip Pengarahan #1).
// Kurang daripada 2 beat sah selepas penapisan -> pulang null (isyarat fallback
// deterministik ke sceneEngine.extractBeats). Lebih daripada 6 -> dipotong kepada 6.
function parseBeats(json) {
  const arr = asArray(json && json.beats);
  if (!arr.length) return null;
  let out = arr.map(function (bObj) {
    const raw = (bObj && bObj.suggested_panel_count) || {};
    const min = clampInt(raw.min, 1, 8, 1);
    const max = clampInt(raw.max, min, 8, Math.max(min, 2));
    return {
      beat_type: pickEnum(bObj.beat_type, BEAT_TYPES, 'orientation'),
      purpose: s(bObj.purpose),
      emotion: pickEnum(bObj.emotion, BEAT_EMOTIONS, 'neutral'),
      tension_level: clampInt(bObj.tension_level, 1, 5, 2),
      visual_intent: s(bObj.visual_intent),
      suggested_panel_count: { min: min, max: max },
      transition_from_previous: pickEnum(bObj.transition_from_previous, TRANSITION_TYPES, 'continuous')
    };
  }).filter(function (b) { return !!b.purpose; });

  // Falsafah pengarahan: setiap Scene mempunyai 2-6 beat.
  if (out.length > 6) out = out.slice(0, 6);
  if (out.length < 2) return null;

  out.forEach(function (b, idx) { b.beat_no = idx + 1; });
  return out;
}

function parsePanels(json) {
  const arr = asArray(json && json.panels);
  if (!arr.length) return null;
  const out = arr.map(function (pObj, i) {
    const no = i + 1;
    const captionAr = s(pObj.caption_ar);
    return {
      panel_no: no,
      panel_order: no,
      panel_type: pickEnum(pObj.panel_type, PANEL_TYPES, 'character'),
      shot_type: pickEnum(pObj.shot_type, SHOT_TYPES, 'medium'),
      composition: s(pObj.composition) || null,
      camera: s(pObj.camera) || 'eye_level',
      // Arab-first: vual + kapsyen ke medan paparan/eksport.
      visual_ms: s(pObj.visual_ar),
      action_ms: null,
      emotion_ms: s(pObj.emotion) || null,
      location: s(pObj.location) || null,
      mood: s(pObj.mood) || null,
      characters_json: asArray(pObj.characters).map(function (x) { return String(x).trim().toUpperCase().replace(/\s+/g, '_'); }).filter(Boolean),
      caption_ms: captionAr,   // kapsyen Arab -> caption_ms (dibaca oleh eksport)
      caption_ar: '',
      dialogue_ar: null,
      dialogue_ms: null,
      visual_notes: null,
      needs_image: true
    };
  });
  return out.length ? out : null;
}

function parseScripts(json) {
  const arr = asArray(json && json.scripts);
  if (!arr.length) return null;
  const out = arr.map(function (it, idx) {
    const order = idx + 1;
    const code = String(it.speaker_code || '').trim().toUpperCase().replace(/\s+/g, '_');
    return {
      script_order: order,
      script_type: pickEnum(it.script_type, SCRIPT_TYPES, 'narration'),
      speaker_code: code,
      speaker_name: '', // diisi route daripada peta watak jika perlu
      // Arab-first: teks ke text_ms (PDF/HTML/merge baca text_ms), text_ar kosong.
      text_ar: '',
      text_ms: s(it.text_ar) || s(it.text_ms),
      emotion: pickEnum(it.emotion, EMOTIONS, 'neutral'),
      bubble_type: pickEnum(it.bubble_type, BUBBLE_TYPES, 'narration'),
      reading_order: order,
      status: 'draft',
      notes: ''
    };
  }).filter(function (x) { return s(x.text_ms) || x.script_type === 'sfx'; });
  return out.length ? out : null;
}

function parseVisual(json, payload) {
  const v = json && json.visual;
  if (!v || typeof v !== 'object') return null;
  function en(field, val) { return ENUMS[field] && ENUMS[field].indexOf(String(val || '').toLowerCase()) !== -1 ? String(val).toLowerCase() : null; }
  const out = {
    camera: s(payload && payload.panel && payload.panel.camera) || 'eye_level',
    shot: en('shot', v.shot) || 'medium_shot',
    angle: en('angle', v.angle) || 'eye_level',
    lens: en('lens', v.lens) || 'normal_50mm',
    composition: en('composition', v.composition) || 'centered',
    camera_movement: en('camera_movement', v.camera_movement) || 'static',
    location: s(payload && payload.scene && payload.scene.location) || null,
    weather: en('weather', v.weather) || 'clear',
    time_of_day: en('time_of_day', v.time_of_day) || 'morning',
    lighting: en('lighting', v.lighting) || 'soft_daylight',
    atmosphere: en('atmosphere', v.atmosphere) || 'calm',
    color_palette: en('color_palette', v.color_palette) || 'warm',
    detail_level: en('detail_level', v.detail_level) || 'medium',
    depth: en('depth', v.depth) || 'medium',
    focus: en('focus', v.focus) || 'soft_background',
    visual_priority: en('visual_priority', v.visual_priority) || 'character',
    face_policy: en('face_policy', v.face_policy) || 'normal',
    visual_notes: s(v.visual_notes) || null
  };
  return out;
}

// PROMPT: kuatkuasakan peraturan tokoh mulia + negatif asas secara deterministik.
// Fasa 21: validation pre-ComfyUI — steril prompt (buci token internal/Arab/MB),
// deteksi kebocoran bahasa, penegasan tokoh mulia ketat, batas panjang.
// Pulang null (isyarat fallback deterministik) jika prompt tidak boleh diselamatkan.
function parsePrompt(json, payload) {
  if (!json || typeof json !== 'object') return null;
  let promptText = s(json.prompt_text).trim();
  let negative = s(json.negative_prompt).trim();
  if (!promptText) return null;

  // ---- Sterilisasi: buang token yang TIDAK boleh sampai ke ComfyUI ----
  // (kod watak dalaman MUSA_001, placeholder, tanda pemformatan kurung).
  promptText = promptText
    .replace(/\b[A-Z]{2,}_\d{3}\b/g, '')        // kod watak dalaman (MUSA_001)
    .replace(/\{\{[^}]*\}\}/g, '')              // placeholder {{...}}
    .replace(/```[\s\S]*?```/g, '')             // pagar kod
    .replace(/\s{2,}/g, ' ').trim();

  // ---- Deteksi kebocoran bahasa: prompt EN tidak boleh ada skrip Arab ----
  // (huruf Arab U+0600–U+06FF). Jika bocor teruk → fallback (jangan hantar teks
  // Arab mentah ke model imej).
  const arabic = /[\u0600-\u06FF]/.test(promptText);
  if (arabic) return null;

  // ---- Batas panjang munasabah (ComfyUI/SDXL lebih baik padat) ----
  const MAX = 1200;
  if (promptText.length > MAX) promptText = promptText.slice(0, MAX).replace(/[,;\s]+$/, '').trim();

  // Adakah panel mengandungi tokoh mulia? (daripada visual/charMap)
  const chars = charsBrief(payload && payload.characters);
  const noble = (payload && payload.visual && payload.visual.face_policy === 'glowing_light') ||
    chars.some(function (c) { return c.type === 'noble_figure_no_face' || c.face_policy === 'glowing_light'; });

  if (noble && promptText.toLowerCase().indexOf('glowing light') === -1) {
    promptText = (promptText + ' ' + NOBLE_PROMPT_LINE).trim();
  }
  // Negatif: sentiasa sertakan asas; tambah negatif tokoh mulia jika perlu.
  const base = BASE_NEGATIVE;
  if (noble) negative = (NOBLE_NEGATIVE + ', ' + (negative || base)).replace(/^,\s*/, '');
  if (!negative) negative = base;
  if (negative.toLowerCase().indexOf(base.split(',')[0].trim().toLowerCase()) === -1) negative = negative + ', ' + base;

  return {
    prompt_text: promptText,
    negative_prompt: negative,
    style_preset: DEFAULT_STYLE_PRESET,
    language: DEFAULT_LANGUAGE, // 'en'
    prompt_version: 'v2-claude',
    status: 'ready'
  };
}

function parseReview(json) {
  if (!json || typeof json !== 'object') return null;
  return {
    qa_status: pickEnum(json.qa_status, ['ok', 'warning', 'error'], 'ok'),
    issues: asArray(json.issues).map(function (x) { return s(x); }).filter(Boolean),
    notes: s(json.notes)
  };
}

function parse(engine, rawText, payload) {
  const json = extractJson(rawText);
  if (json === null || json === undefined) return null;
  switch (engine) {
    case 'character': return parseCharacters(json);
    case 'scene': return parseScenes(json);
    case 'beat': return parseBeats(json);
    case 'panel': return parsePanels(json);
    case 'script': return parseScripts(json);
    case 'visual': return parseVisual(json, payload);
    case 'prompt': return parsePrompt(json, payload);
    case 'review': return parseReview(json);
    default: return null;
  }
}

module.exports = {
  buildMessages,
  parse,
  charsBrief,
  extractJson,
  NOBLE_NOTE_AR,
  // enum (untuk ujian/route jika perlu)
  CHARACTER_TYPES, SCENE_TYPES, PANEL_TYPES, SHOT_TYPES, SCRIPT_TYPES, BUBBLE_TYPES, EMOTIONS, FACE_POLICIES,
  BEAT_TYPES, BEAT_EMOTIONS, TRANSITION_TYPES, // Fasa 23: Narrative Beat
  SYS
};
