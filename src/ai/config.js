'use strict';

// ===========================================================================
// src/ai/config.js — Fasa 10: konfigurasi AI Worker
//
// AI_PROVIDER menetapkan adapter lalai. Lalai 'dummy' (simulasi). Boleh ditukar
// melalui env AI_PROVIDER. TIADA API luar / berbayar.
// ===========================================================================

module.exports = {
  AI_PROVIDER: process.env.AI_PROVIDER || 'dummy'
};
