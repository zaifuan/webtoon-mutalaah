'use strict';

// ===========================================================================
// imageAssetService.js — Fasa 8: Local Image Workflow (helper storan fail)
//
// Storan local-first. Fail disimpan di:
//   uploads/images/project-{projectId}/panel-{panelId}.{ext}
// Database hanya menyimpan path relatif (images/project-1/panel-1.png).
// Tiada binari dalam DB. Tiada API berbayar. Tiada penjanaan imej.
// ===========================================================================

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

// /app/uploads  (src/services -> ../../ = root projek)
const UPLOAD_ROOT = path.resolve(__dirname, '..', '..', 'uploads');
const IMAGES_DIR = path.join(UPLOAD_ROOT, 'images');

const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const ALLOWED_MIME = Object.keys(MIME_EXT);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const FILE_RX = /^panel-(\d+)\.(png|jpe?g|webp)$/i;

function extFromMime(mime) { return MIME_EXT[mime] || null; }
function projectDir(projectId) { return path.join(IMAGES_DIR, 'project-' + Number(projectId)); }
function panelFilename(panelId, ext) { return 'panel-' + Number(panelId) + '.' + ext; }
function relPath(projectId, filename) { return 'images/project-' + Number(projectId) + '/' + filename; }
function publicUrl(imagePath) { return '/uploads/' + String(imagePath || '').replace(/^\/+/, ''); }

function ensureDir(dir) { return fsp.mkdir(dir, { recursive: true }); }
function ensureBaseDirSync() { try { fs.mkdirSync(IMAGES_DIR, { recursive: true }); } catch (e) { /* abai */ } }

// Pastikan path akhir kekal di dalam IMAGES_DIR (anti path-traversal).
function isInsideImages(absPath) {
  const rel = path.relative(IMAGES_DIR, absPath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function absFromRel(imagePath) {
  // imagePath: "images/project-1/panel-1.png" → /app/uploads/images/...
  const clean = String(imagePath || '').replace(/^\/+/, '');
  return path.join(UPLOAD_ROOT, clean);
}

// Buang fail panel sedia ada (apa-apa ext) — kecuali keepExt jika diberi.
async function removeExistingPanelFiles(projectId, panelId, keepExt) {
  const dir = projectDir(projectId);
  let files = [];
  try { files = await fsp.readdir(dir); } catch (e) { return; }
  const keepName = keepExt ? panelFilename(panelId, keepExt) : null;
  const prefix = 'panel-' + Number(panelId) + '.';
  for (const f of files) {
    if (f === keepName) continue;
    if (f.indexOf(prefix) === 0 && FILE_RX.test(f)) {
      try { await fsp.unlink(path.join(dir, f)); } catch (e) { /* abai */ }
    }
  }
}

// Imbas folder projek untuk fail panel-{id}.{ext}. Pulang SATU entri setiap
// panel (jika ada beberapa ext, utamakan png > jpg > jpeg > webp).
async function scanProjectFolder(projectId) {
  const dir = projectDir(projectId);
  let files = [];
  try { files = await fsp.readdir(dir); } catch (e) { return []; }
  const order = { png: 0, jpg: 1, jpeg: 2, webp: 3 };
  const byPanel = {};
  files.forEach(function (f) {
    const m = FILE_RX.exec(f);
    if (!m) return;
    const panelId = Number(m[1]);
    const ext = m[2].toLowerCase();
    const prev = byPanel[panelId];
    if (!prev || order[ext] < order[prev.ext]) byPanel[panelId] = { panelId: panelId, filename: f, ext: ext };
  });
  return Object.keys(byPanel).map(function (k) { return byPanel[k]; });
}

async function fileSize(absPath) {
  try { const st = await fsp.stat(absPath); return st.size; } catch (e) { return null; }
}

// ---- Pembaca dimensi (best-effort, tanpa dependency) ----------------------
function sizeFromPng(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  return null;
}
function sizeFromJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xFF) { off++; continue; }
    const marker = buf[off + 1];
    // SOF0..SOF15 (kecuali DHT=C4, JPG=C8, DAC=CC)
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
    }
    const segLen = buf.readUInt16BE(off + 2);
    if (segLen < 2) break;
    off += 2 + segLen;
  }
  return null;
}
function sizeFromWebp(buf) {
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fourcc = buf.toString('ascii', 12, 16);
  try {
    if (fourcc === 'VP8X') {
      const w = ((buf[24]) | (buf[25] << 8) | (buf[26] << 16)) + 1;
      const h = ((buf[27]) | (buf[28] << 8) | (buf[29] << 16)) + 1;
      return { width: w, height: h };
    }
    if (fourcc === 'VP8 ') {
      // frame tag 3 bait di 20..22, kemudian start code 9d 01 2a di 23..25, dimensi di 26..29
      if (buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
        const w = buf.readUInt16LE(26) & 0x3fff;
        const h = buf.readUInt16LE(28) & 0x3fff;
        return { width: w, height: h };
      }
    }
  } catch (e) { /* abai */ }
  return null; // VP8L dilangkau
}
function readImageSize(buf, mime) {
  try {
    let s = null;
    if (mime === 'image/png') s = sizeFromPng(buf);
    else if (mime === 'image/jpeg') s = sizeFromJpeg(buf);
    else if (mime === 'image/webp') s = sizeFromWebp(buf);
    else s = sizeFromPng(buf) || sizeFromJpeg(buf) || sizeFromWebp(buf);
    if (s && s.width > 0 && s.height > 0) return s;
  } catch (e) { /* abai */ }
  return { width: null, height: null };
}

module.exports = {
  UPLOAD_ROOT,
  IMAGES_DIR,
  MIME_EXT,
  ALLOWED_MIME,
  MAX_BYTES,
  FILE_RX,
  extFromMime,
  projectDir,
  panelFilename,
  relPath,
  publicUrl,
  ensureDir,
  ensureBaseDirSync,
  isInsideImages,
  absFromRel,
  removeExistingPanelFiles,
  scanProjectFolder,
  fileSize,
  readImageSize
};
