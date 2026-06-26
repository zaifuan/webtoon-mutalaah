'use strict';

// ===========================================================================
// src/prompts/builder.js — Fasa 11B: Prompt Context Builder
//
// SATU-SATUNYA tempat yang membina prompt. Semua AI Adapter (dummy, ollama,
// dan masa depan: LM Studio, llama.cpp, OpenAI, Claude, Gemini, ...) mesti guna
// builder ini. Template disimpan dalam fail teks (bukan DB, bukan hardcode).
//
// Ciri: cache template dalam memori dengan auto-reload bila fail berubah
// (berdasarkan mtime), penggantian placeholder yang selamat, dan output
// seragam { system, user, messages, version, template, meta }.
// ===========================================================================

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const config = require('./config');

// Cache: fullPath -> { text, mtimeMs }
const cache = {};

// ---- Pemilihan & pemuatan template ----------------------------------------
// Utamakan templates/{version}/{name}.txt; jika tiada, jatuh ke templates/{name}.txt.
async function resolveTemplateFile(name, version) {
  const v = version || config.PROMPT_VERSION;
  const versioned = path.join(config.TEMPLATE_DIR, v, name + '.txt');
  const flat = path.join(config.TEMPLATE_DIR, name + '.txt');
  try { await fsp.access(versioned); return versioned; } catch (e) { /* cuba flat */ }
  try { await fsp.access(flat); return flat; } catch (e) { /* tiada */ }
  return null;
}

async function loadTemplate(name, version) {
  const file = await resolveTemplateFile(name, version);
  if (!file) {
    const err = new Error('Template tidak dijumpai: "' + name + '" (version ' + (version || config.PROMPT_VERSION) + ')');
    err.code = 'TEMPLATE_NOT_FOUND';
    throw err;
  }
  let st;
  try { st = await fsp.stat(file); } catch (e) {
    const err = new Error('Template tidak boleh dibaca: ' + name);
    err.code = 'TEMPLATE_NOT_FOUND';
    throw err;
  }
  const cached = cache[file];
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.text; // guna cache
  const text = await fsp.readFile(file, 'utf8'); // reload kerana berubah / belum dicache
  cache[file] = { text: text, mtimeMs: st.mtimeMs };
  return text;
}

// ---- Placeholder ------------------------------------------------------------
function countPlaceholders(template) {
  const m = String(template).match(/\{\{\s*[A-Z0-9_]+\s*\}\}/g);
  return m ? m.length : 0;
}

// Ganti {{KEY}} dengan values[KEY]. Jika tiada → string kosong (tidak crash).
function applyPlaceholders(template, values) {
  return String(template).replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, function (_, key) {
    const v = values[key];
    return (v === undefined || v === null) ? '' : String(v);
  });
}

function fmt(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

// ---- Context ----------------------------------------------------------------
// Susun context mengikut turutan: project → character → scene → panel → script
// → visual → prompt → task. Medan yang tiada diabaikan secara selamat.
async function buildContext(payload) {
  const p = (payload && typeof payload === 'object') ? payload : {};
  return {
    project: p.project || null,
    character: p.character || p.characters || null,
    scene: p.scene || null,
    panel: p.panel || null,
    script: p.script || p.scripts || null,
    visual: p.visual || null,
    prompt: p.prompt || null,
    task: p.task || p.job_type || null,
    user_input: p.user_input || p.input || '',
    system_note: p.system_note || ''
  };
}

function placeholderValues(ctx) {
  const proj = ctx.project || {};
  return {
    PROJECT_TITLE: proj.title_ms || proj.title || proj.title_ar || '',
    PROJECT_LANGUAGE: proj.language || proj.lang || 'ms',
    CHARACTER: fmt(ctx.character),
    SCENE: fmt(ctx.scene),
    PANEL: fmt(ctx.panel),
    SCRIPT: fmt(ctx.script),
    VISUAL: fmt(ctx.visual),
    PROMPT: fmt(ctx.prompt),
    TASK: ctx.task ? String(ctx.task) : '',
    USER_INPUT: fmt(ctx.user_input),
    SYSTEM_NOTE: fmt(ctx.system_note)
  };
}

function logBuild(meta) {
  if (!config.PROMPT_DEBUG) return;
  console.log('[prompt-builder] template=' + meta.template + ' version=' + meta.version +
    ' placeholders=' + meta.placeholders + ' system_len=' + meta.system_len + ' user_len=' + meta.user_len);
}

// ---- Pembinaan utama --------------------------------------------------------
async function buildSystemPrompt(payload) {
  const ctx = await buildContext(payload);
  const values = placeholderValues(ctx);
  const tpl = await loadTemplate('system');
  const system = applyPlaceholders(tpl, values);
  return { system: system, user: '', messages: [{ role: 'system', content: system }], version: config.PROMPT_VERSION, template: 'system' };
}

// Bina system + user (daripada taskTemplate) → format mesej standard.
async function buildMessages(taskTemplate, payload) {
  const ctx = await buildContext(payload);
  const values = placeholderValues(ctx);
  const systemTpl = await loadTemplate('system');
  const userTpl = await loadTemplate(taskTemplate);
  const system = applyPlaceholders(systemTpl, values);
  const user = applyPlaceholders(userTpl, values);
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
  const meta = {
    version: config.PROMPT_VERSION,
    template: taskTemplate,
    placeholders: countPlaceholders(systemTpl) + countPlaceholders(userTpl),
    system_len: system.length,
    user_len: user.length
  };
  logBuild(meta);
  return { system: system, user: user, messages: messages, version: config.PROMPT_VERSION, template: taskTemplate, meta: meta };
}

async function buildGenerateScriptPrompt(payload) { return buildMessages('generate_script', payload); }
async function buildGeneratePromptPrompt(payload) { return buildMessages('generate_prompt', payload); }
async function buildReviewPrompt(payload) { return buildMessages('review', payload); }

// Pemetaan task → fungsi (untuk endpoint preview & guna umum).
async function buildByTask(task, payload) {
  switch (String(task || '').toLowerCase()) {
    case 'system': return buildSystemPrompt(payload);
    case 'prompt':
    case 'generate_prompt': return buildGeneratePromptPrompt(payload);
    case 'review': return buildReviewPrompt(payload);
    case 'script':
    case 'generate_script':
    default: return buildGenerateScriptPrompt(payload);
  }
}

module.exports = {
  VERSION: config.PROMPT_VERSION,
  TEMPLATES: ['system', 'generate_script', 'generate_prompt', 'review'],
  loadTemplate,
  applyPlaceholders,
  countPlaceholders,
  buildContext,
  buildSystemPrompt,
  buildGenerateScriptPrompt,
  buildGeneratePromptPrompt,
  buildReviewPrompt,
  buildMessages,
  buildByTask
};
