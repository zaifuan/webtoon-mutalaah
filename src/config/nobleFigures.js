'use strict';

// ===========================================================================
// nobleFigures.js
// Pengesanan tokoh mulia (Nabi, Rasul, Sahabat). Jika nama watak sepadan:
//   character_type = noble_figure_no_face
//   face_policy    = glowing_light
// Muka tokoh mulia TIDAK BOLEH dipaparkan — digantikan cahaya lembut.
// ===========================================================================

// Penormalan teks Arab (dikongsi dengan character engine):
//  - buang harakat/tanda baca & tatweel
//  - seragamkan alef (أ إ آ ٱ → ا), ى → ي, ة → ه, ؤ → و, ئ → ي
function normalizeArabic(input) {
  if (input === undefined || input === null) return '';
  return String(input)
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0624/g, '\u0648')
    .replace(/\u0626/g, '\u064A')
    .replace(/\s+/g, ' ')
    .trim();
}

// Senarai tokoh mulia (tanpa "ال" di hadapan supaya padanan lebih luas).
const NOBLE_FIGURES_AR = [
  // Nabi & Rasul
  'موسى', 'خضر', 'محمد', 'أحمد', 'إبراهيم', 'إسماعيل', 'إسحاق', 'يعقوب',
  'يوسف', 'نوح', 'هود', 'صالح', 'لوط', 'شعيب', 'يونس', 'أيوب', 'زكريا',
  'يحيى', 'عيسى', 'آدم', 'إدريس', 'هارون', 'داوود', 'سليمان', 'إلياس',
  'اليسع', 'ذو الكفل', 'يوشع',
  // Sahabat (RA)
  'أبو بكر', 'عمر', 'عثمان', 'علي', 'حمزة', 'بلال', 'خالد', 'سلمان',
  'أبو هريرة', 'خديجة', 'عائشة', 'فاطمة'
];

// Bentuk ternormal (untuk padanan pantas).
const NOBLE_NORMALIZED = NOBLE_FIGURES_AR.map(normalizeArabic).filter(function (s) {
  return s.length >= 2;
});

// Profil wajib bagi tokoh mulia.
const NOBLE_PROFILE = Object.freeze({
  character_type: 'noble_figure_no_face',
  face_policy: 'glowing_light'
});

// Adakah nama ini merujuk tokoh mulia? (semak nama Arab dan/atau Melayu)
function isNobleName() {
  for (var i = 0; i < arguments.length; i++) {
    var norm = normalizeArabic(arguments[i]);
    if (!norm) continue;
    for (var j = 0; j < NOBLE_NORMALIZED.length; j++) {
      if (norm.indexOf(NOBLE_NORMALIZED[j]) !== -1) return true;
    }
  }
  return false;
}

module.exports = {
  normalizeArabic,
  NOBLE_FIGURES_AR,
  NOBLE_NORMALIZED,
  NOBLE_PROFILE,
  isNobleName
};
