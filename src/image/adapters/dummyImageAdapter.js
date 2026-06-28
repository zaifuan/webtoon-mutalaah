'use strict';

// ===========================================================================
// src/image/adapters/dummyImageAdapter.js — Fasa 12: adapter imej SIMULASI
//
// Semua fungsi: await sleep(1000) → return respons dummy seragam. TIADA imej
// sebenar, TIADA png/jpg, TIADA ComfyUI/Stable Diffusion/Forge/Flux/Midjourney.
// Fasa 13 hanya perlu menambah adapter sebenar (cth. comfyUIAdapter.js) dengan
// antaramuka SAMA — tanpa mengubah Production Engine.
// ===========================================================================

const LATENCY_MS = 1000;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function dummyResult(extra) {
  return Object.assign({
    success: true,
    provider: 'dummy-image',
    latency_ms: LATENCY_MS,
    cost: 0,
    image: null,
    metadata: { simulated: true }
  }, extra || {});
}

async function run(kind, payload) {
  await sleep(LATENCY_MS);
  const r = dummyResult();
  r.metadata = Object.assign({ simulated: true, kind: kind }, r.metadata);
  return r;
}

module.exports = {
  name: 'dummy-image',
  info: {
    name: 'dummy-image',
    model: 'dummy-image-model',
    description: 'Adapter imej simulasi tempatan (tiada imej sebenar, kos 0).',
    latency_ms: LATENCY_MS
  },
  async health() {
    return { ok: true, provider: 'dummy-image', available: true, latency_ms: 0, model: 'dummy-image-model', base_url: null };
  },
  async generateImage(payload) { return run('generateImage', payload); },
  async upscaleImage(payload) { return run('upscaleImage', payload); },
  async variation(payload) { return run('variation', payload); },
  async inpaint(payload) { return run('inpaint', payload); },
  async outpaint(payload) { return run('outpaint', payload); },
  async img2img(payload) { return run('img2img', payload); }
};
