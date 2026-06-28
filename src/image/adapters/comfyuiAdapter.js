'use strict';

// ===========================================================================
// src/image/adapters/comfyuiAdapter.js — Fasa 13: adapter ComfyUI (REAL)
//
// Penjana imej sebenar pertama. REST API sahaja (native fetch, TIADA SDK).
// Adapter HANYA: muat workflow JSON → suntik prompt/negative/width/height/seed
// → submit → polling → muat turun imej → simpan (storage Fasa 8) → pulang path.
// TIADA logik lain. Semua kegagalan DIKAWAL (success:false) — server tidak
// crash, Ollama/AI tidak terjejas, retry kekal sistem Fasa 9.
// ===========================================================================

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const imageStore = require('../../services/imageAssetService'); // storage Fasa 8

const PROVIDER = 'comfyui';

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function baseUrl() { return String(config.COMFYUI_BASE_URL || '').replace(/\/+$/, ''); }
function toInt(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }
function toFloat(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function randomSeed() { return Math.floor(Math.random() * 1e15); }

function result(success, extra) {
  return Object.assign({ success: success, provider: PROVIDER, cost: 0, image: null }, extra || {});
}
function fail(extra) { return result(false, extra); }

// fetch dengan timeout (AbortController). Tidak melempar — pulang { ok:false }.
async function comfyFetch(pathname, options, timeoutMs) {
  const controller = new AbortController();
  const ms = timeoutMs || config.COMFYUI_TIMEOUT_MS;
  const timer = setTimeout(function () { controller.abort(); }, ms);
  const t0 = Date.now();
  try {
    const res = await fetch(baseUrl() + pathname, Object.assign({ signal: controller.signal }, options || {}));
    return { ok: true, res: res, latency: Date.now() - t0 };
  } catch (e) {
    const latency = Date.now() - t0;
    if (e && e.name === 'AbortError') return { ok: false, latency: latency, timeout: true, error: 'Ollama/ComfyUI timeout' };
    return { ok: false, latency: latency, error: (e && e.message ? e.message : String(e)) };
  } finally {
    clearTimeout(timer);
  }
}

// Suntik nilai ke dalam workflow melalui placeholder. Token tepat → nilai
// bertaip; token tertanam dalam string → gantian string.
function injectPlaceholders(workflow, values) {
  const clone = JSON.parse(JSON.stringify(workflow));
  function replaceVal(v) {
    if (typeof v !== 'string') return v;
    if (Object.prototype.hasOwnProperty.call(values, v)) return values[v];
    let out = v;
    for (const tok of Object.keys(values)) {
      if (out.indexOf(tok) !== -1) out = out.split(tok).join(String(values[tok]));
    }
    return out;
  }
  function walk(node) {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) { node[i] = replaceVal(node[i]); if (node[i] && typeof node[i] === 'object') walk(node[i]); }
      return;
    }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) { node[k] = replaceVal(node[k]); if (node[k] && typeof node[k] === 'object') walk(node[k]); }
    }
  }
  walk(clone);
  return clone;
}

// Pilihan: tindih checkpoint/unet jika payload.model diberi.
function overrideModel(wf, model) {
  for (const id of Object.keys(wf)) {
    const n = wf[id];
    if (!n || !n.inputs) continue;
    if (n.class_type === 'CheckpointLoaderSimple' && 'ckpt_name' in n.inputs) n.inputs.ckpt_name = model;
    if (n.class_type === 'UNETLoader' && 'unet_name' in n.inputs) n.inputs.unet_name = model;
  }
}

function findFirstImage(outputs, preferNode) {
  if (preferNode && outputs[preferNode] && Array.isArray(outputs[preferNode].images) && outputs[preferNode].images.length) {
    return outputs[preferNode].images[0];
  }
  for (const nodeId of Object.keys(outputs || {})) {
    const o = outputs[nodeId];
    if (o && Array.isArray(o.images) && o.images.length) return o.images[0];
  }
  return null;
}

function extFromName(name) {
  const m = String(name || '').toLowerCase().match(/\.(png|jpe?g|webp)$/);
  if (!m) return 'png';
  return m[1] === 'jpg' ? 'jpeg' : m[1];
}

// Simpan buffer guna storage Fasa 8 (IMAGES_DIR, publicUrl). Tidak cipta sistem baru.
async function saveBuffer(buf, sourceName, subfolder) {
  const ext = extFromName(sourceName);
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const sub = subfolder || '_generated';
  const dir = path.join(imageStore.IMAGES_DIR, sub);
  await imageStore.ensureDir(dir);
  const fname = 'gen-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '.' + (ext === 'jpeg' ? 'jpg' : ext);
  const abs = path.join(dir, fname);
  await fsp.writeFile(abs, buf);
  const rel = 'images/' + sub + '/' + fname;
  return { abs: abs, relPath: rel, url: imageStore.publicUrl(rel), filename: fname, mime: mime };
}

// ---- HEALTH ----------------------------------------------------------------
async function health() {
  const r = await comfyFetch('/system_stats', { method: 'GET' }, Math.min(config.COMFYUI_TIMEOUT_MS, 5000));
  const base = { provider: PROVIDER, base_url: config.COMFYUI_BASE_URL };
  if (!r.ok) return Object.assign({ ok: false, available: false, latency_ms: r.latency, error: r.timeout ? 'ComfyUI request timeout' : 'ComfyUI not reachable' }, base);
  if (!r.res.ok) return Object.assign({ ok: false, available: false, latency_ms: r.latency, error: 'ComfyUI HTTP ' + r.res.status }, base);
  let stats = {};
  try { stats = await r.res.json(); } catch (e) { /* abai */ }
  const sys = stats.system || {};
  const dev = (stats.devices && stats.devices[0]) || {};
  let queue = null;
  const qr = await comfyFetch('/queue', { method: 'GET' }, 5000);
  if (qr.ok && qr.res.ok) { try { const qd = await qr.res.json(); queue = ((qd.queue_running || []).length) + ((qd.queue_pending || []).length); } catch (e) { /* abai */ } }
  return Object.assign({
    ok: true,
    available: true,
    latency_ms: r.latency,
    version: sys.comfyui_version || null,
    gpu: dev.name || null,
    vram: (dev.vram_total != null ? { total: dev.vram_total, free: (dev.vram_free != null ? dev.vram_free : null) } : null),
    queue: queue
  }, base);
}

// ---- GENERATE IMAGE (10 langkah) -------------------------------------------
async function generateImage(payload) {
  const p = payload || {};
  const t0 = Date.now();

  // 1) Muat workflow JSON
  const wfName = String(p.workflow || config.COMFYUI_WORKFLOW || 'turbo').replace(/\.json$/i, '');
  const wfFile = path.join(config.WORKFLOW_DIR, wfName + '.json');
  let wfRaw;
  try { wfRaw = await fsp.readFile(wfFile, 'utf8'); }
  catch (e) { return fail({ message: 'Workflow not found', workflow: wfName, latency_ms: Date.now() - t0 }); }
  let workflow;
  try { workflow = JSON.parse(wfRaw); }
  catch (e) { return fail({ message: 'Workflow JSON tidak sah: ' + (e && e.message ? e.message : ''), workflow: wfName, latency_ms: Date.now() - t0 }); }

  // 2-7) Suntik prompt/negative/width/height/seed/steps/cfg/sampler
  const seed = (p.seed != null && Number.isFinite(Number(p.seed))) ? Number(p.seed) : randomSeed();
  const values = {
    '%PROMPT%': String(p.prompt || ''),
    '%NEGATIVE%': String(p.negative_prompt || p.negative || ''),
    '%WIDTH%': toInt(p.width, config.IMAGE_WIDTH),
    '%HEIGHT%': toInt(p.height, config.IMAGE_HEIGHT),
    '%SEED%': seed,
    '%STEPS%': toInt(p.steps, config.IMAGE_STEPS),
    '%CFG%': toFloat(p.cfg, config.IMAGE_CFG),
    '%SAMPLER%': String(p.sampler || config.IMAGE_SAMPLER)
  };
  const injected = injectPlaceholders(workflow, values);
  if (p.model) overrideModel(injected, String(p.model));

  // 8) Submit workflow
  const clientId = (crypto.randomUUID && crypto.randomUUID()) || ('c' + Date.now());
  const sub = await comfyFetch('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: injected, client_id: clientId })
  }, config.COMFYUI_TIMEOUT_MS);
  if (!sub.ok) return fail({ error: sub.timeout ? 'ComfyUI request timeout' : 'ComfyUI not reachable: ' + sub.error, latency_ms: Date.now() - t0 });
  if (!sub.res.ok) { let t = ''; try { t = await sub.res.text(); } catch (e) {} return fail({ error: 'ComfyUI HTTP ' + sub.res.status + (t ? ': ' + t.slice(0, 200) : ''), latency_ms: Date.now() - t0 }); }
  let subData = null;
  try { subData = await sub.res.json(); } catch (e) { return fail({ error: 'Respons /prompt bukan JSON', latency_ms: Date.now() - t0 }); }
  if (subData.node_errors && Object.keys(subData.node_errors).length) return fail({ error: 'ComfyUI node errors', node_errors: subData.node_errors, latency_ms: Date.now() - t0 });
  const promptId = subData.prompt_id;
  if (!promptId) return fail({ error: 'Tiada prompt_id daripada ComfyUI', latency_ms: Date.now() - t0 });

  // 9) Polling sehingga siap (atau timeout terkawal)
  const deadline = t0 + config.COMFYUI_TIMEOUT_MS;
  let outputs = null;
  while (Date.now() < deadline) {
    await sleep(1000);
    const hr = await comfyFetch('/history/' + promptId, { method: 'GET' }, 10000);
    if (!hr.ok || !hr.res.ok) continue;
    let hist = null;
    try { hist = await hr.res.json(); } catch (e) { continue; }
    const entry = hist && hist[promptId];
    if (entry && entry.outputs) { outputs = entry.outputs; break; }
  }
  if (!outputs) return fail({ error: 'ComfyUI request timeout', prompt_id: promptId, latency_ms: Date.now() - t0 });

  const imgInfo = findFirstImage(outputs, config.COMFYUI_OUTPUT_NODE);
  if (!imgInfo) return fail({ error: 'Tiada imej dalam output ComfyUI', prompt_id: promptId, latency_ms: Date.now() - t0 });

  // 10) Muat turun imej & simpan (storage Fasa 8)
  const q = new URLSearchParams({ filename: imgInfo.filename, subfolder: imgInfo.subfolder || '', type: imgInfo.type || 'output' });
  const dl = await comfyFetch('/view?' + q.toString(), { method: 'GET' }, config.COMFYUI_TIMEOUT_MS);
  if (!dl.ok || !dl.res.ok) return fail({ error: 'Gagal muat turun imej daripada ComfyUI', prompt_id: promptId, latency_ms: Date.now() - t0 });
  let buf;
  try { buf = Buffer.from(await dl.res.arrayBuffer()); } catch (e) { return fail({ error: 'Gagal membaca bait imej', latency_ms: Date.now() - t0 }); }
  if (!buf || !buf.length) return fail({ error: 'Imej kosong daripada ComfyUI', latency_ms: Date.now() - t0 });

  let saved;
  try { saved = await saveBuffer(buf, imgInfo.filename, p.subfolder); }
  catch (e) { return fail({ error: 'Gagal menyimpan imej: ' + (e && e.message ? e.message : ''), latency_ms: Date.now() - t0 }); }
  const size = imageStore.readImageSize(buf, saved.mime);

  return result(true, {
    latency_ms: Date.now() - t0,
    image: { path: saved.relPath, url: saved.url, filename: saved.filename, width: size.width, height: size.height },
    seed: seed,
    workflow: wfName,
    prompt_id: promptId,
    metadata: { provider: PROVIDER, simulated: false, prompt_id: promptId }
  });
}

// ---- Fungsi lain (belum dilaksanakan dalam Fasa 13) ------------------------
function notImpl(name) {
  return async function () { return result(false, { latency_ms: 0, message: name + ' is not implemented in ComfyUI adapter (Fasa 13).' }); };
}

module.exports = {
  name: PROVIDER,
  info: {
    name: PROVIDER,
    model: config.COMFYUI_WORKFLOW,
    base_url: config.COMFYUI_BASE_URL,
    latency_ms: null,
    description: 'Adapter ComfyUI tempatan (REST). Default sistem kekal dummy-image.'
  },
  health: health,
  generateImage: generateImage,
  upscaleImage: notImpl('upscaleImage'),
  variation: notImpl('variation'),
  inpaint: notImpl('inpaint'),
  outpaint: notImpl('outpaint'),
  img2img: notImpl('img2img'),
  // dieksport untuk ujian unit (suntikan placeholder)
  _injectPlaceholders: injectPlaceholders
};
