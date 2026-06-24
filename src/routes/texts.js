'use strict';

const express = require('express');
const router = express.Router();

const pool = require('../db/pool');
const { PROJECT_STATUS, EARLY_STAGES } = require('../config/projectStatus');

const TEXT_COLUMNS =
  'id, project_id, original_ar, translation_ms, notes, created_at, updated_at';
const PROJECT_COLUMNS =
  'id, title_ar, title_ms, description, status, created_at, updated_at';

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Kekalkan format dalaman (baris baharu, jarak), tetapi anggap teks yang
// hanya whitespace sebagai kosong → null.
function normalize(value) {
  if (value === undefined || value === null) return null;
  const s = String(value);
  return s.trim().length ? s : null;
}

// GET /api/projects/:id/text — dapatkan teks projek (struktur kosong jika belum ada).
router.get('/:id/text', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });

  try {
    const proj = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });
    }

    const { rows } = await pool.query(
      `SELECT ${TEXT_COLUMNS} FROM texts WHERE project_id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.json({ project_id: id, original_ar: '', translation_ms: '', notes: '' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[texts] get:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mendapatkan teks' });
  }
});

// PUT /api/projects/:id/text — simpan (upsert) teks + kemas kini status.
// Peraturan: original_ar berisi → text_ready; kosong → draft.
// Hanya dikuatkuasakan jika projek masih di peringkat awal (draft/text_ready),
// supaya kemajuan Fasa 2+ tidak terbatal.
router.put('/:id/text', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });

  const original_ar = normalize(req.body.original_ar);
  const translation_ms = normalize(req.body.translation_ms);
  const notes = normalize(req.body.notes);
  const hasArabic = original_ar !== null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const proj = await client.query('SELECT id, status FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });
    }

    const text = await client.query(
      `INSERT INTO texts (project_id, original_ar, translation_ms, notes)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id) DO UPDATE
            SET original_ar    = EXCLUDED.original_ar,
                translation_ms = EXCLUDED.translation_ms,
                notes          = EXCLUDED.notes
       RETURNING ${TEXT_COLUMNS}`,
      [id, original_ar, translation_ms, notes]
    );

    const current = proj.rows[0].status;
    let nextStatus = current;
    if (EARLY_STAGES.includes(current)) {
      nextStatus = hasArabic ? PROJECT_STATUS.TEXT_READY : PROJECT_STATUS.DRAFT;
    }

    let project;
    if (nextStatus !== current) {
      const upd = await client.query(
        `UPDATE projects SET status = $1 WHERE id = $2 RETURNING ${PROJECT_COLUMNS}`,
        [nextStatus, id]
      );
      project = upd.rows[0];
    } else {
      const cur = await client.query(
        `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $1`,
        [id]
      );
      project = cur.rows[0];
    }

    await client.query('COMMIT');
    res.json({ text: text.rows[0], project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[texts] save:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menyimpan teks' });
  } finally {
    client.release();
  }
});

module.exports = router;
