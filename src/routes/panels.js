'use strict';

const express = require('express');
const router = express.Router();

const pool = require('../db/pool');
const { PROJECT_STATUS } = require('../config/projectStatus');
const { extractPanels, NOBLE_PANEL_NOTE } = require('../services/panelEngine');
const ai = require('../ai/adapter'); // Fasa 20: Story Director (Claude-first, fallback deterministik)

const PANEL_TYPES = ['establishing', 'character', 'dialogue', 'action', 'reaction', 'transition', 'reveal', 'closing'];
const SHOT_TYPES = ['wide', 'medium', 'close_up', 'over_shoulder', 'low_angle', 'high_angle', 'detail'];

const PANEL_COLUMNS =
  'id, project_id, scene_id, page_id, panel_no, panel_order, panel_type, ' +
  'visual_ms, action_ms, emotion_ms, location, characters_json, ' +
  'dialogue_ar, dialogue_ms, caption_ar, caption_ms, camera, shot_type, ' +
  'composition, mood, visual_notes, image_prompt, image_url, needs_image, ' +
  'status, created_at, updated_at';
const PROJECT_COLUMNS =
  'id, title_ar, title_ms, description, status, created_at, updated_at';

const INSERT_HEAD =
  `INSERT INTO panels
     (project_id, scene_id, page_id, panel_no, panel_order, panel_type,
      visual_ms, action_ms, emotion_ms, location, characters_json,
      dialogue_ar, dialogue_ms, caption_ar, caption_ms, camera,
      shot_type, composition, mood, visual_notes, needs_image, status)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'active')`;

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
function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}
function parseCharacters(input) {
  if (input === undefined || input === null || input === '') return [];
  if (!Array.isArray(input)) return null;
  return input.map(function (x) { return String(x).trim(); }).filter(function (x) { return x.length > 0; });
}

function panelParams(projectId, sceneId, d) {
  return [
    projectId, sceneId, null, d.panel_no, d.panel_order, d.panel_type,
    d.visual_ms, d.action_ms, d.emotion_ms, d.location,
    JSON.stringify(Array.isArray(d.characters_json) ? d.characters_json : []),
    d.dialogue_ar, d.dialogue_ms, d.caption_ar, d.caption_ms, d.camera,
    d.shot_type, d.composition, d.mood, d.visual_notes,
    d.needs_image === undefined ? true : !!d.needs_image
  ];
}

// Set kod watak tokoh mulia bagi projek (untuk integrasi polisi muka).
async function nobleCodeSet(client, projectId) {
  const r = await client.query(
    "SELECT character_code FROM characters WHERE project_id = $1 " +
    "AND (character_type = 'noble_figure_no_face' OR face_policy = 'glowing_light')",
    [projectId]
  );
  const set = new Set();
  r.rows.forEach(function (x) { if (x.character_code) set.add(x.character_code); });
  return set;
}

// Pastikan nota wajah WAJIB hadir jika ada tokoh mulia dalam panel.
function ensureNobleNote(visualNotes, codes, nobleSet) {
  const has = (codes || []).some(function (c) { return nobleSet.has(c); });
  if (!has) return visualNotes || null;
  if (visualNotes && visualNotes.indexOf(NOBLE_PANEL_NOTE) !== -1) return visualNotes;
  return (visualNotes ? visualNotes + ' ' : '') + NOBLE_PANEL_NOTE;
}

// Segerakkan status projek mengikut bilangan panel / babak / watak / teks.
async function syncPanelStatus(client, projectId) {
  const pc = await client.query('SELECT count(*)::int AS n FROM panels WHERE project_id = $1', [projectId]);
  const panelCount = pc.rows[0].n;
  const pr = await client.query('SELECT status FROM projects WHERE id = $1', [projectId]);
  if (pr.rows.length === 0) return null;
  const cur = pr.rows[0].status;
  let next = cur;

  if (panelCount >= 1) {
    if (cur === PROJECT_STATUS.DRAFT || cur === PROJECT_STATUS.TEXT_READY ||
        cur === PROJECT_STATUS.CHARACTER_READY || cur === PROJECT_STATUS.SCENE_READY) {
      next = PROJECT_STATUS.PANEL_READY;
    }
  } else if (cur === PROJECT_STATUS.PANEL_READY) {
    const sc = await client.query('SELECT count(*)::int AS n FROM scenes WHERE project_id = $1', [projectId]);
    const ch = await client.query('SELECT count(*)::int AS n FROM characters WHERE project_id = $1', [projectId]);
    const tx = await client.query(
      "SELECT 1 FROM texts WHERE project_id = $1 AND original_ar IS NOT NULL AND length(btrim(original_ar)) > 0",
      [projectId]
    );
    if (sc.rows[0].n >= 1) next = PROJECT_STATUS.SCENE_READY;
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

function normScene(row) {
  // characters_json mungkin string (jsonb) atau array.
  let chars = row.characters_json;
  if (typeof chars === 'string') {
    try { chars = JSON.parse(chars); } catch (e) { chars = []; }
  }
  return Object.assign({}, row, { characters_json: Array.isArray(chars) ? chars : [] });
}

// Jana panel bagi satu babak dalam transaksi sedia ada.
async function generateForScene(client, scene, nobleSet, characters) {
  const normed = normScene(scene);
  // Fasa 20: Story Director (Claude) tentukan bilangan panel/shot/komposisi;
  // fallback ke templat beat deterministik jika Claude gagal/JSON tak sah.
  let templates = null;
  try {
    const r = await ai.generatePanel({ scene: normed, characters: characters || [] });
    if (r && r.success !== false && Array.isArray(r.panels) && r.panels.length) templates = r.panels;
  } catch (e) { console.error('[panels] claude:', e && e.message ? e.message : e); }
  if (!templates) templates = extractPanels(normed, nobleSet);
  let created = 0, skipped = 0;
  for (var i = 0; i < templates.length; i++) {
    var ins = await client.query(
      INSERT_HEAD + ' ON CONFLICT (scene_id, panel_no) DO NOTHING RETURNING id',
      panelParams(scene.project_id, scene.id, templates[i])
    );
    if (ins.rows.length > 0) created++; else skipped++;
  }
  return { detected: templates.length, created: created, skipped: skipped };
}

// ---------------------------------------------------------------------------
// GET /api/projects/:id/panels — semua panel (scene_no asc, panel_order asc)
// ---------------------------------------------------------------------------
router.get('/projects/:id/panels', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });
  try {
    const proj = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });

    const { rows } = await pool.query(
      `SELECT ${PANEL_COLUMNS.split(', ').map(function (c) { return 'p.' + c; }).join(', ')}
         FROM panels p
         LEFT JOIN scenes s ON s.id = p.scene_id
        WHERE p.project_id = $1
        ORDER BY s.scene_no ASC NULLS LAST, p.panel_order ASC NULLS LAST, p.panel_no ASC, p.id ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[panels] list project:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mendapatkan senarai panel' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/scenes/:id/panels — panel bagi satu babak
// ---------------------------------------------------------------------------
router.get('/scenes/:id/panels', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID babak tidak sah' });
  try {
    const sc = await pool.query('SELECT id FROM scenes WHERE id = $1', [id]);
    if (sc.rows.length === 0) return res.status(404).json({ ok: false, error: 'Babak tidak dijumpai' });

    const { rows } = await pool.query(
      `SELECT ${PANEL_COLUMNS} FROM panels WHERE scene_id = $1 ORDER BY panel_order ASC NULLS LAST, panel_no ASC, id ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[panels] list scene:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mendapatkan panel babak' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scenes/:id/generate-panels — jana panel untuk satu babak
// ---------------------------------------------------------------------------
router.post('/scenes/:id/generate-panels', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID babak tidak sah' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sc = await client.query(
      'SELECT id, project_id, title_ar, title_ms, summary_ms, mood, location, scene_type, characters_json FROM scenes WHERE id = $1',
      [id]
    );
    if (sc.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Babak tidak dijumpai' });
    }
    const scene = sc.rows[0];

    const ch = await client.query('SELECT count(*)::int AS n FROM characters WHERE project_id = $1', [scene.project_id]);
    if (ch.rows[0].n === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Sila jana watak dahulu sebelum jana panel.' });
    }

    const nobleSet = await nobleCodeSet(client, scene.project_id);
    const chRows = await client.query('SELECT character_code, name_ar, name_ms, character_type, face_policy, role, visual_dna FROM characters WHERE project_id = $1 ORDER BY id ASC', [scene.project_id]);
    const result = await generateForScene(client, scene, nobleSet, chRows.rows);
    const project = await syncPanelStatus(client, scene.project_id);
    const all = await client.query(
      `SELECT ${PANEL_COLUMNS} FROM panels WHERE scene_id = $1 ORDER BY panel_order ASC NULLS LAST, panel_no ASC`,
      [id]
    );
    await client.query('COMMIT');
    res.json({ ok: true, scene_id: id, detected: result.detected, created: result.created, skipped: result.skipped, panels: all.rows, project: project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[panels] generate scene:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menjana panel' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/generate-panels — jana panel untuk semua babak
// ---------------------------------------------------------------------------
router.post('/projects/:id/generate-panels', async (req, res) => {
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

    const ch = await client.query('SELECT count(*)::int AS n FROM characters WHERE project_id = $1', [id]);
    if (ch.rows[0].n === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Sila jana watak dahulu sebelum jana panel.' });
    }
    const scs = await client.query(
      'SELECT id, project_id, title_ar, title_ms, summary_ms, mood, location, scene_type, characters_json FROM scenes WHERE project_id = $1 ORDER BY scene_no ASC',
      [id]
    );
    if (scs.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Sila jana babak dahulu sebelum jana panel.' });
    }

    const nobleSet = await nobleCodeSet(client, id);
    const chRows = await client.query('SELECT character_code, name_ar, name_ms, character_type, face_policy, role, visual_dna FROM characters WHERE project_id = $1 ORDER BY id ASC', [id]);
    let detected = 0, created = 0, skipped = 0;
    for (var i = 0; i < scs.rows.length; i++) {
      var r = await generateForScene(client, scs.rows[i], nobleSet, chRows.rows);
      detected += r.detected; created += r.created; skipped += r.skipped;
    }

    const project = await syncPanelStatus(client, id);
    const all = await client.query(
      `SELECT ${PANEL_COLUMNS.split(', ').map(function (c) { return 'p.' + c; }).join(', ')}
         FROM panels p LEFT JOIN scenes s ON s.id = p.scene_id
        WHERE p.project_id = $1
        ORDER BY s.scene_no ASC NULLS LAST, p.panel_order ASC NULLS LAST, p.panel_no ASC`,
      [id]
    );
    await client.query('COMMIT');
    res.json({ ok: true, detected: detected, created: created, skipped: skipped, panels: all.rows, project: project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[panels] generate project:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menjana panel' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/scenes/:id/panels — tambah panel manual untuk babak
// ---------------------------------------------------------------------------
router.post('/scenes/:id/panels', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID babak tidak sah' });

  const b = req.body || {};
  let panel_type = clean(b.panel_type);
  if (panel_type !== null && PANEL_TYPES.indexOf(panel_type) === -1) {
    return res.status(400).json({ ok: false, error: 'panel_type tidak sah' });
  }
  let shot_type = clean(b.shot_type);
  if (shot_type !== null && SHOT_TYPES.indexOf(shot_type) === -1) {
    return res.status(400).json({ ok: false, error: 'shot_type tidak sah' });
  }
  const characters_json = parseCharacters(b.characters_json);
  if (characters_json === null) {
    return res.status(400).json({ ok: false, error: 'characters_json mesti senarai (array) kod watak' });
  }
  let panel_order = null;
  if (b.panel_order !== undefined && b.panel_order !== null && b.panel_order !== '') {
    panel_order = Number(b.panel_order);
    if (!isPositiveInt(panel_order)) return res.status(400).json({ ok: false, error: 'panel_order mesti nombor positif' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sc = await client.query('SELECT id, project_id FROM scenes WHERE id = $1', [id]);
    if (sc.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Babak tidak dijumpai' });
    }
    const projectId = sc.rows[0].project_id;

    // panel_no: guna yang diberi (jika sah & bebas) atau auto = max+1.
    let panel_no;
    if (b.panel_no !== undefined && b.panel_no !== null && b.panel_no !== '') {
      panel_no = Number(b.panel_no);
      if (!isPositiveInt(panel_no)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'panel_no mesti nombor positif' });
      }
      const dup = await client.query('SELECT 1 FROM panels WHERE scene_id = $1 AND panel_no = $2', [id, panel_no]);
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ ok: false, error: 'panel_no sudah digunakan dalam babak ini' });
      }
    } else {
      const mx = await client.query('SELECT COALESCE(MAX(panel_no), 0) AS m FROM panels WHERE scene_id = $1', [id]);
      panel_no = Number(mx.rows[0].m) + 1;
    }
    if (panel_order === null) panel_order = panel_no;

    // Integrasi polisi muka untuk panel manual.
    const nobleSet = await nobleCodeSet(client, projectId);
    const visual_notes = ensureNobleNote(clean(b.visual_notes), characters_json, nobleSet);

    const data = {
      panel_no: panel_no, panel_order: panel_order, panel_type: panel_type,
      visual_ms: clean(b.visual_ms), action_ms: clean(b.action_ms), emotion_ms: clean(b.emotion_ms),
      location: clean(b.location), characters_json: characters_json,
      dialogue_ar: clean(b.dialogue_ar), dialogue_ms: clean(b.dialogue_ms),
      caption_ar: clean(b.caption_ar), caption_ms: clean(b.caption_ms),
      camera: clean(b.camera), shot_type: shot_type, composition: clean(b.composition),
      mood: clean(b.mood), visual_notes: visual_notes,
      needs_image: b.needs_image === undefined ? true : !!b.needs_image
    };

    const ins = await client.query(
      INSERT_HEAD + ' RETURNING ' + PANEL_COLUMNS,
      panelParams(projectId, id, data)
    );
    const project = await syncPanelStatus(client, projectId);
    await client.query('COMMIT');
    res.status(201).json({ panel: ins.rows[0], project });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'panel_no sudah digunakan dalam babak ini' });
    }
    console.error('[panels] create:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menambah panel' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /api/panels/:id — edit panel
// ---------------------------------------------------------------------------
router.put('/panels/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID panel tidak sah' });

  try {
    const ex = await pool.query(`SELECT ${PANEL_COLUMNS} FROM panels WHERE id = $1`, [id]);
    if (ex.rows.length === 0) return res.status(404).json({ ok: false, error: 'Panel tidak dijumpai' });
    const cur = ex.rows[0];
    const b = req.body || {};

    let panel_no = cur.panel_no;
    if (b.panel_no !== undefined && b.panel_no !== null && b.panel_no !== '') {
      panel_no = Number(b.panel_no);
      if (!isPositiveInt(panel_no)) return res.status(400).json({ ok: false, error: 'panel_no mesti nombor positif' });
    }
    let panel_order = cur.panel_order;
    if (b.panel_order !== undefined && b.panel_order !== null && b.panel_order !== '') {
      panel_order = Number(b.panel_order);
      if (!isPositiveInt(panel_order)) return res.status(400).json({ ok: false, error: 'panel_order mesti nombor positif' });
    }
    let panel_type = cur.panel_type;
    if (b.panel_type !== undefined) {
      panel_type = clean(b.panel_type);
      if (panel_type !== null && PANEL_TYPES.indexOf(panel_type) === -1) {
        return res.status(400).json({ ok: false, error: 'panel_type tidak sah' });
      }
    }
    let shot_type = cur.shot_type;
    if (b.shot_type !== undefined) {
      shot_type = clean(b.shot_type);
      if (shot_type !== null && SHOT_TYPES.indexOf(shot_type) === -1) {
        return res.status(400).json({ ok: false, error: 'shot_type tidak sah' });
      }
    }
    let characters_json = cur.characters_json;
    if (typeof characters_json === 'string') { try { characters_json = JSON.parse(characters_json); } catch (e) { characters_json = []; } }
    if (b.characters_json !== undefined) {
      characters_json = parseCharacters(b.characters_json);
      if (characters_json === null) {
        return res.status(400).json({ ok: false, error: 'characters_json mesti senarai (array) kod watak' });
      }
    }

    const visual_ms = b.visual_ms !== undefined ? clean(b.visual_ms) : cur.visual_ms;
    const action_ms = b.action_ms !== undefined ? clean(b.action_ms) : cur.action_ms;
    const emotion_ms = b.emotion_ms !== undefined ? clean(b.emotion_ms) : cur.emotion_ms;
    const location = b.location !== undefined ? clean(b.location) : cur.location;
    const dialogue_ar = b.dialogue_ar !== undefined ? clean(b.dialogue_ar) : cur.dialogue_ar;
    const dialogue_ms = b.dialogue_ms !== undefined ? clean(b.dialogue_ms) : cur.dialogue_ms;
    const caption_ar = b.caption_ar !== undefined ? clean(b.caption_ar) : cur.caption_ar;
    const caption_ms = b.caption_ms !== undefined ? clean(b.caption_ms) : cur.caption_ms;
    const camera = b.camera !== undefined ? clean(b.camera) : cur.camera;
    const composition = b.composition !== undefined ? clean(b.composition) : cur.composition;
    const mood = b.mood !== undefined ? clean(b.mood) : cur.mood;
    const needs_image = b.needs_image !== undefined ? !!b.needs_image : cur.needs_image;
    let visual_notes = b.visual_notes !== undefined ? clean(b.visual_notes) : cur.visual_notes;

    // Penguatkuasaan polisi muka: jika ada tokoh mulia → nota wajib hadir.
    const nobleSet = await nobleCodeSet(pool, cur.project_id);
    visual_notes = ensureNobleNote(visual_notes, characters_json, nobleSet);

    const upd = await pool.query(
      `UPDATE panels SET
          panel_no = $1, panel_order = $2, panel_type = $3, visual_ms = $4,
          action_ms = $5, emotion_ms = $6, location = $7, characters_json = $8::jsonb,
          dialogue_ar = $9, dialogue_ms = $10, caption_ar = $11, caption_ms = $12,
          camera = $13, shot_type = $14, composition = $15, mood = $16,
          visual_notes = $17, needs_image = $18
        WHERE id = $19
        RETURNING ${PANEL_COLUMNS}`,
      [panel_no, panel_order, panel_type, visual_ms, action_ms, emotion_ms, location,
       JSON.stringify(Array.isArray(characters_json) ? characters_json : []),
       dialogue_ar, dialogue_ms, caption_ar, caption_ms, camera, shot_type, composition,
       mood, visual_notes, needs_image, id]
    );
    res.json({ panel: upd.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'panel_no sudah digunakan dalam babak ini' });
    }
    console.error('[panels] update:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mengemas kini panel' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/panels/:id — padam panel (+ segerak status)
// ---------------------------------------------------------------------------
router.delete('/panels/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID panel tidak sah' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ex = await client.query('SELECT project_id FROM panels WHERE id = $1', [id]);
    if (ex.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Panel tidak dijumpai' });
    }
    const projectId = ex.rows[0].project_id;
    await client.query('DELETE FROM panels WHERE id = $1', [id]);
    const project = await syncPanelStatus(client, projectId);
    await client.query('COMMIT');
    res.json({ ok: true, deleted: id, project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[panels] delete:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memadam panel' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/scenes/:id/panels/reorder — susun semula panel dalam babak
// Body: { "panel_ids": [..] } — mesti senarai penuh id panel babak itu.
// ---------------------------------------------------------------------------
router.post('/scenes/:id/panels/reorder', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID babak tidak sah' });

  const raw = req.body && req.body.panel_ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return res.status(400).json({ ok: false, error: 'panel_ids mesti senarai (array) yang tidak kosong' });
  }
  const orderIds = [];
  for (var k = 0; k < raw.length; k++) {
    var pid = parseId(raw[k]);
    if (!pid) return res.status(400).json({ ok: false, error: 'panel_ids mengandungi id tidak sah' });
    orderIds.push(pid);
  }
  if (new Set(orderIds.map(String)).size !== orderIds.length) {
    return res.status(400).json({ ok: false, error: 'panel_ids mengandungi pendua' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sc = await client.query('SELECT id FROM scenes WHERE id = $1', [id]);
    if (sc.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Babak tidak dijumpai' });
    }
    const existing = await client.query('SELECT id FROM panels WHERE scene_id = $1', [id]);
    const existingSet = new Set(existing.rows.map(function (r) { return String(r.id); }));
    if (existingSet.size !== orderIds.length || !orderIds.every(function (x) { return existingSet.has(String(x)); })) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'panel_ids mesti sepadan dengan semua panel babak ini' });
    }

    // panel_order tiada UNIQUE, jadi boleh tetapkan terus tanpa fasa offset.
    for (var j = 0; j < orderIds.length; j++) {
      await client.query('UPDATE panels SET panel_order = $1 WHERE id = $2 AND scene_id = $3', [j + 1, orderIds[j], id]);
    }
    await client.query('COMMIT');
    const all = await client.query(
      `SELECT ${PANEL_COLUMNS} FROM panels WHERE scene_id = $1 ORDER BY panel_order ASC NULLS LAST, panel_no ASC`,
      [id]
    );
    res.json({ ok: true, panels: all.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[panels] reorder:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menyusun semula panel' });
  } finally {
    client.release();
  }
});

module.exports = router;
