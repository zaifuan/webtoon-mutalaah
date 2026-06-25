'use strict';

// ===========================================================================
// panelEngine.js
// Enjin penjanaan PANEL (storyboard draft) — TANPA AI (rule-based).
//
// FOKUS FASA 4: setiap babak dipecahkan kepada 3–5 panel asas mengikut
// scene_type. Data babak (title, summary, location, mood, characters)
// digunakan untuk menyusun visual_ms / caption_ms / nota.
//
// INTEGRASI POLISI MUKA (WAJIB): jika panel mengandungi kod watak yang
// tergolong tokoh mulia (noble_figure_no_face / glowing_light), nota wajib
// ditambah ke visual_notes — wajah tidak dipaparkan, diganti cahaya lembut.
// ===========================================================================

// Nota WAJIB bagi panel yang mengandungi tokoh mulia.
const NOBLE_PANEL_NOTE =
  'Watak tokoh mulia dalam panel ini tidak memaparkan wajah. ' +
  'Wajah diganti dengan cahaya lembut bersinar, tanpa mata, hidung atau mulut.';

// Pemilih watak untuk setiap "beat":
//   all   -> semua watak babak
//   lead  -> watak pertama
//   pair  -> dua watak pertama
//   crowd -> watak berkumpulan (_GROUP) sahaja; [] jika tiada
function pickWho(kind, chars) {
  const list = Array.isArray(chars) ? chars : [];
  if (kind === 'all') return list.slice();
  if (kind === 'lead') return list.length ? [list[0]] : [];
  if (kind === 'pair') return list.slice(0, 2);
  if (kind === 'crowd') return list.filter(function (c) { return /_GROUP$/.test(c); });
  return list.slice();
}

// Susunan beat (panel) bagi setiap scene_type — menghasilkan 3–5 panel.
const BEATS = {
  intro: [
    { type: 'establishing', shot: 'wide', who: 'all' },
    { type: 'character', shot: 'medium', who: 'lead' },
    { type: 'reaction', shot: 'close_up', who: 'crowd' }
  ],
  journey: [
    { type: 'establishing', shot: 'wide', who: 'all' },
    { type: 'character', shot: 'medium', who: 'lead' },
    { type: 'action', shot: 'medium', who: 'all' },
    { type: 'reaction', shot: 'close_up', who: 'crowd' }
  ],
  meeting: [
    { type: 'establishing', shot: 'wide', who: 'all' },
    { type: 'character', shot: 'medium', who: 'lead' },
    { type: 'dialogue', shot: 'over_shoulder', who: 'pair' },
    { type: 'reaction', shot: 'close_up', who: 'crowd' }
  ],
  lesson: [
    { type: 'establishing', shot: 'wide', who: 'all' },
    { type: 'dialogue', shot: 'medium', who: 'pair' },
    { type: 'reaction', shot: 'close_up', who: 'crowd' },
    { type: 'closing', shot: 'medium', who: 'pair' }
  ],
  event: [
    { type: 'establishing', shot: 'wide', who: 'all' },
    { type: 'action', shot: 'medium', who: 'all' },
    { type: 'reaction', shot: 'close_up', who: 'crowd' },
    { type: 'dialogue', shot: 'over_shoulder', who: 'pair' },
    { type: 'reveal', shot: 'detail', who: 'pair' }
  ],
  reveal: [
    { type: 'establishing', shot: 'wide', who: 'all' },
    { type: 'dialogue', shot: 'medium', who: 'pair' },
    { type: 'reveal', shot: 'medium', who: 'pair' },
    { type: 'reaction', shot: 'close_up', who: 'crowd' }
  ],
  ending: [
    { type: 'establishing', shot: 'wide', who: 'all' },
    { type: 'dialogue', shot: 'medium', who: 'pair' },
    { type: 'closing', shot: 'wide', who: 'all' }
  ]
};
const FALLBACK_BEATS = [
  { type: 'establishing', shot: 'wide', who: 'all' },
  { type: 'character', shot: 'medium', who: 'lead' },
  { type: 'reaction', shot: 'close_up', who: 'crowd' }
];

const COMPOSITION = {
  establishing: 'wide_balanced',
  character: 'centered',
  dialogue: 'two_shot',
  action: 'dynamic',
  reaction: 'close_framing',
  reveal: 'centered',
  closing: 'wide_balanced',
  transition: 'minimal'
};

function visualFor(beat, scene) {
  const loc = scene.location || 'lokasi babak';
  const title = scene.title_ms || scene.title_ar || 'babak ini';
  const summary = scene.summary_ms || '';
  switch (beat.type) {
    case 'establishing': return 'Pemandangan luas ' + loc + ' bagi membuka babak "' + title + '".';
    case 'character': return 'Fokus pada watak utama dalam babak "' + title + '".';
    case 'dialogue': return summary ? ('Babak perbualan: ' + summary) : ('Dua watak berinteraksi dalam babak "' + title + '".');
    case 'action': return summary ? ('Aksi utama berlaku: ' + summary) : ('Aksi utama dalam babak "' + title + '".');
    case 'reaction': return 'Riak wajah dan reaksi terhadap peristiwa di ' + loc + '.';
    case 'reveal': return summary ? ('Detik hikmah didedahkan: ' + summary) : ('Detik hikmah dalam babak "' + title + '".');
    case 'closing': return 'Babak penutup "' + title + '" di ' + loc + '.';
    default: return 'Panel bagi babak "' + title + '".';
  }
}

const BASE_NOTE = {
  establishing: 'Tunjukkan latar dan kedudukan watak dengan jelas.',
  character: 'Tekankan ekspresi dan postur watak utama.',
  dialogue: 'Susun dua watak berhadapan untuk dialog.',
  action: 'Tangkap pergerakan aksi dengan tenaga.',
  reaction: 'Fokus dekat pada reaksi emosi.',
  reveal: 'Bina suasana pendedahan hikmah.',
  closing: 'Suasana tenang menutup babak.',
  transition: 'Peralihan lembut antara babak.'
};

function hasNoble(codes, nobleSet) {
  for (var i = 0; i < codes.length; i++) {
    if (nobleSet && nobleSet.has(codes[i])) return true;
  }
  return false;
}

// Jana templat panel bagi satu babak.
//  scene    : objek babak (characters_json sudah array)
//  nobleSet : Set kod watak tokoh mulia bagi projek
function extractPanels(scene, nobleSet) {
  const chars = Array.isArray(scene.characters_json) ? scene.characters_json : [];
  const beats = BEATS[scene.scene_type] || FALLBACK_BEATS;
  const out = [];

  for (var i = 0; i < beats.length; i++) {
    var beat = beats[i];
    var who = pickWho(beat.who, chars);
    var notes = BASE_NOTE[beat.type] || '';
    if (hasNoble(who, nobleSet)) {
      notes = (notes ? notes + ' ' : '') + NOBLE_PANEL_NOTE;
    }
    out.push({
      panel_no: i + 1,
      panel_order: i + 1,
      panel_type: beat.type,
      shot_type: beat.shot,
      composition: COMPOSITION[beat.type] || null,
      camera: 'eye_level',
      visual_ms: visualFor(beat, scene),
      action_ms: beat.type === 'action' ? (scene.summary_ms || null) : null,
      emotion_ms: beat.type === 'reaction' ? (scene.mood || null) : null,
      location: scene.location || null,
      mood: scene.mood || null,
      characters_json: who,
      caption_ms: beat.type === 'establishing' ? (scene.title_ms || null) : (scene.summary_ms || null),
      caption_ar: null,
      dialogue_ar: null,
      dialogue_ms: null,
      visual_notes: notes || null,
      needs_image: true
    });
  }
  return out;
}

module.exports = {
  NOBLE_PANEL_NOTE,
  extractPanels
};
