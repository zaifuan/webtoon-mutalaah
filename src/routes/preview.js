'use strict';

// ===========================================================================
// src/routes/preview.js — Fasa 15: Webtoon Preview Engine (READ ONLY)
//
//   GET /api/projects/:id/preview
//
// Menghimpun data sedia ada (scenes/panels/scripts/visuals/image_prompts/
// image_assets) + review berasaskan peraturan (reviewEngine, read-only) menjadi
// struktur reader: project → chapters(scene) → panels. TIADA INSERT/UPDATE/
// DELETE. Tidak menyentuh schema/queue/pipeline.
// ===========================================================================

const express = require('express');
const router = express.Router();

const pool = require('../db/pool');
const svc = require('../services/imageAssetService');
const { reviewPanel } = require('../services/reviewEngine');

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}
function jget(v) {
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } }
  return v;
}

const VISUAL_COLS = 'panel_id, shot, angle, lens, lighting, composition, atmosphere, ' +
  'weather, depth, focus, color_palette, face_policy, visual_notes, location';
const PROMPT_COLS = 'panel_id, prompt_text, negative_prompt, style_preset, prompt_version, status';
const SCRIPT_COLS = 'id, panel_id, script_order, reading_order, script_type, speaker_code, ' +
  'speaker_name, text_ar, text_ms, emotion, bubble_type, status';

function isNarration(s) {
  const bt = (s.bubble_type || '').toLowerCase();
  const st = (s.script_type || '').toLowerCase();
  if (bt === 'narration' || st === 'narration' || st === 'caption') return true;
  return !s.speaker_name && !s.speaker_code;
}

// Petakan characters_json (pelbagai bentuk) → senarai nama paparan.
function panelCharacterNames(charsJson, charMap) {
  const out = [];
  const arr = Array.isArray(charsJson) ? charsJson : [];
  arr.forEach(function (c) {
    if (c == null) return;
    if (typeof c === 'string') {
      const m = charMap[c];
      out.push(m && m.name_ms ? m.name_ms : c);
    } else if (typeof c === 'object') {
      const code = c.character_code || c.code || c.id;
      const name = c.name_ms || c.name || (code && charMap[code] && charMap[code].name_ms) || code;
      if (name) out.push(name);
    }
  });
  return out;
}

router.get('/projects/:id/preview', async (req, res) => {
  const projectId = parseId(req.params.id);
  if (!projectId) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });

  try {
    const proj = await pool.query('SELECT id, title_ar, title_ms, status FROM projects WHERE id = $1', [projectId]);
    if (proj.rows.length === 0) return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });
    const project = proj.rows[0];

    // Scenes (chapters)
    const scs = await pool.query(
      'SELECT id, scene_no, title_ms, mood, location, scene_type FROM scenes WHERE project_id = $1 ORDER BY scene_no ASC, id ASC',
      [projectId]
    );
    const sceneMap = {};
    scs.rows.forEach(function (s) { sceneMap[String(s.id)] = s; });

    // Characters (untuk charMap + senarai filter)
    const chs = await pool.query(
      'SELECT character_code, character_type, face_policy, name_ms, name_ar FROM characters WHERE project_id = $1 ORDER BY id ASC',
      [projectId]
    );
    const charMap = {};
    chs.rows.forEach(function (c) {
      charMap[c.character_code] = { character_type: c.character_type, face_policy: c.face_policy, name_ms: c.name_ms };
    });
    const charactersList = chs.rows.map(function (c) {
      return { character_code: c.character_code, name_ms: c.name_ms, name_ar: c.name_ar, character_type: c.character_type };
    });

    // Panels (urutan webtoon)
    const pls = await pool.query(
      'SELECT p.id, p.scene_id, p.panel_no, p.panel_order, p.panel_type, p.visual_ms, ' +
      'p.caption_ms, p.dialogue_ms, p.location, p.mood, p.characters_json ' +
      'FROM panels p LEFT JOIN scenes s ON s.id = p.scene_id WHERE p.project_id = $1 ' +
      'ORDER BY s.scene_no ASC NULLS LAST, p.panel_order ASC NULLS LAST, p.panel_no ASC, p.id ASC',
      [projectId]
    );

    // Scripts per panel
    const scr = await pool.query(
      'SELECT ' + SCRIPT_COLS + ' FROM scripts WHERE project_id = $1 ' +
      'ORDER BY panel_id ASC, reading_order ASC NULLS LAST, script_order ASC', [projectId]
    );
    const scriptsByPanel = {};
    scr.rows.forEach(function (r) { (scriptsByPanel[String(r.panel_id)] = scriptsByPanel[String(r.panel_id)] || []).push(r); });

    // Visuals per panel
    const vis = await pool.query('SELECT ' + VISUAL_COLS + ' FROM visuals WHERE project_id = $1', [projectId]);
    const visualByPanel = {};
    vis.rows.forEach(function (v) { visualByPanel[String(v.panel_id)] = v; });

    // Prompts per panel
    const prm = await pool.query('SELECT ' + PROMPT_COLS + ' FROM image_prompts WHERE project_id = $1', [projectId]);
    const promptByPanel = {};
    prm.rows.forEach(function (p) { promptByPanel[String(p.panel_id)] = p; });

    // Images per panel (Fasa 8) — ambil terkini setiap panel
    const imgs = await pool.query(
      'SELECT panel_id, image_path, image_filename, status, provider, width, height ' +
      'FROM image_assets WHERE project_id = $1 ORDER BY id DESC', [projectId]
    );
    const imageByPanel = {};
    imgs.rows.forEach(function (a) {
      const k = String(a.panel_id);
      if (imageByPanel[k]) return; // sudah ada yang lebih baharu (DESC)
      imageByPanel[k] = {
        url: a.image_path ? svc.publicUrl(a.image_path) : null,
        filename: a.image_filename || null,
        status: a.status || null,
        provider: a.provider || null,
        width: a.width != null ? a.width : null,
        height: a.height != null ? a.height : null
      };
    });

    // Bina chapters → panels
    const chaptersMap = {};
    const chaptersOrder = [];
    let panelCount = 0, withImage = 0;

    pls.rows.forEach(function (row) {
      const panel = {
        id: row.id, scene_id: row.scene_id, panel_no: row.panel_no, panel_order: row.panel_order,
        panel_type: row.panel_type, visual_ms: row.visual_ms, caption_ms: row.caption_ms,
        dialogue_ms: row.dialogue_ms, location: row.location, mood: row.mood,
        characters_json: jget(row.characters_json) || []
      };
      const scene = sceneMap[String(row.scene_id)] || { id: row.scene_id, scene_no: null, title_ms: '(tanpa bab)' };
      const pScripts = scriptsByPanel[String(row.id)] || [];
      const visual = visualByPanel[String(row.id)] || null;
      const prompt = promptByPanel[String(row.id)] || null;
      const image = imageByPanel[String(row.id)] || null;

      let review = null;
      try { review = reviewPanel(panel, scene, pScripts, visual, prompt, charMap); }
      catch (e) { review = null; }

      const dialogue = pScripts.filter(function (s) { return !isNarration(s); }).map(function (s) {
        return { speaker_name: s.speaker_name || '', speaker_code: s.speaker_code || '', text_ms: s.text_ms || '', text_ar: s.text_ar || '', emotion: s.emotion || '', bubble_type: s.bubble_type || '' };
      });
      const narration = pScripts.filter(isNarration).map(function (s) {
        return { text_ms: s.text_ms || '', text_ar: s.text_ar || '' };
      });
      const chars = panelCharacterNames(panel.characters_json, charMap);

      const previewPanel = {
        id: panel.id,
        panel_no: panel.panel_no,
        panel_type: panel.panel_type || null,
        shot: (visual && visual.shot) || null,
        mood: panel.mood || (scene && scene.mood) || null,
        location: panel.location || (visual && visual.location) || (scene && scene.location) || null,
        characters: chars,
        visual_ms: panel.visual_ms || null,
        caption_ms: panel.caption_ms || null,
        dialogue: dialogue,
        narration: narration,
        visual: visual ? {
          shot: visual.shot, angle: visual.angle, lens: visual.lens, lighting: visual.lighting,
          composition: visual.composition, atmosphere: visual.atmosphere, weather: visual.weather
        } : null,
        prompt: prompt ? { prompt_text: prompt.prompt_text || '', negative_prompt: prompt.negative_prompt || '', style_preset: prompt.style_preset || '' } : null,
        image: image,
        review: review ? { qa_status: review.qa_status, ready_for_image: review.ready_for_image, noble: review.noble } : null
      };

      panelCount++;
      if (image && image.url) withImage++;

      const key = String(scene.id);
      if (!chaptersMap[key]) {
        chaptersMap[key] = {
          scene: { id: scene.id, scene_no: scene.scene_no, title_ms: scene.title_ms || null, mood: scene.mood || null, location: scene.location || null },
          panels: []
        };
        chaptersOrder.push(key);
      }
      chaptersMap[key].panels.push(previewPanel);
    });

    const chapters = chaptersOrder.map(function (k) { return chaptersMap[k]; });

    return res.json({
      ok: true,
      project: { id: project.id, title_ms: project.title_ms, title_ar: project.title_ar, status: project.status },
      characters: charactersList,
      chapters: chapters,
      summary: {
        chapters: chapters.length,
        panels: panelCount,
        with_image: withImage,
        without_image: panelCount - withImage
      }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : 'Gagal membina preview' });
  }
});

module.exports = router;
