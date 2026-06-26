'use strict';

// ===========================================================================
// src/routes/promptContext.js — Fasa 11B: preview Prompt Context (debugging)
//
//   POST /api/prompts/context   { task, payload }  → { system, user, messages }
//   GET  /api/prompts/context?task=generate_script → contoh dengan payload kosong
//   GET  /api/prompts/templates → senarai template + version
//
// Read-only. Tidak menyentuh DB.
// ===========================================================================

const express = require('express');
const router = express.Router();
const builder = require('../prompts/builder');

router.get('/prompts/templates', (req, res) => {
  res.json({ ok: true, version: builder.VERSION, templates: builder.TEMPLATES });
});

router.post('/prompts/context', async (req, res) => {
  const body = req.body || {};
  const task = body.task || 'generate_script';
  const payload = body.payload || body.context || (body.task ? {} : body);
  try {
    const built = await builder.buildByTask(task, payload);
    res.json(Object.assign({ ok: true }, built));
  } catch (err) {
    res.status(400).json({ ok: false, error: err && err.message ? err.message : 'Gagal membina prompt' });
  }
});

router.get('/prompts/context', async (req, res) => {
  const task = (req.query && req.query.task) || 'generate_script';
  try {
    const built = await builder.buildByTask(task, {});
    res.json(Object.assign({ ok: true }, built));
  } catch (err) {
    res.status(400).json({ ok: false, error: err && err.message ? err.message : 'Gagal membina prompt' });
  }
});

module.exports = router;
