'use strict';

// ===========================================================================
// src/services/exportService.js — Fasa 16: Export Studio (READ ONLY)
//
// Menghasilkan 6 format export daripada data Preview API:
//   HTML (zip tapak offline) · PDF · ZIP (data project) · JSON · Markdown ·
//   Prompt Pack (zip prompt.txt + negative_prompt.txt).
//
// SUMBER KEBENARAN: Preview API. Service ini memanggil GET /api/projects/:id/
// preview pada pelayan sendiri (loopback) supaya logik tidak diduplikasi dan
// preview.js TIDAK disentuh. TIADA tulisan DB, TIADA AI, TIADA job.
// ===========================================================================

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const archiver = require('archiver');
const PDFDocument = require('pdfkit');
const imageStore = require('./imageAssetService');

const EXPORTS_ROOT = path.resolve(__dirname, '..', '..', 'exports');
const TYPE_DIRS = ['html', 'pdf', 'zip', 'json', 'markdown', 'prompt'];

// ---- Util ----------------------------------------------------------------
function selfBase() {
  return process.env.EXPORT_SELF_BASE_URL || ('http://127.0.0.1:' + (process.env.PORT || 3000));
}
function ts() {
  const d = new Date();
  const p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
function ensureDir(dir) { return fsp.mkdir(dir, { recursive: true }); }
function ensureRootSync() { try { fs.mkdirSync(EXPORTS_ROOT, { recursive: true }); } catch (e) { /* abai */ } }
function projDir(projectId, type) { return path.join(EXPORTS_ROOT, 'project-' + Number(projectId), type); }

function uploadRoot() { return imageStore.UPLOAD_ROOT || path.dirname(imageStore.IMAGES_DIR); }
function localImagePath(url) {
  if (!url) return null;
  const rel = String(url).replace(/^\/+uploads\/+/, '');
  return path.join(uploadRoot(), rel);
}
function imgExt(url) {
  const e = path.extname(String(url || '')).toLowerCase();
  return e && /^\.(png|jpg|jpeg|webp|gif)$/.test(e) ? e : '.png';
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function normOpts(o) {
  o = o || {};
  let q = Number(o.imageQuality);
  if (!Number.isFinite(q)) q = 80;
  q = Math.min(100, Math.max(1, Math.round(q)));
  return {
    includeImages: o.includeImages !== false,
    includePrompt: o.includePrompt !== false,
    includeReview: o.includeReview !== false,
    includeMetadata: o.includeMetadata !== false,
    compressImages: !!o.compressImages,
    imageQuality: q
  };
}

// ---- Branding + metadata + ikon SVG inline (local) -----------------------
const APP_NAME = 'Webtoon Mutalaah';
const APP_AUTHOR = 'ByZaifuan';
let APP_VERSION = '0.1.0';
try { APP_VERSION = require('../../package.json').version || APP_VERSION; } catch (e) { /* abai */ }

function buildMetadata(data, exportType) {
  const proj = (data && data.project) || {};
  const sum = (data && data.summary) || {};
  return {
    app_name: APP_NAME,
    author: APP_AUTHOR,
    version: APP_VERSION,
    export_type: exportType,
    generated_at: new Date().toISOString(),
    project_title: proj.title_ms || null,
    project_title_ar: proj.title_ar || null,
    total_chapters: sum.chapters != null ? sum.chapters : ((data && data.chapters) ? data.chapters.length : 0),
    total_panels: sum.panels != null ? sum.panels : 0,
    total_with_image: sum.with_image != null ? sum.with_image : 0,
    source: 'preview-api'
  };
}

function fmtDate(d) {
  d = d || new Date();
  const p = function (n) { return String(n).padStart(2, '0'); };
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// Ikon SVG inline (tiada pustaka luar)
const SVG = {
  chapter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  panel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>',
  dialogue: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 6h-2v9H6v2a1 1 0 0 0 1 1h11l4 4V7a1 1 0 0 0-1-1z"/><path d="M17 2H3a1 1 0 0 0-1 1v14l4-4h11a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/></svg>',
  narration: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  noimage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  brand: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 5.6L20 9l-4.2 4 1 6L12 16l-4.8 3 1-6L4 9l5.6-1.4z"/></svg>'
};

// ---- Sumber: Preview API (loopback) --------------------------------------
async function fetchPreview(projectId) {
  let res;
  try { res = await fetch(selfBase() + '/api/projects/' + Number(projectId) + '/preview', { headers: { Accept: 'application/json' } }); }
  catch (e) { const err = new Error('Tidak dapat menghubungi Preview API: ' + (e && e.message)); err.status = 502; throw err; }
  if (res.status === 404) { const err = new Error('Projek tidak dijumpai'); err.status = 404; throw err; }
  if (!res.ok) { const err = new Error('Preview API gagal (HTTP ' + res.status + ')'); err.status = res.status; throw err; }
  const data = await res.json();
  if (!data || !data.ok) { const err = new Error('Data preview tidak sah'); err.status = 500; throw err; }
  return data;
}

// Ratakan panels merentas chapters (kekal urutan).
function flatPanels(data) {
  const out = [];
  (data.chapters || []).forEach(function (c) {
    (c.panels || []).forEach(function (p) {
      out.push({ chapter_id: c.scene.id, scene_no: c.scene.scene_no, chapter_title: c.scene.title_ms, panel: p });
    });
  });
  return out;
}

async function fileInfo(projectId, type, filename) {
  const abs = path.join(projDir(projectId, type), filename);
  const st = await fsp.stat(abs);
  return {
    file: type + '/' + filename,
    name: filename,
    type: type,
    size: st.size,
    created_at: st.mtime.toISOString(),
    status: 'ready',
    url: '/exports/project-' + Number(projectId) + '/' + type + '/' + filename
  };
}

function zipTo(absPath, buildFn) {
  return new Promise(function (resolve, reject) {
    const output = fs.createWriteStream(absPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', function () { resolve(absPath); });
    archive.on('warning', function (err) { if (!err || err.code !== 'ENOENT') reject(err); });
    archive.on('error', reject);
    archive.pipe(output);
    try { buildFn(archive); } catch (e) { reject(e); return; }
    archive.finalize();
  });
}

// Salin fail imej panel ke dalam arkib di images/panel-{id}.ext (jika wujud).
function addImages(archive, data, opts, prefix) {
  if (!opts.includeImages) return 0;
  let n = 0;
  flatPanels(data).forEach(function (fp) {
    const p = fp.panel;
    if (!p.image || !p.image.url) return;
    const abs = localImagePath(p.image.url);
    if (abs && fs.existsSync(abs)) {
      archive.file(abs, { name: (prefix || '') + 'images/panel-' + p.id + imgExt(p.image.url) });
      n++;
    }
  });
  return n;
}

// ====================== EXPORT: JSON ======================================
async function exportJson(projectId, options) {
  const opts = normOpts(options);
  const data = await fetchPreview(projectId);
  const payload = {
    project: data.project,
    characters: data.characters,
    summary: data.summary,
    chapters: (data.chapters || []).map(function (c) {
      return {
        scene: c.scene,
        panels: (c.panels || []).map(function (p) {
          const out = {
            id: p.id, panel_no: p.panel_no, panel_type: p.panel_type, shot: p.shot, mood: p.mood,
            location: p.location, characters: p.characters, caption_ms: p.caption_ms,
            dialogue: p.dialogue, narration: p.narration, visual: p.visual
          };
          if (opts.includePrompt) out.prompt = p.prompt;
          if (opts.includeReview) out.review = p.review;
          if (opts.includeImages) out.image = p.image;
          return out;
        })
      };
    })
  };
  if (opts.includeMetadata) payload.metadata = Object.assign(buildMetadata(data, 'json'), { options: opts });

  const dir = projDir(projectId, 'json'); await ensureDir(dir);
  const filename = 'project-' + Number(projectId) + '-' + ts() + '.json';
  await fsp.writeFile(path.join(dir, filename), JSON.stringify(payload, null, 2), 'utf8');
  return fileInfo(projectId, 'json', filename);
}

// ====================== EXPORT: Markdown ==================================
async function exportMarkdown(projectId, options) {
  const opts = normOpts(options);
  const data = await fetchPreview(projectId);
  const L = [];
  L.push('# ' + (data.project.title_ms || ('Projek ' + projectId)));
  if (data.project.title_ar) L.push('', '> ' + data.project.title_ar);
  L.push('', '_' + data.summary.chapters + ' bab · ' + data.summary.panels + ' panel · ' + data.summary.with_image + ' berimej_', '');

  (data.chapters || []).forEach(function (c) {
    L.push('', '## Bab ' + (c.scene.scene_no != null ? c.scene.scene_no : '?') + (c.scene.title_ms ? ' — ' + c.scene.title_ms : ''));
    (c.panels || []).forEach(function (p) {
      L.push('', '### Panel ' + p.panel_no);
      const meta = [];
      if (p.shot) meta.push('**Shot:** ' + p.shot);
      if (p.mood) meta.push('**Mood:** ' + p.mood);
      if (p.characters && p.characters.length) meta.push('**Watak:** ' + p.characters.join(', '));
      if (meta.length) L.push(meta.join(' · '));
      if (opts.includeImages) {
        if (p.image && p.image.url) L.push('', '![Panel ' + p.panel_no + '](images/panel-' + p.id + imgExt(p.image.url) + ')');
        else L.push('', '`No Image`');
      }
      if (p.caption_ms) L.push('', '**Caption:** ' + p.caption_ms);
      if (p.dialogue && p.dialogue.length) {
        L.push('', '**Dialog:**');
        p.dialogue.forEach(function (d) { L.push('- **' + (d.speaker_name || '???') + ':** ' + (d.text_ms || '') + (d.text_ar ? '  \n  _' + d.text_ar + '_' : '')); });
      }
      if (p.narration && p.narration.length) {
        L.push('', '**Narasi:**');
        p.narration.forEach(function (n) { L.push('> ' + (n.text_ms || '') + (n.text_ar ? '  \n> _' + n.text_ar + '_' : '')); });
      }
      if (opts.includePrompt && p.prompt && (p.prompt.prompt_text || p.prompt.negative_prompt)) {
        L.push('', '**Prompt:**', '```', p.prompt.prompt_text || '', '```');
        if (p.prompt.negative_prompt) L.push('**Negatif:** `' + p.prompt.negative_prompt + '`');
      }
      if (opts.includeReview && p.review && p.review.qa_status) L.push('', '_QA: ' + p.review.qa_status + (p.review.ready_for_image ? ' · sedia imej' : '') + '_');
    });
  });

  const dir = projDir(projectId, 'markdown'); await ensureDir(dir);
  const filename = 'project-' + Number(projectId) + '-' + ts() + '.md';
  await fsp.writeFile(path.join(dir, filename), L.join('\n'), 'utf8');
  return fileInfo(projectId, 'markdown', filename);
}

// ====================== EXPORT: Prompt Pack ===============================
async function exportPrompts(projectId, options) {
  const data = await fetchPreview(projectId);
  const fps = flatPanels(data);
  const pos = [], neg = [], pack = [];
  let i = 0;
  fps.forEach(function (fp) {
    const p = fp.panel;
    if (!p.prompt) return;
    i++;
    const label = 'Panel ' + p.panel_no;
    pos.push(label, (p.prompt.prompt_text || '').trim(), '');
    neg.push(label, (p.prompt.negative_prompt || '').trim(), '');
    pack.push(label, 'Prompt:', (p.prompt.prompt_text || '').trim(), 'Negative Prompt:', (p.prompt.negative_prompt || '').trim(), '', '----------', '');
  });
  const header = '# Prompt Pack — ' + (data.project.title_ms || ('Projek ' + projectId)) + '\n# ' + i + ' panel berprompt · dijana ' + new Date().toISOString() + '\n\n';

  const dir = projDir(projectId, 'prompt'); await ensureDir(dir);
  const filename = 'prompts-' + Number(projectId) + '-' + ts() + '.zip';
  await zipTo(path.join(dir, filename), function (archive) {
    archive.append(header + pos.join('\n'), { name: 'prompt.txt' });
    archive.append(header + neg.join('\n'), { name: 'negative_prompt.txt' });
    archive.append(header + pack.join('\n'), { name: 'pack.txt' });
  });
  return fileInfo(projectId, 'prompt', filename);
}

// ====================== EXPORT: ZIP (data project) ========================
async function exportZip(projectId, options) {
  const opts = normOpts(options);
  const data = await fetchPreview(projectId);
  const fps = flatPanels(data);

  const panels = fps.map(function (fp) {
    const p = fp.panel;
    return {
      id: p.id, scene_id: fp.chapter_id, scene_no: fp.scene_no, panel_no: p.panel_no,
      panel_type: p.panel_type, shot: p.shot, mood: p.mood, location: p.location,
      characters: p.characters, caption_ms: p.caption_ms
    };
  });
  const scripts = fps.map(function (fp) { return { panel_id: fp.panel.id, dialogue: fp.panel.dialogue, narration: fp.panel.narration }; });
  const visuals = fps.map(function (fp) { return { panel_id: fp.panel.id, visual: fp.panel.visual }; });
  const prompts = fps.map(function (fp) { return { panel_id: fp.panel.id, prompt: fp.panel.prompt }; });
  const review = fps.map(function (fp) { return { panel_id: fp.panel.id, review: fp.panel.review }; });
  const chapters = (data.chapters || []).map(function (c) { return { scene: c.scene, panel_ids: (c.panels || []).map(function (p) { return p.id; }) }; });

  const dir = projDir(projectId, 'zip'); await ensureDir(dir);
  const filename = 'project-' + Number(projectId) + '-' + ts() + '.zip';
  await zipTo(path.join(dir, filename), function (archive) {
    archive.append(JSON.stringify(data.project, null, 2), { name: 'project.json' });
    archive.append(JSON.stringify(chapters, null, 2), { name: 'chapters.json' });
    archive.append(JSON.stringify(panels, null, 2), { name: 'panels.json' });
    archive.append(JSON.stringify(scripts, null, 2), { name: 'scripts.json' });
    archive.append(JSON.stringify(visuals, null, 2), { name: 'visuals.json' });
    archive.append(JSON.stringify(data.characters, null, 2), { name: 'characters.json' });
    if (opts.includePrompt) archive.append(JSON.stringify(prompts, null, 2), { name: 'prompts.json' });
    if (opts.includeReview) archive.append(JSON.stringify(review, null, 2), { name: 'review.json' });
    if (opts.includeMetadata) archive.append(JSON.stringify(Object.assign(buildMetadata(data, 'zip'), { project: data.project, summary: data.summary, options: opts }), null, 2), { name: 'metadata.json' });
    addImages(archive, data, opts, '');
  });
  return fileInfo(projectId, 'zip', filename);
}

// ====================== EXPORT: HTML (tapak offline) ======================
function readerCss() {
  return [
    ':root{color-scheme:dark}',
    '*{box-sizing:border-box}',
    'html{scroll-behavior:smooth}',
    'body{margin:0;background:#0d1014;color:#e8edf3;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.55}',
    '.ic{display:inline-flex;vertical-align:-2px}',
    '.ic svg{width:1em;height:1em;display:block}',
    'header.top{position:sticky;top:0;background:#15181d;border-bottom:1px solid #2a2f37;padding:10px 16px;z-index:6;display:flex;align-items:center;justify-content:space-between;gap:10px}',
    'header.top .brand{display:inline-flex;align-items:center;gap:8px;font-weight:800;color:#e2b659;letter-spacing:.02em}',
    'header.top .brand .ic{color:#e2b659;font-size:18px}',
    'header.top .by{font-size:.72rem;color:#8a92a0;font-weight:400}',
    'nav.chapnav{position:sticky;top:43px;background:#121519;border-bottom:1px solid #242a31;padding:8px 12px;z-index:5;display:flex;gap:8px;overflow-x:auto}',
    'nav.chapnav a{flex:0 0 auto;font-size:.76rem;color:#aeb4bd;text-decoration:none;border:1px solid #2a2f37;border-radius:20px;padding:4px 11px;white-space:nowrap}',
    'nav.chapnav a:hover{border-color:#2fb78f;color:#e8edf3}',
    '.cover{max-width:760px;margin:0 auto;padding:54px 24px 30px;text-align:center}',
    '.cover .cbrand{display:inline-flex;align-items:center;gap:7px;color:#2fb78f;font-weight:700;letter-spacing:.16em;text-transform:uppercase;font-size:.74rem}',
    '.cover .cbrand .ic{font-size:15px}',
    '.cover h1{margin:18px 0 6px;font-size:2rem;line-height:1.2}',
    '.cover .ar{font-size:1.5rem;color:#e2b659;direction:rtl;margin:6px 0 14px}',
    '.cover .stats{display:flex;gap:22px;justify-content:center;flex-wrap:wrap;margin-top:14px;color:#aeb4bd;font-size:.82rem}',
    '.cover .stats b{color:#e8edf3;font-size:1.15rem;display:block;line-height:1.2}',
    '.cover .date{margin-top:14px;color:#6a727d;font-size:.78rem}',
    '.cover .rule{width:64px;height:3px;background:#2fb78f;border-radius:2px;margin:22px auto 0}',
    '.wrap{max-width:760px;margin:0 auto;padding:8px 16px 40px}',
    '.chapter-head{display:flex;align-items:center;gap:9px;background:linear-gradient(100deg,#1f6f67,#2fb78f);color:#fff;border-radius:12px;padding:11px 14px;margin:26px 0 12px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.28);scroll-margin-top:96px}',
    '.chapter-head .ic{font-size:18px}',
    '.chapter-head .ctitle{font-weight:500;opacity:.95;font-size:.92rem}',
    '.panel{background:#1a1d22;border:1px solid #2a2f37;border-radius:14px;overflow:hidden;margin-bottom:18px;box-shadow:0 6px 20px rgba(0,0,0,.22)}',
    '.imgwrap{background:#0a0c0f;text-align:center;border-bottom:1px solid #2a2f37}',
    '.imgwrap img{display:block;max-width:100%;height:auto;margin:0 auto}',
    '.noimg{display:flex;flex-direction:column;align-items:center;gap:6px;margin:14px;padding:34px 12px;border:1.5px dashed #343b44;border-radius:12px;color:#7a828d}',
    '.noimg .ic{font-size:40px;color:#2fb78f;opacity:.85}',
    '.noimg .t{font-weight:700;letter-spacing:.06em;color:#aeb4bd}',
    '.noimg .s{font-size:.76rem;color:#6a727d}',
    '.metas{display:flex;flex-wrap:wrap;gap:6px;padding:10px 12px;border-bottom:1px solid #23272d}',
    '.meta{display:inline-flex;align-items:center;gap:4px;font-size:.72rem;background:#23272d;border:1px solid #2c3036;border-radius:10px;padding:2px 9px;color:#aeb4bd}',
    '.meta.pno{color:#5fd0c4;border-color:rgba(47,183,143,.5)}',
    '.meta.pno .ic{font-size:12px}',
    '.caption{padding:10px 12px 4px;font-size:.86rem;color:#c7ccd3}',
    '.caption .tag{color:#e2b659;border-color:rgba(226,182,89,.5)}',
    '.dialogue{padding:8px 12px;display:flex;flex-direction:column;gap:9px}',
    '.dline{display:flex;flex-direction:column;gap:3px}',
    '.speaker{display:inline-flex;align-items:center;gap:5px;font-size:.76rem;font-weight:700;color:#5fd0c4}',
    '.speaker .ic{font-size:13px}',
    '.bubble{background:#23272d;border:1px solid #2c3036;border-radius:13px;border-top-left-radius:4px;padding:8px 12px;font-size:.9rem;line-height:1.5}',
    '.bubble .ar{color:#e2b659;margin-top:3px;font-size:1.05rem}',
    '.narration{margin:6px 12px 10px;padding:10px 12px;border-left:3px solid #e2b659;background:rgba(226,182,89,.07);border-radius:10px;font-style:italic}',
    '.narration .nhead{display:inline-flex;align-items:center;gap:5px;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:#e2b659;font-style:normal;margin-bottom:5px}',
    '.narration .nhead .ic{font-size:13px}',
    '.ar{direction:rtl;text-align:right}',
    '.tag{font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:#8a92a0;border:1px solid #2a2f37;border-radius:8px;padding:0 6px;margin-right:6px}',
    '.prompt{padding:9px 12px;border-top:1px dashed #2a2f37;background:rgba(95,208,196,.06);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.74rem;color:#aeb4bd}',
    'footer.foot{max-width:760px;margin:30px auto 0;padding:18px 16px 44px;border-top:1px solid #242a31;text-align:center;color:#6a727d;font-size:.78rem}',
    'footer.foot .fb{display:inline-flex;align-items:center;gap:6px;color:#e2b659;font-weight:700}',
    'footer.foot .fb .ic{font-size:14px}',
    '#top{position:fixed;right:16px;bottom:16px;background:#1f6f67;color:#fff;border:none;border-radius:20px;padding:8px 14px;cursor:pointer;opacity:.9;box-shadow:0 4px 14px rgba(0,0,0,.3)}',
    '@media(max-width:640px){.cover h1{font-size:1.5rem}.cover{padding:36px 16px 22px}}'
  ].join('\n');
}

function readerJs() {
  return [
    '(function(){',
    '  var btn=document.getElementById("top");',
    '  if(btn){btn.addEventListener("click",function(){window.scrollTo({top:0,behavior:"smooth"});});}',
    '  document.addEventListener("keydown",function(e){',
    '    if(e.key==="Home"){window.scrollTo({top:0,behavior:"smooth"});}',
    '    else if(e.key==="End"){window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});}',
    '    else if(e.key==="ArrowDown"){window.scrollBy({top:Math.round(innerHeight*0.9),behavior:"smooth"});e.preventDefault();}',
    '    else if(e.key==="ArrowUp"){window.scrollBy({top:-Math.round(innerHeight*0.9),behavior:"smooth"});e.preventDefault();}',
    '  });',
    '})();'
  ].join('\n');
}
function buildHtml(projectId, data, opts) {
  const proj = data.project || {};
  const title = proj.title_ms || ('Projek ' + projectId);
  const ic = function (name) { return '<span class="ic">' + (SVG[name] || '') + '</span>'; };
  const out = [];
  out.push('<!DOCTYPE html><html lang="ms"><head><meta charset="utf-8">');
  out.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
  out.push('<title>' + esc(title) + ' \u2014 ' + APP_NAME + '</title>');
  out.push('<link rel="stylesheet" href="assets/css/reader.css"></head><body>');

  out.push('<header class="top"><span class="brand">' + ic('brand') + APP_NAME + ' <span class="by">by ' + APP_AUTHOR + '</span></span>');
  out.push('<span class="by">' + data.summary.chapters + ' bab \u00b7 ' + data.summary.panels + ' panel</span></header>');

  if ((data.chapters || []).length) {
    out.push('<nav class="chapnav">');
    (data.chapters || []).forEach(function (c) {
      const n = c.scene.scene_no != null ? c.scene.scene_no : '?';
      out.push('<a href="#ch-' + esc(n) + '">Bab ' + esc(n) + '</a>');
    });
    out.push('</nav>');
  }

  out.push('<section class="cover">');
  out.push('<span class="cbrand">' + ic('brand') + APP_NAME + '</span>');
  out.push('<h1>' + esc(title) + '</h1>');
  if (proj.title_ar) out.push('<div class="ar">' + esc(proj.title_ar) + '</div>');
  out.push('<div class="stats"><span><b>' + data.summary.chapters + '</b>Bab</span><span><b>' + data.summary.panels + '</b>Panel</span><span><b>' + data.summary.with_image + '</b>Berimej</span></div>');
  out.push('<div class="date">Dijana: ' + esc(fmtDate()) + '</div>');
  out.push('<div class="rule"></div></section>');

  out.push('<div class="wrap">');
  (data.chapters || []).forEach(function (c) {
    const n = c.scene.scene_no != null ? c.scene.scene_no : '?';
    out.push('<div class="chapter-head" id="ch-' + esc(n) + '">' + ic('chapter') + '<span>Bab ' + esc(n) + '</span>' + (c.scene.title_ms ? '<span class="ctitle">\u2014 ' + esc(c.scene.title_ms) + '</span>' : '') + '</div>');
    (c.panels || []).forEach(function (p) {
      out.push('<div class="panel">');
      if (opts.includeImages) {
        if (p.image && p.image.url) out.push('<div class="imgwrap"><img loading="lazy" alt="Panel ' + esc(p.panel_no) + '" src="images/panel-' + p.id + imgExt(p.image.url) + '"></div>');
        else out.push('<div class="imgwrap"><div class="noimg">' + ic('noimage') + '<span class="t">No Image</span><span class="s">Jana imej untuk pratonton panel ini</span></div></div>');
      }
      const metas = ['<span class="meta pno">' + ic('panel') + 'Panel ' + esc(p.panel_no) + '</span>'];
      if (p.shot) metas.push('<span class="meta">Shot: ' + esc(p.shot) + '</span>');
      if (p.mood) metas.push('<span class="meta">Mood: ' + esc(p.mood) + '</span>');
      if (p.characters && p.characters.length) metas.push('<span class="meta">Watak: ' + esc(p.characters.join(', ')) + '</span>');
      out.push('<div class="metas">' + metas.join('') + '</div>');
      if (p.caption_ms) out.push('<div class="caption"><span class="tag">Caption</span>' + esc(p.caption_ms) + '</div>');
      if (p.dialogue && p.dialogue.length) {
        out.push('<div class="dialogue">');
        p.dialogue.forEach(function (d) {
          out.push('<div class="dline"><span class="speaker">' + ic('dialogue') + esc(d.speaker_name || '???') + '</span><div class="bubble">' + esc(d.text_ms || '') + (d.text_ar ? '<div class="ar">' + esc(d.text_ar) + '</div>' : '') + '</div></div>');
        });
        out.push('</div>');
      }
      if (p.narration && p.narration.length) {
        out.push('<div class="narration"><div class="nhead">' + ic('narration') + 'Narasi</div>');
        p.narration.forEach(function (nn) {
          out.push('<div>' + esc(nn.text_ms || '') + (nn.text_ar ? '<div class="ar">' + esc(nn.text_ar) + '</div>' : '') + '</div>');
        });
        out.push('</div>');
      }
      if (opts.includePrompt && p.prompt && p.prompt.prompt_text) {
        out.push('<div class="prompt"><span class="tag">Prompt</span>' + esc(p.prompt.prompt_text) + (p.prompt.negative_prompt ? '<br>Negatif: ' + esc(p.prompt.negative_prompt) : '') + '</div>');
      }
      out.push('</div>');
    });
  });
  out.push('</div>');

  out.push('<footer class="foot"><div class="fb">' + ic('brand') + APP_NAME + '</div><div>by ' + APP_AUTHOR + ' \u00b7 export offline</div></footer>');
  out.push('<button id="top" type="button">\u2191 Atas</button>');
  out.push('<script src="assets/js/reader.js"></script></body></html>');
  return out.join('\n');
}

async function exportHtml(projectId, options) {
  const opts = normOpts(options);
  const data = await fetchPreview(projectId);
  const html = buildHtml(projectId, data, opts);

  const dir = projDir(projectId, 'html'); await ensureDir(dir);
  const filename = 'html-' + Number(projectId) + '-' + ts() + '.zip';
  await zipTo(path.join(dir, filename), function (archive) {
    archive.append(html, { name: 'index.html' });
    archive.append(readerCss(), { name: 'assets/css/reader.css' });
    archive.append(readerJs(), { name: 'assets/js/reader.js' });
    addImages(archive, data, opts, '');
  });
  return fileInfo(projectId, 'html', filename);
}

// ====================== EXPORT: PDF =======================================
function pdfEnsure(doc, h) {
  if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
}
async function exportPdf(projectId, options) {
  const opts = normOpts(options);
  const data = await fetchPreview(projectId);
  const dir = projDir(projectId, 'pdf'); await ensureDir(dir);
  const filename = 'project-' + Number(projectId) + '-' + ts() + '.pdf';
  const abs = path.join(dir, filename);
  const title = (data.project && data.project.title_ms) || ('Projek ' + projectId);

  await new Promise(function (resolve, reject) {
    const doc = new PDFDocument({ size: 'A4', margin: 48, autoFirstPage: false, bufferPages: true });
    const stream = fs.createWriteStream(abs);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);

    const M = 48;
    const teal = '#1f6f67', tealL = '#2fb78f', ink = '#1a1a1a', soft = '#555555', faint = '#999999';
    doc.addPage();
    const fullW = doc.page.width - M * 2;

    // ---------- COVER ----------
    doc.fontSize(11).fillColor(tealL).text(APP_NAME.toUpperCase(), { align: 'center', characterSpacing: 3 });
    doc.moveDown(6);
    doc.fontSize(28).fillColor(ink).text(title, { align: 'center' });
    doc.moveDown(0.6);
    doc.fontSize(12).fillColor(soft).text(
      data.summary.chapters + ' Bab     \u00b7     ' + data.summary.panels + ' Panel     \u00b7     ' + data.summary.with_image + ' Berimej',
      { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor(faint).text('Tarikh export: ' + fmtDate(), { align: 'center' });
    const ry = doc.y + 16;
    doc.moveTo((doc.page.width - 64) / 2, ry).lineTo((doc.page.width + 64) / 2, ry).lineWidth(3).strokeColor(tealL).stroke();
    doc.moveDown(2.4);
    doc.fontSize(8).fillColor(faint).text('Nota: teks Arab dipaparkan dalam export HTML/JSON. PDF memaparkan teks Melayu.', { align: 'center' });

    // ---------- BAB ----------
    (data.chapters || []).forEach(function (c) {
      const n = c.scene.scene_no != null ? c.scene.scene_no : '?';
      doc.addPage();
      doc.y = doc.page.height * 0.42;
      doc.fontSize(13).fillColor(tealL).text('BAB', { align: 'center', characterSpacing: 4 });
      doc.moveDown(0.2);
      doc.fontSize(40).fillColor(teal).text(String(n), { align: 'center' });
      if (c.scene.title_ms) { doc.moveDown(0.3); doc.fontSize(15).fillColor(soft).text(c.scene.title_ms, { align: 'center' }); }

      doc.addPage();
      doc.fontSize(13).fillColor(teal).text('Bab ' + n + (c.scene.title_ms ? ' \u2014 ' + c.scene.title_ms : ''));
      doc.moveDown(0.5);

      (c.panels || []).forEach(function (p) {
        pdfEnsure(doc, 48);
        const x = M;
        doc.fontSize(11).fillColor('#0d5b54').text('Panel ' + p.panel_no +
          (p.shot ? '   \u00b7   Shot: ' + p.shot : '') + (p.mood ? '   \u00b7   Mood: ' + p.mood : ''), x, doc.y);
        if (p.characters && p.characters.length) doc.fontSize(8.5).fillColor(faint).text('Watak: ' + p.characters.join(', '));
        doc.moveDown(0.25);

        if (opts.includeImages) {
          const ip = (p.image && p.image.url) ? localImagePath(p.image.url) : null;
          if (ip && fs.existsSync(ip)) {
            pdfEnsure(doc, 300);
            const y0 = doc.y;
            try { doc.image(ip, x, y0, { fit: [fullW, 290], align: 'center' }); doc.y = y0 + 298; doc.x = x; }
            catch (e) { doc.fontSize(9).fillColor(faint).text('[Imej tidak dapat dimuat]'); }
          } else {
            pdfEnsure(doc, 84);
            const y0 = doc.y;
            doc.save();
            doc.dash(4, { space: 3 }).lineWidth(1).strokeColor('#cfcfcf').rect(x, y0, fullW, 70).stroke();
            doc.undash();
            doc.restore();
            doc.fontSize(11).fillColor('#9a9a9a').text('No Image', x, y0 + 22, { width: fullW, align: 'center' });
            doc.fontSize(8).fillColor('#b3b3b3').text('Jana imej untuk pratonton panel ini', x, y0 + 40, { width: fullW, align: 'center' });
            doc.y = y0 + 78; doc.x = x;
          }
        }

        if (p.caption_ms) { pdfEnsure(doc, 18); doc.fontSize(9.5).fillColor('#333333').text('\u201c' + p.caption_ms + '\u201d', { width: fullW }); }
        (p.dialogue || []).forEach(function (d) {
          pdfEnsure(doc, 16);
          doc.fontSize(10).fillColor(teal).text((d.speaker_name || '???') + ': ', { continued: true });
          doc.fillColor(ink).text(d.text_ms || '');
        });
        (p.narration || []).forEach(function (nn) {
          pdfEnsure(doc, 16);
          doc.fontSize(9.5).fillColor(soft).text('\u203a ' + (nn.text_ms || ''), { width: fullW });
        });
        if (opts.includePrompt && p.prompt && p.prompt.prompt_text) { pdfEnsure(doc, 16); doc.fontSize(8).fillColor('#999999').text('Prompt: ' + p.prompt.prompt_text, { width: fullW }); }
        if (opts.includeReview && p.review && p.review.qa_status) { doc.fontSize(8).fillColor('#aaaaaa').text('QA: ' + p.review.qa_status); }

        doc.moveDown(0.4);
        pdfEnsure(doc, 10);
        doc.moveTo(x, doc.y).lineTo(x + fullW, doc.y).lineWidth(0.5).strokeColor('#e5e5e5').stroke();
        doc.moveDown(0.5);
      });
    });

    // ---------- FOOTER + nombor halaman ----------
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const by = doc.page.height - 32;
      doc.fontSize(8).fillColor('#aaaaaa');
      doc.text('Generated by ' + APP_NAME + ' \u00b7 by ' + APP_AUTHOR, M, by, { width: fullW / 2, align: 'left', lineBreak: false });
      doc.text('Halaman ' + (i + 1) + ' / ' + range.count, M + fullW / 2, by, { width: fullW / 2, align: 'right', lineBreak: false });
    }

    doc.end();
  });

  return fileInfo(projectId, 'pdf', filename);
}

// ====================== Pengurus export ===================================
async function listExports(projectId) {
  const base = path.join(EXPORTS_ROOT, 'project-' + Number(projectId));
  const items = [];
  for (const type of TYPE_DIRS) {
    const dir = path.join(base, type);
    let files = [];
    try { files = await fsp.readdir(dir); } catch (e) { continue; }
    for (const f of files) {
      try {
        const st = await fsp.stat(path.join(dir, f));
        if (!st.isFile()) continue;
        items.push({
          file: type + '/' + f, name: f, type: type, size: st.size,
          created_at: st.mtime.toISOString(), status: 'ready',
          url: '/exports/project-' + Number(projectId) + '/' + type + '/' + f
        });
      } catch (e) { /* abai */ }
    }
  }
  items.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
  return items;
}

async function deleteExport(projectId, fileRef) {
  const base = path.join(EXPORTS_ROOT, 'project-' + Number(projectId));
  const decoded = decodeURIComponent(String(fileRef || ''));
  const parts = decoded.split('/');
  if (parts.length !== 2 || decoded.indexOf('..') !== -1) { const e = new Error('Rujukan fail tidak sah'); e.status = 400; throw e; }
  const [type, name] = parts;
  if (TYPE_DIRS.indexOf(type) === -1) { const e = new Error('Jenis export tidak sah'); e.status = 400; throw e; }
  const target = path.join(base, type, name);
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) { const e = new Error('Laluan di luar julat'); e.status = 400; throw e; }
  try { await fsp.unlink(target); }
  catch (e) { if (e.code === 'ENOENT') { const err = new Error('Fail tidak dijumpai'); err.status = 404; throw err; } throw e; }
  return { ok: true, deleted: type + '/' + name };
}

module.exports = {
  EXPORTS_ROOT,
  ensureRootSync,
  exportHtml, exportPdf, exportZip, exportJson, exportMarkdown, exportPrompts,
  listExports, deleteExport,
  // didedah untuk ujian
  _normOpts: normOpts, _localImagePath: localImagePath
};
