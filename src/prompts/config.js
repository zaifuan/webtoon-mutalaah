'use strict';

// ===========================================================================
// src/prompts/config.js — Fasa 11B: konfigurasi Prompt Context Builder
//
// PROMPT_VERSION memilih set template. Lalai 'v1'. Mudah ditukar ke v2/v3 pada
// masa depan (letak template dalam templates/v2/...). Semua dari env.
// ===========================================================================

const path = require('path');

module.exports = {
  PROMPT_VERSION: process.env.PROMPT_VERSION || 'v1',
  TEMPLATE_DIR: path.resolve(__dirname, 'templates'),
  // Log ringkas pembinaan prompt hanya jika diaktifkan (jangan log prompt penuh).
  PROMPT_DEBUG: process.env.PROMPT_DEBUG === '1'
};
