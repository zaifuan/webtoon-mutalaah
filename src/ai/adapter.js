'use strict';

// ===========================================================================
// src/ai/adapter.js — Fasa 10: ANTARAMUKA UTAMA AI Worker
//
// Inilah satu-satunya titik yang dipanggil oleh Production Worker. Ia memilih
// adapter semasa daripada registry dan memetakan job_type → kaedah adapter.
// Production Engine TIDAK tahu model AI apa digunakan.
//
//   Create Job → Worker → AI Adapter → Result
// ===========================================================================

const registry = require('./adapterRegistry');
const dummyAdapter = require('./adapters/dummyAdapter');
const ollamaAdapter = require('./adapters/ollamaAdapter');
const config = require('./config');

// ---- Bootstrap: daftar adapter terbina + tetapkan default dari config ------
registry.register('dummy', dummyAdapter);
registry.register('ollama', ollamaAdapter);
// (Fasa 12+: registry.register('lmstudio', lmStudioAdapter); — tanpa ubah engine)
// Default kekal 'dummy' melainkan env AI_PROVIDER menetapkan sebaliknya.
if (registry.has(config.AI_PROVIDER)) registry.setDefault(config.AI_PROVIDER);

// ---- Pemetaan job_type → kaedah adapter ------------------------------------
const JOB_METHOD = {
  TEXT_PARSE: 'generateText',
  CHARACTER_GENERATION: 'generateCharacter',
  SCENE_GENERATION: 'generateScene',
  PANEL_GENERATION: 'generatePanel',
  SCRIPT_GENERATION: 'generateScript',
  VISUAL_GENERATION: 'generateVisual',
  PROMPT_GENERATION: 'generatePrompt',
  IMAGE_GENERATION: 'generateImage',
  REVIEW: 'review',
  EXPORT: 'export'
};

function currentAdapter() { return registry.getDefaultAdapter(); }

// Jalankan satu job melalui adapter semasa (generik — worker guna ini).
async function runJob(jobType, payload) {
  const adapter = currentAdapter();
  const providerName = registry.getDefault();
  if (!adapter) {
    return { success: false, provider: providerName, error: 'Tiada adapter AI berdaftar', latency_ms: 0, tokens: 0, cost: 0 };
  }
  const method = JOB_METHOD[jobType];
  if (!method || typeof adapter[method] !== 'function') {
    return { success: true, provider: adapter.name || providerName, latency_ms: 0, tokens: 0, cost: 0, note: 'job_type tiada pemetaan: ' + jobType };
  }
  const result = await adapter[method](payload || {});
  return Object.assign({ job_type: jobType, method: method }, result);
}

// Facade per-jenis (delegasi ke adapter semasa).
function delegate(method) {
  return async function (payload) {
    const a = currentAdapter();
    if (!a || typeof a[method] !== 'function') throw new Error('Adapter semasa tiada kaedah ' + method);
    return a[method](payload || {});
  };
}

module.exports = {
  registry,
  JOB_METHOD,
  runJob,
  currentAdapter,
  generateText: delegate('generateText'),
  generateCharacter: delegate('generateCharacter'),
  generateScene: delegate('generateScene'),
  generatePanel: delegate('generatePanel'),
  generateScript: delegate('generateScript'),
  generateVisual: delegate('generateVisual'),
  generatePrompt: delegate('generatePrompt'),
  generateImage: delegate('generateImage'),
  review: delegate('review'),
  export: delegate('export')
};
