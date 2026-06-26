'use strict';

// ===========================================================================
// src/ai/config.js — Fasa 10/11: konfigurasi AI Worker
//
// AI_PROVIDER menetapkan adapter lalai. LALAI 'dummy' (simulasi). Ollama hanya
// provider PILIHAN. Semua nilai dari env (tiada hardcode). TIADA API berbayar.
// ===========================================================================

function intEnv(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : fallback;
}
function floatEnv(name, fallback) {
  const v = parseFloat(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

module.exports = {
  AI_PROVIDER: process.env.AI_PROVIDER || 'dummy',

  // ---- Ollama (local-first, pilihan) ----
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
  OLLAMA_TIMEOUT_MS: intEnv('OLLAMA_TIMEOUT_MS', 60000),
  OLLAMA_TEMPERATURE: floatEnv('OLLAMA_TEMPERATURE', 0.4)
};
