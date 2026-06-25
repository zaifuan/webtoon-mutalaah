'use strict';

// ===========================================================================
// scriptSource.js
// Lapisan "Script" dalam pipeline (Panel → Script → Visual → Prompt).
//
// Skrip menyatukan medan PIAWAI: speaker, narration, caption, dialogue,
// thought, sfx, emotion — supaya Visual Director & Prompt Engine boleh
// menghasilkan arahan yang lebih tepat.
//
// FASA 7: kini ada jadual `scripts` sebenar (1:N bagi setiap panel).
//   resolveScript() — baca scripts sebenar daripada pangkalan data JIKA wujud,
//                     gabungkan kepada objek piawai. Jika belum ada rekod,
//                     jatuh-balik kepada sintesis daripada panel (tiada regression).
//   buildScript()   — sintesis murni daripada medan panel (sedia ada, dikekalkan).
//
// buildScript() kekal SEGERAK (sync) kerana ia dipanggil oleh visualEngine &
// promptEngine secara langsung. resolveScript() adalah async (query DB) dan
// menjadi pintu masuk utama bagi Visual & Prompt route (lihat bawah).
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

// Bina objek skrip PIAWAI secara sintesis murni daripada medan panel (Fasa 6C).
//
// Bentuk piawai (digunakan oleh Visual & Prompt engine):
//   { speaker, narration, caption, dialogue, thought, sfx, emotion }
//
// Semua medan WAJIB wujud. Jika tiada nilai, pulangkan string kosong "" —
// JANGAN null.
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

// Gabungkan senarai baris jadual `scripts` (1:N) menjadi satu objek piawai.
// Medan berganda disambung dengan pemisah " / " mengikut reading_order.
//  rows : array baris scripts (sudah disusun) — masing-masing membawa
//         script_type, speaker_code, speaker_name, text_ms, text_ar,
//         emotion, bubble_type.
function mergeScriptRows(rows) {
  const empty = { speaker: '', narration: '', caption: '', dialogue: '', thought: '', sfx: '', emotion: '' };
  if (!Array.isArray(rows) || rows.length === 0) return empty;

  const out = Object.assign({}, empty);
  const narrationParts = [];
  const dialogueParts = [];
  const captionParts = [];
  const thoughtParts = [];
  const sfxParts = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var type = s(r.script_type);
    var text = s(r.text_ms);
    // Pilih penutur dialog pertama yang ada speaker_code.
    if (type === 'dialogue' && !out.speaker && r.speaker_code) {
      out.speaker = s(r.speaker_code);
    }
    // Emosi: ambil emosi bukan-neutral pertama.
    if (!out.emotion || out.emotion === 'neutral') {
      var em = s(r.emotion);
      if (em && em !== 'neutral') out.emotion = em;
    }
    if (!text) continue;
    switch (type) {
      case 'narration':
      case 'reaction':
        narrationParts.push(text); break;
      case 'dialogue':
        dialogueParts.push(text); break;
      case 'caption':
        captionParts.push(text); break;
      case 'thought':
      case 'dua':
        thoughtParts.push(text); break;
      case 'sfx':
        sfxParts.push(text); break;
      default:
        narrationParts.push(text);
    }
  }

  out.narration = narrationParts.join(' / ');
  out.dialogue = dialogueParts.join(' / ');
  out.caption = captionParts.join(' / ');
  out.thought = thoughtParts.join(' / ');
  out.sfx = sfxParts.join(' / ');
  if (!out.emotion) out.emotion = 'neutral';
  return out;
}

// ===========================================================================
// resolveScript — pintu masuk utama Fasa 7.
//
// Baca scripts sebenar daripada jadual `scripts` bagi panel ini. Jika wujud,
// gabungkan kepada objek piawai. Jika belum ada rekod, jatuh-balik kepada
// sintesis buildScript() (tiada regression).
//
//  clientOrPool : klien / pool pg (boleh dari transaksi)
//  panel        : objek panel (characters_json sudah array)
//  scene        : objek babak
//  charMap      : { code: { character_type, face_policy, visual_dna } }
// ===========================================================================
async function resolveScript(clientOrPool, panel, scene, charMap) {
  try {
    const { rows } = await clientOrPool.query(
      `SELECT script_type, speaker_code, speaker_name, text_ar, text_ms,
              emotion, bubble_type, reading_order, status
         FROM scripts
        WHERE panel_id = $1
        ORDER BY reading_order ASC NULLS LAST, script_order ASC, id ASC`,
      [panel.id]
    );
    if (rows.length > 0) {
      return mergeScriptRows(rows);
    }
  } catch (err) {
    // Jika jadual `scripts` belum wujud (migration belum lari), jatuh-balik
    // secara senyap kepada sintesis lama — tidak memecahkan Visual/Prompt.
    console.error('[scriptSource] resolveScript fallback:', err.message);
  }
  return buildScript(panel, scene || {}, charMap);
}

module.exports = {
  buildScript,
  resolveScript,
  mergeScriptRows,
  pickSpeaker
};
