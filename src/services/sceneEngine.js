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

// ===========================================================================
// FASA 23 — Narrative Beat: Scene sebagai container kepada Beat.
//
// TIDAK mengubah SCENES / cloneScene / matchesStory / extractScenes di atas.
// Ini lapisan TAMBAHAN semata-mata, selaras DUA corak sedia ada dalam projek:
//   (a) kandungan KANONIK dikunci ikut scene_no (corak scriptEngine.js CANON)
//   (b) fallback GENERIK dikunci ikut scene_type (corak panelEngine.js BEATS)
//
// Setiap Scene -> 2-6 Beat. Beat TIDAK menyentuh Panel — pipeline Panel kekal
// tidak berubah (Beat hanya diwujudkan dahulu, belum disambung ke Panel).
// ===========================================================================

const BEAT_TYPES = [
  'orientation', 'question', 'instruction', 'commitment', 'tension_build',
  'incident', 'objection', 'silence', 'reveal', 'reflection', 'dua_moment',
  'farewell', 'transition'
];
const TRANSITION_TYPES = ['none', 'continuous', 'hard_cut', 'contrast', 'escalation', 'release', 'echo'];

function pr(min, max) { return { min: min, max: max }; }

// ---------------------------------------------------------------------------
// KANDUNGAN KANONIK — 13 babak kisah Musa & Khidir, dikunci ikut scene_no
// (selaras CANON dalam scriptEngine.js). tension_level SENGAJA meningkat
// merentasi tiga bantahan Musa (babak 8 -> 9 -> 10: 3 -> 4 -> 5) selaras
// Prinsip Pengarahan #21 (escalation, bukan diperlakukan sama rata).
// ---------------------------------------------------------------------------
const BEATS_BY_SCENE = {
  // Babak 1 — Khutbah Nabi Musa (intro)
  1: [
    { beat_type: 'orientation', purpose: 'Membuka suasana perhimpunan Bani Israel sebelum khutbah bermula.', emotion: 'calm', tension_level: 1, visual_intent: 'Lapang dan tenang, menampakkan ramai pendengar berkumpul.', suggested_panel_count: pr(1, 2), transition_from_previous: 'none' },
    { beat_type: 'instruction', purpose: 'Nabi Musa menyampaikan nasihat dan mengingatkan nikmat Allah kepada kaumnya.', emotion: 'solemn', tension_level: 2, visual_intent: 'Fokus pada watak utama menyampaikan ucapan dengan penuh wibawa.', suggested_panel_count: pr(1, 2), transition_from_previous: 'continuous' },
    { beat_type: 'reflection', purpose: 'Hati pendengar tersentuh; kesan khutbah dirasai bersama.', emotion: 'respectful', tension_level: 1, visual_intent: 'Reaksi senyap, wajah-wajah yang tunduk dan terharu.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' }
  ],
  // Babak 2 — Soalan tentang orang lebih alim (lesson)
  2: [
    { beat_type: 'orientation', purpose: 'Meneruskan suasana perhimpunan sejurus selepas khutbah selesai.', emotion: 'calm', tension_level: 1, visual_intent: 'Susulan tenang daripada babak sebelum ini.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' },
    { beat_type: 'question', purpose: 'Seorang lelaki bertanya sama ada ada orang yang lebih berilmu daripada Musa.', emotion: 'curiosity', tension_level: 2, visual_intent: 'Tumpuan pada watak yang bertanya, nada ingin tahu.', suggested_panel_count: pr(1, 2), transition_from_previous: 'continuous' },
    { beat_type: 'tension_build', purpose: 'Musa tidak mempunyai jawapan pasti; keraguan mula tertanam dalam dirinya.', emotion: 'thinking', tension_level: 2, visual_intent: 'Wajah termenung, jeda sebelum wahyu turun.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' }
  ],
  // Babak 3 — Wahyu tentang Khidir (reveal)
  3: [
    { beat_type: 'tension_build', purpose: 'Kegelisahan Musa berterusan tanpa jawapan yang pasti.', emotion: 'thinking', tension_level: 2, visual_intent: 'Suasana sunyi menanti petunjuk.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' },
    { beat_type: 'reveal', purpose: 'Allah mewahyukan bahawa ada hamba soleh yang lebih mengetahui di pertemuan dua laut.', emotion: 'wonder', tension_level: 3, visual_intent: 'Simbol wahyu/cahaya, detik penuh hikmah didedahkan.', suggested_panel_count: pr(1, 2), transition_from_previous: 'escalation' },
    { beat_type: 'commitment', purpose: 'Musa bertekad untuk mencari hamba soleh itu walau sejauh mana perjalanannya.', emotion: 'anticipation', tension_level: 2, visual_intent: 'Watak berazam, pandangan ke hadapan.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' }
  ],
  // Babak 4 — Persediaan mencari Khidir (journey)
  4: [
    { beat_type: 'orientation', purpose: 'Musa dan pembantunya bersiap untuk memulakan pencarian.', emotion: 'calm', tension_level: 1, visual_intent: 'Persediaan bekalan dan perjalanan.', suggested_panel_count: pr(1, 2), transition_from_previous: 'continuous' },
    { beat_type: 'commitment', purpose: 'Mereka berangkat menuju pertemuan dua laut dengan tekad yang kuat.', emotion: 'anticipation', tension_level: 2, visual_intent: 'Perjalanan bermula, langkah pertama ke arah destinasi.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' },
    { beat_type: 'silence', purpose: 'Perjalanan jauh dan panjang berlalu tanpa banyak kata.', emotion: 'calm', tension_level: 1, visual_intent: 'Pemandangan luas perjalanan, watak kecil dalam lanskap.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' }
  ],
  // Babak 5 — Ikan hilang (event, ringan)
  5: [
    { beat_type: 'orientation', purpose: 'Mereka berhenti berehat di batu berhampiran pertemuan dua laut.', emotion: 'calm', tension_level: 1, visual_intent: 'Suasana rehat selepas perjalanan jauh.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' },
    { beat_type: 'incident', purpose: 'Ikan yang dibawa terlepas dan menghilang ke laut secara ajaib.', emotion: 'surprised', tension_level: 2, visual_intent: 'Detik kecil tetapi ganjil, ikan bergerak sendiri ke air.', suggested_panel_count: pr(1, 2), transition_from_previous: 'continuous' },
    { beat_type: 'tension_build', purpose: "Yusha' terlupa memberitahu Musa; mereka meneruskan perjalanan tanpa sedar.", emotion: 'thinking', tension_level: 2, visual_intent: 'Mereka berjalan jauh sebelum menyedari kesilapan.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' }
  ],
  // Babak 6 — Pertemuan dengan Khidir (meeting)
  6: [
    { beat_type: 'orientation', purpose: 'Mereka kembali ke batu tadi dan bertemu seorang hamba soleh.', emotion: 'curiosity', tension_level: 2, visual_intent: 'Pertemuan pertama, watak baharu diperkenalkan dengan tenang.', suggested_panel_count: pr(1, 2), transition_from_previous: 'continuous' },
    { beat_type: 'question', purpose: 'Musa memohon dengan adab untuk mengikuti dan belajar daripadanya.', emotion: 'respectful', tension_level: 2, visual_intent: 'Dialog penuh adab antara dua watak.', suggested_panel_count: pr(1, 2), transition_from_previous: 'continuous' },
    { beat_type: 'tension_build', purpose: 'Khidir memberi amaran bahawa Musa tidak akan mampu bersabar bersamanya.', emotion: 'calm', tension_level: 3, visual_intent: 'Amaran disampaikan dengan tenang tetapi tegas.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' }
  ],
  // Babak 7 — Perjanjian sabar (lesson)
  7: [
    { beat_type: 'instruction', purpose: 'Khidir menetapkan syarat: jangan bertanya sehingga dijelaskan sendiri.', emotion: 'solemn', tension_level: 3, visual_intent: 'Syarat disampaikan dengan tegas, watak berhadapan.', suggested_panel_count: pr(1, 2), transition_from_previous: 'continuous' },
    { beat_type: 'commitment', purpose: 'Musa menerima syarat itu dengan penuh kesungguhan.', emotion: 'respectful', tension_level: 2, visual_intent: 'Watak mengangguk setuju, langkah pertama perjanjian.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' },
    { beat_type: 'reflection', purpose: 'Mereka memulakan perjalanan bersama sebagai guru dan murid.', emotion: 'calm', tension_level: 1, visual_intent: 'Dua watak berjalan seiringan, permulaan hubungan baharu.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' }
  ],
  // Babak 8 — Kapal dilubangi (event, bantahan #1 — tension 3)
  8: [
    { beat_type: 'orientation', purpose: 'Musa dan Khidir menaiki kapal milik orang miskin.', emotion: 'calm', tension_level: 1, visual_intent: 'Menaiki kapal, suasana masih tenang.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' },
    { beat_type: 'incident', purpose: 'Khidir melubangi kapal itu tanpa sebarang penjelasan.', emotion: 'surprised', tension_level: 3, visual_intent: 'Tindakan mengejutkan berlaku secara tiba-tiba.', suggested_panel_count: pr(2, 3), transition_from_previous: 'continuous' },
    { beat_type: 'silence', purpose: 'Musa terdiam seketika, cuba memahami apa yang baru berlaku.', emotion: 'surprised', tension_level: 3, visual_intent: 'Jeda senyap, wajah terkejut tanpa kata.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' },
    { beat_type: 'objection', purpose: 'Musa tidak dapat menahan diri dan membantah tindakan itu — bantahan pertama.', emotion: 'surprised', tension_level: 3, visual_intent: 'Dialog tegas pertama, jarak dekat antara dua watak.', suggested_panel_count: pr(1, 2), transition_from_previous: 'continuous' },
    { beat_type: 'tension_build', purpose: 'Khidir mengingatkan Musa tentang perjanjian sabar yang telah dibuat.', emotion: 'calm', tension_level: 2, visual_intent: 'Balasan tenang tetapi menegaskan semula syarat.', suggested_panel_count: pr(1, 1), transition_from_previous: 'release' }
  ],
  // Babak 9 — Budak lelaki (event, bantahan #2 — tension 4)
  9: [
    { beat_type: 'tension_build', purpose: 'Perjalanan diteruskan dengan babak baharu menanti di hadapan.', emotion: 'calm', tension_level: 2, visual_intent: 'Susulan tenang selepas insiden kapal.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' },
    { beat_type: 'incident', purpose: 'Khidir membunuh seorang budak lelaki tanpa sebab yang nyata.', emotion: 'fear', tension_level: 4, visual_intent: 'Tindakan berat dan mengejutkan, lebih membebankan daripada insiden kapal.', suggested_panel_count: pr(2, 3), transition_from_previous: 'escalation' },
    { beat_type: 'silence', purpose: 'Kesunyian yang lebih berat berbanding babak kapal; Musa terkejut hebat.', emotion: 'sad', tension_level: 4, visual_intent: 'Jeda panjang, watak membeku dalam kejutan.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' },
    { beat_type: 'objection', purpose: 'Musa membantah dengan lebih keras — bantahan kedua yang lebih berat daripada sebelumnya.', emotion: 'sad', tension_level: 4, visual_intent: 'Dialog lebih emosional berbanding bantahan pertama.', suggested_panel_count: pr(1, 2), transition_from_previous: 'continuous' }
  ],
  // Babak 10 — Dinding dibaiki (event, bantahan #3 — tension 5, klimaks)
  10: [
    { beat_type: 'orientation', purpose: 'Mereka tiba di sebuah kampung dan ditolak apabila meminta jamuan.', emotion: 'sad', tension_level: 2, visual_intent: 'Suasana lapar dan tidak dialu-alukan.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' },
    { beat_type: 'incident', purpose: 'Walaupun ditolak, Khidir membaiki dinding kampung yang hampir roboh.', emotion: 'surprised', tension_level: 4, visual_intent: 'Tindakan ganjil — berbuat baik kepada mereka yang enggan menjamu.', suggested_panel_count: pr(2, 3), transition_from_previous: 'continuous' },
    { beat_type: 'objection', purpose: 'Musa membantah buat kali ketiga — bantahan paling kuat dan terakhir.', emotion: 'angry', tension_level: 5, visual_intent: 'Puncak ketegangan hubungan, jarak paling dekat, emosi paling tinggi.', suggested_panel_count: pr(1, 2), transition_from_previous: 'escalation' },
    { beat_type: 'tension_build', purpose: 'Perjanjian telah dilanggar tiga kali; detik ini menandakan noktah perpisahan.', emotion: 'solemn', tension_level: 5, visual_intent: 'Kesenyapan berat sebelum keputusan diumumkan.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' }
  ],
  // Babak 11 — Perpisahan (ending, pelepasan tension)
  11: [
    { beat_type: 'tension_build', purpose: 'Khidir mengumumkan bahawa ini adalah detik perpisahan mereka.', emotion: 'solemn', tension_level: 4, visual_intent: 'Pengumuman berat, dua watak berhadapan buat kali terakhir sebelum berpisah.', suggested_panel_count: pr(1, 1), transition_from_previous: 'release' },
    { beat_type: 'farewell', purpose: 'Musa dan Khidir berpisah selepas perjalanan penuh pengajaran.', emotion: 'sad', tension_level: 3, visual_intent: 'Detik perpisahan, jarak antara watak mula terbentuk.', suggested_panel_count: pr(1, 2), transition_from_previous: 'continuous' },
    { beat_type: 'silence', purpose: 'Kesunyian sebaik sahaja perpisahan, ruang untuk meresap kesedihan.', emotion: 'sad', tension_level: 2, visual_intent: 'Pemandangan lengang, watak berjalan berasingan.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' }
  ],
  // Babak 12 — Penjelasan hikmah (reveal)
  12: [
    { beat_type: 'orientation', purpose: 'Sebelum benar-benar berpisah, Khidir memutuskan untuk menjelaskan hikmah di sebalik tindakannya.', emotion: 'calm', tension_level: 2, visual_intent: 'Suasana tenang, ruang untuk penjelasan bermula.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' },
    { beat_type: 'reveal', purpose: 'Khidir menjelaskan hikmah melubangi kapal — melindungi daripada raja yang zalim.', emotion: 'wonder', tension_level: 2, visual_intent: 'Penjelasan pertama, ketegangan mula mereda.', suggested_panel_count: pr(1, 2), transition_from_previous: 'release' },
    { beat_type: 'reveal', purpose: 'Khidir menjelaskan hikmah membunuh budak dan membaiki dinding.', emotion: 'wonder', tension_level: 2, visual_intent: 'Penjelasan kedua dan ketiga, kelegaan semakin jelas.', suggested_panel_count: pr(1, 2), transition_from_previous: 'continuous' },
    { beat_type: 'reflection', purpose: 'Musa memahami bahawa setiap tindakan mempunyai hikmah tersendiri.', emotion: 'relief', tension_level: 1, visual_intent: 'Wajah lega, penerimaan penuh terhadap hikmah.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' }
  ],
  // Babak 13 — Pengajaran (lesson, penutup)
  13: [
    { beat_type: 'reflection', purpose: 'Kisah ini merumuskan pengajaran kesabaran, ilmu, dan hikmah takdir Allah.', emotion: 'thinking', tension_level: 1, visual_intent: 'Nada renungan, mengimbas keseluruhan perjalanan.', suggested_panel_count: pr(1, 2), transition_from_previous: 'continuous' },
    { beat_type: 'dua_moment', purpose: 'Penutup dengan renungan dan doa agar pembaca mengambil iktibar.', emotion: 'respectful', tension_level: 1, visual_intent: 'Suasana khusyuk dan tenang menutup kisah.', suggested_panel_count: pr(1, 1), transition_from_previous: 'continuous' }
  ]
};

// ---------------------------------------------------------------------------
// FALLBACK GENERIK — ikut scene_type (selaras corak BEATS/FALLBACK_BEATS
// dalam panelEngine.js), bagi babak/tajuk lain yang belum mempunyai
// kandungan kanonik. purpose/visual_intent dijana secara dinamik daripada
// medan Scene sedia ada (title_ms/summary_ms/location) — sama seperti
// visualFor() dalam panelEngine.js.
// ---------------------------------------------------------------------------
const GENERIC_BEATS_BY_TYPE = {
  intro: [
    { type: 'orientation', emotion: 'calm', tension: 1, range: [1, 2], trans: 'continuous' },
    { type: 'instruction', emotion: 'solemn', tension: 2, range: [1, 2], trans: 'continuous' },
    { type: 'reflection', emotion: 'respectful', tension: 1, range: [1, 1], trans: 'continuous' }
  ],
  journey: [
    { type: 'orientation', emotion: 'calm', tension: 1, range: [1, 2], trans: 'continuous' },
    { type: 'commitment', emotion: 'anticipation', tension: 2, range: [1, 1], trans: 'continuous' },
    { type: 'tension_build', emotion: 'thinking', tension: 2, range: [1, 1], trans: 'continuous' },
    { type: 'silence', emotion: 'calm', tension: 1, range: [1, 1], trans: 'continuous' }
  ],
  meeting: [
    { type: 'orientation', emotion: 'curiosity', tension: 2, range: [1, 2], trans: 'continuous' },
    { type: 'question', emotion: 'respectful', tension: 2, range: [1, 2], trans: 'continuous' },
    { type: 'tension_build', emotion: 'calm', tension: 3, range: [1, 1], trans: 'continuous' }
  ],
  lesson: [
    { type: 'instruction', emotion: 'solemn', tension: 2, range: [1, 2], trans: 'continuous' },
    { type: 'commitment', emotion: 'respectful', tension: 2, range: [1, 1], trans: 'continuous' },
    { type: 'reflection', emotion: 'calm', tension: 1, range: [1, 1], trans: 'continuous' }
  ],
  event: [
    { type: 'orientation', emotion: 'calm', tension: 1, range: [1, 1], trans: 'continuous' },
    { type: 'incident', emotion: 'surprised', tension: 3, range: [2, 3], trans: 'continuous' },
    { type: 'silence', emotion: 'surprised', tension: 3, range: [1, 1], trans: 'continuous' },
    { type: 'objection', emotion: 'surprised', tension: 3, range: [1, 2], trans: 'continuous' },
    { type: 'tension_build', emotion: 'calm', tension: 2, range: [1, 1], trans: 'release' }
  ],
  reveal: [
    { type: 'orientation', emotion: 'calm', tension: 2, range: [1, 1], trans: 'continuous' },
    { type: 'reveal', emotion: 'wonder', tension: 2, range: [1, 2], trans: 'release' },
    { type: 'reflection', emotion: 'relief', tension: 1, range: [1, 1], trans: 'continuous' }
  ],
  ending: [
    { type: 'tension_build', emotion: 'solemn', tension: 3, range: [1, 1], trans: 'release' },
    { type: 'farewell', emotion: 'sad', tension: 2, range: [1, 2], trans: 'continuous' },
    { type: 'silence', emotion: 'sad', tension: 1, range: [1, 1], trans: 'continuous' }
  ]
};
const FALLBACK_BEATS = [
  { type: 'orientation', emotion: 'calm', tension: 1, range: [1, 2], trans: 'continuous' },
  { type: 'incident', emotion: 'thinking', tension: 2, range: [1, 2], trans: 'continuous' },
  { type: 'reflection', emotion: 'calm', tension: 1, range: [1, 1], trans: 'continuous' }
];

// purpose/visual_intent dinamik bagi laluan generik — selaras visualFor() panelEngine.js.
function purposeFor(beatType, scene) {
  const title = scene.title_ms || scene.title_ar || 'babak ini';
  const summary = scene.summary_ms || '';
  switch (beatType) {
    case 'orientation': return 'Membuka konteks dan suasana bagi babak "' + title + '".';
    case 'question': return 'Persoalan/rasa ingin tahu dicetuskan dalam babak "' + title + '".';
    case 'instruction': return summary ? ('Pengajaran/nasihat disampaikan: ' + summary) : ('Pengajaran disampaikan dalam babak "' + title + '".');
    case 'commitment': return 'Watak membuat keputusan/ikrar untuk meneruskan babak "' + title + '".';
    case 'tension_build': return 'Ketegangan mula terbina dalam babak "' + title + '".';
    case 'incident': return summary ? ('Kejadian utama berlaku: ' + summary) : ('Kejadian utama dalam babak "' + title + '".');
    case 'objection': return 'Watak membantah/tidak dapat menerima kejadian dalam babak "' + title + '".';
    case 'silence': return 'Jeda senyap untuk meresap kesan babak "' + title + '".';
    case 'reveal': return summary ? ('Hikmah/rahsia didedahkan: ' + summary) : ('Detik pendedahan dalam babak "' + title + '".');
    case 'reflection': return 'Renungan/pengajaran diringkaskan bagi babak "' + title + '".';
    case 'dua_moment': return 'Detik doa/renungan khusyuk menutup babak "' + title + '".';
    case 'farewell': return 'Detik perpisahan dalam babak "' + title + '".';
    case 'transition': return 'Peralihan menuju babak seterusnya.';
    default: return 'Beat bagi babak "' + title + '".';
  }
}
function visualIntentFor(beatType, scene) {
  const loc = scene.location || 'lokasi babak';
  switch (beatType) {
    case 'orientation': return 'Pandangan lapang ' + loc + ', memperkenalkan konteks.';
    case 'question': return 'Tumpuan pada watak yang bertanya/tertanya-tanya.';
    case 'instruction': return 'Fokus pada watak yang menyampaikan ajaran.';
    case 'commitment': return 'Watak menunjukkan tekad/keazaman.';
    case 'tension_build': return 'Suasana mula tegang tanpa insiden lagi berlaku.';
    case 'incident': return 'Tindakan/kejadian ditangkap dengan tenaga.';
    case 'objection': return 'Jarak dekat, dialog tegas antara watak.';
    case 'silence': return 'Komposisi lengang, tiada dialog, ruang bernafas.';
    case 'reveal': return 'Komposisi "hero", tumpuan penuh pada detik pendedahan.';
    case 'reflection': return 'Nada tenang, mengimbas semula peristiwa.';
    case 'dua_moment': return 'Suasana khusyuk dan tenang.';
    case 'farewell': return 'Jarak antara watak mula terbentuk, nada sedih.';
    case 'transition': return 'Persekitaran sahaja, watak kecil/tiada, menandakan lompat masa/tempat.';
    default: return 'Paparan visual biasa bagi beat ini.';
  }
}

function cloneBeat(b, no) {
  return {
    beat_no: no,
    beat_type: b.beat_type,
    purpose: b.purpose,
    emotion: b.emotion,
    tension_level: b.tension_level,
    visual_intent: b.visual_intent,
    suggested_panel_count: { min: b.suggested_panel_count.min, max: b.suggested_panel_count.max },
    transition_from_previous: b.transition_from_previous
  };
}

// Jana templat Beat bagi SATU babak (kanonik ikut scene_no dahulu, generik
// ikut scene_type seterusnya, fallback akhir jika scene_type tidak dikenali).
//   scene : objek babak (perlu scene_no, scene_type; title_ms/summary_ms/
//           location digunakan oleh laluan generik sahaja)
function extractBeats(scene) {
  const sc = scene || {};
  const no = sc.scene_no;
  const canon = (no !== undefined && no !== null) ? BEATS_BY_SCENE[String(no)] : null;
  if (canon && canon.length) {
    return canon.map(function (b, i) { return cloneBeat(b, i + 1); });
  }
  const generic = GENERIC_BEATS_BY_TYPE[sc.scene_type] || FALLBACK_BEATS;
  return generic.map(function (b, i) {
    return {
      beat_no: i + 1,
      beat_type: b.type,
      purpose: purposeFor(b.type, sc),
      emotion: b.emotion,
      tension_level: b.tension,
      visual_intent: visualIntentFor(b.type, sc),
      suggested_panel_count: { min: b.range[0], max: b.range[1] },
      transition_from_previous: b.trans
    };
  });
}

module.exports = {
  STORY_KEY,
  matchesStory,
  extractScenes,
  // Fasa 23: Narrative Beat (sokongan container sahaja — struktur Scene tidak berubah)
  BEAT_TYPES,
  TRANSITION_TYPES,
  extractBeats
};
