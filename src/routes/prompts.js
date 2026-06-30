'use strict';

const express = require('express');
const router = express.Router();

const pool = require('../db/pool');
const { PROJECT_STATUS } = require('../config/projectStatus');
const {
  DEFAULT_STYLE_PRESET, DEFAULT_VERSION, DEFAULT_LANGUAGE,
  isValidStatus, isValidPreset
} = require('../config/promptStyle');
const { buildPrompt, enforceNoblePrompt, panelHasNoble } = require('../services/promptEngine');
const { resolveScript } = require('../services/scriptSource');
const ai = require('../ai/adapter'); // Fasa 20: Image Prompt Director (Claude EN, fallback deterministik)

const PROMPT_COLUMNS =
  'id, project_id, scene_id, panel_id, prompt_text, negative_prompt, ' +
  'style_preset, language, prompt_version, status, created_at, updated_at';
const PROJECT_COLUMNS =
  'id, title_ar, title_ms, description, status, created_at, updated_at';

const INSERT_HEAD =
  `INSERT INTO image_prompts
     (project_id, scene_id, panel_id, prompt_text, negative_prompt, style_preset,
      language, prompt_version, status)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`;

// Join visual → panel → babak: semua medan yang diperlukan oleh enjin prompt.
const JOIN_SELECT =
  `SELECT v.panel_id, v.project_id, v.scene_id,
          v.shot, v.angle, v.lens, v.composition, v.lighting, v.color_palette,
          v.atmosphere, v.focus, v.depth, v.face_policy, v.characters_layout,
          p.characters_json, p.visual_ms, p.caption_ms, p.dialogue_ms, p.action_ms,
          p.emotion_ms, p.panel_type, p.panel_no, p.panel_order,
          s.scene_type AS scene_type, s.location AS scene_location, s.mood AS scene_mood, s.scene_no AS scene_no
     FROM visuals v
     JOIN panels p ON p.id = v.panel_id
     LEFT JOIN scenes s ON s.id = v.scene_id`;

// --- helper ---------------------------------------------------------------
function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}
function clean(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}
function jget(v) {
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } }
  return v;
}

async function buildCharMap(client, projectId) {
  const r = await client.query(
    'SELECT character_code, character_type, face_policy, visual_dna FROM characters WHERE project_id = $1',
    [projectId]
  );
  const map = {};
  r.rows.forEach(function (row) {
    map[row.character_code] = {
      character_type: row.character_type,
      face_policy: row.face_policy,
      visual_dna: jget(row.visual_dna) || {}
    };
  });
  return map;
}

// Bina objek panel/scene/visual daripada satu baris join.
function shape(row) {
  const panel = {
    id: row.panel_id, project_id: row.project_id, scene_id: row.scene_id,
    panel_type: row.panel_type, visual_ms: row.visual_ms, caption_ms: row.caption_ms,
    dialogue_ms: row.dialogue_ms, action_ms: row.action_ms, emotion_ms: row.emotion_ms,
    characters_json: jget(row.characters_json) || []
  };
  const scene = { scene_type: row.scene_type, location: row.scene_location, mood: row.scene_mood };
  const visual = {
    shot: row.shot, angle: row.angle, lens: row.lens, composition: row.composition,
    lighting: row.lighting, color_palette: row.color_palette, atmosphere: row.atmosphere,
    focus: row.focus, depth: row.depth, face_policy: row.face_policy,
    characters_layout: jget(row.characters_layout) || []
  };
  return { panel: panel, scene: scene, visual: visual };
}

async function insertPrompt(client, shaped, charMap) {
  const script = await resolveScript(client, shaped.panel, shaped.scene, charMap);
  // Fasa 20: Image Prompt Director (Claude) hasilkan prompt EN profesional;
  // fallback ke buildPrompt deterministik jika gagal. Enforcement tokoh mulia
  // sudah dikuatkuasakan dalam parser Claude DAN dalam buildPrompt.
  let p = null;
  try {
    const charsArr = Object.keys(charMap || {}).map(function (code) { return Object.assign({ character_code: code }, charMap[code]); });
    const r = await ai.generatePrompt({ panel: shaped.panel, scene: shaped.scene, script: script, visual: shaped.visual, characters: charsArr });
    if (r && r.success !== false && r.prompt_text && String(r.prompt_text).trim()) {
      p = {
        prompt_text: String(r.prompt_text).trim(),
        negative_prompt: r.negative_prompt || '',
        style_preset: r.style_preset || 'webtoon_mutalaah',
        language: r.language || 'en',
        prompt_version: r.prompt_version || 'v2-claude',
        status: (['draft', 'ready', 'approved'].indexOf(r.status) !== -1 ? r.status : 'ready')
      };
    }
  } catch (e) { console.error('[prompts] claude:', e && e.message ? e.message : e); }
  if (!p) p = buildPrompt(shaped.panel, shaped.scene, script, shaped.visual, charMap);
  const ins = await client.query(
    INSERT_HEAD + ' ON CONFLICT (panel_id) DO NOTHING RETURNING id',
    [shaped.panel.project_id, shaped.panel.scene_id, shaped.panel.id,
     p.prompt_text, p.negative_prompt, p.style_preset, p.language, p.prompt_version, p.status]
  );
  return ins.rows.length > 0 ? 1 : 0;
}

// Segerakkan status projek mengikut bilangan prompt / visual / panel / babak / watak / teks.
async function syncPromptStatus(client, projectId) {
  const pc = await client.query('SELECT count(*)::int AS n FROM image_prompts WHERE project_id = $1', [projectId]);
  const n = pc.rows[0].n;
  const pr = await client.query('SELECT status FROM projects WHERE id = $1', [projectId]);
  if (pr.rows.length === 0) return null;
  const cur = pr.rows[0].status;
  let next = cur;

  if (n >= 1) {
    if (cur === PROJECT_STATUS.DRAFT || cur === PROJECT_STATUS.TEXT_READY ||
        cur === PROJECT_STATUS.CHARACTER_READY || cur === PROJECT_STATUS.SCENE_READY ||
        cur === PROJECT_STATUS.PANEL_READY || cur === PROJECT_STATUS.VISUAL_READY) {
      next = PROJECT_STATUS.PROMPT_READY;
    }
  } else if (cur === PROJECT_STATUS.PROMPT_READY) {
    const vc = await client.query('SELECT count(*)::int AS n FROM visuals WHERE project_id = $1', [projectId]);
    const pcount = await client.query('SELECT count(*)::int AS n FROM panels WHERE project_id = $1', [projectId]);
    const sc = await client.query('SELECT count(*)::int AS n FROM scenes WHERE project_id = $1', [projectId]);
    const ch = await client.query('SELECT count(*)::int AS n FROM characters WHERE project_id = $1', [projectId]);
    const tx = await client.query(
      "SELECT 1 FROM texts WHERE project_id = $1 AND original_ar IS NOT NULL AND length(btrim(original_ar)) > 0",
      [projectId]
    );
    if (vc.rows[0].n >= 1) next = PROJECT_STATUS.VISUAL_READY;
    else if (pcount.rows[0].n >= 1) next = PROJECT_STATUS.PANEL_READY;
    else if (sc.rows[0].n >= 1) next = PROJECT_STATUS.SCENE_READY;
    else if (ch.rows[0].n >= 1) next = PROJECT_STATUS.CHARACTER_READY;
    else if (tx.rows.length > 0) next = PROJECT_STATUS.TEXT_READY;
    else next = PROJECT_STATUS.DRAFT;
  }

  if (next !== cur) {
    const u = await client.query(
      `UPDATE projects SET status = $1 WHERE id = $2 RETURNING ${PROJECT_COLUMNS}`,
      [next, projectId]
    );
    return u.rows[0];
  }
  const cur2 = await client.query(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $1`, [projectId]);
  return cur2.rows[0];
}

// ---------------------------------------------------------------------------
// GET /api/projects/:id/prompts — semua prompt (scene_no asc, panel_order asc)
// ---------------------------------------------------------------------------
router.get('/projects/:id/prompts', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });
  try {
    const proj = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });

    const { rows } = await pool.query(
      `SELECT ${PROMPT_COLUMNS.split(', ').map(function (c) { return 'ip.' + c; }).join(', ')}
         FROM image_prompts ip
         LEFT JOIN panels p ON p.id = ip.panel_id
         LEFT JOIN scenes s ON s.id = ip.scene_id
        WHERE ip.project_id = $1
        ORDER BY s.scene_no ASC NULLS LAST, p.panel_order ASC NULLS LAST, p.panel_no ASC, ip.id ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[prompts] list project:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mendapatkan senarai prompt' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/generate-prompts — jana prompt untuk semua panel
// ---------------------------------------------------------------------------
router.post('/projects/:id/generate-prompts', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const proj = await client.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });
    }
    const rows = await client.query(JOIN_SELECT + ' WHERE v.project_id = $1 ORDER BY s.scene_no ASC NULLS LAST, p.panel_order ASC NULLS LAST, p.panel_no ASC', [id]);
    if (rows.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Sila jana visual dahulu sebelum jana prompt.' });
    }

    const charMap = await buildCharMap(client, id);
    let created = 0, skipped = 0;
    for (var i = 0; i < rows.rows.length; i++) {
      var shaped = shape(rows.rows[i]);
      var c = await insertPrompt(client, shaped, charMap);
      if (c) created++; else skipped++;
    }

    const project = await syncPromptStatus(client, id);
    const all = await client.query(
      `SELECT ${PROMPT_COLUMNS.split(', ').map(function (c) { return 'ip.' + c; }).join(', ')}
         FROM image_prompts ip LEFT JOIN panels p ON p.id = ip.panel_id LEFT JOIN scenes s ON s.id = ip.scene_id
        WHERE ip.project_id = $1
        ORDER BY s.scene_no ASC NULLS LAST, p.panel_order ASC NULLS LAST, p.panel_no ASC`,
      [id]
    );
    await client.query('COMMIT');
    res.json({ ok: true, detected: rows.rows.length, created: created, skipped: skipped, prompts: all.rows, project: project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[prompts] generate project:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menjana prompt' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/panels/:id/generate-prompt — jana prompt untuk satu panel
// ---------------------------------------------------------------------------
router.post('/panels/:id/generate-prompt', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID panel tidak sah' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pr = await client.query('SELECT id, project_id FROM panels WHERE id = $1', [id]);
    if (pr.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Panel tidak dijumpai' });
    }
    const rows = await client.query(JOIN_SELECT + ' WHERE v.panel_id = $1', [id]);
    if (rows.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Sila jana visual untuk panel ini dahulu sebelum jana prompt.' });
    }
    const projectId = rows.rows[0].project_id;
    const charMap = await buildCharMap(client, projectId);
    const created = await insertPrompt(client, shape(rows.rows[0]), charMap);

    const project = await syncPromptStatus(client, projectId);
    const cur = await client.query(`SELECT ${PROMPT_COLUMNS} FROM image_prompts WHERE panel_id = $1`, [id]);
    await client.query('COMMIT');
    res.json({ ok: true, panel_id: id, created: created, skipped: created ? 0 : 1, prompt: cur.rows[0] || null, project: project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[prompts] generate panel:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menjana prompt' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /api/prompts/:id — edit prompt
// ---------------------------------------------------------------------------
router.put('/prompts/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID prompt tidak sah' });

  const b = req.body || {};
  // Validasi medan yang dihantar.
  if (b.prompt_text !== undefined && clean(b.prompt_text) === null) {
    return res.status(400).json({ ok: false, error: 'prompt_text tidak boleh kosong' });
  }
  if (b.negative_prompt !== undefined && clean(b.negative_prompt) === null) {
    return res.status(400).json({ ok: false, error: 'negative_prompt tidak boleh kosong' });
  }
  if (b.style_preset !== undefined && !isValidPreset(clean(b.style_preset))) {
    return res.status(400).json({ ok: false, error: 'style_preset tidak sah' });
  }
  if (b.status !== undefined && !isValidStatus(clean(b.status))) {
    return res.status(400).json({ ok: false, error: 'status mesti draft, ready, atau approved' });
  }

  try {
    const ex = await pool.query(`SELECT ${PROMPT_COLUMNS} FROM image_prompts WHERE id = $1`, [id]);
    if (ex.rows.length === 0) return res.status(404).json({ ok: false, error: 'Prompt tidak dijumpai' });
    const cur = ex.rows[0];

    const merged = {
      prompt_text: b.prompt_text !== undefined ? clean(b.prompt_text) : cur.prompt_text,
      negative_prompt: b.negative_prompt !== undefined ? clean(b.negative_prompt) : cur.negative_prompt,
      style_preset: b.style_preset !== undefined ? clean(b.style_preset) : cur.style_preset,
      language: b.language !== undefined ? (clean(b.language) || DEFAULT_LANGUAGE) : cur.language,
      prompt_version: b.prompt_version !== undefined ? (clean(b.prompt_version) || DEFAULT_VERSION) : cur.prompt_version,
      status: b.status !== undefined ? clean(b.status) : cur.status
    };

    // Penguatkuasaan tokoh mulia: berdasarkan watak panel + face_policy visual.
    const info = await pool.query(
      `SELECT p.characters_json AS cj, v.face_policy AS fp
         FROM panels p LEFT JOIN visuals v ON v.panel_id = p.id
        WHERE p.id = $1`,
      [cur.panel_id]
    );
    const codes = (info.rows[0] && jget(info.rows[0].cj)) || [];
    const charMap = await buildCharMap(pool, cur.project_id);
    const noble = panelHasNoble(codes, { face_policy: info.rows[0] && info.rows[0].fp }, charMap);
    const enforced = enforceNoblePrompt(merged.prompt_text, merged.negative_prompt, noble);
    merged.prompt_text = enforced.prompt_text;
    merged.negative_prompt = enforced.negative_prompt;

    const upd = await pool.query(
      `UPDATE image_prompts SET
          prompt_text = $1, negative_prompt = $2, style_preset = $3,
          language = $4, prompt_version = $5, status = $6
        WHERE id = $7
        RETURNING ${PROMPT_COLUMNS}`,
      [merged.prompt_text, merged.negative_prompt, merged.style_preset,
       merged.language, merged.prompt_version, merged.status, id]
    );
    res.json({ prompt: upd.rows[0] });
  } catch (err) {
    console.error('[prompts] update:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mengemas kini prompt' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/prompts/:id — padam prompt (+ segerak status)
// ---------------------------------------------------------------------------
router.delete('/prompts/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID prompt tidak sah' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ex = await client.query('SELECT project_id FROM image_prompts WHERE id = $1', [id]);
    if (ex.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Prompt tidak dijumpai' });
    }
    const projectId = ex.rows[0].project_id;
    await client.query('DELETE FROM image_prompts WHERE id = $1', [id]);
    const project = await syncPromptStatus(client, projectId);
    await client.query('COMMIT');
    res.json({ ok: true, deleted: id, project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[prompts] delete:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memadam prompt' });
  } finally {
    client.release();
  }
});

module.exports = router;
