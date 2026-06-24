'use strict';

const express = require('express');
const router = express.Router();

const pool = require('../db/pool');
const { PROJECT_STATUS } = require('../config/projectStatus');
const { extractScenes } = require('../services/sceneEngine');

const SCENE_TYPES = ['intro', 'journey', 'meeting', 'lesson', 'event', 'reveal', 'ending'];

const SCENE_COLUMNS =
  'id, project_id, scene_no, title_ar, title_ms, summary_ms, mood, location, ' +
  'source_hint, characters_json, scene_type, estimated_pages, status, ' +
  'created_at, updated_at';
const PROJECT_COLUMNS =
  'id, title_ar, title_ms, description, status, created_at, updated_at';

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
// characters_json: array string → array bersih. Pulang null jika bukan array.
function parseCharacters(input) {
  if (input === undefined || input === null || input === '') return [];
  if (!Array.isArray(input)) return null;
  return input.map(function (x) { return String(x).trim(); }).filter(function (x) { return x.length > 0; });
}

// Segerakkan status projek mengikut bilangan babak / watak / teks.
//   >=1 babak                          -> scene_ready
//   ==0 babak (dari scene_ready)       -> character_ready | text_ready | draft
async function syncSceneStatus(client, projectId) {
  const sc = await client.query('SELECT count(*)::int AS n FROM scenes WHERE project_id = $1', [projectId]);
  const sceneCount = sc.rows[0].n;
  const pr = await client.query('SELECT status FROM projects WHERE id = $1', [projectId]);
  if (pr.rows.length === 0) return null;
  const cur = pr.rows[0].status;
  let next = cur;

  if (sceneCount >= 1) {
    if (cur === PROJECT_STATUS.DRAFT || cur === PROJECT_STATUS.TEXT_READY || cur === PROJECT_STATUS.CHARACTER_READY) {
      next = PROJECT_STATUS.SCENE_READY;
    }
  } else if (cur === PROJECT_STATUS.SCENE_READY) {
    const ch = await client.query('SELECT count(*)::int AS n FROM characters WHERE project_id = $1', [projectId]);
    const charCount = ch.rows[0].n;
    const tx = await client.query(
      "SELECT 1 FROM texts WHERE project_id = $1 AND original_ar IS NOT NULL AND length(btrim(original_ar)) > 0",
      [projectId]
    );
    const hasText = tx.rows.length > 0;
    if (charCount >= 1) next = PROJECT_STATUS.CHARACTER_READY;
    else if (hasText) next = PROJECT_STATUS.TEXT_READY;
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
// GET /api/projects/:id/scenes — senarai babak (scene_no asc)
// ---------------------------------------------------------------------------
router.get('/projects/:id/scenes', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });
  try {
    const proj = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });

    const { rows } = await pool.query(
      `SELECT ${SCENE_COLUMNS} FROM scenes WHERE project_id = $1 ORDER BY scene_no ASC, id ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[scenes] list:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mendapatkan senarai babak' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/scenes — tambah babak manual
// ---------------------------------------------------------------------------
router.post('/projects/:id/scenes', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });

  const title_ar = clean(req.body.title_ar);
  const title_ms = clean(req.body.title_ms);
  const summary_ms = clean(req.body.summary_ms);
  const mood = clean(req.body.mood);
  const location = clean(req.body.location);
  const source_hint = clean(req.body.source_hint);

  if (!title_ar && !title_ms) {
    return res.status(400).json({ ok: false, error: 'Sila beri sekurang-kurangnya satu tajuk babak (Arab atau Melayu).' });
  }

  // scene_type
  let scene_type = clean(req.body.scene_type);
  if (scene_type !== null && SCENE_TYPES.indexOf(scene_type) === -1) {
    return res.status(400).json({ ok: false, error: 'scene_type tidak sah' });
  }

  // estimated_pages (1..20)
  let estimated_pages = 1;
  if (req.body.estimated_pages !== undefined && req.body.estimated_pages !== null && req.body.estimated_pages !== '') {
    estimated_pages = Number(req.body.estimated_pages);
    if (!Number.isInteger(estimated_pages) || estimated_pages < 1 || estimated_pages > 20) {
      return res.status(400).json({ ok: false, error: 'estimated_pages mesti nombor antara 1 dan 20' });
    }
  }

  // characters_json
  const characters_json = parseCharacters(req.body.characters_json);
  if (characters_json === null) {
    return res.status(400).json({ ok: false, error: 'characters_json mesti senarai (array) kod watak' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const proj = await client.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });
    }

    // scene_no: guna yang diberi (jika sah & bebas) atau auto = max+1.
    let scene_no;
    if (req.body.scene_no !== undefined && req.body.scene_no !== null && req.body.scene_no !== '') {
      scene_no = Number(req.body.scene_no);
      if (!isPositiveInt(scene_no)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'scene_no mesti nombor positif' });
      }
      const dup = await client.query('SELECT 1 FROM scenes WHERE project_id = $1 AND scene_no = $2', [id, scene_no]);
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ ok: false, error: 'scene_no sudah digunakan dalam projek ini' });
      }
    } else {
      const mx = await client.query('SELECT COALESCE(MAX(scene_no), 0) AS m FROM scenes WHERE project_id = $1', [id]);
      scene_no = Number(mx.rows[0].m) + 1;
    }

    const ins = await client.query(
      `INSERT INTO scenes
         (project_id, scene_no, title_ar, title_ms, summary_ms, mood, location,
          source_hint, characters_json, scene_type, estimated_pages, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,'active')
       RETURNING ${SCENE_COLUMNS}`,
      [id, scene_no, title_ar, title_ms, summary_ms, mood, location,
       source_hint, JSON.stringify(characters_json), scene_type, estimated_pages]
    );

    const project = await syncSceneStatus(client, id);
    await client.query('COMMIT');
    res.status(201).json({ scene: ins.rows[0], project });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'scene_no sudah digunakan dalam projek ini' });
    }
    console.error('[scenes] create:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menambah babak' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /api/scenes/:id — edit babak
// ---------------------------------------------------------------------------
router.put('/scenes/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID babak tidak sah' });

  try {
    const ex = await pool.query(`SELECT ${SCENE_COLUMNS} FROM scenes WHERE id = $1`, [id]);
    if (ex.rows.length === 0) return res.status(404).json({ ok: false, error: 'Babak tidak dijumpai' });
    const cur = ex.rows[0];

    // Gabung nilai sedia ada dengan input (hanya tukar yang dihantar).
    const b = req.body || {};

    let scene_no = cur.scene_no;
    if (b.scene_no !== undefined && b.scene_no !== null && b.scene_no !== '') {
      scene_no = Number(b.scene_no);
      if (!isPositiveInt(scene_no)) return res.status(400).json({ ok: false, error: 'scene_no mesti nombor positif' });
    }

    let scene_type = cur.scene_type;
    if (b.scene_type !== undefined) {
      scene_type = clean(b.scene_type);
      if (scene_type !== null && SCENE_TYPES.indexOf(scene_type) === -1) {
        return res.status(400).json({ ok: false, error: 'scene_type tidak sah' });
      }
    }

    let estimated_pages = cur.estimated_pages;
    if (b.estimated_pages !== undefined && b.estimated_pages !== null && b.estimated_pages !== '') {
      estimated_pages = Number(b.estimated_pages);
      if (!Number.isInteger(estimated_pages) || estimated_pages < 1 || estimated_pages > 20) {
        return res.status(400).json({ ok: false, error: 'estimated_pages mesti nombor antara 1 dan 20' });
      }
    }

    let characters_json = cur.characters_json;
    if (b.characters_json !== undefined) {
      characters_json = parseCharacters(b.characters_json);
      if (characters_json === null) {
        return res.status(400).json({ ok: false, error: 'characters_json mesti senarai (array) kod watak' });
      }
    }

    const title_ar = b.title_ar !== undefined ? clean(b.title_ar) : cur.title_ar;
    const title_ms = b.title_ms !== undefined ? clean(b.title_ms) : cur.title_ms;
    const summary_ms = b.summary_ms !== undefined ? clean(b.summary_ms) : cur.summary_ms;
    const mood = b.mood !== undefined ? clean(b.mood) : cur.mood;
    const location = b.location !== undefined ? clean(b.location) : cur.location;
    const source_hint = b.source_hint !== undefined ? clean(b.source_hint) : cur.source_hint;

    if (!title_ar && !title_ms) {
      return res.status(400).json({ ok: false, error: 'Sila beri sekurang-kurangnya satu tajuk babak (Arab atau Melayu).' });
    }

    const upd = await pool.query(
      `UPDATE scenes
          SET scene_no = $1, title_ar = $2, title_ms = $3, summary_ms = $4, mood = $5,
              location = $6, source_hint = $7, characters_json = $8::jsonb,
              scene_type = $9, estimated_pages = $10
        WHERE id = $11
        RETURNING ${SCENE_COLUMNS}`,
      [scene_no, title_ar, title_ms, summary_ms, mood, location, source_hint,
       JSON.stringify(characters_json), scene_type, estimated_pages, id]
    );
    res.json({ scene: upd.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'scene_no sudah digunakan dalam projek ini' });
    }
    console.error('[scenes] update:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mengemas kini babak' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/scenes/:id — padam babak (+ segerak status)
// ---------------------------------------------------------------------------
router.delete('/scenes/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID babak tidak sah' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ex = await client.query('SELECT project_id FROM scenes WHERE id = $1', [id]);
    if (ex.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Babak tidak dijumpai' });
    }
    const projectId = ex.rows[0].project_id;
    await client.query('DELETE FROM scenes WHERE id = $1', [id]);
    const project = await syncSceneStatus(client, projectId);
    await client.query('COMMIT');
    res.json({ ok: true, deleted: id, project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[scenes] delete:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memadam babak' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/generate-scenes — jana babak rule-based daripada teks
// Idempotent: ON CONFLICT (project_id, scene_no) DO NOTHING.
// ---------------------------------------------------------------------------
router.post('/projects/:id/generate-scenes', async (req, res) => {
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

    // Prasyarat pipeline: perlu teks, kemudian perlu watak.
    const t = await client.query('SELECT original_ar FROM texts WHERE project_id = $1', [id]);
    const original = (t.rows[0] && t.rows[0].original_ar) || '';
    if (!original.trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Sila masukkan teks Mutalaah dahulu.' });
    }
    const ch = await client.query('SELECT count(*)::int AS n FROM characters WHERE project_id = $1', [id]);
    if (ch.rows[0].n === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Sila jana watak dahulu sebelum jana babak.' });
    }

    const templates = extractScenes(original);
    let created = 0;
    let skipped = 0;

    for (var i = 0; i < templates.length; i++) {
      var s = templates[i];
      var ins = await client.query(
        `INSERT INTO scenes
           (project_id, scene_no, title_ar, title_ms, summary_ms, mood, location,
            source_hint, characters_json, scene_type, estimated_pages, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,'active')
         ON CONFLICT (project_id, scene_no) DO NOTHING
         RETURNING id`,
        [id, s.scene_no, s.title_ar, s.title_ms, s.summary_ms, s.mood, s.location,
         s.source_hint, JSON.stringify(s.characters_json), s.scene_type, s.estimated_pages]
      );
      if (ins.rows.length > 0) created++;
      else skipped++;
    }

    const project = await syncSceneStatus(client, id);
    const all = await client.query(
      `SELECT ${SCENE_COLUMNS} FROM scenes WHERE project_id = $1 ORDER BY scene_no ASC, id ASC`,
      [id]
    );

    await client.query('COMMIT');
    res.json({
      ok: true,
      detected: templates.length,
      created: created,
      skipped: skipped,
      scenes: all.rows,
      project: project
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[scenes] generate:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menjana babak' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/scenes/reorder — susun semula scene_no
// Body: { "scene_ids": [3,1,2,4] } — mesti senarai penuh id babak projek.
// ---------------------------------------------------------------------------
router.post('/projects/:id/scenes/reorder', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });

  const raw = req.body && req.body.scene_ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return res.status(400).json({ ok: false, error: 'scene_ids mesti senarai (array) yang tidak kosong' });
  }
  const orderIds = [];
  for (var k = 0; k < raw.length; k++) {
    var sid = parseId(raw[k]);
    if (!sid) return res.status(400).json({ ok: false, error: 'scene_ids mengandungi id tidak sah' });
    orderIds.push(sid);
  }
  // tiada pendua
  if (new Set(orderIds.map(String)).size !== orderIds.length) {
    return res.status(400).json({ ok: false, error: 'scene_ids mengandungi pendua' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const proj = await client.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });
    }

    const existing = await client.query('SELECT id FROM scenes WHERE project_id = $1', [id]);
    const existingSet = new Set(existing.rows.map(function (r) { return String(r.id); }));
    if (existingSet.size !== orderIds.length || !orderIds.every(function (x) { return existingSet.has(String(x)); })) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'scene_ids mesti sepadan dengan semua babak projek ini' });
    }

    // Dua fasa untuk elak perlanggaran UNIQUE(project_id, scene_no).
    await client.query('UPDATE scenes SET scene_no = scene_no + 100000 WHERE project_id = $1', [id]);
    for (var j = 0; j < orderIds.length; j++) {
      await client.query('UPDATE scenes SET scene_no = $1 WHERE id = $2 AND project_id = $3', [j + 1, orderIds[j], id]);
    }

    await client.query('COMMIT');
    const all = await client.query(
      `SELECT ${SCENE_COLUMNS} FROM scenes WHERE project_id = $1 ORDER BY scene_no ASC, id ASC`,
      [id]
    );
    res.json({ ok: true, scenes: all.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[scenes] reorder:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menyusun semula babak' });
  } finally {
    client.release();
  }
});

module.exports = router;
