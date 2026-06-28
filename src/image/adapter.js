'use strict';

// ===========================================================================
// src/image/adapter.js — Fasa 12: ANTARAMUKA UTAMA Image Generator
//
// Dipanggil oleh Production Worker HANYA untuk job_type IMAGE_GENERATION.
// Memilih adapter imej semasa daripada registry dan memetakan job_type →
// kaedah adapter. Production Engine TIDAK tahu image engine apa digunakan.
//
//   Production Engine → AI Adapter → Image Generator Adapter → DummyImageAdapter
// ===========================================================================

const registry = require('./adapterRegistry');
const dummyImageAdapter = require('./adapters/dummyImageAdapter');
const config = require('./config');

// ---- Bootstrap: daftar adapter terbina + tetapkan default dari config ------
registry.register('dummy-image', dummyImageAdapter);
// (Fasa 13+: registry.register('comfyui', comfyUIAdapter); — tanpa ubah engine)
if (registry.has(config.IMAGE_PROVIDER)) registry.setDefault(config.IMAGE_PROVIDER);

// ---- Pemetaan job_type → kaedah adapter (IMAGE_GENERATION sahaja dahulu) ----
const JOB_METHOD = {
  IMAGE_GENERATION: 'generateImage'
};

function currentAdapter() { return registry.getDefaultAdapter(); }

// Jalankan satu job imej melalui adapter semasa (generik).
async function runJob(jobType, payload) {
  const adapter = currentAdapter();
  const providerName = registry.getDefault();
  if (!adapter) {
    return { success: false, provider: providerName, error: 'Tiada adapter imej berdaftar', latency_ms: 0, cost: 0, image: null };
  }
  const method = JOB_METHOD[jobType] || 'generateImage';
  if (typeof adapter[method] !== 'function') {
    return { success: false, provider: adapter.name || providerName, error: 'Kaedah tidak wujud: ' + method, latency_ms: 0, cost: 0, image: null };
  }
  const result = await adapter[method](payload || {});
  return Object.assign({ job_type: jobType, method: method }, result);
}

// Facade per-jenis (delegasi ke adapter semasa).
function delegate(method) {
  return async function (payload) {
    const a = currentAdapter();
    if (!a || typeof a[method] !== 'function') throw new Error('Adapter imej semasa tiada kaedah ' + method);
    return a[method](payload || {});
  };
}

module.exports = {
  registry,
  JOB_METHOD,
  runJob,
  currentAdapter,
  generateImage: delegate('generateImage'),
  upscaleImage: delegate('upscaleImage'),
  variation: delegate('variation'),
  inpaint: delegate('inpaint'),
  outpaint: delegate('outpaint'),
  img2img: delegate('img2img')
};
