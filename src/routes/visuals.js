'use strict';

const express = require('express');
const router = express.Router();

const pool = require('../db/pool');
const { PROJECT_STATUS } = require('../config/projectStatus');
const { VISUAL_ENUM_FIELDS, LAYOUT_ENUM_FIELDS, isValid } = require('../config/visualDirector');
const { extractVisual, NOBLE_VISUAL_NOTE } = require('../services/visualEngine');
const { resolveScript } = require('../services/scriptSource');
const ai = require('../ai/adapter'); // Fasa 20: Visual Director (Claude-first, fallback deterministik)

const VISUAL_COLUMNS =
  'id, project_id, scene_id, panel_id, camera, shot, angle, lens, composition, ' +
  'camera_movement, characters_layout, location, weather, time_of_day, lighting, ' +
  'atmosphere, foreground_object, background_object, color_palette, detail_level, ' +
  'depth, focus, visual_priority, face_policy, visual_notes, sensitive_object, ' +
  'status, created_at, updated_at';
const PROJECT_COLUMNS =
  'id, title_ar, title_ms, description, status, created_at, updated_at';

// Lajur panel yang diperlukan oleh enjin visual + skrip.
const PANEL_SELECT = 'id, project_id, scene_id, panel_no, panel_order, panel_type, ' +
  'shot_type, camera, composition, location, mood, emotion_ms, visual_notes, ' +
  'visual_ms, action_ms, dialogue_ms, caption_ms, characters_json';

const INSERT_HEAD =
  `INSERT INTO visuals
     (project_id, scene_id, panel_id, camera, shot, angle, lens, composition,
      camera_movement, characters_layout, location, weather, time_of_day, lighting,
      atmosphere, foreground_object, background_object, color_palette, detail_level,
      depth, focus, visual_priority, face_policy, visual_notes, sensitive_object, status)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,'active')`;

// --- helper ---------------------------------------------------------------
function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}
function clean(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}
function jget(v) {
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } }
  return v;
}

function visualParams(v) {
  return [
    v.project_id, v.scene_id, v.panel_id, v.camera, v.shot, v.angle, v.lens, v.composition,
    v.camera_movement, JSON.stringify(Array.isArray(v.characters_layout) ? v.characters_layout : []),
    v.location, v.weather, v.time_of_day, v.lighting, v.atmosphere, v.foreground_object,
    v.background_object, v.color_palette, v.detail_level, v.depth, v.focus, v.visual_priority,
    v.face_policy, v.visual_notes, v.sensitive_object
  ];
}

// Sahkan medan enum peringkat visual; pulang nama medan yang gagal atau null.
function badEnumField(body) {
  for (var i = 0; i < VISUAL_ENUM_FIELDS.length; i++) {
    var f = VISUAL_ENUM_FIELDS[i];
    if (body[f] !== undefined && body[f] !== null && body[f] !== '') {
      if (!isValid(f, String(body[f]))) return f;
    }
  }
  return null;
}

// Sahkan characters_layout (array objek; medan enum dalamannya sah).
function checkLayout(layout) {
  if (!Array.isArray(layout)) return { error: 'characters_layout mesti array' };
  for (var i = 0; i < layout.length; i++) {
    var item = layout[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { error: 'characters_layout mesti array objek' };
    }
    for (var j = 0; j < LAYOUT_ENUM_FIELDS.length; j++) {
      var f = LAYOUT_ENUM_FIELDS[j];
      if (item[f] !== undefined && item[f] !== null && item[f] !== '' && !isValid(f, String(item[f]))) {
        return { error: f + ' (dalam characters_layout) tidak sah' };
      }
    }
  }
  return { value: layout };
}

async function buildCharMap(client, projectId) {
  const r = await client.query(
    'SELECT character_code, character_type, face_policy, visual_dna FROM characters WHERE project_id = $1',
    [projectId]
  );
  const map = {};
  r.rows.forEach(function (row) {
    map[row.character_code] = {
      character_type: row.character_type,
      face_policy: row.face_policy,
      visual_dna: jget(row.visual_dna) || {}
    };
  });
  return map;
}

async function nobleCodeSet(client, projectId) {
  const r = await client.query(
    "SELECT character_code FROM characters WHERE project_id = $1 " +
    "AND (character_type = 'noble_figure_no_face' OR face_policy = 'glowing_light')",
    [projectId]
  );
  const set = new Set();
  r.rows.forEach(function (x) { if (x.character_code) set.add(x.character_code); });
  return set;
}

function enforceFacePolicy(visualNotes, facePolicy, codes, nobleSet) {
  const has = (codes || []).some(function (c) { return nobleSet.has(c); });
  if (!has) return { face_policy: facePolicy || 'normal', visual_notes: visualNotes || null };
  let vn = visualNotes;
  if (!vn || vn.indexOf(NOBLE_VISUAL_NOTE) === -1) {
    vn = NOBLE_VISUAL_NOTE;
  }
  return { face_policy: 'glowing_light', visual_notes: vn };
}

// Segerakkan status projek mengikut bilangan visual / panel / babak / watak / teks.
async function syncVisualStatus(client, projectId) {
  const vc = await client.query('SELECT count(*)::int AS n FROM visuals WHERE project_id = $1', [projectId]);
  const n = vc.rows[0].n;
  const pr = await client.query('SELECT status FROM projects WHERE id = $1', [projectId]);
  if (pr.rows.length === 0) return null;
  const cur = pr.rows[0].status;
  let next = cur;

  if (n >= 1) {
    if (cur === PROJECT_STATUS.DRAFT || cur === PROJECT_STATUS.TEXT_READY ||
        cur === PROJECT_STATUS.CHARACTER_READY || cur === PROJECT_STATUS.SCENE_READY ||
        cur === PROJECT_STATUS.PANEL_READY || cur === PROJECT_STATUS.SCRIPT_READY) {
      next = PROJECT_STATUS.VISUAL_READY;
    }
  } else if (cur === PROJECT_STATUS.VISUAL_READY) {
    // Pipeline: panel_ready -> script_ready -> visual_ready. Apabila semua
    // visual dipadam, surut ke script_ready jika skrip masih wujud, jika tidak
    // ke panel_ready (atau lebih awal mengikut data sedia ada).
    const scr = await client.query('SELECT count(*)::int AS n FROM scripts WHERE project_id = $1', [projectId]);
    const pc = await client.query('SELECT count(*)::int AS n FROM panels WHERE project_id = $1', [projectId]);
    const sc = await client.query('SELECT count(*)::int AS n FROM scenes WHERE project_id = $1', [projectId]);
    const ch = await client.query('SELECT count(*)::int AS n FROM characters WHERE project_id = $1', [projectId]);
    const tx = await client.query(
      "SELECT 1 FROM texts WHERE project_id = $1 AND original_ar IS NOT NULL AND length(btrim(original_ar)) > 0",
      [projectId]
    );
    if (scr.rows[0].n >= 1) next = PROJECT_STATUS.SCRIPT_READY;
    else if (pc.rows[0].n >= 1) next = PROJECT_STATUS.PANEL_READY;
    else if (sc.rows[0].n >= 1) next = PROJECT_STATUS.SCENE_READY;
    else if (ch.rows[0].n >= 1) next = PROJECT_STATUS.CHARACTER_READY;
    else if (tx.rows.length > 0) next = PROJECT_STATUS.TEXT_READY;
    else next = PROJECT_STATUS.DRAFT;
  }

  if (next !== cur) {
    const u = await client.query(
      `UPDATE projects SET status = $1 WHERE id = $2 RETURNING ${PROJECT_COLUMNS}`,
      [next, projectId]
    );
    return u.rows[0];
  }
  const cur2 = await client.query(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $1`, [projectId]);
  return cur2.rows[0];
}

function panelNorm(row) {
  return Object.assign({}, row, { characters_json: jget(row.characters_json) || [] });
}

// Jana visual bagi satu panel dalam transaksi sedia ada (idempotent).
// Fasa 20: gabung asas deterministik (pautan DB + susun atur watak + kuatkuasa
// tokoh mulia) dengan pilihan sinematografi Claude. Hanya medan kamera/cahaya/
// komposisi diganti; pautan & layout kekal daripada extractVisual yang terbukti.
function mergeVisualBase(panel, scene, script, charMap, cv) {
  const base = extractVisual(panel, scene || {}, script, charMap);
  const FIELDS = ['camera', 'shot', 'angle', 'lens', 'composition', 'camera_movement',
    'lighting', 'atmosphere', 'time_of_day', 'weather', 'color_palette',
    'detail_level', 'depth', 'focus', 'visual_priority'];
  FIELDS.forEach(function (f) { if (cv[f] != null && cv[f] !== '') base[f] = cv[f]; });
  if (cv.visual_notes) base.visual_notes = cv.visual_notes;
  if (cv.face_policy === 'glowing_light') base.face_policy = 'glowing_light'; // jangan longgar
  return base;
}

async function generateForPanel(client, panelRow, scene, charMap) {
  const panel = panelNorm(panelRow);
  const script = await resolveScript(client, panel, scene || {}, charMap);
  let v = null;
  try {
    console.log('[debug-visual] panel_id=' + panel.id + ' before ai call');
    const charsArr = Object.keys(charMap || {}).map(function (code) { return Object.assign({ character_code: code }, charMap[code]); });
    const r = await ai.generateVisual({ panel: panel, scene: scene || {}, script: script, characters: charsArr });
    console.log('[debug-visual] ai result success=' + (r && r.success) + ' error=' + (r && r.error ? r.error : '') + ' hasVisual=' + !!(r && r.visual && typeof r.visual === 'object'));
    if (r && r.success !== false && r.visual && typeof r.visual === 'object') {
      v = mergeVisualBase(panel, scene, script, charMap, r.visual);
      console.log('[debug-visual] template ready shot=' + (v && v.shot) + ' lighting=' + (v && v.lighting));
    } else {
      console.log('[debug-visual] raw preview=' + (r && r.raw_preview ? String(r.raw_preview).slice(0, 160) : '(none)'));
      console.log('[debug-visual] falling back deterministic reason=' + (!r ? 'ai-null' : (r.success === false ? ('ai-failed:' + (r.error || '?')) : 'no-visual-object')));
    }
  } catch (e) { console.error('[visuals] claude:', e && e.message ? e.message : e); console.log('[debug-visual] falling back deterministic reason=exception'); }
  if (!v) v = extractVisual(panel, scene || {}, script, charMap);
  const ins = await client.query(
    INSERT_HEAD + ' ON CONFLICT (panel_id) DO NOTHING RETURNING id',
    visualParams(v)
  );
  console.log('[debug-visual] insert created=' + (ins.rows.length > 0 ? 1 : 0));
  return ins.rows.length > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// GET /api/projects/:id/visuals — semua visual (scene_no asc, panel_order asc)
// ---------------------------------------------------------------------------
router.get('/projects/:id/visuals', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });
  try {
    const proj = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });

    const { rows } = await pool.query(
      `SELECT ${VISUAL_COLUMNS.split(', ').map(function (c) { return 'v.' + c; }).join(', ')}
         FROM visuals v
         LEFT JOIN panels p ON p.id = v.panel_id
         LEFT JOIN scenes s ON s.id = v.scene_id
        WHERE v.project_id = $1
        ORDER BY s.scene_no ASC NULLS LAST, p.panel_order ASC NULLS LAST, p.panel_no ASC, v.id ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[visuals] list project:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mendapatkan senarai visual' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/panels/:id/visual — visual bagi satu panel (null jika belum ada)
// ---------------------------------------------------------------------------
router.get('/panels/:id/visual', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID panel tidak sah' });
  try {
    const p = await pool.query('SELECT id FROM panels WHERE id = $1', [id]);
    if (p.rows.length === 0) return res.status(404).json({ ok: false, error: 'Panel tidak dijumpai' });

    const { rows } = await pool.query(`SELECT ${VISUAL_COLUMNS} FROM visuals WHERE panel_id = $1`, [id]);
    res.json(rows.length ? rows[0] : null);
  } catch (err) {
    console.error('[visuals] get panel:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mendapatkan visual panel' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/panels/:id/generate-visual — jana visual untuk satu panel
// ---------------------------------------------------------------------------
router.post('/panels/:id/generate-visual', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID panel tidak sah' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pr = await client.query(`SELECT ${PANEL_SELECT} FROM panels WHERE id = $1`, [id]);
    if (pr.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Panel tidak dijumpai' });
    }
    const panel = pr.rows[0];
    const sc = await client.query('SELECT id, location, mood, summary_ms, title_ar, scene_type FROM scenes WHERE id = $1', [panel.scene_id]);
    const scene = sc.rows[0] || {};
    const charMap = await buildCharMap(client, panel.project_id);

    const created = await generateForPanel(client, panel, scene, charMap);
    const project = await syncVisualStatus(client, panel.project_id);
    const cur = await client.query(`SELECT ${VISUAL_COLUMNS} FROM visuals WHERE panel_id = $1`, [id]);
    await client.query('COMMIT');
    res.json({ ok: true, panel_id: id, created: created, skipped: created ? 0 : 1, visual: cur.rows[0] || null, project: project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[visuals] generate panel:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menjana visual' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/generate-visuals — jana visual untuk semua panel
// ---------------------------------------------------------------------------
router.post('/projects/:id/generate-visuals', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID projek tidak sah' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const proj = await client.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Projek tidak dijumpai' });
    }
    const pls = await client.query(`SELECT ${PANEL_SELECT} FROM panels WHERE project_id = $1`, [id]);
    if (pls.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Sila jana panel dahulu sebelum jana visual.' });
    }

    // Peta babak (untuk persekitaran) & peta watak (untuk continuity/face policy).
    const scs = await client.query('SELECT id, location, mood, summary_ms, title_ar, scene_type FROM scenes WHERE project_id = $1', [id]);
    const sceneMap = {};
    scs.rows.forEach(function (s) { sceneMap[String(s.id)] = s; });
    const charMap = await buildCharMap(client, id);

    let created = 0, skipped = 0;
    for (var i = 0; i < pls.rows.length; i++) {
      var panel = pls.rows[i];
      var scene = sceneMap[String(panel.scene_id)] || {};
      var c = await generateForPanel(client, panel, scene, charMap);
      if (c) created++; else skipped++;
    }

    const project = await syncVisualStatus(client, id);
    const all = await client.query(
      `SELECT ${VISUAL_COLUMNS.split(', ').map(function (c) { return 'v.' + c; }).join(', ')}
         FROM visuals v LEFT JOIN panels p ON p.id = v.panel_id LEFT JOIN scenes s ON s.id = v.scene_id
        WHERE v.project_id = $1
        ORDER BY s.scene_no ASC NULLS LAST, p.panel_order ASC NULLS LAST, p.panel_no ASC`,
      [id]
    );
    await client.query('COMMIT');
    res.json({ ok: true, detected: pls.rows.length, created: created, skipped: skipped, visuals: all.rows, project: project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[visuals] generate project:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menjana visual' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /api/visuals/:id — edit visual
// ---------------------------------------------------------------------------
router.put('/visuals/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID visual tidak sah' });

  const b = req.body || {};
  const badEnum = badEnumField(b);
  if (badEnum) return res.status(400).json({ ok: false, error: badEnum + ' tidak sah' });

  let layout;
  if (b.characters_layout !== undefined) {
    const chk = checkLayout(b.characters_layout);
    if (chk.error) return res.status(400).json({ ok: false, error: chk.error });
    layout = chk.value;
  }

  try {
    const ex = await pool.query(`SELECT ${VISUAL_COLUMNS} FROM visuals WHERE id = $1`, [id]);
    if (ex.rows.length === 0) return res.status(404).json({ ok: false, error: 'Visual tidak dijumpai' });
    const cur = ex.rows[0];

    // Gabung nilai (hanya tukar yang dihantar).
    const merged = {
      project_id: cur.project_id, scene_id: cur.scene_id, panel_id: cur.panel_id,
      camera: b.camera !== undefined ? clean(b.camera) : cur.camera,
      shot: b.shot !== undefined ? clean(b.shot) : cur.shot,
      angle: b.angle !== undefined ? clean(b.angle) : cur.angle,
      lens: b.lens !== undefined ? clean(b.lens) : cur.lens,
      composition: b.composition !== undefined ? clean(b.composition) : cur.composition,
      camera_movement: b.camera_movement !== undefined ? clean(b.camera_movement) : cur.camera_movement,
      characters_layout: layout !== undefined ? layout : (jget(cur.characters_layout) || []),
      location: b.location !== undefined ? clean(b.location) : cur.location,
      weather: b.weather !== undefined ? clean(b.weather) : cur.weather,
      time_of_day: b.time_of_day !== undefined ? clean(b.time_of_day) : cur.time_of_day,
      lighting: b.lighting !== undefined ? clean(b.lighting) : cur.lighting,
      atmosphere: b.atmosphere !== undefined ? clean(b.atmosphere) : cur.atmosphere,
      foreground_object: b.foreground_object !== undefined ? clean(b.foreground_object) : cur.foreground_object,
      background_object: b.background_object !== undefined ? clean(b.background_object) : cur.background_object,
      color_palette: b.color_palette !== undefined ? clean(b.color_palette) : cur.color_palette,
      detail_level: b.detail_level !== undefined ? clean(b.detail_level) : cur.detail_level,
      depth: b.depth !== undefined ? clean(b.depth) : cur.depth,
      focus: b.focus !== undefined ? clean(b.focus) : cur.focus,
      visual_priority: b.visual_priority !== undefined ? clean(b.visual_priority) : cur.visual_priority,
      face_policy: b.face_policy !== undefined ? clean(b.face_policy) : cur.face_policy,
      visual_notes: b.visual_notes !== undefined ? clean(b.visual_notes) : cur.visual_notes,
      sensitive_object: b.sensitive_object !== undefined ? clean(b.sensitive_object) : cur.sensitive_object
    };

    // Penguatkuasaan polisi muka: kod daripada panel + layout.
    const pj = await pool.query('SELECT characters_json FROM panels WHERE id = $1', [cur.panel_id]);
    const panelCodes = (pj.rows[0] && jget(pj.rows[0].characters_json)) || [];
    const layoutCodes = (merged.characters_layout || []).map(function (x) { return x && x.code; }).filter(Boolean);
    const unionCodes = panelCodes.concat(layoutCodes);
    const nobleSet = await nobleCodeSet(pool, cur.project_id);
    const enforced = enforceFacePolicy(merged.visual_notes, merged.face_policy, unionCodes, nobleSet);
    merged.face_policy = enforced.face_policy;
    merged.visual_notes = enforced.visual_notes;

    const upd = await pool.query(
      `UPDATE visuals SET
          camera = $1, shot = $2, angle = $3, lens = $4, composition = $5, camera_movement = $6,
          characters_layout = $7::jsonb, location = $8, weather = $9, time_of_day = $10,
          lighting = $11, atmosphere = $12, foreground_object = $13, background_object = $14,
          color_palette = $15, detail_level = $16, depth = $17, focus = $18, visual_priority = $19,
          face_policy = $20, visual_notes = $21, sensitive_object = $22
        WHERE id = $23
        RETURNING ${VISUAL_COLUMNS}`,
      [merged.camera, merged.shot, merged.angle, merged.lens, merged.composition, merged.camera_movement,
       JSON.stringify(Array.isArray(merged.characters_layout) ? merged.characters_layout : []),
       merged.location, merged.weather, merged.time_of_day, merged.lighting, merged.atmosphere,
       merged.foreground_object, merged.background_object, merged.color_palette, merged.detail_level,
       merged.depth, merged.focus, merged.visual_priority, merged.face_policy, merged.visual_notes,
       merged.sensitive_object, id]
    );
    res.json({ visual: upd.rows[0] });
  } catch (err) {
    console.error('[visuals] update:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mengemas kini visual' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/visuals/:id — padam visual (+ segerak status)
// ---------------------------------------------------------------------------
router.delete('/visuals/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID visual tidak sah' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ex = await client.query('SELECT project_id FROM visuals WHERE id = $1', [id]);
    if (ex.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Visual tidak dijumpai' });
    }
    const projectId = ex.rows[0].project_id;
    await client.query('DELETE FROM visuals WHERE id = $1', [id]);
    const project = await syncVisualStatus(client, projectId);
    await client.query('COMMIT');
    res.json({ ok: true, deleted: id, project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[visuals] delete:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memadam visual' });
  } finally {
    client.release();
  }
});

module.exports = router;
