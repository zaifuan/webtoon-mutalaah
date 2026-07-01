'use strict';

// ===========================================================================
// routes/review.js — Fasa 7B: Review & QA (READ-ONLY)
//
//   GET /api/projects/:id/review         — review penuh projek + ringkasan
//   GET /api/panels/:id/review           — review satu panel
//   GET /api/projects/:id/review/export  — laporan QA (JSON, muat turun)
//
// Semua endpoint hanya BACA data sedia ada. Tiada INSERT/UPDATE/DELETE.
// ===========================================================================

const express = require('express');
const router = express.Router();

const pool = require('../db/pool');
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

// Muatkan semua data + jalankan QA. Pulangkan { project, items, summary }.
async function buildReview(projectId, onlyPanelId) {
  const proj = await pool.query(
    'SELECT id, title_ar, title_ms, status FROM projects WHERE id = $1', [projectId]
  );
  if (proj.rows.length === 0) return null;
  const project = proj.rows[0];

  const scs = await pool.query(
    'SELECT id, scene_no, title_ms, mood, location, scene_type FROM scenes WHERE project_id = $1', [projectId]
  );
  const sceneMap = {};
  scs.rows.forEach(function (s) { sceneMap[String(s.id)] = s; });

  const chs = await pool.query(
    'SELECT character_code, character_type, face_policy, name_ms FROM characters WHERE project_id = $1', [projectId]
  );
  const charMap = {};
  chs.rows.forEach(function (c) {
    charMap[c.character_code] = { character_type: c.character_type, face_policy: c.face_policy, name_ms: c.name_ms };
  });

  let panelSql =
    'SELECT p.id, p.scene_id, p.panel_no, p.panel_order, p.panel_type, p.visual_ms, ' +
    'p.caption_ms, p.dialogue_ms, p.location, p.mood, p.characters_json ' +
    'FROM panels p LEFT JOIN scenes s ON s.id = p.scene_id WHERE p.project_id = $1 ';
  const params = [projectId];
  if (onlyPanelId) { panelSql += 'AND p.id = $2 '; params.push(onlyPanelId); }
  panelSql += 'ORDER BY s.scene_no ASC NULLS LAST, p.panel_order ASC NULLS LAST, p.panel_no ASC, p.id ASC';
  const pls = await pool.query(panelSql, params);

  const scr = await pool.query(
    `SELECT ${SCRIPT_COLS} FROM scripts WHERE project_id = $1 ORDER BY panel_id ASC, reading_order ASC NULLS LAST, script_order ASC`,
    [projectId]
  );
  const scriptsByPanel = {};
  scr.rows.forEach(function (r) { (scriptsByPanel[String(r.panel_id)] = scriptsByPanel[String(r.panel_id)] || []).push(r); });

  const vis = await pool.query(`SELECT ${VISUAL_COLS} FROM visuals WHERE project_id = $1`, [projectId]);
  const visualByPanel = {};
  vis.rows.forEach(function (v) { visualByPanel[String(v.panel_id)] = v; });

  const prm = await pool.query(`SELECT ${PROMPT_COLS} FROM image_prompts WHERE project_id = $1`, [projectId]);
  const promptByPanel = {};
  prm.rows.forEach(function (p) { promptByPanel[String(p.panel_id)] = p; });

  const items = [];
  let ok = 0, warning = 0, error = 0, errorsCount = 0, warningsCount = 0;
  let scriptsPanels = 0, visualPanels = 0, promptPanels = 0, readyCount = 0;

  pls.rows.forEach(function (row) {
    const panel = {
      id: row.id, scene_id: row.scene_id, panel_no: row.panel_no, panel_order: row.panel_order,
      panel_type: row.panel_type, visual_ms: row.visual_ms, caption_ms: row.caption_ms,
      dialogue_ms: row.dialogue_ms, location: row.location, mood: row.mood,
      characters_json: jget(row.characters_json) || []
    };
    const scene = sceneMap[String(row.scene_id)] || {};
    const pScripts = scriptsByPanel[String(row.id)] || [];
    const visual = visualByPanel[String(row.id)] || null;
    const prompt = promptByPanel[String(row.id)] || null;

    const review = reviewPanel(panel, scene, pScripts, visual, prompt, charMap);

    if (pScripts.length) scriptsPanels++;
    if (visual) visualPanels++;
    if (prompt) promptPanels++;
    if (review.ready_for_image) readyCount++;
    if (review.qa_status === 'ok') ok++;
    else if (review.qa_status === 'warning') warning++;
    else if (review.qa_status === 'error') error++;
    review.issues.forEach(function (it) { if (it.type === 'error') errorsCount++; else warningsCount++; });

    items.push({
      panel_id: row.id,
      scene_no: scene.scene_no || null,
      scene_title: scene.title_ms || '',
      panel_no: row.panel_no,
      panel_type: row.panel_type,
      qa_status: review.qa_status,
      ready_for_image: review.ready_for_image,
      noble: review.noble,
      checklist: review.checklist,
      issues: review.issues,
      panel: { visual_ms: row.visual_ms, caption_ms: row.caption_ms, location: row.location, mood: row.mood, characters_json: panel.characters_json },
      scripts: pScripts,
      visual: visual,
      prompt: prompt
    });
  });

  const summary = {
    characters: chs.rows.length,
    scenes: scs.rows.length,
    panels: pls.rows.length,
    scripts: scriptsPanels,
    visuals: visualPanels,
    prompts: promptPanels,
    ok: ok,
    warning: warning,
    error: error,
    errors: errorsCount,
    warnings: warningsCount,
    ready_for_image: readyCount
  };

  return { project: project, items: items, summary: summary };
}

// ---------------------------------------------------------------------------
// GET /api/projects/:id/review
// ---------------------------------------------------------------------------
router.get('/projects/:id/review', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });
  try {
    const data = await buildReview(id, null);
    if (!data) return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });
    res.json({ ok: true, project: data.project, summary: data.summary, items: data.items });
  } catch (err) {
    console.error('[review] project:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menjana review' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/panels/:id/review
// ---------------------------------------------------------------------------
router.get('/panels/:id/review', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID panel tidak sah' });
  try {
    const pr = await pool.query('SELECT project_id FROM panels WHERE id = $1', [id]);
    if (pr.rows.length === 0) return res.status(404).json({ ok: false, error: 'Panel tidak dijumpai' });
    const data = await buildReview(pr.rows[0].project_id, id);
    if (!data || data.items.length === 0) return res.status(404).json({ ok: false, error: 'Panel tidak dijumpai' });
    res.json({ ok: true, project: data.project, item: data.items[0] });
  } catch (err) {
    console.error('[review] panel:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menjana review panel' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/projects/:id/review/export — laporan QA (JSON, muat turun)
// ---------------------------------------------------------------------------
router.get('/projects/:id/review/export', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });
  try {
    const data = await buildReview(id, null);
    if (!data) return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });

    const errors = [];
    const warnings = [];
    data.items.forEach(function (it) {
      it.issues.forEach(function (issue) {
        const entry = { panel_id: it.panel_id, scene_no: it.scene_no, panel_no: it.panel_no, message: issue.message };
        if (issue.type === 'error') errors.push(entry); else warnings.push(entry);
      });
    });

    const report = {
      ok: true,
      project_id: id,
      project_title: data.project.title_ms || data.project.title_ar || '',
      generated_at: new Date().toISOString(),
      summary: data.summary,
      errors: errors,
      warnings: warnings
    };

    res.setHeader('Content-Disposition', 'attachment; filename="qa-report-project-' + id + '.json"');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify(report, null, 2));
  } catch (err) {
    console.error('[review] export:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mengeksport laporan QA' });
  }
});

module.exports = router;
