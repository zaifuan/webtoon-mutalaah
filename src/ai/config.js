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
  OLLAMA_TEMPERATURE: floatEnv('OLLAMA_TEMPERATURE', 0.4),

  // ---- Claude (Anthropic Messages API) — provider penaakulan AI (Fasa 19) ----
  // Hanya digunakan apabila AI_PROVIDER=claude. Tiada kunci dihardcode.
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || '',
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
  CLAUDE_BASE_URL: process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com',
  CLAUDE_API_VERSION: process.env.CLAUDE_API_VERSION || '2023-06-01',
  CLAUDE_TIMEOUT_MS: intEnv('CLAUDE_TIMEOUT_MS', 60000),
  CLAUDE_MAX_TOKENS: intEnv('CLAUDE_MAX_TOKENS', 2048),
  CLAUDE_TEMPERATURE: floatEnv('CLAUDE_TEMPERATURE', 0.4)
};
