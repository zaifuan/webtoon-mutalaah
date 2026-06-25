'use strict';

// ===========================================================================
// scriptSource.js
// Lapisan "Script" dalam pipeline (Panel → Script → Visual → Prompt).
//
// Skrip menyatukan medan PIAWAI: speaker, narration, caption, dialogue,
// thought, sfx, emotion — supaya Visual Director & Prompt Engine boleh
// menghasilkan arahan yang lebih tepat. Pada peringkat ini, skrip DISINTESIS
// daripada medan panel sedia ada dan TIDAK memerlukan jadual baharu.
// (`thought` dan `sfx` kekal kosong "" buat masa ini.)
//
// Pada Fasa 7, modul/jadual `scripts` sebenar akan dibina; fungsi ini akan
// dikemas kini untuk membaca rekod skrip apabila wujud, dan jika tiada, kekal
// jatuh-balik kepada sintesis daripada panel (tiada regression).
// ===========================================================================

function firstMood(mood) {
  if (!mood) return '';
  return String(mood).split(',')[0].trim() || '';
}

// Pastikan nilai sentiasa string (tidak pernah null/undefined).
function s(v) { return (v === undefined || v === null) ? '' : String(v); }

// Penutur = watak bukan-kumpulan pertama dalam panel (utamakan tokoh mulia).
function pickSpeaker(codes, charMap) {
  const map = charMap || {};
  const nonGroup = (codes || []).filter(function (c) { return !/_GROUP$/.test(c); });
  if (!nonGroup.length) return '';
  for (var i = 0; i < nonGroup.length; i++) {
    var m = map[nonGroup[i]];
    if (m && m.character_type === 'noble_figure_no_face') return nonGroup[i];
  }
  return nonGroup[0];
}

// Bina objek skrip PIAWAI bagi satu panel.
//
// Bentuk piawai (digunakan oleh Visual & Prompt engine, dan kelak jadual
// `scripts` sebenar pada Fasa 7):
//   { speaker, narration, caption, dialogue, thought, sfx, emotion }
//
// Semua medan WAJIB wujud. Jika tiada nilai, pulangkan string kosong "" —
// JANGAN null. `thought` dan `sfx` masih kosong pada peringkat ini.
//
//  panel   : objek panel (characters_json sudah array)
//  scene   : objek babak
//  charMap : { code: { character_type, face_policy, visual_dna } }
function buildScript(panel, scene, charMap) {
  const codes = Array.isArray(panel.characters_json) ? panel.characters_json : [];
  return {
    speaker: s(pickSpeaker(codes, charMap)),
    narration: s(panel.visual_ms || panel.action_ms || ''),
    caption: s(panel.caption_ms || ''),
    dialogue: s(panel.dialogue_ms || ''),
    thought: '',
    sfx: '',
    emotion: s(panel.emotion_ms || firstMood(scene && scene.mood))
  };
}

module.exports = {
  buildScript,
  pickSpeaker
};
