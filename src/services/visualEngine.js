'use strict';

// ===========================================================================
// visualEngine.js
// Enjin Visual Director — TANPA AI (dictionary + rule-based + mapping).
// Memetakan setiap panel (+ babak + data watak) kepada satu rekod visual
// lengkap, termasuk kesinambungan watak (character continuity) dan polisi muka.
// ===========================================================================

// Nota WAJIB bagi visual yang mengandungi tokoh mulia (5 pernyataan).
const NOBLE_VISUAL_NOTE =
  'Tokoh mulia dalam panel ini: wajah tidak dipaparkan, diganti cahaya lembut ' +
  'bersinar, tiada mata, tiada hidung, tiada mulut.';

function lc(s) { return String(s || '').toLowerCase(); }

function isSea(text) {
  const t = lc(text);
  return t.indexOf('laut') !== -1 || text.indexOf('بحر') !== -1 ||
         text.indexOf('سفين') !== -1 || t.indexOf('kapal') !== -1;
}
function isVillageOrDesert(text) {
  const t = lc(text);
  return t.indexOf('kampung') !== -1 || text.indexOf('قري') !== -1 ||
         t.indexOf('padang') !== -1 || t.indexOf('bani israel') !== -1 ||
         text.indexOf('كهف') !== -1 || t.indexOf('gua') !== -1;
}

// Pemetaan shot panel (Fasa 4) -> shot/lens/angle visual.
const SHOT_MAP = {
  wide: { shot: 'wide_shot', lens: 'wide_24mm', angle: 'eye_level' },
  medium: { shot: 'medium_shot', lens: 'normal_50mm', angle: 'eye_level' },
  close_up: { shot: 'close_up', lens: 'portrait_85mm', angle: 'eye_level' },
  over_shoulder: { shot: 'over_the_shoulder', lens: 'normal_50mm', angle: 'eye_level' },
  low_angle: { shot: 'full_shot', lens: 'normal_35mm', angle: 'low_angle' },
  high_angle: { shot: 'full_shot', lens: 'normal_35mm', angle: 'high_angle' },
  detail: { shot: 'insert_detail', lens: 'tele_135mm', angle: 'eye_level' }
};
const MOVEMENT_BY_TYPE = {
  establishing: 'crane', character: 'static', dialogue: 'static', action: 'tracking',
  reaction: 'static', reveal: 'dolly_in', closing: 'dolly_out', transition: 'pan'
};
const COMPOSITION_BY_TYPE = {
  establishing: 'rule_of_thirds', character: 'centered', dialogue: 'rule_of_thirds',
  action: 'leading_lines', reaction: 'centered', reveal: 'centered',
  closing: 'symmetry', transition: 'negative_space'
};
const DETAIL_BY_TYPE = {
  establishing: 'high', character: 'high', dialogue: 'medium', action: 'medium',
  reaction: 'medium', reveal: 'high', closing: 'medium', transition: 'low'
};
const DEPTH_BY_TYPE = {
  establishing: 'deep', character: 'shallow', dialogue: 'medium', action: 'medium',
  reaction: 'shallow', reveal: 'medium', closing: 'medium', transition: 'flat'
};
const FOCUS_BY_TYPE = {
  establishing: 'deep_focus', character: 'selective_focus', dialogue: 'soft_background',
  action: 'soft_background', reaction: 'selective_focus', reveal: 'selective_focus',
  closing: 'soft_background', transition: 'soft_background'
};
const PRIORITY_BY_TYPE = {
  establishing: 'environment', character: 'character', dialogue: 'character',
  action: 'action', reaction: 'emotion', reveal: 'symbolic',
  closing: 'emotion', transition: 'environment'
};
const POSE_BY_TYPE = {
  establishing: 'standing', character: 'addressing', dialogue: 'conversing',
  action: 'in_motion', reaction: 'reacting', reveal: 'attentive',
  closing: 'standing', transition: 'walking'
};
const GESTURE_BY_TYPE = {
  establishing: 'neutral', character: 'open_hand', dialogue: 'open_hand',
  action: 'reaching', reaction: 'hand_to_chest', reveal: 'open_hand',
  closing: 'neutral', transition: 'neutral'
};

function lightingFor(tod) {
  switch (tod) {
    case 'golden_hour': return 'golden_light';
    case 'dusk': return 'golden_light';
    case 'night': return 'moonlight';
    case 'dawn': return 'soft_daylight';
    case 'midday': return 'soft_daylight';
    default: return 'warm_sunlight';
  }
}

function atmosphereFor(mood) {
  const m = lc(mood);
  if (m.indexOf('serius') !== -1) return 'solemn';
  if (m.indexOf('hikmah') !== -1 || m.indexOf('reflektif') !== -1) return 'reverent';
  if (m.indexOf('cemas') !== -1 || m.indexOf('mengejut') !== -1 || m.indexOf('terkejut') !== -1 || m.indexOf('berat') !== -1) return 'tense';
  if (m.indexOf('sedih') !== -1) return 'melancholic';
  if (m.indexOf('tenang') !== -1) return 'calm';
  if (m.indexOf('gembira') !== -1 || m.indexOf('riang') !== -1) return 'joyful';
  if (m.indexOf('misteri') !== -1) return 'mysterious';
  return 'calm';
}

function positionsFor(n) {
  if (n <= 1) return ['center'];
  if (n === 2) return ['left', 'right'];
  if (n === 3) return ['left', 'center', 'right'];
  const arr = ['left', 'center', 'right'];
  for (var i = 3; i < n; i++) arr.push('background');
  return arr;
}

function firstMood(mood) {
  if (!mood) return 'neutral';
  return String(mood).split(',')[0].trim() || 'neutral';
}

// Bina layout + continuity bagi setiap watak panel.
function buildLayout(codes, panel, scene, charMap) {
  const positions = positionsFor(codes.length);
  const isDialoguePair = panel.panel_type === 'dialogue' && codes.length >= 2;

  return codes.map(function (code, idx) {
    const isGroup = /_GROUP$/.test(code);
    const dna = (charMap[code] && charMap[code].visual_dna) || {};
    const props = [];
    if (dna.staff) props.push('staff');
    if (dna.turban && dna.turban !== 'none') props.push('turban_' + dna.turban);
    if (dna.robe) props.push('robe_' + dna.robe);

    var facing = 'front';
    var eye = 'camera';
    if (isDialoguePair && idx === 0) { facing = 'right'; eye = 'right'; }
    else if (isDialoguePair && idx === 1) { facing = 'left'; eye = 'left'; }
    else if (panel.panel_type === 'action') { facing = 'three_quarter'; eye = 'away'; }
    else if (idx === 0) { facing = 'three_quarter'; }

    var size = isGroup ? 'background' : (idx === 0 ? 'foreground' : 'middle');

    return {
      code: code,
      position: isGroup ? 'background' : positions[idx],
      facing: facing,
      character_size: size,
      pose: isGroup ? 'gathered' : (POSE_BY_TYPE[panel.panel_type] || 'standing'),
      gesture: isGroup ? 'neutral' : (GESTURE_BY_TYPE[panel.panel_type] || 'neutral'),
      eye_direction: eye,
      emotion: panel.emotion_ms || firstMood(scene.mood),
      props: props
    };
  });
}

function hasNoble(codes, charMap) {
  for (var i = 0; i < codes.length; i++) {
    var c = charMap[codes[i]];
    if (c && (c.character_type === 'noble_figure_no_face' || c.face_policy === 'glowing_light')) return true;
  }
  return false;
}

// Jana satu rekod visual daripada panel + babak + peta watak.
//  panel    : objek panel (characters_json sudah array)
//  scene    : objek babak
//  charMap  : { code: { character_type, face_policy, visual_dna(obj) } }
function extractVisual(panel, scene, charMap) {
  const codes = Array.isArray(panel.characters_json) ? panel.characters_json : [];
  const ptype = panel.panel_type || 'character';
  const sm = SHOT_MAP[panel.shot_type] || { shot: 'medium_shot', lens: 'normal_50mm', angle: 'eye_level' };

  const locText = (panel.location || scene.location || '') + ' ' + (scene.summary_ms || '') + ' ' + (scene.title_ar || '');
  const sea = isSea(locText);
  const village = isVillageOrDesert(locText);

  const time_of_day = sea ? 'afternoon' : 'morning';
  const weather = sea ? 'windy' : 'clear';
  const lighting = lightingFor(time_of_day);
  const color_palette = sea ? 'cool' : (village ? 'desert_sand' : 'warm');

  const noble = hasNoble(codes, charMap);

  return {
    panel_id: panel.id,
    scene_id: panel.scene_id,
    project_id: panel.project_id,

    camera: panel.camera || 'eye_level',
    shot: sm.shot,
    angle: sm.angle,
    lens: sm.lens,
    composition: COMPOSITION_BY_TYPE[ptype] || 'centered',
    camera_movement: MOVEMENT_BY_TYPE[ptype] || 'static',

    characters_layout: buildLayout(codes, panel, scene, charMap),

    location: panel.location || scene.location || null,
    weather: weather,
    time_of_day: time_of_day,
    lighting: lighting,
    atmosphere: atmosphereFor(scene.mood),
    foreground_object: null,
    background_object: null,

    color_palette: color_palette,
    detail_level: DETAIL_BY_TYPE[ptype] || 'medium',
    depth: DEPTH_BY_TYPE[ptype] || 'medium',
    focus: FOCUS_BY_TYPE[ptype] || 'soft_background',
    visual_priority: PRIORITY_BY_TYPE[ptype] || 'character',

    face_policy: noble ? 'glowing_light' : 'normal',
    visual_notes: noble ? NOBLE_VISUAL_NOTE : (panel.visual_notes || 'Paparan visual biasa.'),
    sensitive_object: null
  };
}

module.exports = {
  NOBLE_VISUAL_NOTE,
  extractVisual
};
