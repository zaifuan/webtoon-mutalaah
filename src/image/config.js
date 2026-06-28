'use strict';

// ===========================================================================
// src/image/config.js — Fasa 12: konfigurasi Image Generator (abstraction)
//
// IMAGE_PROVIDER menetapkan adapter imej lalai. LALAI 'dummy-image' (simulasi).
// Semua nilai dari env (tiada hardcode). NOTA: pada Fasa 12 ini SEMUA hanya
// config — belum digunakan untuk penjanaan imej sebenar. Tiada SDK, tiada
// ComfyUI/Stable Diffusion/Forge/Flux. 100% local-first.
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
  IMAGE_PROVIDER: process.env.IMAGE_PROVIDER || 'dummy-image',

  // ---- Parameter penjanaan (config sahaja, belum digunakan) ----
  IMAGE_TIMEOUT_MS: intEnv('IMAGE_TIMEOUT_MS', 120000),
  IMAGE_OUTPUT_PATH: process.env.IMAGE_OUTPUT_PATH || 'uploads/images',
  IMAGE_FORMAT: process.env.IMAGE_FORMAT || 'png',
  IMAGE_WIDTH: intEnv('IMAGE_WIDTH', 1024),
  IMAGE_HEIGHT: intEnv('IMAGE_HEIGHT', 1024),
  IMAGE_STEPS: intEnv('IMAGE_STEPS', 30),
  IMAGE_CFG: floatEnv('IMAGE_CFG', 7.0),
  IMAGE_SAMPLER: process.env.IMAGE_SAMPLER || 'euler_a'
};
