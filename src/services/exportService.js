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
  if (opts.includeMetadata) payload.metadata = { exported_at: new Date().toISOString(), options: opts, source: 'preview-api' };

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
    if (opts.includeMetadata) archive.append(JSON.stringify({ project: data.project, summary: data.summary, options: opts, exported_at: new Date().toISOString(), source: 'preview-api' }, null, 2), { name: 'metadata.json' });
    addImages(archive, data, opts, '');
  });
  return fileInfo(projectId, 'zip', filename);
}

// ====================== EXPORT: HTML (tapak offline) ======================
function readerCss() {
  return [
    ':root{color-scheme:dark}',
    '*{box-sizing:border-box}',
    'body{margin:0;background:#0f1115;color:#e6e6e6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.5}',
    'header.top{position:sticky;top:0;background:#15181d;border-bottom:1px solid #2a2f37;padding:12px 16px;z-index:5}',
    'header.top h1{margin:0;font-size:1.1rem}',
    'header.top .sub{color:#8a92a0;font-size:.8rem;margin-top:2px}',
    '.wrap{max-width:760px;margin:0 auto;padding:16px}',
    '.chapter-head{background:#1f6f67;color:#fff;border-radius:10px;padding:10px 14px;margin:22px 0 12px;font-weight:700}',
    '.panel{background:#1c1f24;border:1px solid #2a2f37;border-radius:12px;overflow:hidden;margin-bottom:16px}',
    '.imgwrap{background:#0c0e11;text-align:center}',
    '.imgwrap img{display:block;max-width:100%;height:auto;margin:0 auto}',
    '.noimg{padding:48px 12px;color:#6a727d;font-weight:700;letter-spacing:.08em;text-align:center}',
    '.metas{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border-bottom:1px solid #2a2f37}',
    '.meta{font-size:.72rem;background:#23272d;border:1px solid #2a2f37;border-radius:10px;padding:1px 8px;color:#aeb4bd}',
    '.caption{padding:8px 12px;font-size:.9rem}',
    '.dialogue,.narration{padding:6px 12px}',
    '.narration{background:#1a1d22;font-style:italic;color:#c7ccd3}',
    '.line{margin:4px 0}',
    '.speaker{font-weight:700;color:#5fd0c4;margin-right:6px}',
    '.ar{direction:rtl;text-align:right;opacity:.85}',
    '.tag{font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:#8a92a0;border:1px solid #2a2f37;border-radius:8px;padding:0 6px;margin-right:6px}',
    '.prompt{padding:8px 12px;border-top:1px solid #2a2f37;background:rgba(95,208,196,.06);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.74rem;color:#c7ccd3}',
    '#top{position:fixed;right:16px;bottom:16px;background:#1f6f67;color:#fff;border:none;border-radius:20px;padding:8px 14px;cursor:pointer;opacity:.85}'
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
  const out = [];
  out.push('<!DOCTYPE html><html lang="ms"><head><meta charset="utf-8">');
  out.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
  out.push('<title>' + esc(data.project.title_ms || ('Projek ' + projectId)) + ' — Webtoon</title>');
  out.push('<link rel="stylesheet" href="assets/css/reader.css"></head><body>');
  out.push('<header class="top"><h1>' + esc(data.project.title_ms || ('Projek ' + projectId)) + '</h1>');
  out.push('<div class="sub">' + data.summary.chapters + ' bab · ' + data.summary.panels + ' panel · ' + data.summary.with_image + ' berimej · export offline</div></header>');
  out.push('<div class="wrap">');

  (data.chapters || []).forEach(function (c) {
    out.push('<div class="chapter-head">Bab ' + esc(c.scene.scene_no != null ? c.scene.scene_no : '?') + (c.scene.title_ms ? ' — ' + esc(c.scene.title_ms) : '') + '</div>');
    (c.panels || []).forEach(function (p) {
      out.push('<div class="panel">');
      if (opts.includeImages) {
        if (p.image && p.image.url) out.push('<div class="imgwrap"><img loading="lazy" alt="Panel ' + esc(p.panel_no) + '" src="images/panel-' + p.id + imgExt(p.image.url) + '"></div>');
        else out.push('<div class="imgwrap"><div class="noimg">No Image</div></div>');
      }
      const metas = ['<span class="meta">Bab: ' + esc(c.scene.scene_no != null ? c.scene.scene_no : '?') + '</span>', '<span class="meta">Panel: ' + esc(p.panel_no) + '</span>'];
      if (p.shot) metas.push('<span class="meta">Shot: ' + esc(p.shot) + '</span>');
      if (p.mood) metas.push('<span class="meta">Mood: ' + esc(p.mood) + '</span>');
      if (p.characters && p.characters.length) metas.push('<span class="meta">Watak: ' + esc(p.characters.join(', ')) + '</span>');
      out.push('<div class="metas">' + metas.join('') + '</div>');
      if (p.caption_ms) out.push('<div class="caption"><span class="tag">Caption</span>' + esc(p.caption_ms) + '</div>');
      if (p.dialogue && p.dialogue.length) {
        out.push('<div class="dialogue">');
        p.dialogue.forEach(function (d) {
          out.push('<div class="line"><span class="speaker">' + esc((d.speaker_name || '???') + ':') + '</span>' + esc(d.text_ms || '') + (d.text_ar ? '<div class="ar">' + esc(d.text_ar) + '</div>' : '') + '</div>');
        });
        out.push('</div>');
      }
      if (p.narration && p.narration.length) {
        out.push('<div class="narration">');
        p.narration.forEach(function (n) {
          out.push('<div class="line"><span class="tag">Narasi</span>' + esc(n.text_ms || '') + (n.text_ar ? '<div class="ar">' + esc(n.text_ar) + '</div>' : '') + '</div>');
        });
        out.push('</div>');
      }
      if (opts.includePrompt && p.prompt && p.prompt.prompt_text) {
        out.push('<div class="prompt"><span class="tag">Prompt</span>' + esc(p.prompt.prompt_text) + (p.prompt.negative_prompt ? '<br>Negatif: ' + esc(p.prompt.negative_prompt) : '') + '</div>');
      }
      out.push('</div>');
    });
  });

  out.push('</div><button id="top" type="button">↑ Atas</button>');
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

  await new Promise(function (resolve, reject) {
    const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: false });
    const stream = fs.createWriteStream(abs);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);

    const contentW = doc.page ? 0 : 0; // placeholder
    doc.addPage();
    const fullW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.fontSize(22).fillColor('#111').text(data.project.title_ms || ('Projek ' + projectId), { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#666').text(data.summary.chapters + ' bab · ' + data.summary.panels + ' panel · ' + data.summary.with_image + ' berimej', { align: 'center' });
    doc.fontSize(8).fillColor('#999').text('Nota: teks Arab dipaparkan dalam export HTML/JSON; PDF memaparkan teks Melayu.', { align: 'center' });

    (data.chapters || []).forEach(function (c) {
      doc.addPage();
      doc.fontSize(16).fillColor('#1f6f67').text('Bab ' + (c.scene.scene_no != null ? c.scene.scene_no : '?') + (c.scene.title_ms ? ' — ' + c.scene.title_ms : ''));
      doc.moveDown(0.4);
      (c.panels || []).forEach(function (p) {
        pdfEnsure(doc, 40);
        doc.fontSize(11).fillColor('#000').text('Panel ' + p.panel_no +
          (p.shot ? '   ·   Shot: ' + p.shot : '') + (p.mood ? '   ·   Mood: ' + p.mood : ''));
        if (p.characters && p.characters.length) doc.fontSize(9).fillColor('#555').text('Watak: ' + p.characters.join(', '));
        doc.moveDown(0.2);

        if (opts.includeImages) {
          const ip = (p.image && p.image.url) ? localImagePath(p.image.url) : null;
          if (ip && fs.existsSync(ip)) {
            pdfEnsure(doc, 320);
            const y0 = doc.y;
            try { doc.image(ip, doc.page.margins.left, y0, { fit: [fullW, 300], align: 'center' }); doc.y = y0 + 308; }
            catch (e) { doc.fontSize(9).fillColor('#999').text('[Imej tidak dapat dimuat]'); }
          } else {
            pdfEnsure(doc, 70);
            const y0 = doc.y;
            doc.rect(doc.page.margins.left, y0, fullW, 56).stroke('#cccccc');
            doc.fontSize(11).fillColor('#999999').text('No Image', doc.page.margins.left, y0 + 20, { width: fullW, align: 'center' });
            doc.y = y0 + 64; doc.x = doc.page.margins.left;
          }
        }

        if (p.caption_ms) { pdfEnsure(doc, 20); doc.fontSize(10).fillColor('#333').text('Caption: ' + p.caption_ms); }
        (p.dialogue || []).forEach(function (d) { pdfEnsure(doc, 16); doc.fontSize(10).fillColor('#000').text((d.speaker_name || '???') + ': ' + (d.text_ms || '')); });
        (p.narration || []).forEach(function (n) { pdfEnsure(doc, 16); doc.fontSize(10).fillColor('#555').text('Narasi: ' + (n.text_ms || ''), { oblique: true }); });
        if (opts.includePrompt && p.prompt && p.prompt.prompt_text) { pdfEnsure(doc, 16); doc.fontSize(8).fillColor('#888').text('Prompt: ' + p.prompt.prompt_text); }
        if (opts.includeReview && p.review && p.review.qa_status) { doc.fontSize(8).fillColor('#aaa').text('QA: ' + p.review.qa_status); }
        doc.moveDown(0.6);
      });
    });

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
