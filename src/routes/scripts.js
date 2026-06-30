'use strict';

// ===========================================================================
// routes/scripts.js — Fasa 7: Script Engine
//
// Endpoint:
//   GET    /api/projects/:id/scripts          — semua skrip projek
//   GET    /api/panels/:id/scripts            — skrip bagi satu panel
//   POST   /api/projects/:id/generate-scripts — jana skrip semua panel (idempotent)
//   POST   /api/panels/:id/generate-scripts   — jana skrip satu panel (idempotent)
//   POST   /api/panels/:id/scripts            — tambah skrip manual
//   PUT    /api/scripts/:id                   — edit skrip
//   DELETE /api/scripts/:id                   — padam skrip (+ segerak status)
//   POST   /api/panels/:id/scripts/reorder    — susun semula skrip dalam panel
// ===========================================================================

const express = require('express');
const router = express.Router();

const pool = require('../db/pool');
const { PROJECT_STATUS } = require('../config/projectStatus');
const { generateScripts, SCRIPT_TYPES, BUBBLE_TYPES, EMOTIONS, STATUSES } =
  require('../services/scriptEngine');
const ai = require('../ai/adapter'); // Fasa 20: Story Director (Claude-first, fallback deterministik)

const SCRIPT_COLUMNS =
  'id, project_id, scene_id, panel_id, script_order, script_type, speaker_code, ' +
  'speaker_name, text_ar, text_ms, emotion, bubble_type, reading_order, ' +
  'status, notes, created_at, updated_at';
const PROJECT_COLUMNS =
  'id, title_ar, title_ms, description, status, created_at, updated_at';

const INSERT_HEAD =
  `INSERT INTO scripts
     (project_id, scene_id, panel_id, script_order, script_type, speaker_code,
      speaker_name, text_ar, text_ms, emotion, bubble_type, reading_order,
      status, notes)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`;

// --- helper ---------------------------------------------------------------
function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}
// Bersih ke string: trim; pulangkan '' (bukan null) supaya selaras dengan
// DEFAULT '' dalam jadual dan piawai "tiada null".
function cleanStr(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}
function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

function jget(v) {
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } }
  return v;
}

// Validasi enum; menerima null/undefined/'' sebagai "jangan tukar".
function validEnum(value, allowed) {
  return value === undefined || value === null || value === '' ||
    allowed.indexOf(String(value)) !== -1;
}

// Segerakkan status projek mengikut bilangan script / panel / babak / watak / teks.
//   >=1 script                                -> script_ready
//   ==0 script (dari script_ready)            -> panel_ready (atau lebih awal)
// Flow: panel_ready -> script_ready -> visual_ready -> prompt_ready
async function syncScriptStatus(client, projectId) {
  const sc = await client.query('SELECT count(*)::int AS n FROM scripts WHERE project_id = $1', [projectId]);
  const n = sc.rows[0].n;
  const pr = await client.query('SELECT status FROM projects WHERE id = $1', [projectId]);
  if (pr.rows.length === 0) return null;
  const cur = pr.rows[0].status;
  let next = cur;

  if (n >= 1) {
    // Naik ke script_ready jika status masih di peringkat panel atau lebih awal.
    if (cur === PROJECT_STATUS.DRAFT || cur === PROJECT_STATUS.TEXT_READY ||
        cur === PROJECT_STATUS.CHARACTER_READY || cur === PROJECT_STATUS.SCENE_READY ||
        cur === PROJECT_STATUS.STORYBOARD_READY || cur === PROJECT_STATUS.PANEL_READY) {
      next = PROJECT_STATUS.SCRIPT_READY;
    }
  } else if (cur === PROJECT_STATUS.SCRIPT_READY) {
    // Semua skrip dipadam -> surut ke panel_ready (atau lebih awal mengikut data).
    const pc = await client.query('SELECT count(*)::int AS n FROM panels WHERE project_id = $1', [projectId]);
    const scn = await client.query('SELECT count(*)::int AS n FROM scenes WHERE project_id = $1', [projectId]);
    const ch = await client.query('SELECT count(*)::int AS n FROM characters WHERE project_id = $1', [projectId]);
    const tx = await client.query(
      "SELECT 1 FROM texts WHERE project_id = $1 AND original_ar IS NOT NULL AND length(btrim(original_ar)) > 0",
      [projectId]
    );
    if (pc.rows[0].n >= 1) next = PROJECT_STATUS.PANEL_READY;
    else if (scn.rows[0].n >= 1) next = PROJECT_STATUS.SCENE_READY;
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

// Jana skrip bagi satu panel dalam transaksi sedia ada (idempotent).
//   created = bilangan baris baru; skipped = yang sudah wujud.
async function generateForPanel(client, panel, scene, characters) {
  // Fasa 20: Story Director (Claude) tulis dialog/narasi/kapsyen Arab; fallback
  // ke skrip deterministik jika gagal. Isi speaker_name daripada peta watak.
  let items = null;
  try {
    const r = await ai.generateScript({ panel: panel, scene: scene, characters: characters || [] });
    if (r && r.success !== false && Array.isArray(r.scripts) && r.scripts.length) {
      const nameByCode = {};
      (characters || []).forEach(function (c) { nameByCode[c.character_code] = c.name_ar || c.name_ms || c.character_code; });
      r.scripts.forEach(function (it) { if (it.speaker_code && !it.speaker_name) it.speaker_name = nameByCode[it.speaker_code] || ''; });
      items = r.scripts;
    }
  } catch (e) { console.error('[scripts] claude:', e && e.message ? e.message : e); }
  if (!items) items = generateScripts(panel, scene);
  let created = 0, skipped = 0;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var ins = await client.query(
      INSERT_HEAD + ' ON CONFLICT (panel_id, script_order) DO NOTHING RETURNING id',
      [panel.project_id, panel.scene_id, panel.id, it.script_order, it.script_type,
       it.speaker_code, it.speaker_name, it.text_ar, it.text_ms, it.emotion,
       it.bubble_type, it.reading_order, it.status, it.notes]
    );
    if (ins.rows.length > 0) created++; else skipped++;
  }
  return { detected: items.length, created: created, skipped: skipped };
}

// ---------------------------------------------------------------------------
// GET /api/projects/:id/scripts — semua skrip (scene_no asc, panel_order asc)
// ---------------------------------------------------------------------------
router.get('/projects/:id/scripts', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });
  try {
    const proj = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });

    const { rows } = await pool.query(
      `SELECT ${SCRIPT_COLUMNS.split(', ').map(function (c) { return 'sc.' + c; }).join(', ')}
         FROM scripts sc
         LEFT JOIN panels p ON p.id = sc.panel_id
         LEFT JOIN scenes s ON s.id = sc.scene_id
        WHERE sc.project_id = $1
        ORDER BY s.scene_no ASC NULLS LAST, p.panel_order ASC NULLS LAST,
                 p.panel_no ASC, sc.panel_id ASC, sc.script_order ASC, sc.id ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[scripts] list project:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mendapatkan senarai skrip' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/panels/:id/scripts — skrip bagi satu panel
// ---------------------------------------------------------------------------
router.get('/panels/:id/scripts', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID panel tidak sah' });
  try {
    const p = await pool.query('SELECT id FROM panels WHERE id = $1', [id]);
    if (p.rows.length === 0) return res.status(404).json({ ok: false, error: 'Panel tidak dijumpai' });

    const { rows } = await pool.query(
      `SELECT ${SCRIPT_COLUMNS} FROM scripts WHERE panel_id = $1
        ORDER BY reading_order ASC NULLS LAST, script_order ASC, id ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[scripts] list panel:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mendapatkan skrip panel' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/generate-scripts — jana skrip untuk semua panel
// ---------------------------------------------------------------------------
router.post('/projects/:id/generate-scripts', async (req, res) => {
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
    const pls = await client.query(
      'SELECT id, project_id, scene_id, panel_no, panel_order, panel_type, ' +
      'visual_ms, action_ms, emotion_ms, caption_ms, dialogue_ms, dialogue_ar, ' +
      'location, characters_json FROM panels WHERE project_id = $1 ' +
      'ORDER BY panel_order ASC NULLS LAST, panel_no ASC, id ASC',
      [id]
    );
    if (pls.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Sila jana panel dahulu sebelum jana skrip.' });
    }
    // Peta babak (untuk scene_no + mood).
    const scs = await client.query(
      'SELECT id, scene_no, title_ms, summary_ms, mood, location, scene_type FROM scenes WHERE project_id = $1',
      [id]
    );
    const sceneMap = {};
    scs.rows.forEach(function (s) { sceneMap[String(s.id)] = s; });
    const chRows = await client.query('SELECT character_code, name_ar, name_ms, character_type, face_policy, role, visual_dna FROM characters WHERE project_id = $1 ORDER BY id ASC', [id]);

    let detected = 0, created = 0, skipped = 0;
    for (var i = 0; i < pls.rows.length; i++) {
      var panel = pls.rows[i];
      panel.characters_json = jget(panel.characters_json) || [];
      var scene = sceneMap[String(panel.scene_id)] || {};
      var r = await generateForPanel(client, panel, scene, chRows.rows);
      detected += r.detected; created += r.created; skipped += r.skipped;
    }

    const project = await syncScriptStatus(client, id);
    const all = await client.query(
      `SELECT ${SCRIPT_COLUMNS.split(', ').map(function (c) { return 'sc.' + c; }).join(', ')}
         FROM scripts sc LEFT JOIN panels p ON p.id = sc.panel_id LEFT JOIN scenes s ON s.id = sc.scene_id
        WHERE sc.project_id = $1
        ORDER BY s.scene_no ASC NULLS LAST, p.panel_order ASC NULLS LAST,
                 p.panel_no ASC, sc.panel_id ASC, sc.script_order ASC`,
      [id]
    );
    await client.query('COMMIT');
    res.json({ ok: true, detected: detected, created: created, skipped: skipped, scripts: all.rows, project: project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[scripts] generate project:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menjana skrip' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/panels/:id/generate-scripts — jana skrip untuk satu panel
// ---------------------------------------------------------------------------
router.post('/panels/:id/generate-scripts', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID panel tidak sah' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pr = await client.query(
      'SELECT id, project_id, scene_id, panel_no, panel_order, panel_type, ' +
      'visual_ms, action_ms, emotion_ms, caption_ms, dialogue_ms, dialogue_ar, ' +
      'location, characters_json FROM panels WHERE id = $1',
      [id]
    );
    if (pr.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Panel tidak dijumpai' });
    }
    const panel = pr.rows[0];
    panel.characters_json = jget(panel.characters_json) || [];
    const sc = await client.query(
      'SELECT id, scene_no, title_ms, summary_ms, mood, location, scene_type FROM scenes WHERE id = $1',
      [panel.scene_id]
    );
    const scene = sc.rows[0] || {};

    const chRows = await client.query('SELECT character_code, name_ar, name_ms, character_type, face_policy, role, visual_dna FROM characters WHERE project_id = $1 ORDER BY id ASC', [panel.project_id]);
    const r = await generateForPanel(client, panel, scene, chRows.rows);
    const project = await syncScriptStatus(client, panel.project_id);
    const all = await client.query(
      `SELECT ${SCRIPT_COLUMNS} FROM scripts WHERE panel_id = $1 ORDER BY reading_order ASC NULLS LAST, script_order ASC, id ASC`,
      [id]
    );
    await client.query('COMMIT');
    res.json({ ok: true, panel_id: id, detected: r.detected, created: r.created, skipped: r.skipped, scripts: all.rows, project: project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[scripts] generate panel:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menjana skrip' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/panels/:id/scripts — tambah skrip manual
// ---------------------------------------------------------------------------
router.post('/panels/:id/scripts', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID panel tidak sah' });

  const b = req.body || {};

  // Validasi enum.
  if (!validEnum(b.script_type, SCRIPT_TYPES)) {
    return res.status(400).json({ ok: false, error: 'script_type tidak sah' });
  }
  if (!validEnum(b.bubble_type, BUBBLE_TYPES)) {
    return res.status(400).json({ ok: false, error: 'bubble_type tidak sah' });
  }
  if (!validEnum(b.emotion, EMOTIONS)) {
    return res.status(400).json({ ok: false, error: 'emotion tidak sah' });
  }
  if (!validEnum(b.status, STATUSES)) {
    return res.status(400).json({ ok: false, error: 'status tidak sah' });
  }

  const text_ar = cleanStr(b.text_ar);
  const text_ms = cleanStr(b.text_ms);
  if (!text_ar && !text_ms) {
    return res.status(400).json({ ok: false, error: 'Sekurang-kurangnya text_ar atau text_ms mesti diisi.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pr = await client.query('SELECT id, project_id, scene_id FROM panels WHERE id = $1', [id]);
    if (pr.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Panel tidak dijumpai' });
    }
    const panel = pr.rows[0];

    // script_order: guna yang diberi (jika sah & bebas) atau auto = max+1.
    let script_order;
    if (b.script_order !== undefined && b.script_order !== null && b.script_order !== '') {
      script_order = Number(b.script_order);
      if (!isPositiveInt(script_order)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'script_order mesti nombor positif' });
      }
    } else {
      const mx = await client.query('SELECT COALESCE(MAX(script_order), 0) AS m FROM scripts WHERE panel_id = $1', [id]);
      script_order = Number(mx.rows[0].m) + 1;
    }

    // reading_order: guna yang diberi (jika sah) atau ikut script_order.
    let reading_order;
    if (b.reading_order !== undefined && b.reading_order !== null && b.reading_order !== '') {
      reading_order = Number(b.reading_order);
      if (!isPositiveInt(reading_order)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'reading_order mesti nombor positif' });
      }
    } else {
      reading_order = script_order;
    }

    const script_type = b.script_type ? cleanStr(b.script_type) : 'narration';
    const speaker_code = cleanStr(b.speaker_code);
    const bubble_type = b.bubble_type ? cleanStr(b.bubble_type) : (script_type === 'dialogue' ? 'speech' : 'narration');
    const emotion = b.emotion ? cleanStr(b.emotion) : 'neutral';
    const status = b.status ? cleanStr(b.status) : 'draft';
    const notes = cleanStr(b.notes);
    // speaker_name: guna input, jika tidak cuba petakan daripada kod.
    const speaker_name = cleanStr(b.speaker_name);

    const ins = await client.query(
      INSERT_HEAD + ' RETURNING ' + SCRIPT_COLUMNS,
      [panel.project_id, panel.scene_id, id, script_order, script_type, speaker_code,
       speaker_name, text_ar, text_ms, emotion, bubble_type, reading_order, status, notes]
    );
    const project = await syncScriptStatus(client, panel.project_id);
    await client.query('COMMIT');
    res.status(201).json({ script: ins.rows[0], project });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'script_order sudah digunakan dalam panel ini' });
    }
    console.error('[scripts] create:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menambah skrip' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /api/scripts/:id — edit skrip
// ---------------------------------------------------------------------------
router.put('/scripts/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID skrip tidak sah' });

  const b = req.body || {};

  if (!validEnum(b.script_type, SCRIPT_TYPES)) {
    return res.status(400).json({ ok: false, error: 'script_type tidak sah' });
  }
  if (!validEnum(b.bubble_type, BUBBLE_TYPES)) {
    return res.status(400).json({ ok: false, error: 'bubble_type tidak sah' });
  }
  if (!validEnum(b.emotion, EMOTIONS)) {
    return res.status(400).json({ ok: false, error: 'emotion tidak sah' });
  }
  if (!validEnum(b.status, STATUSES)) {
    return res.status(400).json({ ok: false, error: 'status tidak sah' });
  }

  try {
    const ex = await pool.query(`SELECT ${SCRIPT_COLUMNS} FROM scripts WHERE id = $1`, [id]);
    if (ex.rows.length === 0) return res.status(404).json({ ok: false, error: 'Skrip tidak dijumpai' });
    const cur = ex.rows[0];

    let script_order = cur.script_order;
    if (b.script_order !== undefined && b.script_order !== null && b.script_order !== '') {
      script_order = Number(b.script_order);
      if (!isPositiveInt(script_order)) {
        return res.status(400).json({ ok: false, error: 'script_order mesti nombor positif' });
      }
    }
    let reading_order = cur.reading_order;
    if (b.reading_order !== undefined && b.reading_order !== null && b.reading_order !== '') {
      reading_order = Number(b.reading_order);
      if (!isPositiveInt(reading_order)) {
        return res.status(400).json({ ok: false, error: 'reading_order mesti nombor positif' });
      }
    }

    const script_type = b.script_type !== undefined && b.script_type !== null && b.script_type !== ''
      ? cleanStr(b.script_type) : cur.script_type;
    const speaker_code = b.speaker_code !== undefined ? cleanStr(b.speaker_code) : cur.speaker_code;
    const speaker_name = b.speaker_name !== undefined ? cleanStr(b.speaker_name) : cur.speaker_name;
    const text_ar = b.text_ar !== undefined ? cleanStr(b.text_ar) : cur.text_ar;
    const text_ms = b.text_ms !== undefined ? cleanStr(b.text_ms) : cur.text_ms;
    const emotion = b.emotion !== undefined && b.emotion !== null && b.emotion !== ''
      ? cleanStr(b.emotion) : cur.emotion;
    const bubble_type = b.bubble_type !== undefined && b.bubble_type !== null && b.bubble_type !== ''
      ? cleanStr(b.bubble_type) : cur.bubble_type;
    const status = b.status !== undefined && b.status !== null && b.status !== ''
      ? cleanStr(b.status) : cur.status;
    const notes = b.notes !== undefined ? cleanStr(b.notes) : cur.notes;

    // Sekurang-kurangnya satu teks mesti ada.
    if (!text_ar && !text_ms) {
      return res.status(400).json({ ok: false, error: 'Sekurang-kurangnya text_ar atau text_ms mesti diisi.' });
    }

    const upd = await pool.query(
      `UPDATE scripts SET
          script_order = $1, script_type = $2, speaker_code = $3, speaker_name = $4,
          text_ar = $5, text_ms = $6, emotion = $7, bubble_type = $8,
          reading_order = $9, status = $10, notes = $11
        WHERE id = $12
        RETURNING ${SCRIPT_COLUMNS}`,
      [script_order, script_type, speaker_code, speaker_name, text_ar, text_ms,
       emotion, bubble_type, reading_order, status, notes, id]
    );
    res.json({ script: upd.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'script_order sudah digunakan dalam panel ini' });
    }
    console.error('[scripts] update:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mengemas kini skrip' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/scripts/:id — padam skrip (+ segerak status)
// ---------------------------------------------------------------------------
router.delete('/scripts/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID skrip tidak sah' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ex = await client.query('SELECT project_id FROM scripts WHERE id = $1', [id]);
    if (ex.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Skrip tidak dijumpai' });
    }
    const projectId = ex.rows[0].project_id;
    await client.query('DELETE FROM scripts WHERE id = $1', [id]);
    const project = await syncScriptStatus(client, projectId);
    await client.query('COMMIT');
    res.json({ ok: true, deleted: id, project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[scripts] delete:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memadam skrip' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/panels/:id/scripts/reorder — susun semula script_order dalam panel
// Body: { "script_ids": [..] } — mesti senarai penuh id skrip panel itu.
// ---------------------------------------------------------------------------
router.post('/panels/:id/scripts/reorder', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID panel tidak sah' });

  const raw = req.body && req.body.script_ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return res.status(400).json({ ok: false, error: 'script_ids mesti senarai (array) yang tidak kosong' });
  }
  const orderIds = [];
  for (var k = 0; k < raw.length; k++) {
    var sid = parseId(raw[k]);
    if (!sid) return res.status(400).json({ ok: false, error: 'script_ids mengandungi id tidak sah' });
    orderIds.push(sid);
  }
  if (new Set(orderIds.map(String)).size !== orderIds.length) {
    return res.status(400).json({ ok: false, error: 'script_ids mengandungi pendua' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await client.query('SELECT id FROM panels WHERE id = $1', [id]);
    if (p.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Panel tidak dijumpai' });
    }
    const existing = await client.query('SELECT id FROM scripts WHERE panel_id = $1', [id]);
    const existingSet = new Set(existing.rows.map(function (r) { return String(r.id); }));
    if (existingSet.size !== orderIds.length || !orderIds.every(function (x) { return existingSet.has(String(x)); })) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'script_ids mesti sepadan dengan semua skrip panel ini' });
    }

    // Dua fasa untuk mengelak langgar UNIQUE(panel_id, script_order):
    // Fasa 1 — alih SEMUA script_order panel ini ke julat sementara (+100000)
    //          dalam satu pernyataan supaya tiada pertindihan.
    await client.query('UPDATE scripts SET script_order = script_order + 100000 WHERE panel_id = $1', [id]);
    // Fasa 2 — tetapkan script_order & reading_order mengikut urutan akhir (1..n).
    for (var j = 0; j < orderIds.length; j++) {
      await client.query('UPDATE scripts SET script_order = $1, reading_order = $1 WHERE id = $2 AND panel_id = $3', [j + 1, orderIds[j], id]);
    }
    await client.query('COMMIT');
    const all = await client.query(
      `SELECT ${SCRIPT_COLUMNS} FROM scripts WHERE panel_id = $1 ORDER BY reading_order ASC NULLS LAST, script_order ASC, id ASC`,
      [id]
    );
    res.json({ ok: true, scripts: all.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[scripts] reorder:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menyusun semula skrip' });
  } finally {
    client.release();
  }
});

module.exports = router;
