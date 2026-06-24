'use strict';

const express = require('express');
const router = express.Router();

const pool = require('../db/pool');

// GET /api/health
// Pemeriksaan ringkas — tidak menyentuh pangkalan data.
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'webtoon-mutalaah'
  });
});

// GET /api/health/db
// Pemeriksaan tambahan untuk mengesahkan sambungan PostgreSQL.
// Berguna untuk pengesahan deploy dan akan diperluas pada Fasa 1.
router.get('/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    res.json({
      ok: true,
      service: 'webtoon-mutalaah',
      db: 'connected',
      time: result.rows[0].now
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      service: 'webtoon-mutalaah',
      db: 'error',
      error: err.message
    });
  }
});

module.exports = router;
