'use strict';

// ===========================================================================
// sceneEngine.js
// Enjin penjanaan BABAK (scene) — TANPA AI (rule-based + dictionary).
//
// FOKUS FASA 3: dioptimumkan & distabilkan untuk SATU tajuk:
//     « سيدنا موسى وخضر »  (Surah al-Kahf)
//
// Apabila teks projek dikenal pasti sebagai kisah ini (mengandungi موسى
// dan خضر), enjin menjana 13 babak asas mengikut urutan cerita. Struktur
// templat dibuat berdata supaya tajuk lain mudah ditambah pada fasa akan datang.
// ===========================================================================

const { normalizeArabic } = require('../config/nobleFigures');

const STORY_KEY = 'musa_khidr';

// 13 babak asas (urutan = scene_no). characters merujuk character_code Fasa 2.
const SCENES = [
  {
    title_ar: 'خطبة موسى في بني إسرائيل',
    title_ms: 'Khutbah Nabi Musa kepada Bani Israel',
    summary_ms: 'Nabi Musa menyampaikan khutbah dan ilmu kepada Bani Israel.',
    scene_type: 'intro',
    mood: 'serius, menyentuh hati',
    location: 'perhimpunan Bani Israel',
    characters: ['MUSA_001']
  },
  {
    title_ar: 'سؤال الرجل عن العلم',
    title_ms: 'Seorang lelaki bertanya tentang orang yang lebih alim',
    summary_ms: 'Seorang lelaki bertanya adakah ada orang yang lebih berilmu daripada Nabi Musa.',
    scene_type: 'lesson',
    mood: 'ingin tahu, mendidik',
    location: 'perhimpunan Bani Israel',
    characters: ['MUSA_001']
  },
  {
    title_ar: 'الوحي إلى موسى عن الخضر',
    title_ms: 'Allah memberitahu Musa tentang hamba soleh',
    summary_ms: 'Allah mewahyukan bahawa ada hamba soleh yang lebih mengetahui di pertemuan dua laut.',
    scene_type: 'reveal',
    mood: 'penuh hikmah',
    location: 'wahyu daripada Allah',
    characters: ['MUSA_001', 'KHIDR_001']
  },
  {
    title_ar: 'الاستعداد للسفر',
    title_ms: 'Musa bersiap untuk mencari Khidir',
    summary_ms: 'Nabi Musa bersiap dan berangkat bersama pembantunya untuk mencari Khidir.',
    scene_type: 'journey',
    mood: 'tekad, mencari ilmu',
    location: 'perjalanan menuju مجمع البحرين',
    characters: ['MUSA_001', 'YUSHA_001']
  },
  {
    title_ar: 'نسيان الحوت',
    title_ms: 'Ikan hilang dan pembantu terlupa memberitahu Musa',
    summary_ms: 'Ikan yang dibawa menghilang ke laut, tetapi pembantu terlupa memberitahu Musa.',
    scene_type: 'event',
    mood: 'letih, hairan',
    location: 'batu di مجمع البحرين',
    characters: ['MUSA_001', 'YUSHA_001']
  },
  {
    title_ar: 'لقاء موسى بالخضر',
    title_ms: 'Musa bertemu Khidir',
    summary_ms: 'Nabi Musa bertemu Khidir di pertemuan dua laut dan memohon untuk belajar.',
    scene_type: 'meeting',
    mood: 'tenang, penuh adab',
    location: 'مجمع البحرين',
    characters: ['MUSA_001', 'KHIDR_001']
  },
  {
    title_ar: 'العهد بين موسى والخضر',
    title_ms: 'Perjanjian sabar antara Musa dan Khidir',
    summary_ms: 'Khidir menerima Musa dengan syarat bersabar dan tidak bertanya sehingga dijelaskan.',
    scene_type: 'lesson',
    mood: 'serius, mendidik',
    location: 'permulaan perjalanan',
    characters: ['MUSA_001', 'KHIDR_001']
  },
  {
    title_ar: 'السفينة',
    title_ms: 'Khidir melubangi kapal',
    summary_ms: 'Khidir melubangi kapal milik orang miskin; Musa hairan dan membantah.',
    scene_type: 'event',
    mood: 'cemas, mengejutkan',
    location: 'laut',
    characters: ['MUSA_001', 'KHIDR_001', 'BOAT_PEOPLE_GROUP']
  },
  {
    title_ar: 'الغلام',
    title_ms: 'Peristiwa budak lelaki',
    summary_ms: 'Khidir membunuh seorang budak lelaki; Musa membantah dengan lebih keras.',
    scene_type: 'event',
    mood: 'mengejutkan, berat',
    location: 'jalan perjalanan',
    characters: ['MUSA_001', 'KHIDR_001', 'BOY_001']
  },
  {
    title_ar: 'الجدار',
    title_ms: 'Khidir membaiki dinding di kampung',
    summary_ms: 'Di kampung yang enggan menjamu, Khidir membaiki dinding yang hampir roboh.',
    scene_type: 'event',
    mood: 'lapar, hairan',
    location: 'kampung',
    characters: ['MUSA_001', 'KHIDR_001', 'VILLAGE_PEOPLE_GROUP']
  },
  {
    title_ar: 'الفراق',
    title_ms: 'Perpisahan Musa dan Khidir',
    summary_ms: 'Musa dan Khidir berpisah selepas Musa membantah tiga kali.',
    scene_type: 'ending',
    mood: 'sedih, menerima hikmah',
    location: 'selepas keluar dari kampung',
    characters: ['MUSA_001', 'KHIDR_001']
  },
  {
    title_ar: 'تأويل الأحداث',
    title_ms: 'Khidir menjelaskan hikmah kapal, budak dan dinding',
    summary_ms: 'Khidir menjelaskan hikmah di sebalik kapal, budak dan dinding.',
    scene_type: 'reveal',
    mood: 'jelas, penuh hikmah',
    location: 'tempat perpisahan',
    characters: ['MUSA_001', 'KHIDR_001']
  },
  {
    title_ar: 'الدروس المستفادة',
    title_ms: 'Pengajaran daripada kisah Musa dan Khidir',
    summary_ms: 'Pengajaran kesabaran, ilmu, dan hikmah takdir Allah daripada kisah ini.',
    scene_type: 'lesson',
    mood: 'reflektif',
    location: 'penutup kisah',
    characters: ['MUSA_001', 'KHIDR_001']
  }
];

function cloneScene(s, no) {
  return {
    scene_no: no,
    title_ar: s.title_ar,
    title_ms: s.title_ms,
    summary_ms: s.summary_ms,
    mood: s.mood,
    location: s.location,
    source_hint: STORY_KEY + ':' + s.title_ar,
    scene_type: s.scene_type,
    estimated_pages: 1,
    characters_json: s.characters.slice()
  };
}

// Kenal pasti kisah ini? (teks mengandungi موسى DAN خضر).
function matchesStory(text) {
  const norm = normalizeArabic(text || '');
  return norm.indexOf('موسي') !== -1 && norm.indexOf('خضر') !== -1;
}

// Analisis teks → senarai templat babak (kosong jika kisah tidak dikenali).
function extractScenes(text) {
  if (!matchesStory(text)) return [];
  return SCENES.map(function (s, i) { return cloneScene(s, i + 1); });
}

module.exports = {
  STORY_KEY,
  matchesStory,
  extractScenes
};
