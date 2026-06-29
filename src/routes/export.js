'use strict';

// ===========================================================================
// src/routes/export.js — Fasa 16: Export Studio (READ ONLY)
//
//   POST /api/projects/:id/export/html
//   POST /api/projects/:id/export/pdf
//   POST /api/projects/:id/export/zip
//   POST /api/projects/:id/export/json
//   POST /api/projects/:id/export/markdown
//   POST /api/projects/:id/export/prompts
//   GET  /api/projects/:id/exports
//   DELETE /api/projects/:id/exports/:file   (:file = encodeURIComponent('type/namafail'))
//
// Semua endpoint hanya MEMBACA data (melalui Preview API) dan menulis fail ke
// folder exports/. Tiada perubahan DB/AI/job. Body POST = opsyen export.
// ===========================================================================

const express = require('express');
const router = express.Router();
const svc = require('../services/exportService');

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function makeExportHandler(fnName) {
  return async function (req, res) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });
    const options = (req.body && typeof req.body === 'object') ? req.body : {};
    try {
      const info = await svc[fnName](id, options);
      return res.json({ ok: true, export: info });
    } catch (e) {
      const status = e && e.status ? e.status : 500;
      return res.status(status).json({ ok: false, error: e && e.message ? e.message : 'Export gagal' });
    }
  };
}

router.post('/projects/:id/export/html', makeExportHandler('exportHtml'));
router.post('/projects/:id/export/pdf', makeExportHandler('exportPdf'));
router.post('/projects/:id/export/zip', makeExportHandler('exportZip'));
router.post('/projects/:id/export/json', makeExportHandler('exportJson'));
router.post('/projects/:id/export/markdown', makeExportHandler('exportMarkdown'));
router.post('/projects/:id/export/prompts', makeExportHandler('exportPrompts'));

router.get('/projects/:id/exports', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });
  try {
    const items = await svc.listExports(id);
    return res.json({ ok: true, exports: items, count: items.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : 'Gagal menyenaraikan export' });
  }
});

router.delete('/projects/:id/exports/:file', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });
  try {
    const result = await svc.deleteExport(id, req.params.file);
    return res.json({ ok: true, deleted: result.deleted });
  } catch (e) {
    const status = e && e.status ? e.status : 500;
    return res.status(status).json({ ok: false, error: e && e.message ? e.message : 'Gagal memadam fail' });
  }
});

module.exports = router;
