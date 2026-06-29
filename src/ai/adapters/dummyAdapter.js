'use strict';

// ===========================================================================
// src/ai/adapters/dummyAdapter.js — Fasa 10: adapter SIMULASI
//
// Semua fungsi: await sleep(1000) → return respons dummy seragam. TIADA AI,
// TIADA Ollama / Stable Diffusion / OpenAI / Claude / Gemini. Fasa 11 hanya
// perlu menambah adapter baharu (cth. ollamaAdapter.js) dengan antaramuka SAMA.
// ===========================================================================

const LATENCY_MS = 1000;

const builder = require('../../prompts/builder');

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

// Fasa 11B: dummy juga MESTI guna Prompt Builder (bina mesej via builder,
// kemudian pulang respons simulasi). Tiada prompt dibina dalam adapter.
async function runWithBuilder(kind, taskTemplate, payload) {
  let built = null;
  try { built = await builder.buildByTask(taskTemplate, payload); } catch (e) { built = null; }
  await sleep(LATENCY_MS);
  return dummyResult({ kind: kind, prompt_version: built ? built.version : null, prompt_template: built ? built.template : null });
}

// PROMPT_REWRITE (simulasi): passthrough — pulang balik prompt asal tanpa ubah.
// Adapter dummy tidak menjana semula teks; ia hanya mengekalkan behavior lama
// supaya sistem berfungsi apabila AI_PROVIDER=dummy. Adapter sebenar (ollama)
// yang melakukan rewrite.
async function rewritePrompt(payload) {
  const p = (payload && typeof payload === 'object') ? payload : {};
  await sleep(LATENCY_MS);
  return dummyResult({
    kind: 'rewritePrompt',
    prompt_text: p.prompt || p.prompt_text || '',
    negative_prompt: p.negative_prompt || '',
    note: 'rewrite simulasi (passthrough) — guna adapter sebenar untuk hasilkan prompt baru'
  });
}

module.exports = {
  name: 'dummy',
  info: {
    name: 'dummy',
    model: 'dummy-model',
    description: 'Adapter simulasi tempatan (tiada AI sebenar, kos 0).',
    latency_ms: LATENCY_MS
  },
  async health() {
    return { ok: true, provider: 'dummy', available: true, latency_ms: 0, model: 'dummy-model', base_url: null };
  },
  async generateText(payload) { return run('generateText', payload); },
  async generateCharacter(payload) { return run('generateCharacter', payload); },
  async generateScene(payload) { return run('generateScene', payload); },
  async generatePanel(payload) { return run('generatePanel', payload); },
  async generateScript(payload) { return runWithBuilder('generateScript', 'generate_script', payload); },
  async generateVisual(payload) { return run('generateVisual', payload); },
  async generatePrompt(payload) { return runWithBuilder('generatePrompt', 'generate_prompt', payload); },
  async rewritePrompt(payload) { return rewritePrompt(payload); },
  async generateImage(payload) { return run('generateImage', payload); },
  async review(payload) { return runWithBuilder('review', 'review', payload); },
  async export(payload) { return run('export', payload); }
};
