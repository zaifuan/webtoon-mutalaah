'use strict';

// ===========================================================================
// reviewEngine.js — Fasa 7B / Fasa 22: Review & Quality Assurance (READ-ONLY)
//
// Semakan rule-based terhadap setiap panel: Script + Visual + Prompt + Face
// Policy. TIADA AI, TIADA penjanaan, TIADA pengubahan data.
//
// Fasa 22: peraturan dikemas semula supaya SEPADAN dengan output Claude
// (Arab-first ke medan *_ms, prompt English semula jadi tanpa kod dalaman,
// visual_notes dalam Arab). Penanda literal lama (Melayu/English) diganti
// dengan padanan makna (sinonim Arab + English). Backward-compatible: output
// deterministik lama masih dinilai dengan betul.
//
// reviewPanel(...) memulangkan:
//   { panel_id, qa_status, ready_for_image, noble, checklist, issues }
//   qa_status : 'ok' | 'warning' | 'error'
//   issues    : [ { type: 'error'|'warning', message } ]
//
// Prinsip Error vs Warning (Fasa 22):
//   ERROR hanya perkara yang menghalang image generation:
//     - prompt_text kosong / tiada
//     - visual / script / panel / character hilang
//     - prompt ada kebocoran Arab
//     - noble figure safety tiada langsung
//   WARNING untuk kekurangan ringan (caption/dialogue/location kosong dll).
// ===========================================================================

const { BUBBLE_TYPES, EMOTIONS } = require('./scriptEngine');

// ---- Penanda keselamatan tokoh mulia (per adab Islam: tiada wajah) ---------
// Bentuk MAKSUD, bukan literal tunggal. Lulus jika mana-mana satu hadir.
// Melayu lama (wajah/cahaya/tanpa wajah) + Arab (لا وجه/نور) + English
// semula jadi (face hidden/no facial features/soft glowing light/faceless...).
const NOBLE_POSITIVE_HINTS = [
  // Melayu (output deterministik lama)
  'wajah tidak dipaparkan', 'cahaya lembut', 'tanpa wajah', 'glowing light',
  // Arab MSA (visual_notes Claude kini dalam Arab)
  'لا يُظهَر وجه', 'لا يظهر وجه', 'لا وجه', 'نور لطيف', 'نور متوهّج', 'نور متوهج',
  'بدون وجه', 'بلا وجه', 'بلا عين', 'بلا ملامح', 'توهّج', 'نور',
  // English semula jadi (prompt Claude Inggeris)
  'glowing light', 'soft glowing', 'face hidden', 'faceless', 'no facial features',
  'no face', 'features not visible', 'radiant light', 'divine light', 'obscured face',
  'face obscured', 'no eyes', 'face not shown', 'face fully replaced', 'halo of light'
];

// Penanda negatif (yang MENUNJUKKAN keselamatan dikuatkuasakan).
const NOBLE_NEGATIVE_HINTS = [
  'visible face', 'facial features', 'realistic face', 'realistic prophet',
  'detailed face', 'disrespectful', 'no eyes', 'no nose', 'no mouth', 'no face',
  // Arab: negatif jarang, tetapi sokong
  'لا وجه', 'بدون ملامح'
];

// Medan visual penting (kekurangan = WARNING, bukan error). Set teras sahaja;
// medan lain (angle/lens/dll) bersifat pilihan untuk output padat Claude.
const VISUAL_CORE = ['shot', 'lighting', 'composition'];
// Medan penuh lama — masih disemak sebagai warning ringan jika semua kosong.
const VISUAL_FULL = ['shot', 'angle', 'lens', 'lighting', 'composition', 'atmosphere', 'weather', 'depth', 'focus'];

function lc(v) { return String(v === undefined || v === null ? '' : v).toLowerCase(); }
function nonEmpty(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }
// Benarkan panel tanpa lokasi eksplisit jika scene ada lokasi (inheritance).
function hasLocationAny(visual, scene, panel) {
  return nonEmpty(visual && visual.location) || nonEmpty(scene && scene.location) || nonEmpty(panel && panel.location);
}
// Padanan makna: lulus jika mana-mana hint hadir dalam teks.
function hasAny(text, hints) {
  const t = lc(text);
  if (!t) return false;
  for (var i = 0; i < hints.length; i++) if (t.indexOf(hints[i]) !== -1) return true;
  return false;
}

function isNoblePanel(codes, visual, charMap) {
  if (visual && visual.face_policy === 'glowing_light') return true;
  for (var i = 0; i < codes.length; i++) {
    var c = charMap[codes[i]];
    if (c && (c.character_type === 'noble_figure_no_face' || c.face_policy === 'glowing_light')) return true;
  }
  return false;
}

// Adakah teks Arab? (kebocoran bahasa pada prompt English = masalah).
function hasArabic(text) { return /[\u0600-\u06FF]/.test(String(text || '')); }

// Semak satu panel.
//   panel   : objek panel (characters_json sudah array)
//   scene   : objek babak (atau {})
//   scripts : array baris skrip panel (boleh kosong)
//   visual  : objek visual (atau null)
//   prompt  : objek image_prompt (atau null)
//   charMap : { code: { character_type, face_policy, name_ms } }
function reviewPanel(panel, scene, scripts, visual, prompt, charMap) {
  const codes = Array.isArray(panel.characters_json) ? panel.characters_json : [];
  const rows = Array.isArray(scripts) ? scripts : [];
  const noble = isNoblePanel(codes, visual, charMap);
  const issues = [];
  function err(m) { issues.push({ type: 'error', message: m }); }
  function warn(m) { issues.push({ type: 'warning', message: m }); }

  // ---- kehadiran asas ----
  const hasCharacter = codes.length > 0;
  const hasScript = rows.length > 0;
  const hasVisual = !!visual;
  const hasPrompt = !!prompt;
  const hasLocation = hasLocationAny(visual, scene, panel);
  // Caption/dialogue: Arab-first → kandungan Arab ada dalam *_ms (caption_ms/dialogue_ms/text_ms).
  const hasCaption = nonEmpty(panel.caption_ms) || nonEmpty(panel.caption_ar) ||
    rows.some(function (s) { return s.script_type === 'caption' && (nonEmpty(s.text_ms) || nonEmpty(s.text_ar)); });
  const hasDialogue = nonEmpty(panel.dialogue_ms) || nonEmpty(panel.dialogue_ar) ||
    rows.some(function (s) { return s.script_type === 'dialogue' && (nonEmpty(s.text_ms) || nonEmpty(s.text_ar)); });
  // Kandungan teks apa-apa (visual_ms membawa kandungan Arab untuk panel naratif).
  const hasAnyText = hasCaption || hasDialogue || nonEmpty(panel.visual_ms) ||
    rows.some(function (s) { return nonEmpty(s.text_ms) || nonEmpty(s.text_ar); });

  // ---- CHARACTER (ERROR jika tiada watak langsung — menghalang paparan) ----
  if (!hasCharacter) err('Panel tiada watak.');

  // ---- SCRIPT ----
  if (!hasScript) {
    // Skrip penting untuk konteks, tetapi jika ada teks visual/caption, mungkin
    // panel naratif → warning sahaja, bukan error.
    if (hasAnyText) warn('Panel tiada skrip dalam jadual scripts (teks ada dalam panel).');
    else err('Panel tiada skrip mahupun teks visual/caption.');
  } else {
    const orders = rows.map(function (s) { return Number(s.script_order); }).sort(function (a, b) { return a - b; });
    if (new Set(orders.map(String)).size !== orders.length) warn('Skrip mempunyai susunan (script_order) berganda.');
    var contiguous = true;
    for (var i = 0; i < orders.length; i++) { if (orders[i] !== i + 1) { contiguous = false; break; } }
    if (!contiguous) warn('Susunan skrip tidak berterusan (sepatutnya 1..n).');

    rows.forEach(function (s) {
      if (s.script_type === 'dialogue' && !nonEmpty(s.speaker_code)) warn('Skrip dialog tanpa penutur (speaker_code).');
      if (nonEmpty(s.speaker_code) && !charMap[s.speaker_code]) warn("Skrip: penutur '" + s.speaker_code + "' tidak dikenali.");
      if (!nonEmpty(s.text_ar) && !nonEmpty(s.text_ms)) warn('Terdapat skrip tanpa teks (text_ar & text_ms kosong).');
      if (nonEmpty(s.bubble_type) && BUBBLE_TYPES.indexOf(s.bubble_type) === -1) warn('Skrip: bubble_type tidak sah.');
      if (nonEmpty(s.emotion) && EMOTIONS.indexOf(s.emotion) === -1) warn('Skrip: emotion tidak sah.');
    });
  }

  // ---- VISUAL ----
  if (!hasVisual) {
    err('Visual belum dijana.');
  } else {
    // Medan teras (shot/lighting/composition): warning jika kosong.
    VISUAL_CORE.forEach(function (f) { if (!nonEmpty(visual[f])) warn('Visual: ' + f + ' kosong.'); });
    // Jika SEMUA medan penuh kosong → agak visual tak lengkap.
    const filledCount = VISUAL_FULL.filter(function (f) { return nonEmpty(visual[f]); }).length;
    if (filledCount === 0) warn('Visual: tiada medan sinematografi diisi.');
    if (!nonEmpty(visual.face_policy)) warn('Visual: face_policy kosong.');
    // visual_notes pilihan — jangan error jika kosong (output padat Claude).
  }

  // ---- PROMPT ----
  let promptArabicLeak = false;
  if (!hasPrompt) {
    err('Prompt belum dijana.');
  } else {
    if (!nonEmpty(prompt.prompt_text)) {
      err('Prompt teks kosong.');
    } else {
      // Kebocoran Arab pada prompt English = ERROR (akan rosakkan image gen).
      if (hasArabic(prompt.prompt_text)) { promptArabicLeak = true; err('Prompt mengandungi skrip Arab (kebocoran bahasa).'); }
      // Kod dalaman dalam prompt = warning (sepatutnya dibersihkan).
      if (/[A-Z]{2,}_\d{3}/.test(String(prompt.prompt_text))) warn('Prompt masih mengandungi kod watak dalaman (cth MUSA_001).');
      // Terlalu pendek = warning.
      if (String(prompt.prompt_text).trim().length < 25) warn('Prompt terlalu pendek.');
    }
    if (!nonEmpty(prompt.negative_prompt)) warn('Negative prompt kosong.');
    // Lokasi: lulus jika diwarisi dari scene — jangan error.
    if (!hasLocation) warn('Prompt: tiada maklumat lokasi (panel mahupun scene).');
  }

  // ---- FACE POLICY (tokoh mulia) --------------------------------------------
  // Lulus jika MAKSUD keselamatan hadir di mana-mana: face_policy=glowing_light,
  // ATAU visual_notes/prompty/negative mengandungi hint keselamatan.
  // ERROR hanya jika keselamatan tiada LANGSUNG merentasi semua sumber.
  let faceOk = true;
  if (noble) {
    const vn = (visual && visual.visual_notes) || '';
    const pt = (prompt && prompt.prompt_text) || '';
    const np = (prompt && prompt.negative_prompt) || '';
    const policyOk = visual && visual.face_policy === 'glowing_light';
    const positiveOk = hasAny(vn, NOBLE_POSITIVE_HINTS) || hasAny(pt, NOBLE_POSITIVE_HINTS);
    const negativeOk = hasAny(np, NOBLE_NEGATIVE_HINTS);

    if (!hasVisual) {
      faceOk = false; err('Tokoh mulia tetapi visual belum dijana.');
    } else if (!policyOk && !positiveOk) {
      // Tiada face_policy glowing_light DAN tiada hint positif langsung → bahaya.
      faceOk = false; err('Tokoh mulia: tiada arahan keselamatan wajah (visual_notes / prompt / face_policy).');
    } else if (hasPrompt && !positiveOk && !negativeOk) {
      // Visual OK, tetapi prompt tidak nyatakan keselamatan langsung → warning
      // (boleh diterima jika visual_notes/face_policy sudah mengawal).
      warn('Tokoh mulia: prompt tidak menyebut keselamatan wajah secara nyata.');
    }
  }

  // ---- PROMPT COMPLETE (checklist sahaja; bukan gate error berasingan) ------
  const promptComplete = hasPrompt && nonEmpty(prompt.prompt_text) && nonEmpty(prompt.negative_prompt) &&
    hasCharacter && hasLocation && (!noble || faceOk) && !promptArabicLeak;

  // ---- READY FOR IMAGE ----
  const hasError = issues.some(function (x) { return x.type === 'error'; });
  const readyForImage = hasCharacter && hasScript && hasVisual && hasPrompt &&
    nonEmpty(prompt && prompt.prompt_text) && nonEmpty(prompt && prompt.negative_prompt) &&
    (!noble || faceOk) && !promptArabicLeak && !hasError;

  const qa_status = hasError ? 'error' : (issues.length ? 'warning' : 'ok');

  return {
    panel_id: panel.id,
    qa_status: qa_status,
    ready_for_image: readyForImage,
    noble: noble,
    checklist: {
      character: hasCharacter,
      script: hasScript,
      visual: hasVisual,
      prompt: hasPrompt,
      face_policy: noble ? faceOk : true,
      location: hasLocation,
      caption: hasCaption,
      dialogue: hasDialogue,
      prompt_complete: promptComplete
    },
    issues: issues
  };
}

module.exports = {
  reviewPanel,
  isNoblePanel,
  NOBLE_POSITIVE_HINTS,
  NOBLE_NEGATIVE_HINTS,
  VISUAL_CORE,
  VISUAL_FULL,
  // Kompatibiliti: eksport nama lama supaya import luaran tidak pecah.
  NOTE_MARKERS_MS: ['wajah tidak dipaparkan', 'cahaya lembut', 'tanpa wajah'],
  PROMPT_MARKERS_EN: NOBLE_POSITIVE_HINTS,
  NEG_MARKERS_EN: NOBLE_NEGATIVE_HINTS
};
