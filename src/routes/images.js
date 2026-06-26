'use strict';

// ===========================================================================
// routes/images.js — Fasa 8: Local Image Workflow
//
//   GET    /api/projects/:id/images          — semua panel + gambar (atau null) + ringkasan
//   GET    /api/panels/:id/image             — gambar bagi satu panel
//   POST   /api/panels/:id/image/upload      — muat naik gambar (multipart, medan 'image')
//   POST   /api/projects/:id/images/import-local — imbas folder & link ikut panel-{id}.{ext}
//   PUT    /api/images/:id                   — kemas kini status / notes
//   DELETE /api/images/:id                   — padam rekod + fail
//
// Local-first, RM0: tiada penjanaan imej, tiada API AI/berbayar. Hanya path
// disimpan dalam DB; binari di cakera (uploads/images/...).
// ===========================================================================

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const multer = require('multer');

const pool = require('../db/pool');
const { PROJECT_STATUS } = require('../config/projectStatus');
const svc = require('../services/imageAssetService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: svc.MAX_BYTES, files: 1 },
  fileFilter: function (req, file, cb) {
    if (svc.ALLOWED_MIME.indexOf(file.mimetype) === -1) {
      const e = new Error('Jenis fail tidak disokong (png/jpeg/webp sahaja)');
      e.code = 'BAD_MIME';
      return cb(e);
    }
    cb(null, true);
  }
});

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const QUALIFYING = ['uploaded', 'linked', 'approved'];
const VALID_STATUS = ['draft', 'uploaded', 'linked', 'approved', 'rejected'];

function assetView(a) {
  if (!a) return null;
  return {
    id: a.id,
    project_id: a.project_id,
    scene_id: a.scene_id,
    panel_id: a.panel_id,
    prompt_id: a.prompt_id,
    image_filename: a.image_filename,
    image_path: a.image_path,
    url: a.image_path ? svc.publicUrl(a.image_path) : null,
    source_type: a.source_type,
    provider: a.provider,
    status: a.status,
    width: a.width,
    height: a.height,
    file_size: a.file_size,
    mime_type: a.mime_type,
    notes: a.notes,
    created_at: a.created_at,
    updated_at: a.updated_at
  };
}

// Selaras status projek mengikut liputan gambar.
//   Naik   : semua panel ada gambar (uploaded/linked/approved) → image_ready.
//   Surut  : jika tidak lengkap & status semasa image_ready → prompt_ready
//            (atau peringkat terdekat yang masih sah).
async function syncImageStatus(projectId) {
  const pr = await pool.query('SELECT status FROM projects WHERE id = $1', [projectId]);
  if (pr.rows.length === 0) return null;
  const cur = pr.rows[0].status;

  const pc = (await pool.query('SELECT count(*)::int AS n FROM panels WHERE project_id = $1', [projectId])).rows[0].n;
  const covered = (await pool.query(
    'SELECT count(DISTINCT panel_id)::int AS n FROM image_assets WHERE project_id = $1 AND status = ANY($2)',
    [projectId, QUALIFYING]
  )).rows[0].n;

  const promoteFrom = [
    PROJECT_STATUS.DRAFT, PROJECT_STATUS.TEXT_READY, PROJECT_STATUS.CHARACTER_READY,
    PROJECT_STATUS.SCENE_READY, PROJECT_STATUS.STORYBOARD_READY, PROJECT_STATUS.PANEL_READY,
    PROJECT_STATUS.SCRIPT_READY, PROJECT_STATUS.VISUAL_READY, PROJECT_STATUS.PROMPT_READY
  ];

  let next = null;
  const fully = pc >= 1 && covered === pc;

  if (fully && promoteFrom.indexOf(cur) !== -1) {
    next = PROJECT_STATUS.IMAGE_READY;
  } else if (!fully && cur === PROJECT_STATUS.IMAGE_READY) {
    const hasPrompt = (await pool.query('SELECT 1 FROM image_prompts WHERE project_id = $1 LIMIT 1', [projectId])).rows.length > 0;
    const hasVisual = (await pool.query('SELECT 1 FROM visuals WHERE project_id = $1 LIMIT 1', [projectId])).rows.length > 0;
    const hasScript = (await pool.query('SELECT 1 FROM scripts WHERE project_id = $1 LIMIT 1', [projectId])).rows.length > 0;
    if (hasPrompt) next = PROJECT_STATUS.PROMPT_READY;
    else if (hasVisual) next = PROJECT_STATUS.VISUAL_READY;
    else if (hasScript) next = PROJECT_STATUS.SCRIPT_READY;
    else if (pc >= 1) next = PROJECT_STATUS.PANEL_READY;
    else next = PROJECT_STATUS.DRAFT;
  }

  if (next && next !== cur) {
    await pool.query('UPDATE projects SET status = $1 WHERE id = $2', [next, projectId]);
    return next;
  }
  return cur;
}

// Upsert satu rekod gambar (UNIQUE panel_id → replace, bukan duplicate).
async function upsertAsset(fields) {
  const sql =
    'INSERT INTO image_assets ' +
    '(project_id, scene_id, panel_id, prompt_id, image_filename, image_path, thumbnail_path, ' +
    ' source_type, provider, status, width, height, file_size, mime_type) ' +
    'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ' +
    'ON CONFLICT (panel_id) DO UPDATE SET ' +
    ' scene_id = EXCLUDED.scene_id, prompt_id = EXCLUDED.prompt_id, ' +
    ' image_filename = EXCLUDED.image_filename, image_path = EXCLUDED.image_path, ' +
    ' thumbnail_path = EXCLUDED.thumbnail_path, source_type = EXCLUDED.source_type, ' +
    ' provider = EXCLUDED.provider, status = EXCLUDED.status, width = EXCLUDED.width, ' +
    ' height = EXCLUDED.height, file_size = EXCLUDED.file_size, mime_type = EXCLUDED.mime_type ' +
    'RETURNING *';
  const r = await pool.query(sql, [
    fields.project_id, fields.scene_id, fields.panel_id, fields.prompt_id,
    fields.image_filename, fields.image_path, fields.thumbnail_path,
    fields.source_type, fields.provider, fields.status,
    fields.width, fields.height, fields.file_size, fields.mime_type
  ]);
  return r.rows[0];
}

async function loadPanelMeta(panelId) {
  const r = await pool.query(
    'SELECT p.id, p.project_id, p.scene_id, p.panel_no FROM panels p WHERE p.id = $1', [panelId]
  );
  return r.rows[0] || null;
}
async function promptIdForPanel(panelId) {
  const r = await pool.query('SELECT id FROM image_prompts WHERE panel_id = $1', [panelId]);
  return r.rows.length ? r.rows[0].id : null;
}

// ---------------------------------------------------------------------------
// GET /api/projects/:id/images — semua panel + gambar/null + ringkasan
// ---------------------------------------------------------------------------
router.get('/projects/:id/images', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });
  try {
    const proj = await pool.query('SELECT id, title_ar, title_ms, status FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });

    const scenes = await pool.query('SELECT id, scene_no, title_ms FROM scenes WHERE project_id = $1', [id]);
    const sceneMap = {};
    scenes.rows.forEach(function (s) { sceneMap[String(s.id)] = s; });

    const panels = await pool.query(
      'SELECT p.id, p.scene_id, p.panel_no, p.panel_order, p.panel_type ' +
      'FROM panels p LEFT JOIN scenes s ON s.id = p.scene_id WHERE p.project_id = $1 ' +
      'ORDER BY s.scene_no ASC NULLS LAST, p.panel_order ASC NULLS LAST, p.panel_no ASC, p.id ASC',
      [id]
    );

    const prompts = await pool.query('SELECT panel_id, status FROM image_prompts WHERE project_id = $1', [id]);
    const promptMap = {};
    prompts.rows.forEach(function (p) { promptMap[String(p.panel_id)] = p.status; });

    const assets = await pool.query('SELECT * FROM image_assets WHERE project_id = $1', [id]);
    const assetMap = {};
    assets.rows.forEach(function (a) { assetMap[String(a.panel_id)] = a; });

    let linked = 0, approved = 0, rejected = 0, uploaded = 0, missing = 0;
    const items = panels.rows.map(function (p) {
      const a = assetMap[String(p.id)] || null;
      if (a) {
        if (a.status === 'approved') approved++;
        else if (a.status === 'rejected') rejected++;
        else if (a.status === 'uploaded') uploaded++;
        else if (a.status === 'linked') linked++;
      }
      const qualifies = a && QUALIFYING.indexOf(a.status) !== -1;
      if (!qualifies) missing++;
      const scene = sceneMap[String(p.scene_id)] || {};
      return {
        panel_id: p.id,
        scene_no: scene.scene_no || null,
        scene_title: scene.title_ms || '',
        panel_no: p.panel_no,
        panel_type: p.panel_type,
        has_prompt: promptMap[String(p.id)] !== undefined,
        prompt_status: promptMap[String(p.id)] || null,
        expected_filename: svc.panelFilename(p.id, 'png'),
        image: assetView(a)
      };
    });

    const summary = {
      total_panels: panels.rows.length,
      images_linked: linked + uploaded + approved, // panel yang ada gambar "aktif"
      uploaded: uploaded,
      linked: linked,
      approved: approved,
      rejected: rejected,
      missing: missing,
      upload_folder: 'uploads/images/project-' + id + '/'
    };

    res.json({ ok: true, project: proj.rows[0], summary: summary, items: items });
  } catch (err) {
    console.error('[images] list:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memuatkan senarai gambar' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/panels/:id/image
// ---------------------------------------------------------------------------
router.get('/panels/:id/image', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID panel tidak sah' });
  try {
    const meta = await loadPanelMeta(id);
    if (!meta) return res.status(404).json({ ok: false, error: 'Panel tidak dijumpai' });
    const r = await pool.query('SELECT * FROM image_assets WHERE panel_id = $1', [id]);
    res.json({ ok: true, image: r.rows.length ? assetView(r.rows[0]) : null });
  } catch (err) {
    console.error('[images] panel get:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memuatkan gambar panel' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/panels/:id/image/upload  (multipart, medan 'image')
// ---------------------------------------------------------------------------
router.post('/panels/:id/image/upload', function (req, res) {
  upload.single('image')(req, res, async function (mErr) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: 'ID panel tidak sah' });

    if (mErr) {
      if (mErr.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ ok: false, error: 'Saiz fail melebihi 10MB' });
      if (mErr.code === 'BAD_MIME') return res.status(415).json({ ok: false, error: mErr.message });
      return res.status(400).json({ ok: false, error: 'Muat naik gagal: ' + mErr.message });
    }
    if (!req.file || !req.file.buffer) return res.status(400).json({ ok: false, error: 'Tiada fail diterima (medan: image)' });

    try {
      const meta = await loadPanelMeta(id);
      if (!meta) return res.status(404).json({ ok: false, error: 'Panel tidak dijumpai' });

      const ext = svc.extFromMime(req.file.mimetype);
      if (!ext) return res.status(415).json({ ok: false, error: 'Jenis fail tidak disokong' });

      const dir = svc.projectDir(meta.project_id);
      await svc.ensureDir(dir);
      const filename = svc.panelFilename(id, ext);
      const absPath = path.join(dir, filename);
      if (!svc.isInsideImages(absPath)) return res.status(400).json({ ok: false, error: 'Path tidak sah' });

      await fsp.writeFile(absPath, req.file.buffer);
      // Buang fail lama panel ini yang berlainan ext (elak dua fail).
      await svc.removeExistingPanelFiles(meta.project_id, id, ext);

      const dim = svc.readImageSize(req.file.buffer, req.file.mimetype);
      const promptId = await promptIdForPanel(id);

      const row = await upsertAsset({
        project_id: meta.project_id,
        scene_id: meta.scene_id,
        panel_id: id,
        prompt_id: promptId,
        image_filename: filename,
        image_path: svc.relPath(meta.project_id, filename),
        thumbnail_path: null,
        source_type: 'manual_upload',
        provider: 'manual',
        status: 'uploaded',
        width: dim.width,
        height: dim.height,
        file_size: req.file.size != null ? req.file.size : req.file.buffer.length,
        mime_type: req.file.mimetype
      });

      const status = await syncImageStatus(meta.project_id);
      res.status(201).json({ ok: true, image: assetView(row), project_status: status });
    } catch (err) {
      console.error('[images] upload:', err.message);
      res.status(500).json({ ok: false, error: 'Gagal menyimpan gambar' });
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/images/import-local
// ---------------------------------------------------------------------------
router.post('/projects/:id/images/import-local', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });
  try {
    const proj = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });

    const panels = await pool.query('SELECT id, scene_id FROM panels WHERE project_id = $1', [id]);
    const panelMap = {};
    panels.rows.forEach(function (p) { panelMap[String(p.id)] = p; });

    const found = await svc.scanProjectFolder(id);
    let linked = 0, skipped = 0;
    const errors = [];

    for (const f of found) {
      const panel = panelMap[String(f.panelId)];
      if (!panel) { skipped++; continue; } // panel tidak wujud dalam projek ini
      try {
        const absPath = path.join(svc.projectDir(id), f.filename);
        const buf = await fsp.readFile(absPath);
        const mime = f.ext === 'png' ? 'image/png' : (f.ext === 'webp' ? 'image/webp' : 'image/jpeg');
        const dim = svc.readImageSize(buf, mime);
        const promptId = await promptIdForPanel(f.panelId);
        await upsertAsset({
          project_id: id,
          scene_id: panel.scene_id,
          panel_id: f.panelId,
          prompt_id: promptId,
          image_filename: f.filename,
          image_path: svc.relPath(id, f.filename),
          thumbnail_path: null,
          source_type: 'local_import',
          provider: 'unknown',
          status: 'linked',
          width: dim.width,
          height: dim.height,
          file_size: buf.length,
          mime_type: mime
        });
        linked++;
      } catch (e) {
        errors.push({ filename: f.filename, error: e.message });
      }
    }

    const status = await syncImageStatus(id);
    res.json({ ok: true, linked: linked, skipped: skipped, errors: errors, project_status: status });
  } catch (err) {
    console.error('[images] import-local:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal import gambar local' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/images/:id — kemas kini status / notes
// ---------------------------------------------------------------------------
router.put('/images/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID gambar tidak sah' });
  const body = req.body || {};
  const sets = [];
  const vals = [];
  let i = 1;

  if (body.status !== undefined) {
    if (VALID_STATUS.indexOf(body.status) === -1) return res.status(400).json({ ok: false, error: 'Status tidak sah' });
    sets.push('status = $' + (i++)); vals.push(body.status);
  }
  if (body.notes !== undefined) {
    sets.push('notes = $' + (i++)); vals.push(String(body.notes));
  }
  if (sets.length === 0) return res.status(400).json({ ok: false, error: 'Tiada perubahan diberi' });

  try {
    vals.push(id);
    const r = await pool.query('UPDATE image_assets SET ' + sets.join(', ') + ' WHERE id = $' + i + ' RETURNING *', vals);
    if (r.rows.length === 0) return res.status(404).json({ ok: false, error: 'Gambar tidak dijumpai' });
    const status = await syncImageStatus(r.rows[0].project_id);
    res.json({ ok: true, image: assetView(r.rows[0]), project_status: status });
  } catch (err) {
    console.error('[images] update:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mengemas kini gambar' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/images/:id — padam rekod + fail
// ---------------------------------------------------------------------------
router.delete('/images/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID gambar tidak sah' });
  try {
    const r = await pool.query('SELECT * FROM image_assets WHERE id = $1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ ok: false, error: 'Gambar tidak dijumpai' });
    const a = r.rows[0];

    // Buang SEMUA fail panel-{id}.* (termasuk sebarang ext yatim), dalam folder projek.
    if (svc.isInsideImages(svc.projectDir(a.project_id))) {
      try { await svc.removeExistingPanelFiles(a.project_id, a.panel_id, null); } catch (e) { /* abai */ }
    }
    // Jaga-jaga: jika image_path menunjuk lokasi lain, cuba buang juga.
    if (a.image_path) {
      const abs = svc.absFromRel(a.image_path);
      if (svc.isInsideImages(abs)) { try { await fsp.unlink(abs); } catch (e) { /* fail mungkin sudah tiada */ } }
    }
    await pool.query('DELETE FROM image_assets WHERE id = $1', [id]);
    const status = await syncImageStatus(a.project_id);
    res.json({ ok: true, deleted: true, project_status: status });
  } catch (err) {
    console.error('[images] delete:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memadam gambar' });
  }
});

module.exports = router;
