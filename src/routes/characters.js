'use strict';

const express = require('express');
const router = express.Router();

const pool = require('../db/pool');
const { CHARACTER_TYPES, CHARACTER_TYPE_VALUES } = require('../config/characterTypes');
const { PROJECT_STATUS } = require('../config/projectStatus');
const { isNobleName, NOBLE_PROFILE } = require('../config/nobleFigures');
const { extractCharacters } = require('../services/characterEngine');
const ai = require('../ai/adapter'); // Fasa 20: Story Director (Claude-first, fallback deterministik)

const FACE_POLICIES = ['normal', 'glowing_light'];

const CHARACTER_COLUMNS =
  'id, project_id, character_code, name_ar, name_ms, character_type, role, ' +
  'face_policy, appearance_notes, visual_dna, canonical_character, status, ' +
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

// visual_dna: terima objek (dari JSON body) atau string JSON.
// Pulang objek; pulang null jika tidak sah (bukan objek / JSON rosak).
function parseVisualDna(input) {
  if (input === undefined || input === null || input === '') return {};
  if (typeof input === 'object') {
    return Array.isArray(input) ? null : input;
  }
  try {
    const obj = JSON.parse(String(input));
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
    return null;
  } catch (e) {
    return null;
  }
}

// Tentukan face_policy: tokoh mulia → glowing_light; selainnya ikut input / normal.
function resolveFacePolicy(isNoble, requested) {
  if (isNoble) return 'glowing_light';
  if (requested && FACE_POLICIES.indexOf(requested) !== -1) return requested;
  return 'normal';
}

// Hasilkan asas kod daripada nama (ASCII), fallback 'CHAR'.
function slugCode(name) {
  const base = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'CHAR';
}

async function nextCode(client, projectId, base) {
  const r = await client.query(
    'SELECT character_code FROM characters WHERE project_id = $1 AND character_code LIKE $2',
    [projectId, base + '\\_%']
  );
  const taken = {};
  r.rows.forEach(function (x) { taken[x.character_code] = true; });
  let i = 1;
  let code = base + '_' + String(i).padStart(3, '0');
  while (taken[code]) {
    i++;
    code = base + '_' + String(i).padStart(3, '0');
  }
  return code;
}

// Segerakkan status projek mengikut bilangan watak.
//  >=1 watak & status draft/text_ready  -> character_ready
//  ==0 watak & status character_ready    -> text_ready
async function syncProjectStatus(client, projectId) {
  const c = await client.query('SELECT count(*)::int AS n FROM characters WHERE project_id = $1', [projectId]);
  const count = c.rows[0].n;
  const p = await client.query('SELECT status FROM projects WHERE id = $1', [projectId]);
  if (p.rows.length === 0) return null;
  const cur = p.rows[0].status;
  let next = cur;
  if (count >= 1 && (cur === PROJECT_STATUS.DRAFT || cur === PROJECT_STATUS.TEXT_READY)) {
    next = PROJECT_STATUS.CHARACTER_READY;
  } else if (count === 0 && cur === PROJECT_STATUS.CHARACTER_READY) {
    next = PROJECT_STATUS.TEXT_READY;
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
// GET /api/projects/:id/characters — senarai watak projek
// ---------------------------------------------------------------------------
router.get('/projects/:id/characters', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });
  try {
    const proj = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });

    const { rows } = await pool.query(
      `SELECT ${CHARACTER_COLUMNS} FROM characters WHERE project_id = $1 ORDER BY id ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[characters] list:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mendapatkan senarai watak' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/characters — tambah watak manual
// ---------------------------------------------------------------------------
router.post('/projects/:id/characters', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });

  const name_ar = clean(req.body.name_ar);
  const name_ms = clean(req.body.name_ms);
  const role = clean(req.body.role);
  const appearance_notes = clean(req.body.appearance_notes);

  if (!name_ar && !name_ms) {
    return res.status(400).json({ ok: false, error: 'Sila beri sekurang-kurangnya satu nama (Arab atau Melayu).' });
  }

  let character_type = clean(req.body.character_type) || CHARACTER_TYPES.ORDINARY;
  if (CHARACTER_TYPE_VALUES.indexOf(character_type) === -1) {
    return res.status(400).json({ ok: false, error: 'Jenis watak tidak sah' });
  }

  const visual_dna = parseVisualDna(req.body.visual_dna);
  if (visual_dna === null) {
    return res.status(400).json({ ok: false, error: 'Visual DNA mesti objek JSON yang sah' });
  }

  // Penguatkuasaan tokoh mulia: jika nama sepadan → no-face + glowing_light.
  const noble = isNobleName(name_ar, name_ms);
  if (noble) character_type = NOBLE_PROFILE.character_type;
  const face_policy = resolveFacePolicy(noble, clean(req.body.face_policy));

  const canonical_character =
    req.body.canonical_character === undefined ? true : !!req.body.canonical_character;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const proj = await client.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });
    }

    // Tentukan character_code (guna yang diberi jika ada & unik, jika tidak jana).
    let code = clean(req.body.character_code);
    if (code) {
      const dup = await client.query(
        'SELECT 1 FROM characters WHERE project_id = $1 AND character_code = $2',
        [id, code]
      );
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ ok: false, error: 'character_code sudah digunakan dalam projek ini' });
      }
    } else {
      code = await nextCode(client, id, slugCode(name_ms || name_ar));
    }

    const ins = await client.query(
      `INSERT INTO characters
         (project_id, character_code, name_ar, name_ms, character_type, role,
          face_policy, appearance_notes, visual_dna, canonical_character, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'active')
       RETURNING ${CHARACTER_COLUMNS}`,
      [id, code, name_ar, name_ms, character_type, role, face_policy,
       appearance_notes, JSON.stringify(visual_dna), canonical_character]
    );

    const project = await syncProjectStatus(client, id);
    await client.query('COMMIT');
    res.status(201).json({ character: ins.rows[0], project });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'character_code sudah digunakan dalam projek ini' });
    }
    console.error('[characters] create:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menambah watak' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /api/characters/:id — edit watak (character_code TIDAK boleh diubah)
// Boleh ubah: name_ar, name_ms, role, appearance_notes, visual_dna.
// ---------------------------------------------------------------------------
router.put('/characters/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID watak tidak sah' });

  const name_ar = clean(req.body.name_ar);
  const name_ms = clean(req.body.name_ms);
  const role = clean(req.body.role);
  const appearance_notes = clean(req.body.appearance_notes);

  if (!name_ar && !name_ms) {
    return res.status(400).json({ ok: false, error: 'Sila beri sekurang-kurangnya satu nama (Arab atau Melayu).' });
  }

  const visual_dna = parseVisualDna(req.body.visual_dna);
  if (visual_dna === null) {
    return res.status(400).json({ ok: false, error: 'Visual DNA mesti objek JSON yang sah' });
  }

  try {
    const existing = await pool.query('SELECT id, character_type FROM characters WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ ok: false, error: 'Watak tidak dijumpai' });

    // Penguatkuasaan keselamatan: jika nama (baharu) tokoh mulia → no-face + glowing_light.
    const noble = isNobleName(name_ar, name_ms);
    let result;
    if (noble) {
      result = await pool.query(
        `UPDATE characters
            SET name_ar = $1, name_ms = $2, role = $3, appearance_notes = $4,
                visual_dna = $5::jsonb,
                character_type = '${NOBLE_PROFILE.character_type}', face_policy = '${NOBLE_PROFILE.face_policy}'
          WHERE id = $6
          RETURNING ${CHARACTER_COLUMNS}`,
        [name_ar, name_ms, role, appearance_notes, JSON.stringify(visual_dna), id]
      );
    } else {
      result = await pool.query(
        `UPDATE characters
            SET name_ar = $1, name_ms = $2, role = $3, appearance_notes = $4,
                visual_dna = $5::jsonb
          WHERE id = $6
          RETURNING ${CHARACTER_COLUMNS}`,
        [name_ar, name_ms, role, appearance_notes, JSON.stringify(visual_dna), id]
      );
    }
    res.json({ character: result.rows[0] });
  } catch (err) {
    console.error('[characters] update:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mengemas kini watak' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/characters/:id — padam watak (+ segerak status projek)
// ---------------------------------------------------------------------------
router.delete('/characters/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID watak tidak sah' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ex = await client.query('SELECT project_id FROM characters WHERE id = $1', [id]);
    if (ex.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Watak tidak dijumpai' });
    }
    const projectId = ex.rows[0].project_id;
    await client.query('DELETE FROM characters WHERE id = $1', [id]);
    const project = await syncProjectStatus(client, projectId);
    await client.query('COMMIT');
    res.json({ ok: true, deleted: id, project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[characters] delete:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memadam watak' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/generate-characters — jana watak daripada teks Arab
// Rule-based (tanpa AI). Idempotent: ON CONFLICT (project_id, character_code).
// ---------------------------------------------------------------------------
router.post('/projects/:id/generate-characters', async (req, res) => {
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

    const t = await client.query('SELECT original_ar FROM texts WHERE project_id = $1', [id]);
    const original = (t.rows[0] && t.rows[0].original_ar) || '';
    if (!original.trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Tiada teks Arab untuk dianalisis. Sila simpan teks dahulu.' });
    }

    // Fasa 20: Story Director (Claude) dahulu; fallback ke engine deterministik.
    let templates = null;
    try {
      const r = await ai.generateCharacter({ text_ar: original });
      if (r && r.success !== false && Array.isArray(r.characters) && r.characters.length) templates = r.characters;
    } catch (e) { console.error('[characters] claude:', e && e.message ? e.message : e); }
    if (!templates) templates = extractCharacters(original);
    const created = [];
    const skipped = [];

    for (var i = 0; i < templates.length; i++) {
      var c = templates[i];
      var ins = await client.query(
        `INSERT INTO characters
           (project_id, character_code, name_ar, name_ms, character_type, role,
            face_policy, appearance_notes, visual_dna, canonical_character, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'active')
         ON CONFLICT (project_id, character_code) DO NOTHING
         RETURNING ${CHARACTER_COLUMNS}`,
        [id, c.character_code, c.name_ar, c.name_ms, c.character_type, c.role,
         c.face_policy, c.appearance_notes, JSON.stringify(c.visual_dna), c.canonical_character]
      );
      if (ins.rows.length > 0) created.push(ins.rows[0]);
      else skipped.push(c.character_code);
    }

    const project = await syncProjectStatus(client, id);
    const all = await client.query(
      `SELECT ${CHARACTER_COLUMNS} FROM characters WHERE project_id = $1 ORDER BY id ASC`,
      [id]
    );

    await client.query('COMMIT');
    res.json({
      ok: true,
      detected: templates.length,
      created: created,
      skipped: skipped,
      characters: all.rows,
      project: project
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[characters] generate:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menjana watak' });
  } finally {
    client.release();
  }
});

module.exports = router;
