'use strict';

// ===========================================================================
// characterEngine.js
// Enjin extraction watak — TANPA AI (rule-based + dictionary + regex).
//
// FOKUS FASA 2: dioptimumkan & distabilkan untuk SATU tajuk dahulu:
//     « سيدنا موسى وخضر »  (kisah Nabi Musa & Khidr, Surah al-Kahf)
//
// Generalisasi kepada tajuk lain dirancang untuk fasa seterusnya. Struktur
// detektor di bawah sengaja dibuat berdata (data-driven) supaya mudah
// ditambah tajuk baharu kelak tanpa mengubah logik.
// ===========================================================================

const { normalizeArabic } = require('../config/nobleFigures');
const { CHARACTER_TYPES } = require('../config/characterTypes');

const STORY_KEY = 'musa_khidr';

// Nota paparan piawai bagi tokoh mulia (selaras peraturan teras).
const NOBLE_NOTE =
  'Wajah TIDAK dipaparkan — digantikan cahaya lembut yang bersinar. ' +
  'Paparan hormat mengikut adab Islam.';

// Setiap detektor: jika mana-mana corak (ternormal) hadir dalam teks,
// watak berkenaan dijana. Susunan = urutan kemunculan dalam kisah.
const DETECTORS = [
  {
    patterns: ['موسي'], // موسى / سيدنا موسى
    template: {
      character_code: 'MUSA_001',
      name_ar: 'موسى',
      name_ms: 'Nabi Musa',
      character_type: CHARACTER_TYPES.NOBLE_NO_FACE,
      role: 'Nabi yang mengembara menuntut ilmu daripada hamba yang soleh',
      face_policy: 'glowing_light',
      appearance_notes: NOBLE_NOTE,
      visual_dna: { gender: 'male', age: 'adult', height: 'medium', robe: 'cream', turban: 'white', staff: true },
      canonical_character: true
    }
  },
  {
    patterns: ['خضر'], // الخضر / خضر
    template: {
      character_code: 'KHIDR_001',
      name_ar: 'الخضر',
      name_ms: 'Nabi Khidir',
      character_type: CHARACTER_TYPES.NOBLE_NO_FACE,
      role: 'Hamba Allah yang soleh dan berilmu; guru kepada Nabi Musa',
      face_policy: 'glowing_light',
      appearance_notes: NOBLE_NOTE,
      visual_dna: { gender: 'male', age: 'elder', height: 'medium', robe: 'green', turban: 'green' },
      canonical_character: true
    }
  },
  {
    patterns: ['فتاه', 'فتي'], // الفتى / فتاه — yakni Yusha' bin Nun
    template: {
      character_code: 'YUSHA_001',
      name_ar: 'يوشع بن نون',
      name_ms: "Yusha' bin Nun",
      character_type: CHARACTER_TYPES.NOBLE_NO_FACE,
      role: 'Pembantu muda Nabi Musa (disebut "الفتى" dalam kisah)',
      face_policy: 'glowing_light',
      appearance_notes: NOBLE_NOTE,
      visual_dna: { gender: 'male', age: 'youth', height: 'medium', robe: 'light_brown', turban: 'none' },
      canonical_character: true
    }
  },
  {
    patterns: ['غلام'], // الغلام / غلاما
    template: {
      character_code: 'BOY_001',
      name_ar: 'الغلام',
      name_ms: 'Budak lelaki',
      character_type: CHARACTER_TYPES.ORDINARY,
      role: 'Budak lelaki yang ditemui dalam perjalanan',
      face_policy: 'normal',
      appearance_notes: 'Watak biasa (bukan tokoh mulia).',
      visual_dna: { gender: 'male', age: 'child', height: 'short', robe: 'plain' },
      canonical_character: true
    }
  },
  {
    patterns: ['سفين', 'اصحاب السفينه'], // السفينة / أصحاب السفينة
    template: {
      character_code: 'BOAT_PEOPLE_GROUP',
      name_ar: 'أصحاب السفينة',
      name_ms: 'Anak kapal / pemilik kapal',
      character_type: CHARACTER_TYPES.BACKGROUND,
      role: 'Kumpulan pemilik dan anak kapal',
      face_policy: 'normal',
      appearance_notes: 'Watak latar berkumpulan.',
      visual_dna: { group: true, count: 'several', attire: 'sailor', setting: 'sea' },
      canonical_character: true
    }
  },
  {
    patterns: ['قريه', 'اهل القريه'], // القرية / أهل القرية
    template: {
      character_code: 'VILLAGE_PEOPLE_GROUP',
      name_ar: 'أهل القرية',
      name_ms: 'Penduduk kampung',
      character_type: CHARACTER_TYPES.BACKGROUND,
      role: 'Kumpulan penduduk kampung yang enggan menjamu',
      face_policy: 'normal',
      appearance_notes: 'Watak latar berkumpulan.',
      visual_dna: { group: true, count: 'many', attire: 'villager', setting: 'village' },
      canonical_character: true
    }
  }
];

// Salin templat secara dalam (deep-ish) supaya pemanggil tidak ubah rujukan.
function cloneTemplate(t) {
  return {
    character_code: t.character_code,
    name_ar: t.name_ar,
    name_ms: t.name_ms,
    character_type: t.character_type,
    role: t.role,
    face_policy: t.face_policy,
    appearance_notes: t.appearance_notes,
    visual_dna: Object.assign({}, t.visual_dna),
    canonical_character: t.canonical_character
  };
}

// Analisis teks Arab → senarai templat watak yang dikenal pasti.
function extractCharacters(text) {
  const norm = normalizeArabic(text || '');
  if (!norm) return [];
  const out = [];
  const seen = {};
  for (var i = 0; i < DETECTORS.length; i++) {
    var d = DETECTORS[i];
    var hit = d.patterns.some(function (p) {
      return norm.indexOf(p) !== -1;
    });
    if (hit && !seen[d.template.character_code]) {
      seen[d.template.character_code] = true;
      out.push(cloneTemplate(d.template));
    }
  }
  return out;
}

module.exports = {
  STORY_KEY,
  extractCharacters
};
