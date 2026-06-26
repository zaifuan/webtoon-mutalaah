'use strict';

// ===========================================================================
// src/ai/adapters/dummyAdapter.js — Fasa 10: adapter SIMULASI
//
// Semua fungsi: await sleep(1000) → return respons dummy seragam. TIADA AI,
// TIADA Ollama / Stable Diffusion / OpenAI / Claude / Gemini. Fasa 11 hanya
// perlu menambah adapter baharu (cth. ollamaAdapter.js) dengan antaramuka SAMA.
// ===========================================================================

const LATENCY_MS = 1000;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function dummyResult(extra) {
  return Object.assign({
    success: true,
    provider: 'dummy',
    latency_ms: LATENCY_MS,
    tokens: 0,
    cost: 0
  }, extra || {});
}

async function run(kind, payload) {
  await sleep(LATENCY_MS);
  return dummyResult({ kind: kind });
}

module.exports = {
  name: 'dummy',
  info: {
    name: 'dummy',
    model: 'dummy-model',
    description: 'Adapter simulasi tempatan (tiada AI sebenar, kos 0).',
    latency_ms: LATENCY_MS
  },
  async generateText(payload) { return run('generateText', payload); },
  async generateCharacter(payload) { return run('generateCharacter', payload); },
  async generateScene(payload) { return run('generateScene', payload); },
  async generatePanel(payload) { return run('generatePanel', payload); },
  async generateScript(payload) { return run('generateScript', payload); },
  async generateVisual(payload) { return run('generateVisual', payload); },
  async generatePrompt(payload) { return run('generatePrompt', payload); },
  async generateImage(payload) { return run('generateImage', payload); },
  async review(payload) { return run('review', payload); },
  async export(payload) { return run('export', payload); }
};
