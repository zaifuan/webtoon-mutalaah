'use strict';

// ===========================================================================
// src/routes/ai.js — Fasa 10: AI provider API
//
//   GET  /api/ai/providers   senarai adapter berdaftar
//   GET  /api/ai/default     provider semasa
//   POST /api/ai/default     tukar provider (masih hanya 'dummy')
// ===========================================================================

const express = require('express');
const router = express.Router();
const adapter = require('../ai/adapter');
const registry = adapter.registry;

router.get('/ai/providers', (req, res) => {
  res.json({ ok: true, default: registry.getDefault(), providers: registry.list() });
});

// GET /api/ai/providers/:provider/health — semak kesihatan adapter (generik).
// Tidak crash walaupun provider offline; pulang { ok:false, ... }.
router.get('/ai/providers/:provider/health', async (req, res) => {
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

router.get('/ai/default', (req, res) => {
  const name = registry.getDefault();
  const a = registry.get(name);
  res.json({ ok: true, default: name, info: a ? a.info : null });
});

router.post('/ai/default', (req, res) => {
  const provider = req.body && req.body.provider;
  if (!provider) return res.status(400).json({ ok: false, error: 'provider diperlukan' });
  if (!registry.has(provider)) return res.status(400).json({ ok: false, error: 'Provider tidak wujud: ' + provider });
  registry.setDefault(provider);
  const a = registry.get(provider);
  res.json({ ok: true, default: registry.getDefault(), info: a ? a.info : null });
});

module.exports = router;
