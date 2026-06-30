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
const storyDirector = require('../storyDirector');

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

// ---- KAEDAH PENAAKULAN (Claude Story Director — Arab-first, Fasa 20) --------
// Setiap kaedah: bina mesej (system Arab khusus engine) via storyDirector →
// chat → parse → pulang { success, <items> }. Jika JSON tak sah / gagal →
// { success:false } supaya pemanggil (engine route) FALLBACK ke deterministik.
async function runEngine(engine, payload, itemKey) {
  let messages;
  try { messages = storyDirector.buildMessages(engine, payload || {}); }
  catch (e) { return result(false, { latency_ms: 0, error: 'buildMessages gagal: ' + (e && e.message ? e.message : String(e)) }); }
  const r = await chat(messages);
  if (!r.ok) return result(false, { latency_ms: r.latency, error: r.error, timeout: !!r.timeout, engine: engine });
  let parsed;
  try { parsed = storyDirector.parse(engine, r.content, payload || {}); }
  catch (e) { return result(false, { latency_ms: r.latency, error: 'parse gagal: ' + (e && e.message ? e.message : String(e)), engine: engine }); }
  if (parsed === null || parsed === undefined) {
    return result(false, { latency_ms: r.latency, error: 'Claude tidak menghasilkan JSON sah (' + engine + ')', engine: engine });
  }
  const out = { latency_ms: r.latency, engine: engine };
  out[itemKey] = parsed;
  return result(true, out);
}

async function generateCharacter(payload) { return runEngine('character', payload, 'characters'); }
async function generateScene(payload)     { return runEngine('scene', payload, 'scenes'); }
async function generatePanel(payload)     { return runEngine('panel', payload, 'panels'); }
async function generateScript(payload)    { return runEngine('script', payload, 'scripts'); }
async function generateVisual(payload)    { return runEngine('visual', payload, 'visual'); }
async function review(payload)            { return runEngine('review', payload, 'review'); }

// PROMPT ENGINE: hasil EN diratakan → route boleh terus guna prompt_text/negative_prompt.
async function generatePrompt(payload) {
  const out = await runEngine('prompt', payload, 'prompt');
  if (out.success === false || !out.prompt) return out;
  return result(true, Object.assign({ latency_ms: out.latency_ms }, out.prompt));
}

// PROMPT_REWRITE: prompt Claude sudah final → passthrough (rewrite dilangkau).
async function rewritePrompt(payload) {
  const p = (payload && typeof payload === 'object') ? payload : {};
  return result(true, { latency_ms: 0, prompt_text: p.prompt || p.prompt_text || '', negative_prompt: p.negative_prompt || '', note: 'rewrite dilangkau — prompt Claude sudah final' });
}

// Penjanaan imej KEKAL di ComfyUI. Adapter Claude tidak menjana imej.
async function generateImage(payload) {
  return result(false, { latency_ms: 0, message: 'Image generation kekal di ComfyUI; tidak dilaksanakan dalam Claude adapter.' });
}

// Fallback selamat untuk kaedah tanpa pemetaan naratif (text/export).
function fallback(kind) {
  return async function (payload) { return result(true, { latency_ms: 0, note: kind + ' tiada pemetaan Claude (fallback selamat).' }); };
}

module.exports = {
  name: PROVIDER,
  info: {
    name: PROVIDER,
    model: config.CLAUDE_MODEL,
    base_url: config.CLAUDE_BASE_URL,
    latency_ms: null,
    description: 'Adapter Claude (Anthropic Messages API) — Story Director Arab-first. Default sistem ikut AI_PROVIDER.'
  },
  health: health,
  generateText: fallback('generateText'),
  generateCharacter: generateCharacter,
  generateScene: generateScene,
  generatePanel: generatePanel,
  generateScript: generateScript,
  generateVisual: generateVisual,
  generatePrompt: generatePrompt,
  rewritePrompt: rewritePrompt,
  generateImage: generateImage,
  review: review,
  export: fallback('export'),
  // dieksport untuk ujian unit
  _chat: chat,
  _splitSystem: splitSystem,
  _runEngine: runEngine
};
