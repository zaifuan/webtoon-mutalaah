'use strict';

// ===========================================================================
// src/ai/adapters/ollamaAdapter.js — Fasa 11: adapter Ollama TEMPATAN (pilihan)
//
// Hanya bercakap dengan Ollama local melalui native fetch (TIADA SDK). Sistem
// mesti kekal berfungsi walaupun Ollama tiada — semua kegagalan DIKAWAL
// (return { success:false, ... }), TIDAK pernah crash server. Adapter HANYA
// menghasilkan result_json; Production Engine yang menentukan status job.
//
// Fokus Fasa 11: generateScript, generatePrompt, review. Lain → fallback
// selamat. generateImage → tidak dilaksanakan (return success:false).
// ===========================================================================

const config = require('../config');
const builder = require('../../prompts/builder');

const PROVIDER = 'ollama';

function baseUrl() { return String(config.OLLAMA_BASE_URL || '').replace(/\/+$/, ''); }

function result(success, extra) {
  return Object.assign({ success: success, provider: PROVIDER, tokens: 0, cost: 0 }, extra || {});
}

// fetch dengan timeout (AbortController). Tidak melempar untuk ralat rangkaian
// — pemanggil mengendalikan { ok:false }.
async function ollamaFetch(pathname, options, timeoutMs) {
  const controller = new AbortController();
  const ms = timeoutMs || config.OLLAMA_TIMEOUT_MS;
  const timer = setTimeout(function () { controller.abort(); }, ms);
  const t0 = Date.now();
  try {
    const res = await fetch(baseUrl() + pathname, Object.assign({ signal: controller.signal }, options || {}));
    return { ok: true, res: res, latency: Date.now() - t0 };
  } catch (e) {
    const latency = Date.now() - t0;
    if (e && e.name === 'AbortError') return { ok: false, latency: latency, timeout: true, error: 'Ollama request timeout (' + ms + 'ms)' };
    return { ok: false, latency: latency, error: 'Ollama not reachable: ' + (e && e.message ? e.message : String(e)) };
  } finally {
    clearTimeout(timer);
  }
}

// Panggil /api/chat dengan senarai mesej (dibina oleh Prompt Builder).
// Pulang { ok, latency, content } atau { ok:false, error }.
async function chat(messages) {
  const body = {
    model: config.OLLAMA_MODEL,
    messages: messages,
    stream: false,
    options: { temperature: config.OLLAMA_TEMPERATURE }
  };
  const r = await ollamaFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) return { ok: false, latency: r.latency, error: r.error, timeout: !!r.timeout };
  if (!r.res.ok) {
    let text = '';
    try { text = await r.res.text(); } catch (e) { /* abai */ }
    return { ok: false, latency: r.latency, error: 'Ollama HTTP ' + r.res.status + (text ? ': ' + text.slice(0, 200) : '') };
  }
  let data = null;
  try { data = await r.res.json(); } catch (e) { return { ok: false, latency: r.latency, error: 'Respons Ollama bukan JSON' }; }
  const content = (data && data.message && data.message.content) || '';
  return { ok: true, latency: r.latency, content: content, raw: data };
}

// Cuba ekstrak objek JSON daripada teks model.
function tryParseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { /* cuba ekstrak */ }
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) { return null; } }
  return null;
}

function payloadHasContext(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return !!(payload.panel || payload.scene || payload.script || payload.visual ||
    payload.context || payload.text_ms || payload.text_ar || payload.summary_ms ||
    payload.panel_type || payload.dialogue_ar);
}

function contextString(payload) {
  try { return JSON.stringify(payload || {}).slice(0, 1500); } catch (e) { return '{}'; }
}

// ---- HEALTH ----------------------------------------------------------------
async function health() {
  const r = await ollamaFetch('/api/tags', { method: 'GET' }, Math.min(config.OLLAMA_TIMEOUT_MS, 5000));
  const base = { provider: PROVIDER, base_url: config.OLLAMA_BASE_URL, model: config.OLLAMA_MODEL };
  if (!r.ok) {
    return Object.assign({ ok: false, available: false, latency_ms: r.latency, error: r.timeout ? 'Ollama request timeout' : 'Ollama not reachable' }, base);
  }
  if (!r.res.ok) {
    return Object.assign({ ok: false, available: false, latency_ms: r.latency, error: 'Ollama HTTP ' + r.res.status }, base);
  }
  let models = [];
  try { const d = await r.res.json(); models = (d && d.models ? d.models : []).map(function (m) { return m.name; }); } catch (e) { /* abai */ }
  return Object.assign({ ok: true, available: true, latency_ms: r.latency, models: models }, base);
}

// ---- FUNGSI FOKUS ----------------------------------------------------------
async function generateScript(payload) {
  if (!payloadHasContext(payload)) {
    return result(true, { latency_ms: 0, note: 'payload tidak lengkap — respons fallback tempatan', text_ms: '', text_ar: '', emotion: 'calm', incomplete_payload: true });
  }
  let built;
  try { built = await builder.buildGenerateScriptPrompt(payload); }
  catch (e) { return result(false, { latency_ms: 0, error: 'Prompt builder gagal: ' + (e && e.message ? e.message : String(e)) }); }
  const r = await chat(built.messages);
  if (!r.ok) return result(false, { latency_ms: r.latency, error: r.error, timeout: !!r.timeout, prompt_version: built.version });
  const j = tryParseJson(r.content);
  if (j) {
    return result(true, { latency_ms: r.latency, prompt_version: built.version, text_ms: j.text_ms || '', text_ar: j.text_ar || '', emotion: j.emotion || 'calm', notes: j.notes || '' });
  }
  return result(true, { latency_ms: r.latency, prompt_version: built.version, raw_text: r.content, note: 'model tidak menghasilkan JSON sah' });
}

async function generatePrompt(payload) {
  if (!payloadHasContext(payload)) {
    return result(true, { latency_ms: 0, note: 'payload tidak lengkap — respons fallback tempatan', prompt_text: '', negative_prompt: '', incomplete_payload: true });
  }
  let built;
  try { built = await builder.buildGeneratePromptPrompt(payload); }
  catch (e) { return result(false, { latency_ms: 0, error: 'Prompt builder gagal: ' + (e && e.message ? e.message : String(e)) }); }
  const r = await chat(built.messages);
  if (!r.ok) return result(false, { latency_ms: r.latency, error: r.error, timeout: !!r.timeout, prompt_version: built.version });
  const j = tryParseJson(r.content);
  if (j) {
    return result(true, { latency_ms: r.latency, prompt_version: built.version, prompt_text: j.prompt_text || '', negative_prompt: j.negative_prompt || '', notes: j.notes || '' });
  }
  return result(true, { latency_ms: r.latency, prompt_version: built.version, raw_text: r.content, note: 'model tidak menghasilkan JSON sah' });
}

// PROMPT_REWRITE: ambil prompt asal + DNA watak + visual + scene + panel,
// minta Ollama hasilkan prompt SDXL Turbo yang lebih kaya. Struktur output sama
// dgn generatePrompt (prompt_text + negative_prompt). Dipanggil oleh Production
// Engine melalui runJobOn('ollama', 'PROMPT_REWRITE', payload) sebelum imej
// dihantar ke imageAdapter (ComfyUI).
async function rewritePrompt(payload) {
  // rewrite memerlukan sekurangnya prompt asal + sedikit konteks panel.
  const hasPrompt = !!(payload && typeof payload === 'object' &&
    (payload.prompt || (payload.prompt_text && typeof payload.prompt_text === 'string')));
  if (!hasPrompt || !payloadHasContext(payload)) {
    return result(true, { latency_ms: 0, note: 'payload tidak lengkap — respons fallback tempatan', prompt_text: payload && (payload.prompt || payload.prompt_text) || '', negative_prompt: payload && payload.negative_prompt || '', incomplete_payload: true });
  }
  let built;
  try { built = await builder.buildRewritePrompt(payload); }
  catch (e) { return result(false, { latency_ms: 0, error: 'Prompt builder gagal: ' + (e && e.message ? e.message : String(e)) }); }
  const r = await chat(built.messages);
  if (!r.ok) return result(false, { latency_ms: r.latency, error: r.error, timeout: !!r.timeout, prompt_version: built.version });
  const j = tryParseJson(r.content);
  if (j) {
    return result(true, { latency_ms: r.latency, prompt_version: built.version, prompt_text: j.prompt_text || '', negative_prompt: j.negative_prompt || '', notes: j.notes || '' });
  }
  return result(true, { latency_ms: r.latency, prompt_version: built.version, raw_text: r.content, note: 'model tidak menghasilkan JSON sah' });
}

async function review(payload) {
  if (!payloadHasContext(payload)) {
    return result(true, { latency_ms: 0, note: 'payload tidak lengkap — respons fallback tempatan', qa_status: 'ok', issues: [] });
  }
  let built;
  try { built = await builder.buildReviewPrompt(payload); }
  catch (e) { return result(false, { latency_ms: 0, error: 'Prompt builder gagal: ' + (e && e.message ? e.message : String(e)) }); }
  const r = await chat(built.messages);
  if (!r.ok) return result(false, { latency_ms: r.latency, error: r.error, timeout: !!r.timeout, prompt_version: built.version });
  const j = tryParseJson(r.content);
  if (j) {
    return result(true, { latency_ms: r.latency, prompt_version: built.version, qa_status: j.qa_status || 'ok', issues: Array.isArray(j.issues) ? j.issues : [], notes: j.notes || '' });
  }
  return result(true, { latency_ms: r.latency, prompt_version: built.version, raw_text: r.content, qa_status: 'warning', issues: ['model tidak menghasilkan JSON sah'] });
}

// ---- FALLBACK SELAMAT (fungsi lain) ----------------------------------------
function fallback(kind) {
  return async function (payload) {
    return result(true, { latency_ms: 0, note: kind + ' belum disokong penuh oleh Ollama adapter (fallback tempatan).' });
  };
}

async function generateImage(payload) {
  return result(false, { latency_ms: 0, message: 'Image generation is not implemented in Ollama adapter.' });
}

module.exports = {
  name: PROVIDER,
  info: {
    name: PROVIDER,
    model: config.OLLAMA_MODEL,
    base_url: config.OLLAMA_BASE_URL,
    latency_ms: null,
    description: 'Adapter Ollama tempatan (pilihan). Default sistem kekal dummy.'
  },
  health: health,
  generateText: fallback('generateText'),
  generateCharacter: fallback('generateCharacter'),
  generateScene: fallback('generateScene'),
  generatePanel: fallback('generatePanel'),
  generateScript: generateScript,
  generateVisual: fallback('generateVisual'),
  generatePrompt: generatePrompt,
  rewritePrompt: rewritePrompt,
  generateImage: generateImage,
  review: review,
  export: fallback('export')
};
