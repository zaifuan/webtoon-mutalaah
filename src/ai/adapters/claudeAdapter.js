'use strict';

// ===========================================================================
// src/ai/adapters/claudeAdapter.js — Fasa 19: adapter Claude (RANGKA)
//
// Provider penaakulan AI sebenar (Claude / Anthropic Messages API). REST sahaja
// melalui native fetch (TIADA SDK), selaras corak ollamaAdapter. Semua kegagalan
// DIKAWAL (return { success:false, ... }) — server TIDAK pernah crash, laluan
// imej/ComfyUI dan provider lain TIDAK terjejas. Adapter HANYA menghasilkan
// result_json; Production Engine yang menentukan status job.
//
// FASA 19 (rangka sahaja):
//   - daftar provider 'claude' dalam registry (lihat ai/adapter.js)
//   - config dari env (tiada hardcode kunci)
//   - health() guna GET /v1/models (kos token 0)
//   - helper chat() ke /v1/messages
//   - kaedah fokus (generateScript/generatePrompt/rewritePrompt/review) guna
//     Prompt Builder SEDIA ADA — supaya boleh ditukar ganti dengan ollama tanpa
//     mengubah engine. Templat akan ditukar ke Arab pada FASA 20; penyambungan
//     ke enjin (Laluan A) pada FASA 21+.
//   - kaedah lain (character/scene/panel/visual/text/export) → fallback selamat.
//   - generateImage → success:false (penjanaan imej KEKAL di ComfyUI).
//
// Default sistem KEKAL mengikut AI_PROVIDER (lalai 'dummy') — Fasa 19 TIDAK
// mengubah tingkah laku sedia ada melainkan AI_PROVIDER=claude ditetapkan.
//
// Anthropic Messages API:
//   POST {CLAUDE_BASE_URL}/v1/messages
//   headers: x-api-key, anthropic-version, content-type: application/json
//   body:    { model, max_tokens, system, messages:[{role,content}], temperature }
//   resp:    { content:[{ type:'text', text:'...' }, ...], ... }
// NOTA: 'system' ialah parameter peringkat-atas Claude (bukan mesej role:system).
// ===========================================================================

const config = require('../config');
const builder = require('../../prompts/builder');

const PROVIDER = 'claude';

function baseUrl() { return String(config.CLAUDE_BASE_URL || '').replace(/\/+$/, ''); }
function apiKey() { return String(config.CLAUDE_API_KEY || '').trim(); }

function result(success, extra) {
  return Object.assign({ success: success, provider: PROVIDER, tokens: 0, cost: 0 }, extra || {});
}

// fetch dengan timeout (AbortController). Tidak melempar untuk ralat rangkaian
// — pemanggil mengendalikan { ok:false }.
async function claudeFetch(pathname, options, timeoutMs) {
  const controller = new AbortController();
  const ms = timeoutMs || config.CLAUDE_TIMEOUT_MS;
  const timer = setTimeout(function () { controller.abort(); }, ms);
  const t0 = Date.now();
  try {
    const res = await fetch(baseUrl() + pathname, Object.assign({ signal: controller.signal }, options || {}));
    return { ok: true, res: res, latency: Date.now() - t0 };
  } catch (e) {
    const latency = Date.now() - t0;
    if (e && e.name === 'AbortError') return { ok: false, latency: latency, timeout: true, error: 'Claude request timeout (' + ms + 'ms)' };
    return { ok: false, latency: latency, error: 'Claude not reachable: ' + (e && e.message ? e.message : String(e)) };
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(extra) {
  return Object.assign({
    'x-api-key': apiKey(),
    'anthropic-version': config.CLAUDE_API_VERSION,
    'content-type': 'application/json'
  }, extra || {});
}

// Pisahkan mesej 'system' (Prompt Builder menghasilkan dalam array messages)
// kepada parameter `system` peringkat-atas Claude; baki (user/assistant) kekal
// dalam `messages`. Builder kita sentiasa hasilkan [system, user].
function splitSystem(messages) {
  let system = '';
  const msgs = [];
  (messages || []).forEach(function (m) {
    if (!m) return;
    if (m.role === 'system') system += (system ? '\n\n' : '') + String(m.content || '');
    else msgs.push({ role: m.role, content: String(m.content || '') });
  });
  return { system: system, messages: msgs };
}

// Panggil /v1/messages dengan senarai mesej (dibina oleh Prompt Builder).
// Pulang { ok, latency, content } atau { ok:false, error }.
async function chat(messages, opts) {
  if (!apiKey()) return { ok: false, latency: 0, error: 'CLAUDE_API_KEY tidak ditetapkan' };
  const sp = splitSystem(messages);
  const body = {
    model: (opts && opts.model) || config.CLAUDE_MODEL,
    max_tokens: (opts && opts.max_tokens) || config.CLAUDE_MAX_TOKENS,
    temperature: (opts && typeof opts.temperature === 'number') ? opts.temperature : config.CLAUDE_TEMPERATURE,
    messages: sp.messages
  };
  if (sp.system) body.system = sp.system;

  const r = await claudeFetch('/v1/messages', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body)
  });
  if (!r.ok) return { ok: false, latency: r.latency, error: r.error, timeout: !!r.timeout };
  if (!r.res.ok) {
    let text = '';
    try { text = await r.res.text(); } catch (e) { /* abai */ }
    return { ok: false, latency: r.latency, error: 'Claude HTTP ' + r.res.status + (text ? ': ' + text.slice(0, 200) : '') };
  }
  let data = null;
  try { data = await r.res.json(); } catch (e) { return { ok: false, latency: r.latency, error: 'Respons Claude bukan JSON' }; }
  // Gabungkan semua blok teks daripada content[].
  const content = Array.isArray(data && data.content)
    ? data.content.map(function (b) { return (b && b.type === 'text' && b.text) ? b.text : ''; }).filter(Boolean).join('\n')
    : '';
  return { ok: true, latency: r.latency, content: content, raw: data };
}

// Cuba ekstrak objek JSON daripada teks model (selaras ollamaAdapter).
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

// ---- HEALTH ----------------------------------------------------------------
// Guna GET /v1/models: mengesahkan ketersampaian + kesahihan kunci, kos token 0.
async function health() {
  const base = { provider: PROVIDER, base_url: config.CLAUDE_BASE_URL, model: config.CLAUDE_MODEL };
  if (!apiKey()) {
    return Object.assign({ ok: false, available: false, latency_ms: 0, error: 'CLAUDE_API_KEY tidak ditetapkan' }, base);
  }
  const r = await claudeFetch('/v1/models', { method: 'GET', headers: authHeaders() }, Math.min(config.CLAUDE_TIMEOUT_MS, 8000));
  if (!r.ok) {
    return Object.assign({ ok: false, available: false, latency_ms: r.latency, error: r.timeout ? 'Claude request timeout' : 'Claude not reachable' }, base);
  }
  if (!r.res.ok) {
    let t = ''; try { t = await r.res.text(); } catch (e) { /* abai */ }
    return Object.assign({ ok: false, available: false, latency_ms: r.latency, error: 'Claude HTTP ' + r.res.status + (t ? ': ' + t.slice(0, 160) : '') }, base);
  }
  let models = [];
  try { const d = await r.res.json(); models = (d && d.data ? d.data : []).map(function (m) { return m.id; }); } catch (e) { /* abai */ }
  return Object.assign({ ok: true, available: true, latency_ms: r.latency, models: models }, base);
}

// ---- KAEDAH FOKUS (guna Prompt Builder sedia ada) --------------------------
// Struktur output SAMA dengan ollamaAdapter supaya boleh ditukar ganti tanpa
// mengubah engine. (Templat → Arab pada Fasa 20; penyambungan enjin Fasa 21+.)
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

async function rewritePrompt(payload) {
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

// ---- FALLBACK SELAMAT (kaedah lain — disambung pada FASA 22+) ---------------
function fallback(kind) {
  return async function (payload) {
    return result(true, { latency_ms: 0, note: kind + ' belum disambung ke Claude (Fasa 22+). Fallback selamat tempatan.' });
  };
}

// Penjanaan imej KEKAL di ComfyUI. Adapter Claude tidak menjana imej.
async function generateImage(payload) {
  return result(false, { latency_ms: 0, message: 'Image generation kekal di ComfyUI; tidak dilaksanakan dalam Claude adapter.' });
}

module.exports = {
  name: PROVIDER,
  info: {
    name: PROVIDER,
    model: config.CLAUDE_MODEL,
    base_url: config.CLAUDE_BASE_URL,
    latency_ms: null,
    description: 'Adapter Claude (Anthropic Messages API) — provider penaakulan AI. Default sistem ikut AI_PROVIDER.'
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
  export: fallback('export'),
  // dieksport untuk ujian unit
  _chat: chat,
  _splitSystem: splitSystem,
  _tryParseJson: tryParseJson
};
