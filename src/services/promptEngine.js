'use strict';

// ===========================================================================
// promptEngine.js
// Image Prompt Engine — TANPA AI (template + rule-based + mapping).
// Menggabungkan data panel + visual director + watak + babak menjadi satu
// prompt imej (teks + negative) bagi setiap panel.
// ===========================================================================

const {
  DEFAULT_STYLE_PRESET, DEFAULT_LANGUAGE, DEFAULT_VERSION,
  NOBLE_PROMPT_LINE, NOBLE_NEGATIVE, BASE_NEGATIVE, styleDescription
} = require('../config/promptStyle');

// Frasa kanonik untuk menyemak kehadiran arahan tokoh mulia.
const NOBLE_CANON = 'face fully replaced by soft glowing light';

function rd(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(v).replace(/_/g, ' ').trim();
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

const SCENE_TYPE_EN = {
  intro: 'an opening scene that introduces the setting',
  journey: 'a journey across the landscape',
  meeting: 'a meeting between the main characters',
  lesson: 'a moment of teaching and reflection',
  event: 'a significant event unfolding',
  reveal: 'a moment of revelation',
  ending: 'a closing, reflective scene'
};

const TYPE_EN = {
  noble_figure_no_face: 'a noble figure',
  ordinary_character: 'an ordinary person',
  background_character: 'a background group'
};

function isNobleCode(code, charMap) {
  const c = charMap[code];
  return !!(c && (c.character_type === 'noble_figure_no_face' || c.face_policy === 'glowing_light'));
}

function panelHasNoble(codes, visual, charMap) {
  if (visual && visual.face_policy === 'glowing_light') return true;
  for (var i = 0; i < codes.length; i++) if (isNobleCode(codes[i], charMap)) return true;
  return false;
}

function layoutFor(visual, code) {
  const arr = (visual && Array.isArray(visual.characters_layout)) ? visual.characters_layout : [];
  for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].code === code) return arr[i];
  return null;
}

function propsPhrase(layout, dna) {
  const props = (layout && Array.isArray(layout.props)) ? layout.props.slice() : [];
  const out = [];
  if (props.indexOf('staff') !== -1 || (dna && dna.staff)) out.push('holding a staff');
  if (dna && dna.turban && dna.turban !== 'none') out.push('wearing a turban');
  return out;
}

// Klausa watak bagi satu kod.
function characterClause(code, panel, visual, charMap) {
  const c = charMap[code] || {};
  const dna = c.visual_dna || {};
  const layout = layoutFor(visual, code);
  const typeEn = TYPE_EN[c.character_type] || 'a person';

  if (/_GROUP$/.test(code)) {
    return 'A crowd (' + typeEn + ') fills the background, wearing modest historical clothing.';
  }

  const size = (layout && rd(layout.character_size)) || 'midground';
  const pose = (layout && rd(layout.pose)) || 'standing';
  const facing = (layout && rd(layout.facing)) || 'forward';
  const props = propsPhrase(layout, dna);
  let clause = code + ' (' + typeEn + ') is positioned in the ' + size + ', ' + pose +
    ', facing ' + facing + ', wearing modest historical robes';
  if (props.length) clause += ', ' + props.join(' and ');
  clause += '.';
  return clause;
}

// Pastikan arahan tokoh mulia hadir dalam prompt + negative (untuk jana & edit).
function enforceNoblePrompt(promptText, negativePrompt, isNoble) {
  let pt = promptText || '';
  let np = negativePrompt || '';
  if (!isNoble) return { prompt_text: pt, negative_prompt: np };

  if (pt.toLowerCase().indexOf(NOBLE_CANON) === -1) {
    pt = (pt.trim() + ' ' + NOBLE_PROMPT_LINE).trim();
  }
  if (np.toLowerCase().indexOf('visible face') === -1 ||
      np.toLowerCase().indexOf('realistic prophet face') === -1) {
    np = (NOBLE_NEGATIVE + ', ' + np).trim().replace(/^,\s*/, '');
  }
  return { prompt_text: pt, negative_prompt: np };
}

// Bina prompt lengkap daripada panel + babak + visual + peta watak.
//  panel   : objek panel (characters_json sudah array)
//  scene   : objek babak
//  visual  : objek visual director (characters_layout sudah array) atau {}
//  charMap : { code: { character_type, face_policy, visual_dna(obj) } }
function buildPrompt(panel, scene, visual, charMap) {
  const codes = Array.isArray(panel.characters_json) ? panel.characters_json : [];
  const v = visual || {};
  const noble = panelHasNoble(codes, v, charMap);

  const parts = [];
  parts.push('Create a vertical Islamic educational webtoon panel.');

  // Kamera / pencahayaan / palet.
  const cam = [];
  if (v.shot) cam.push(cap(rd(v.shot)));
  if (v.angle) cam.push(rd(v.angle));
  if (v.lens) cam.push(rd(v.lens) + ' lens');
  if (v.lighting) cam.push(rd(v.lighting));
  if (v.color_palette) cam.push(rd(v.color_palette) + ' color palette');
  if (cam.length) parts.push(cam.join(', ') + '.');

  // Penerangan babak.
  const sceneEn = SCENE_TYPE_EN[scene && scene.scene_type] || 'a narrative scene';
  parts.push('The scene depicts ' + sceneEn + '.');
  if (panel.visual_ms) parts.push('Action (source, Malay): ' + panel.visual_ms);
  if (panel.caption_ms) parts.push('Caption: ' + panel.caption_ms);
  if (scene && scene.location) parts.push('Location: ' + scene.location + '.');

  // Watak + susun atur.
  codes.forEach(function (code) { parts.push(characterClause(code, panel, v, charMap)); });

  // Arahan tokoh mulia (WAJIB).
  if (noble) parts.push(NOBLE_PROMPT_LINE);

  // Suasana.
  if (v.atmosphere) parts.push('The atmosphere is ' + rd(v.atmosphere) + '.');

  // Komposisi / fokus / latar.
  const comp = [];
  if (v.composition) comp.push('composition follows ' + rd(v.composition));
  if (v.focus) comp.push(rd(v.focus));
  if (v.depth) comp.push(rd(v.depth) + ' depth of field');
  if (comp.length) parts.push(cap(comp.join(', ')) + ', detailed historical background.');
  else parts.push('Detailed historical background.');

  // Gaya.
  parts.push(cap(styleDescription(v.style_preset || DEFAULT_STYLE_PRESET)) + '.');

  const promptText = parts.join(' ').replace(/\s+/g, ' ').trim();
  const negative = noble ? (NOBLE_NEGATIVE + ', ' + BASE_NEGATIVE) : BASE_NEGATIVE;

  return {
    prompt_text: promptText,
    negative_prompt: negative,
    style_preset: DEFAULT_STYLE_PRESET,
    language: DEFAULT_LANGUAGE,
    prompt_version: DEFAULT_VERSION,
    status: 'draft'
  };
}

module.exports = {
  buildPrompt,
  enforceNoblePrompt,
  panelHasNoble,
  NOBLE_CANON
};
