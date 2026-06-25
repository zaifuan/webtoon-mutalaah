'use strict';

// ===========================================================================
// scriptEngine.js
// Enjin penjanaan SKRIPT sebenar — TANPA AI (rule-based + dictionary).
//
// FOKUS FASA 7: bagi setiap panel, jana SATU ATAU LEBIH script item
// (narration, dialogue, thought, sfx, caption, reaction, dua) berpandukan
//   scene_no      (urutan babak dalam kisah)
//   panel_no      (kedudukan beat dalam babak)
//   panel_type    (jenis beat: establishing / dialogue / reaction / dll)
//   characters_json
//   title_ms / visual_ms / caption_ms
//
// Dioptimumkan untuk SATU tajuk dahulu:
//     « سيدنا موسى وخضر »  (Surah al-Kahf)
//
// Hubungan sebenar: Project -> Scene -> Panel -> Scripts (1:N), BUKAN 1:1.
// Contoh: satu panel boleh mempunyai narration + dialogue + thought.
//
// PENJANAAN IDEMPOTEN: jana kali kedua tidak menduplikasi — gabungan
// (panel_id, script_order) dijadikan unik di jadual (migration 008).
// ===========================================================================

// Peta nama penutur (selaras characterEngine.js).
const SPEAKER_NAMES = {
  MUSA_001: 'Nabi Musa',
  KHIDR_001: 'Nabi Khidir',
  YUSHA_001: "Yusha' bin Nun",
  BOY_001: 'Budak lelaki',
  BOAT_PEOPLE_GROUP: 'Anak kapal',
  VILLAGE_PEOPLE_GROUP: 'Penduduk kampung'
};

function speakerName(code) {
  return SPEAKER_NAMES[code] || code || '';
}

// --- Medan enum (selaras migration 008 / CHECK constraint) -----------------
const SCRIPT_TYPES = ['narration', 'dialogue', 'thought', 'dua', 'sfx', 'caption', 'reaction'];
const BUBBLE_TYPES = ['speech', 'thought', 'narration', 'dua', 'sfx', 'caption', 'none'];
const EMOTIONS = ['neutral', 'calm', 'solemn', 'sad', 'happy', 'angry', 'fear',
  'surprised', 'thinking', 'respectful', 'wonder'];
const STATUSES = ['draft', 'approved'];

// Peta mood babak (senarai Melayu,cth "serius, menyentuh hati") -> emotion enum.
const MOOD_KEYWORDS = [
  ['serius', 'solemn'],
  ['menyentuh', 'solemn'],
  ['hikmah', 'wonder'],
  ['reflektif', 'thinking'],
  ['ingin tahu', 'thinking'],
  ['mendidik', 'calm'],
  ['tekad', 'calm'],
  ['mencari ilmu', 'thinking'],
  ['letih', 'sad'],
  ['hairan', 'surprised'],
  ['tenang', 'calm'],
  ['adab', 'respectful'],
  ['cemas', 'fear'],
  ['mengejut', 'surprised'],
  ['berat', 'solemn'],
  ['lapar', 'sad'],
  ['sedih', 'sad'],
  ['menerima', 'respectful'],
  ['jelas', 'wonder'],
  ['gembira', 'happy'],
  ['riang', 'happy'],
  ['marah', 'angry']
];

function moodToEmotion(mood, fallback) {
  if (!mood) return fallback || 'neutral';
  const lc = String(mood).toLowerCase();
  for (var i = 0; i < MOOD_KEYWORDS.length; i++) {
    if (lc.indexOf(MOOD_KEYWORDS[i][0]) !== -1) return MOOD_KEYWORDS[i][1];
  }
  return fallback || 'neutral';
}

// Pastikan nilai sentiasa string (tidak pernah null/undefined).
function s(v) { return (v === undefined || v === null) ? '' : String(v); }

// ===========================================================================
// KANDUNGAN KANONIK kisah Musa & Khidr.
// Dikunci mengikut (scene_no, panel_no) — selaras dengan sceneEngine (13 babak)
// dan panelEngine (beat mengikut scene_type).
//
// Setiap item TIDAK termasuk script_order; ia ditambah mengikut kedudukan
// dalam array (1, 2, 3, ...) oleh builder.
// ===========================================================================
const CANON = {
  // Babak 1 — Khutbah Nabi Musa (intro: establishing, character, reaction)
  '1': {
    1: [
      { script_type: 'narration', text_ar: 'في يوم من الأيام، خطب موسى في بني إسرائيل.',
        text_ms: 'Pada suatu hari, Nabi Musa menyampaikan khutbah kepada Bani Israel.',
        emotion: 'solemn', bubble_type: 'narration' }
    ],
    2: [
      { script_type: 'dialogue', speaker_code: 'MUSA_001',
        text_ar: 'يا قوم، اتقوا الله واذكروا نعمه عليكم.',
        text_ms: 'Wahai kaumku, bertakwalah kepada Allah dan ingatlah nikmat-Nya kepada kamu.',
        emotion: 'solemn', bubble_type: 'speech' }
    ],
    3: [
      { script_type: 'narration',
        text_ar: 'فرقت قلوبهم ودمعت عيونهم.',
        text_ms: 'Hati mereka menjadi lembut dan mata mereka berlinang.',
        emotion: 'respectful', bubble_type: 'narration' }
    ]
  },

  // Babak 6 — Pertemuan Musa dan Khidir (meeting: establishing, character, dialogue, reaction)
  '6': {
    3: [
      { script_type: 'dialogue', speaker_code: 'MUSA_001',
        text_ar: 'هل أتبعك على أن تعلمني مما علمت رشدا؟',
        text_ms: 'Bolehkah aku mengikutimu dengan syarat engkau mengajarkanku ilmu yang ditunjukkan kepadaku sebagai petunjuk?',
        emotion: 'respectful', bubble_type: 'speech' },
      { script_type: 'dialogue', speaker_code: 'KHIDR_001',
        text_ar: 'إنك لن تستطيع معي صبرا.',
        text_ms: 'Sesungguhnya engkau tidak akan dapat bersabar bersamaku.',
        emotion: 'calm', bubble_type: 'speech' }
    ]
  },

  // Babak 7 — Perjanjian sabar (lesson: establishing, dialogue, reaction, closing)
  '7': {
    2: [
      { script_type: 'dialogue', speaker_code: 'KHIDR_001',
        text_ar: 'فإن اتّبعتني فلا تسألني عن شيء حتى أُحدث لك منه ذكرا.',
        text_ms: 'Maka jika engkau mengikutiku, janganlah engkau bertanya kepadaku tentang sesuatu sehingga aku menerangkannya kepadamu.',
        emotion: 'solemn', bubble_type: 'speech' }
    ]
  },

  // Babak 8 — Kapal (event: establishing, action, reaction, dialogue, reveal)
  '8': {
    2: [
      { script_type: 'narration',
        text_ar: 'فانطلقا حتى إذا ركبا في السفينة خرقها.',
        text_ms: 'Lalu mereka berangkat sehingga ketika menaiki kapal, Khidir melubanginya.',
        emotion: 'surprised', bubble_type: 'narration' },
      { script_type: 'sfx', text_ar: '', text_ms: '(bunyi papan kapal pecah)',
        emotion: 'neutral', bubble_type: 'sfx' }
    ],
    4: [
      { script_type: 'dialogue', speaker_code: 'MUSA_001',
        text_ar: 'لقد جئت شيئاً إمراً.',
        text_ms: 'Sesungguhnya aku telah melakukan sesuatu yang sangat sukar.',
        emotion: 'surprised', bubble_type: 'speech' },
      { script_type: 'dialogue', speaker_code: 'KHIDR_001',
        text_ar: 'ألم أقل لك إنك لن تستطيع معي صبرا؟',
        text_ms: 'Bukankah aku telah berkata kepadamu, sesungguhnya engkau tidak akan dapat bersabar bersamaku?',
        emotion: 'calm', bubble_type: 'speech' }
    ]
  },

  // Babak 9 — Budak (event: establishing, action, reaction, dialogue, reveal)
  '9': {
    4: [
      { script_type: 'dialogue', speaker_code: 'MUSA_001',
        text_ar: 'لقد جئت شيئاً نُكراً.',
        text_ms: 'Sesungguhnya aku telah melakukan sesuatu yang sangat mengerikan.',
        emotion: 'sad', bubble_type: 'speech' }
    ]
  },

  // Babak 10 — Dinding (event: establishing, action, reaction, dialogue, reveal)
  '10': {
    4: [
      { script_type: 'dialogue', speaker_code: 'MUSA_001',
        text_ar: 'لو شئت لاتّخذت عليه أجراً.',
        text_ms: 'Jika engkau mahu, nescaya engkau mengambil upah atasnya.',
        emotion: 'solemn', bubble_type: 'speech' }
    ]
  },

  // Babak 12 — Penjelasan hikmah (reveal: establishing, dialogue, reveal, reaction)
  '12': {
    2: [
      { script_type: 'dialogue', speaker_code: 'KHIDR_001',
        text_ar: 'أما السفينة فكانت لمساكين يعملون في البحر فأردت أن أعيبها.',
        text_ms: 'Adapun kapal itu milik orang-orang miskin yang bekerja di laut, maka aku hendak merosakkannya.',
        emotion: 'calm', bubble_type: 'speech' }
    ],
    3: [
      { script_type: 'dialogue', speaker_code: 'KHIDR_001',
        text_ar: 'وأما الغلام فكان أبواه مؤمنين فخشينا أن يُرهقهما طغياناً وكفراً.',
        text_ms: 'Adapun budak itu, kedua ibu bapanya mukmin, maka kami khuatir ia menyeret mereka kepada kesombongan dan kekufuran.',
        emotion: 'solemn', bubble_type: 'speech' },
      { script_type: 'dialogue', speaker_code: 'KHIDR_001',
        text_ar: 'وأما الجدار فكان لغلامين يتيمين، فأراد ربك أن يبلغا أشدهما.',
        text_ms: 'Adapun dinding itu milik dua budak yatim, maka Tuhanmu menghendaki agar mereka mencapai dewasa.',
        emotion: 'wonder', bubble_type: 'speech' }
    ]
  }
};

// ===========================================================================
// Penjanaan GENERIK (fallback) berdasarkan panel_type + data panel/babak.
// Digunakan bagi panel yang tiada kandungan kanonik.
// ===========================================================================

// Watak bukan-kumpulan pertama (utamakan tokoh mulia) sebagai penutur lalai.
function pickSpeakerCode(codes) {
  const list = Array.isArray(codes) ? codes : [];
  const nonGroup = list.filter(function (c) { return !/_GROUP$/.test(c); });
  return nonGroup.length ? nonGroup[0] : '';
}

function genericItems(panel, scene) {
  const ptype = s(panel.panel_type) || 'character';
  const titleMs = s(scene && scene.title_ms);
  const summary = s(scene && scene.summary_ms);
  const visual = s(panel.visual_ms);
  const caption = s(panel.caption_ms);
  const dialogueMs = s(panel.dialogue_ms);
  const dialogueAr = s(panel.dialogue_ar);
  const emotion = moodToEmotion(scene && scene.mood, 'neutral');
  const codes = Array.isArray(panel.characters_json) ? panel.characters_json : [];
  const speaker = pickSpeakerCode(codes);
  const out = [];

  switch (ptype) {
    case 'establishing':
      // Pembuka babak: kapsyen (tajuk) + naratif ringkas.
      if (titleMs) {
        out.push({ script_type: 'caption', text_ar: '', text_ms: titleMs,
          emotion: emotion, bubble_type: 'caption' });
      }
      out.push({ script_type: 'narration', text_ar: '', text_ms: visual || summary,
        emotion: emotion, bubble_type: 'narration' });
      break;
    case 'character':
      out.push({ script_type: 'narration', text_ar: '', text_ms: visual || summary,
        emotion: emotion, bubble_type: 'narration' });
      break;
    case 'dialogue':
      // Naratif + dialog (jika ada di panel) atau teks penutur generik.
      if (visual || summary) {
        out.push({ script_type: 'narration', text_ar: '', text_ms: visual || summary,
          emotion: emotion, bubble_type: 'narration' });
      }
      if (dialogueMs || dialogueAr) {
        out.push({ script_type: 'dialogue', speaker_code: speaker,
          text_ar: dialogueAr, text_ms: dialogueMs,
          emotion: emotion, bubble_type: 'speech' });
      }
      break;
    case 'action':
      out.push({ script_type: 'narration', text_ar: '', text_ms: visual || summary,
        emotion: emotion, bubble_type: 'narration' });
      break;
    case 'reaction':
      out.push({ script_type: 'reaction', text_ar: '', text_ms: visual || ('Reaksi watak terhadap peristiwa di ' + s(scene && scene.location) + '.'),
        emotion: emotion, bubble_type: 'narration' });
      break;
    case 'reveal':
      out.push({ script_type: 'narration', text_ar: '', text_ms: visual || summary,
        emotion: 'wonder', bubble_type: 'narration' });
      break;
    case 'closing':
      out.push({ script_type: 'narration', text_ar: '', text_ms: visual || ('Penutup babak "' + titleMs + '".'),
        emotion: 'calm', bubble_type: 'narration' });
      break;
    case 'transition':
      out.push({ script_type: 'narration', text_ar: '', text_ms: visual || 'Peralihan ke babak seterusnya.',
        emotion: 'neutral', bubble_type: 'narration' });
      break;
    default:
      out.push({ script_type: 'narration', text_ar: '', text_ms: visual || summary || caption,
        emotion: emotion, bubble_type: 'narration' });
  }
  return out;
}

// ===========================================================================
// API UTAMA: jana templat skrip bagi satu panel.
//   panel : objek panel (characters_json sudah array)
//   scene : objek babak
// Pulangkan: array item skrip (tanpa id/panel_id/project_id/scene_id).
// Setiap item membawa script_order + reading_order (1..n), speaker_name,
// status 'draft', notes ''.
// ===========================================================================
function generateScripts(panel, scene) {
  const sceneNo = Number(scene && scene.scene_no);
  const panelNo = Number(panel && panel.panel_no);
  let items = null;

  // Cuba kandungan kanonik bagi kisah Musa & Khidir (scene 1..13).
  if (Number.isInteger(sceneNo) && CANON[String(sceneNo)]) {
    const sceneCanon = CANON[String(sceneNo)];
    const key = panelNo;
    if (Number.isInteger(panelNo) && sceneCanon[key]) {
      items = sceneCanon[key].map(function (it) { return Object.assign({}, it); });
    }
  }

  // Fallback generik jika tiada kandungan kanonik.
  if (!items || !items.length) {
    items = genericItems(panel, scene);
  }

  // Lengkapkan medan piawai & susunan.
  return items.map(function (it, idx) {
    const order = idx + 1;
    const code = s(it.speaker_code);
    return {
      script_order: order,
      script_type: it.script_type || 'narration',
      speaker_code: code,
      speaker_name: code ? speakerName(code) : '',
      text_ar: s(it.text_ar),
      text_ms: s(it.text_ms),
      emotion: it.emotion || 'neutral',
      bubble_type: it.bubble_type || 'narration',
      reading_order: order,
      status: 'draft',
      notes: s(it.notes)
    };
  });
}

module.exports = {
  generateScripts,
  SPEAKER_NAMES,
  speakerName,
  moodToEmotion,
  SCRIPT_TYPES,
  BUBBLE_TYPES,
  EMOTIONS,
  STATUSES
};
