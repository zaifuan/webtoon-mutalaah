'use strict';

// ===========================================================================
// src/routes/pipeline.js — Fasa 14: Auto Production Pipeline API
//
//   POST /api/projects/:id/production/start    bina queue automatik
//   GET  /api/projects/:id/production/status   status + ringkasan + ETA + live
//   POST /api/projects/:id/production/cancel    batal job aktif pipeline
// ===========================================================================

const express = require('express');
const router = express.Router();
const pipelineEngine = require('../services/pipelineEngine');

router.post('/projects/:id/production/start', async (req, res) => {
  try {
    const out = await pipelineEngine.buildProjectPipeline(req.params.id);
    return res.status(out.ok ? 200 : 400).json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : 'Gagal memulakan pipeline' });
  }
});

router.get('/projects/:id/production/status', async (req, res) => {
  try {
    const out = await pipelineEngine.getPipelineStatus(req.params.id);
    return res.status(out.ok ? 200 : 404).json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : 'Gagal mendapatkan status' });
  }
});

router.post('/projects/:id/production/cancel', async (req, res) => {
  try {
    const out = await pipelineEngine.cancelProjectPipeline(req.params.id);
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : 'Gagal membatalkan pipeline' });
  }
});

module.exports = router;
