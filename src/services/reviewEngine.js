'use strict';

// ===========================================================================
// reviewEngine.js — Fasa 7B: Review & Quality Assurance (READ-ONLY)
//
// Semakan rule-based terhadap setiap panel: Script + Visual + Prompt + Face
// Policy. TIADA AI, TIADA penjanaan, TIADA pengubahan data.
//
// reviewPanel(...) memulangkan:
//   { panel_id, qa_status, ready_for_image, noble, checklist, issues }
//   qa_status : 'ok' | 'warning' | 'error'
//   issues    : [ { type: 'error'|'warning', message } ]
// ===========================================================================

const { BUBBLE_TYPES, EMOTIONS } = require('./scriptEngine');

// Penanda yang DIJANA enjin (visual_notes dalam BM; prompt/negative dalam EN).
const NOTE_MARKERS_MS = ['wajah tidak dipaparkan', 'cahaya lembut', 'tiada mata', 'tiada hidung', 'tiada mulut'];
const PROMPT_MARKERS_EN = ['face fully replaced by soft glowing light', 'no facial features', 'no eyes', 'no nose', 'no mouth', 'respectful islamic depiction'];
const NEG_MARKERS_EN = ['visible face', 'facial features', 'realistic prophet face', 'disrespectful depiction'];

// Medan visual yang WAJIB tidak kosong (Visual Review).
const VISUAL_REQUIRED = ['shot', 'angle', 'lens', 'lighting', 'composition', 'atmosphere', 'weather', 'depth', 'focus'];

function lc(v) { return String(v === undefined || v === null ? '' : v).toLowerCase(); }
function nonEmpty(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }
function hasAll(text, markers) {
  const t = lc(text);
  for (var i = 0; i < markers.length; i++) if (t.indexOf(markers[i]) === -1) return false;
  return true;
}

function isNoblePanel(codes, visual, charMap) {
  if (visual && visual.face_policy === 'glowing_light') return true;
  for (var i = 0; i < codes.length; i++) {
    var c = charMap[codes[i]];
    if (c && c.character_type === 'noble_figure_no_face') return true;
  }
  return false;
}

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
  const hasLocation = nonEmpty(visual && visual.location) || nonEmpty(scene && scene.location) || nonEmpty(panel.location);
  const hasCaption = nonEmpty(panel.caption_ms) || rows.some(function (s) { return s.script_type === 'caption' && (nonEmpty(s.text_ms) || nonEmpty(s.text_ar)); });
  const hasDialogue = nonEmpty(panel.dialogue_ms) || rows.some(function (s) { return s.script_type === 'dialogue' && (nonEmpty(s.text_ms) || nonEmpty(s.text_ar)); });

  // ---- CHARACTER ----
  if (!hasCharacter) warn('Panel tiada watak.');

  // ---- SCRIPT (warning sahaja; fallback dibenarkan) ----
  if (!hasScript) {
    warn('Panel tiada skrip (fallback dibenarkan).');
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
    warn('Visual belum dijana.');
  } else {
    VISUAL_REQUIRED.forEach(function (f) { if (!nonEmpty(visual[f])) warn('Visual: ' + f + ' kosong.'); });
    if (!nonEmpty(visual.visual_notes)) warn('Visual: visual_notes kosong.');
    if (!nonEmpty(visual.face_policy)) warn('Visual: face_policy kosong.');
  }

  // ---- PROMPT ----
  if (!hasPrompt) {
    warn('Prompt belum dijana.');
  } else {
    if (!nonEmpty(prompt.prompt_text)) warn('Prompt teks kosong.');
    if (!nonEmpty(prompt.negative_prompt)) warn('Negative prompt kosong.');
    if (!hasCharacter) warn('Prompt: tiada watak.');
    if (!hasLocation) warn('Prompt: lokasi tiada.');
    if (!nonEmpty(visual && visual.shot)) warn('Prompt: shot tiada.');
    if (!nonEmpty(visual && visual.composition)) warn('Prompt: composition tiada.');
    if (!nonEmpty(visual && visual.lighting)) warn('Prompt: lighting tiada.');
    if (!nonEmpty(visual && visual.color_palette)) warn('Prompt: color palette tiada.');
  }

  // ---- FACE POLICY (tokoh mulia → ERROR jika gagal) ----
  let faceOk = true;
  if (noble) {
    if (!hasVisual) {
      faceOk = false; err('Tokoh mulia tetapi visual belum dijana.');
    } else {
      if (visual.face_policy !== 'glowing_light') { faceOk = false; err('Tokoh mulia tetapi face_policy bukan glowing_light.'); }
      if (!hasAll(visual.visual_notes, NOTE_MARKERS_MS)) { faceOk = false; err('Tokoh mulia tetapi visual_notes tiada arahan cahaya/tanpa wajah.'); }
    }
    if (hasPrompt) {
      if (!hasAll(prompt.prompt_text, PROMPT_MARKERS_EN)) { faceOk = false; err('Tokoh mulia tetapi prompt tiada arahan glowing light / tanpa wajah.'); }
      if (!hasAll(prompt.negative_prompt, NEG_MARKERS_EN)) { faceOk = false; err('Tokoh mulia tetapi negative prompt tiada sekatan wajah.'); }
    }
  }

  // ---- PROMPT COMPLETE ----
  const promptComplete = hasPrompt && nonEmpty(prompt.prompt_text) && nonEmpty(prompt.negative_prompt) &&
    hasCharacter && hasLocation && nonEmpty(visual && visual.shot) && nonEmpty(visual && visual.composition) &&
    nonEmpty(visual && visual.lighting) && nonEmpty(visual && visual.color_palette) && (!noble || faceOk);

  // ---- READY FOR IMAGE ----
  const hasError = issues.some(function (x) { return x.type === 'error'; });
  const readyForImage = hasScript && hasVisual && hasPrompt && nonEmpty(prompt && prompt.negative_prompt) && (!noble || faceOk) && !hasError;

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
  NOTE_MARKERS_MS,
  PROMPT_MARKERS_EN,
  NEG_MARKERS_EN,
  VISUAL_REQUIRED
};
