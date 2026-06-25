'use strict';

// ===========================================================================
// promptStyle.js
// Konfigurasi gaya & peraturan keselamatan bagi Image Prompt Engine.
// Semua rule-based — TIADA panggilan AI.
// ===========================================================================

const STYLE_PRESETS = Object.freeze({
  webtoon_mutalaah: {
    label: 'Webtoon Mutalaah',
    description:
      'vertical Islamic educational webtoon, clean semi-realistic illustration, ' +
      'cinematic composition, warm historical atmosphere, modest clothing, high detail, ' +
      'soft lighting, suitable for students, respectful Islamic storytelling'
  }
});

const DEFAULT_STYLE_PRESET = 'webtoon_mutalaah';
const STYLE_PRESET_VALUES = Object.freeze(Object.keys(STYLE_PRESETS));

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_VERSION = 'v1';

const PROMPT_STATUS = Object.freeze({
  DRAFT: 'draft',
  READY: 'ready',
  APPROVED: 'approved'
});
const PROMPT_STATUS_VALUES = Object.freeze(Object.values(PROMPT_STATUS));

// Baris WAJIB bagi prompt yang mengandungi tokoh mulia. Mengandungi kelima-lima
// pernyataan yang diperlukan + "respectful Islamic depiction".
const NOBLE_PROMPT_LINE =
  'Face fully replaced by soft glowing light, no facial features, no eyes, ' +
  'no nose, no mouth. Respectful Islamic depiction.';

// Negative prompt WAJIB bagi tokoh mulia (menyekat sebarang wajah).
const NOBLE_NEGATIVE =
  'visible face, eyes, nose, mouth, facial features, realistic prophet face, ' +
  'disrespectful depiction';

// Negative prompt asas (sentiasa disertakan).
const BASE_NEGATIVE =
  'modern clothing, text, watermark, logo, signature, blurry, distorted body, ' +
  'extra limbs, bad anatomy, low quality, nsfw';

function isValidStatus(value) { return PROMPT_STATUS_VALUES.indexOf(value) !== -1; }
function isValidPreset(value) { return STYLE_PRESET_VALUES.indexOf(value) !== -1; }
function styleDescription(preset) {
  const p = STYLE_PRESETS[preset] || STYLE_PRESETS[DEFAULT_STYLE_PRESET];
  return p.description;
}

module.exports = {
  STYLE_PRESETS,
  DEFAULT_STYLE_PRESET,
  STYLE_PRESET_VALUES,
  DEFAULT_LANGUAGE,
  DEFAULT_VERSION,
  PROMPT_STATUS,
  PROMPT_STATUS_VALUES,
  NOBLE_PROMPT_LINE,
  NOBLE_NEGATIVE,
  BASE_NEGATIVE,
  isValidStatus,
  isValidPreset,
  styleDescription
};
