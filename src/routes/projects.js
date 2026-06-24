'use strict';

const express = require('express');
const router = express.Router();

const pool = require('../db/pool');
const { PROJECT_STATUS, PROJECT_STATUS_VALUES } = require('../config/projectStatus');

// Lajur projek yang dipulangkan kepada klien.
const PROJECT_COLUMNS =
  'id, title_ar, title_ms, description, status, created_at, updated_at';

// Hurai & sahkan id integer positif. Pulang null jika tidak sah.
function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Kemas teks tajuk/penerangan: null jika kosong/whitespace sahaja.
function clean(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

// GET /api/projects — senarai semua projek (terbaru dahulu).
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PROJECT_COLUMNS} FROM projects ORDER BY updated_at DESC, id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[projects] list:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mendapatkan senarai projek' });
  }
});

// POST /api/projects — cipta projek baharu (status = draft).
router.post('/', async (req, res) => {
  const title_ms = clean(req.body.title_ms);
  const title_ar = clean(req.body.title_ar);
  const description = clean(req.body.description);

  if (!title_ms && !title_ar) {
    return res.status(400).json({
      ok: false,
      error: 'Sila beri sekurang-kurangnya satu tajuk (Melayu atau Arab).'
    });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO projects (title_ar, title_ms, description, status)
       VALUES ($1, $2, $3, $4)
       RETURNING ${PROJECT_COLUMNS}`,
      [title_ar, title_ms, description, PROJECT_STATUS.DRAFT]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[projects] create:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mencipta projek' });
  }
});

// GET /api/projects/:id — detail satu projek.
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });

  try {
    const { rows } = await pool.query(
      `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[projects] get:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mendapatkan projek' });
  }
});

// PUT /api/projects/:id — kemas kini tajuk/penerangan (status pilihan & disahkan).
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });

  const title_ms = clean(req.body.title_ms);
  const title_ar = clean(req.body.title_ar);
  const description = clean(req.body.description);

  if (!title_ms && !title_ar) {
    return res.status(400).json({
      ok: false,
      error: 'Sila beri sekurang-kurangnya satu tajuk (Melayu atau Arab).'
    });
  }

  // status pilihan: jika diberi, mesti antara nilai yang dibenarkan.
  let status;
  if (req.body.status !== undefined) {
    status = clean(req.body.status);
    if (!PROJECT_STATUS_VALUES.includes(status)) {
      return res.status(400).json({ ok: false, error: 'Status tidak sah' });
    }
  }

  try {
    let result;
    if (status) {
      result = await pool.query(
        `UPDATE projects
            SET title_ar = $1, title_ms = $2, description = $3, status = $4
          WHERE id = $5
          RETURNING ${PROJECT_COLUMNS}`,
        [title_ar, title_ms, description, status, id]
      );
    } else {
      result = await pool.query(
        `UPDATE projects
            SET title_ar = $1, title_ms = $2, description = $3
          WHERE id = $4
          RETURNING ${PROJECT_COLUMNS}`,
        [title_ar, title_ms, description, id]
      );
    }
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[projects] update:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mengemas kini projek' });
  }
});

// DELETE /api/projects/:id — padam projek (cascade ke texts/scenes/pages/panels).
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });

  try {
    const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });
    }
    res.json({ ok: true, deleted: id });
  } catch (err) {
    console.error('[projects] delete:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memadam projek' });
  }
});

module.exports = router;
