'use strict';

// ===========================================================================
// visualDirector.js
// Kamus nilai sah (enum) bagi Visual Director Engine. Digunakan untuk validasi
// API dan oleh enjin penjanaan. Medan bebas-teks tidak disenaraikan di sini.
// ===========================================================================

const ENUMS = Object.freeze({
  // Camera
  shot: ['establishing_shot', 'wide_shot', 'full_shot', 'medium_shot', 'medium_close_up', 'close_up', 'extreme_close_up', 'over_the_shoulder', 'insert_detail'],
  angle: ['eye_level', 'low_angle', 'high_angle', 'birds_eye', 'worms_eye', 'dutch_angle'],
  lens: ['wide_24mm', 'normal_35mm', 'normal_50mm', 'portrait_85mm', 'tele_135mm'],
  composition: ['centered', 'rule_of_thirds', 'symmetry', 'leading_lines', 'frame_within_frame', 'golden_ratio', 'negative_space'],
  camera_movement: ['static', 'pan', 'tilt', 'dolly_in', 'dolly_out', 'tracking', 'crane', 'handheld'],

  // Environment
  weather: ['clear', 'sunny', 'cloudy', 'overcast', 'rain', 'storm', 'windy', 'foggy', 'sandstorm'],
  time_of_day: ['dawn', 'morning', 'midday', 'afternoon', 'golden_hour', 'dusk', 'night'],
  lighting: ['soft_daylight', 'warm_sunlight', 'golden_light', 'overcast_diffuse', 'dramatic_shadow', 'backlight', 'moonlight', 'divine_glow'],
  atmosphere: ['calm', 'tense', 'solemn', 'joyful', 'mysterious', 'reverent', 'melancholic', 'energetic'],

  // Art direction
  color_palette: ['warm', 'cool', 'earth_tones', 'desert_sand', 'muted', 'vibrant', 'monochrome', 'golden'],
  detail_level: ['low', 'medium', 'high', 'very_high'],
  depth: ['flat', 'shallow', 'medium', 'deep'],
  focus: ['sharp_foreground', 'soft_background', 'deep_focus', 'selective_focus'],
  visual_priority: ['character', 'environment', 'action', 'emotion', 'symbolic'],

  // Safety
  face_policy: ['normal', 'glowing_light'],

  // Character layout (per watak)
  position: ['left', 'center', 'right', 'background'],
  facing: ['front', 'left', 'right', 'back', 'three_quarter'],
  character_size: ['foreground', 'middle', 'background'],
  eye_direction: ['camera', 'left', 'right', 'up', 'down', 'away']
});

// Medan visual (kolum) yang merupakan enum.
const VISUAL_ENUM_FIELDS = ['shot', 'angle', 'lens', 'composition', 'camera_movement',
  'weather', 'time_of_day', 'lighting', 'atmosphere',
  'color_palette', 'detail_level', 'depth', 'focus', 'visual_priority', 'face_policy'];

// Medan dalam setiap objek characters_layout yang merupakan enum.
const LAYOUT_ENUM_FIELDS = ['position', 'facing', 'character_size', 'eye_direction'];

function isValid(field, value) {
  const list = ENUMS[field];
  if (!list) return true; // bukan enum → diterima
  return list.indexOf(value) !== -1;
}

module.exports = {
  ENUMS,
  VISUAL_ENUM_FIELDS,
  LAYOUT_ENUM_FIELDS,
  isValid
};
