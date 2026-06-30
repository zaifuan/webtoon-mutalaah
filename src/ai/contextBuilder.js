'use strict';

// ===========================================================================
// src/ai/contextBuilder.js — Fasa 21: helper konteks padat untuk Story Director
//
// Dipanggil oleh storyDirector.userFor() untuk membina konteks RINGKAS & KONSISTEN
// bagi setiap Director. Fokus Fasa 21:
//   1) penjimatan token (hantar medan berguna sahaja, bukan keseluruhan baris DB);
//   2) konsistensi watak (DNA visual dihadkan & disusun supaya watak sama kelihatan
//      sama di semua panel);
//   3) continuity lokasi/masa/mood (diangkut antara Director);
//   4) ringkasan selamat untuk Review (bukan dump JSON penuh).
//
// Sifat additive: fail baru, tidak pecahkan apa-apa. Dipanggil secara OPTIONAL —
// jika dipanggil dengan payload kosong, pulang ringkasan kosong (tidak crash, tidak
// mengubah bentuk mesej sedia ada). TIDAK menyentuh DB, TIDAK memanggil AI.
//
// Bentuk data diterima (selaras payload yang dihantar oleh route Fasa 20):
//   characters: [{ character_code, name_ar, name_ms, character_type, face_policy,
//                  role, visual_dna:{...} }]
//   scene:      { scene_no, title_ar, title_ms, summary_ar, summary_ms, mood,
//                 location, scene_type, characters_json:[...] }
//   panel:      { panel_no, panel_type, shot_type, composition, camera, visual_ms,
//                 caption_ms, emotion_ms, location, mood, characters_json:[...] }
//   script:     { narration, dialogue, caption, thought, sfx, emotion, speaker }
//   visual:     { shot, angle, lens, lighting, atmosphere, composition, ... ,
//                 characters_layout:[{code,position,...}], face_policy }
// ===========================================================================

function s(v) { return (v === undefined || v === null) ? '' : String(v); }
function asArray(v) { return Array.isArray(v) ? v : []; }

// Susun atur padat DNA visual supaya output konsisten & ringkas.
// Medan yang tidak berguna (kosong/undefined) dibuang sepenuhnya.
function compactDna(dna) {
  const d = (dna && typeof dna === 'object' && !Array.isArray(dna)) ? dna : {};
  // Turutan kunci tetap → paparan DNA stabil & boleh diramal antara panel.
  const ORDER = ['gender', 'age', 'height', 'build', 'robe', 'garment', 'color',
    'turban', 'headwear', 'hair', 'beard', 'skin', 'staff', 'prop', 'attire',
    'count', 'group', 'setting'];
  const out = {};
  for (var i = 0; i < ORDER.length; i++) {
    var k = ORDER[i];
    var v = d[k];
    if (v === undefined || v === null || v === '') continue;
    if (k === 'turban' && (v === 'none' || v === false)) continue; // 'none' tidak membantu
    out[k] = v;
  }
  return out;
}

// Brief watak padat: code + nama Arab (utama) + jenis + face_policy + DNA ringkas.
// Tujuan: konsistensi visual antara panel — Director sentiasa nampak identiti watak.
function charsBrief(characters) {
  const list = asArray(characters);
  return list.map(function (c) {
    const code = c.character_code || c.code || '';
    if (!code) return null;
    const type = c.character_type || c.type || '';
    const noble = (type === 'noble_figure_no_face' || c.face_policy === 'glowing_light');
    return {
      code: code,
      name_ar: c.name_ar || c.name || '',
      type: type,
      face_policy: noble ? 'glowing_light' : (c.face_policy || 'normal'),
      role: s(c.role),
      // DNA ringkas sahaja — penjimatan token.
      dna: compactDna(c.visual_dna)
    };
  }).filter(Boolean);
}

// Hanya watak yang hadir dalam panel/scene ini (mengikut kod characters_json).
// Supaya Director fokus pada watak yang benar-benar kelihatan, bukan semua watak projek.
function charsPresent(characters, codes) {
  const want = new Set(asArray(codes).map(function (x) {
    return String(x || '').trim().toUpperCase().replace(/\s+/g, '_');
  }).filter(Boolean));
  if (!want.size) return charsBrief(characters); // tiada senarai kod → bawa semua
  return charsBrief(characters).filter(function (c) { return want.has(c.code); });
}

// Continuity lokasi/masa/mood ringkas — diangkut antara Director (scene → panel →
// script → visual) supaya setiap Director mewarisi konteks ruang-masa yang sama.
function continuityFrom(scene, panel) {
  const sc = scene || {};
  const pn = panel || {};
  return {
    location: s(pn.location || sc.location),
    mood: s(pn.mood || sc.mood),
    scene_type: s(sc.scene_type),
    time_of_day: s(sc.time_of_day || pn.time_of_day),
    weather: s(sc.weather || pn.weather)
  };
}

// Ringkasan panel untuk Review (bukan dump penuh) — medan bermakna sahaja.
// Tujuan: Review Director dapat menilai tanpa menghabiskan token pada medan
// teknikal/kosong.
function panelBrief(panel) {
  const p = panel || {};
  return {
    panel_no: p.panel_no,
    panel_type: s(p.panel_type),
    shot_type: s(p.shot_type),
    location: s(p.location),
    mood: s(p.mood),
    visual: s(p.visual_ar || p.visual_ms),
    caption: s(p.caption_ar || p.caption_ms),
    characters: asArray(p.characters_json)
  };
}

// Ringkasan skrip piawai untuk Review (hanya medan teks yang relevan).
function scriptBrief(script) {
  const sc = script || {};
  return {
    narration: s(sc.narration),
    dialogue: s(sc.dialogue),
    caption: s(sc.caption),
    emotion: s(sc.emotion),
    speaker: s(sc.speaker)
  };
}

// Ringkasan visual untuk Review (medan sinematografi + face_policy sahaja).
function visualBrief(visual) {
  const v = visual || {};
  return {
    shot: s(v.shot), angle: s(v.angle), lens: s(v.lens),
    composition: s(v.composition), lighting: s(v.lighting),
    atmosphere: s(v.atmosphere), color_palette: s(v.color_palette),
    face_policy: s(v.face_policy)
  };
}

// Ringkasan prompt untuk Review (yang sahaja relevan untuk QA noble/safety).
function promptBrief(prompt) {
  const p = prompt || {};
  const pt = s(p.prompt_text);
  return {
    has_prompt: !!pt,
    prompt_len: pt.length,
    prompt_head: pt.slice(0, 120),
    has_negative: !!s(p.negative_prompt),
    noble_safe: /glowing light|no facial features|no eyes/i.test(pt)
  };
}

module.exports = {
  compactDna,
  charsBrief,
  charsPresent,
  continuityFrom,
  panelBrief,
  scriptBrief,
  visualBrief,
  promptBrief
};
