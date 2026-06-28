'use strict';

// ===========================================================================
// src/routes/image.js — Fasa 12: Image provider API
//
//   GET  /api/image/providers                 senarai adapter imej
//   GET  /api/image/default                   provider imej semasa
//   POST /api/image/default                   tukar provider (dummy-image sahaja)
//   GET  /api/image/providers/:provider/health  semak kesihatan (generik)
// ===========================================================================

const express = require('express');
const router = express.Router();
const imageAdapter = require('../image/adapter');
const registry = imageAdapter.registry;

router.get('/image/providers', (req, res) => {
  res.json({ ok: true, default: registry.getDefault(), providers: registry.list() });
});

router.get('/image/default', (req, res) => {
  const name = registry.getDefault();
  const a = registry.get(name);
  res.json({ ok: true, default: name, info: a ? a.info : null });
});

router.post('/image/default', (req, res) => {
  const provider = req.body && req.body.provider;
  if (!provider) return res.status(400).json({ ok: false, error: 'provider diperlukan' });
  if (!registry.has(provider)) return res.status(400).json({ ok: false, error: 'Provider tidak wujud: ' + provider });
  registry.setDefault(provider);
  const a = registry.get(provider);
  res.json({ ok: true, default: registry.getDefault(), info: a ? a.info : null });
});

router.get('/image/providers/:provider/health', async (req, res) => {
  const name = req.params.provider;
  const a = registry.get(name);
  if (!a) return res.status(404).json({ ok: false, error: 'Provider tidak wujud: ' + name });
  if (typeof a.health === 'function') {
    try {
      const h = await a.health();
      return res.json(h);
    } catch (e) {
      return res.json({ ok: false, provider: name, available: false, error: e && e.message ? e.message : 'health gagal' });
    }
  }
  return res.json({ ok: true, provider: name, available: true, note: 'tiada health check' });
});

// Fasa 13: Generate Test Image — guna provider imej SEMASA, prompt dummy.
// Hanya untuk ujian; TIDAK masuk mana-mana Project / tiada baris DB.
router.post('/image/test-generate', async (req, res) => {
  const body = req.body || {};
  const prompt = body.prompt || 'A red apple on wooden table';
  const payload = {
    prompt: prompt,
    negative_prompt: body.negative_prompt || '',
    subfolder: '_test'
  };
  if (body.workflow) payload.workflow = body.workflow;
  try {
    const out = await imageAdapter.generateImage(payload);
    return res.json(out);
  } catch (e) {
    return res.json({ success: false, provider: registry.getDefault(), error: e && e.message ? e.message : 'Generate gagal' });
  }
});

module.exports = router;
