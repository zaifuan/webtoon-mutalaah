'use strict';

// ===========================================================================
// productionEngine.js — Fasa 9: Production Engine (GENERIK, LOCAL-FIRST)
//
// Logik queue/worker tanpa pengetahuan tentang Webtoon Mutalaah. Worker hanya
// menerima Job. Tiada AI, tiada API luar — dummy worker hanya:
//   claim → sleep(3000) → complete
// supaya Fasa 10 (AI Worker) / Fasa 11 (Ollama) hanya perlu ganti tugas dummy.
// ===========================================================================

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const pool = require('../db/pool');
const aiAdapter = require('../ai/adapter');
const imageAdapter = require('../image/adapter');
const imageAssetService = require('./imageAssetService'); // storage Fasa 8 (link imej janaan)
const promptEngine = require('./promptEngine'); // bina prompt imej (sama sumber dgn route /generate-prompts)
const scriptSource = require('./scriptSource'); // skrip piawai per panel

// Nilai provider yang sah mengikut CHECK constraint image_assets.
const IMAGE_PROVIDER_ALLOWED = ['manual', 'comfyui', 'forge', 'automatic1111', 'unknown'];

const JOB_TYPES = [
  'TEXT_PARSE', 'CHARACTER_GENERATION', 'SCENE_GENERATION', 'PANEL_GENERATION',
  'SCRIPT_GENERATION', 'VISUAL_GENERATION', 'PROMPT_GENERATION', 'IMAGE_GENERATION',
  'REVIEW', 'EXPORT'
];
const JOB_STATUS = ['pending', 'claimed', 'running', 'completed', 'failed', 'cancelled'];
const PRIORITIES = ['high', 'normal', 'low'];
const WORKER_STATUS = ['online', 'offline', 'busy'];

const PRIORITY_SQL = "CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END";

// ---- Linking imej janaan ke panel (Fasa 8) --------------------------------
// IMAGE_GENERATION berjaya tetapi adapter (comfyui) hanya menyimpan PNG ke
// uploads/images/_generated/gen-xxx.png dan pulangkan path itu. Ia TIDAK tahu
// konteks project/panel (adapter sengaja dikekalkan generik). Tanpa langkah
// ini, imej janaan jadi "anak yatim" — wujud di cakera tetapi TIDAK dikaitkan
// ke panel, jadi halaman Image & Preview papar "Tiada gambar".
//
// Fungsi ini: salin/salin-tulis PNG ke path yang UI jangka
//   uploads/images/project-{projectId}/panel-{panelId}.png
// dan upsert baris image_assets (UNIQUE panel_id) supaya UI baca automatik.
// Adapter, schema & ComfyUI TIDAK disentuh — ini hanya langkah linking.
async function linkGeneratedImage(job, aiResult) {
  if (!job || job.job_type !== 'IMAGE_GENERATION') return null;
  const projectId = job.project_id != null ? Number(job.project_id) : null;
  const panelId = job.panel_id != null ? Number(job.panel_id) : null;
  const sceneId = job.scene_id != null ? Number(job.scene_id) : null;
  if (!projectId || !panelId) return null;

  const image = aiResult && aiResult.image;
  const relPath = image && image.path; // "images/_generated/gen-xxx.png"
  if (!relPath) return null;

  // Resolve path sumber (di dalam uploads/). Buang leading slash.
  const srcAbs = imageAssetService.absFromRel(relPath);
  if (!imageAssetService.isInsideImages(srcAbs)) return null;

  // Sahkan fail sumber wujud & tidak kosong sebelum salin.
  let srcStat;
  try { srcStat = await fsp.stat(srcAbs); } catch (e) { return null; }
  if (!srcStat || !srcStat.size) return null;

  // Path destinasi yang UI jangka: images/project-{id}/panel-{id}.png
  const dir = imageAssetService.projectDir(projectId);
  await imageAssetService.ensureDir(dir);
  const ext = image.filename ? (String(image.filename).toLowerCase().match(/\.(png|jpe?g|webp)$/) || [])[1] : null;
  const useExt = ext === 'jpg' ? 'jpeg' : (ext || 'png');
  const fileExt = useExt === 'jpeg' ? 'jpg' : useExt;
  const filename = imageAssetService.panelFilename(panelId, fileExt);
  const dstAbs = path.join(dir, filename);
  if (!imageAssetService.isInsideImages(dstAbs)) return null;

  // Salin (bukan pindah) supaya _generated kekal sebagai arkib janaan mentah.
  await fsp.copyFile(srcAbs, dstAbs);
  // Buang fail lama panel ini yang berlainan ext (elak dua fail).
  await imageAssetService.removeExistingPanelFiles(projectId, panelId, fileExt);

  // Baca metadata panel/prompt untuk upsert.
  const meta = await pool.query('SELECT id, project_id, scene_id FROM panels WHERE id = $1', [panelId]);
  if (!meta.rows.length) return null;
  const panelRow = meta.rows[0];
  let promptId = null;
  try {
    const pr = await pool.query('SELECT id FROM image_prompts WHERE panel_id = $1', [panelId]);
    if (pr.rows.length) promptId = pr.rows[0].id;
  } catch (e) { /* abai */ }

  const mime = fileExt === 'png' ? 'image/png' : (fileExt === 'webp' ? 'image/webp' : 'image/jpeg');
  const providerRaw = aiResult.provider;
  const provider = IMAGE_PROVIDER_ALLOWED.indexOf(providerRaw) !== -1 ? providerRaw : 'unknown';

  // Upsert (UNIQUE panel_id) — selaras dengan routes/images.js.
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
    projectId, sceneId != null ? sceneId : panelRow.scene_id, panelId, promptId,
    filename, imageAssetService.relPath(projectId, filename), null,
    'future_generator', provider, 'uploaded',
    image.width != null ? image.width : null, image.height != null ? image.height : null,
    srcStat.size, mime
  ]);
  return { asset_id: r.rows[0].id, image_path: imageAssetService.relPath(projectId, filename) };
}

// Bina prompt imej on-the-fly daripada panel+visual+scene+charMap (sama logik
// dgn routes/prompts.js insertPrompt). Digunakan apabila image_prompts masih
// kosong untuk panel ini (cth. job PROMPT_GENERATION pipeline tak tulis DB).
// Hasil juga dipersist ke image_prompts supaya jadi sumber kanonik seterusnya.
async function buildPromptFromDb(panelId) {
  const jSQL =
    'SELECT p.id AS panel_id, p.project_id, p.scene_id, p.characters_json, ' +
    'p.visual_ms, p.caption_ms, p.dialogue_ms, ' +
    'v.shot, v.angle, v.lens, v.composition, v.lighting, v.color_palette, ' +
    'v.atmosphere, v.focus, v.depth, v.face_policy, v.characters_layout, ' +
    's.scene_type, s.location AS scene_location, s.mood AS scene_mood ' +
    'FROM panels p LEFT JOIN visuals v ON v.panel_id = p.id ' +
    'LEFT JOIN scenes s ON s.id = p.scene_id WHERE p.id = $1';
  const rows = await pool.query(jSQL, [panelId]);
  if (!rows.rows.length) return null;
  const r = rows.rows[0];
  function jget(v) { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } } return v; }

  // charMap (sama medan dgn routes/prompts.js buildCharMap).
  const crows = await pool.query(
    'SELECT character_code, character_type, face_policy, visual_dna FROM characters WHERE project_id = $1',
    [r.project_id]
  );
  const charMap = {};
  crows.rows.forEach(function (row) {
    charMap[row.character_code] = {
      character_type: row.character_type, face_policy: row.face_policy,
      visual_dna: jget(row.visual_dna) || {}
    };
  });

  const panel = {
    id: r.panel_id, project_id: r.project_id, scene_id: r.scene_id,
    visual_ms: r.visual_ms, caption_ms: r.caption_ms, dialogue_ms: r.dialogue_ms,
    characters_json: jget(r.characters_json) || []
  };
  const scene = { scene_type: r.scene_type, location: r.scene_location, mood: r.scene_mood };
  const visual = {
    shot: r.shot, angle: r.angle, lens: r.lens, composition: r.composition,
    lighting: r.lighting, color_palette: r.color_palette, atmosphere: r.atmosphere,
    focus: r.focus, depth: r.depth, face_policy: r.face_policy,
    characters_layout: jget(r.characters_layout) || []
  };

  const script = await scriptSource.resolveScript(pool, panel, scene, charMap);
  const p = promptEngine.buildPrompt(panel, scene, script, visual, charMap);

  // Persist (UNIQUE panel_id) supaya jadi sumber kanonik seterusnya.
  try {
    await pool.query(
      'INSERT INTO image_prompts ' +
      '(project_id, scene_id, panel_id, prompt_text, negative_prompt, style_preset, language, prompt_version, status) ' +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ready') ON CONFLICT (panel_id) DO UPDATE SET " +
      'prompt_text = EXCLUDED.prompt_text, negative_prompt = EXCLUDED.negative_prompt, ' +
      'style_preset = EXCLUDED.style_preset RETURNING id',
      [r.project_id, r.scene_id, r.panel_id, p.prompt_text, p.negative_prompt,
       p.style_preset, p.language, p.prompt_version]
    );
  } catch (e) { /* abai — prompt tetap dipulangkan ke adapter */ }

  return { prompt_text: p.prompt_text, negative_prompt: p.negative_prompt };
}

// ---- Penyelesaian prompt untuk IMAGE_GENERATION ---------------------------
// Job IMAGE_GENERATION binaan pipeline TIDAK membawa prompt (payload hanya
// { task, project, scene, panel }). ComfyUI adapter pula membaca p.prompt /
// p.negative_prompt — jika kosong, placeholder %PROMPT% dalam turbo.json tidak
// diganti → imej jana menunjukkan teks literal/pelik.
//
// Sumber prompt kanonik ialah jadual image_prompts (prompt_text + negative_prompt
// per panel, UNIQUE panel_id). Fungsi ini membaca baris itu dan menyuntik
// prompt sebenar ke payload SEBELU dihantar ke Image Adapter. Adapter, ComfyUI,
// workflow JSON & UI TIDAK disentuh — ini hanya langkah resolusi konteks.
//
// Fallback selamat: jika image_prompts tiada, baca payload (pelbagai nama medan
// mungkin) → jika masih tiada, biar kosong (behaviour lama; tidak crash).
async function resolveImagePrompt(payload) {
  const p = (payload && typeof payload === 'object') ? payload : {};
  const panelId = (p.panel && p.panel.id) || p.panel_id || null;

  // Cuba beberapa nama medan prompt yang mungkin hadir dalam payload.
  function fromPayload() {
    const keys = ['prompt', 'image_prompt', 'prompt_ms', 'prompt_text', 'final_prompt'];
    for (const k of keys) if (typeof p[k] === 'string' && p[k].trim()) return p[k];
    // Nested (cth. payload.prompt.text).
    if (p.prompt && typeof p.prompt === 'object') {
      for (const k of ['text', 'prompt_text', 'ms']) {
        if (typeof p.prompt[k] === 'string' && p.prompt[k].trim()) return p.prompt[k];
      }
    }
    return null;
  }
  function fromPayloadNegative() {
    const keys = ['negative_prompt', 'negative', 'negative_prompt_text'];
    for (const k of keys) if (typeof p[k] === 'string' && p[k].trim()) return p[k];
    return null;
  }

  let promptText = fromPayload();
  let negativeText = fromPayloadNegative();

  // Tiada dalam payload → ambil dari DB (image_prompts) per panel_id.
  if ((!promptText || !negativeText) && panelId) {
    try {
      const r = await pool.query(
        'SELECT prompt_text, negative_prompt FROM image_prompts WHERE panel_id = $1 LIMIT 1',
        [panelId]
      );
      if (r.rows.length && r.rows[0].prompt_text) {
        if (!promptText) promptText = r.rows[0].prompt_text;
        if (!negativeText) negativeText = r.rows[0].negative_prompt;
      } else if (!promptText) {
        // Safety net: image_prompts masih kosong (cth. job PROMPT_GENERATION
        // pipeline tak tulis DB). Jana on-the-fly daripada panel+visual+scene
        // guna promptEngine (sama logik dgn route /generate-prompts) & persist.
        const built = await buildPromptFromDb(panelId);
        if (built && built.prompt_text) {
          promptText = built.prompt_text;
          if (!negativeText) negativeText = built.negative_prompt;
        }
      }
    } catch (e) { /* abai — fallback selamat */ }
  }

  // Suntik semula ke payload. Adapter comfyui membaca p.prompt / p.negative_prompt.
  return Object.assign({}, p, {
    prompt: promptText || p.prompt || '',
    negative_prompt: negativeText || p.negative_prompt || ''
  });
}

// ---- Job lifecycle --------------------------------------------------------

// Ambil job seterusnya yang LAYAK:
//   - status 'pending'
//   - tiada dependency, ATAU dependency sudah 'completed'
//   - susunan: priority high>normal>low, kemudian created_at terlama.
async function claimNextJob(workerName) {
  const sql =
    "UPDATE production_jobs SET status = 'claimed', worker_name = $1 " +
    'WHERE id = ( ' +
    '  SELECT j.id FROM production_jobs j ' +
    "  WHERE j.status = 'pending' " +
    '    AND (j.depends_on_job IS NULL OR EXISTS ( ' +
    "      SELECT 1 FROM production_jobs d WHERE d.id = j.depends_on_job AND d.status = 'completed' " +
    '    )) ' +
    "  ORDER BY CASE j.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, j.created_at ASC, j.id ASC " +
    '  LIMIT 1 FOR UPDATE SKIP LOCKED ' +
    ') RETURNING *';
  const r = await pool.query(sql, [workerName || null]);
  return r.rows[0] || null;
}

async function startJob(id, workerName) {
  const r = await pool.query(
    "UPDATE production_jobs SET status = 'running', started_at = now()" +
    (workerName ? ', worker_name = $2' : '') +
    " WHERE id = $1 AND status IN ('claimed','pending','running') RETURNING *",
    workerName ? [id, workerName] : [id]
  );
  return r.rows[0] || null;
}

async function completeJob(id, resultJson) {
  const r = await pool.query(
    "UPDATE production_jobs SET status = 'completed', completed_at = now(), result_json = $2, error_message = NULL " +
    "WHERE id = $1 AND status <> 'cancelled' RETURNING *",
    [id, resultJson ? JSON.stringify(resultJson) : null]
  );
  return r.rows[0] || null;
}

// Gagal: retry_count++. Jika melebihi max_retry → 'failed'; jika tidak → 'pending' (requeue).
async function failJob(id, errorMessage) {
  const cur = await pool.query('SELECT retry_count, max_retry FROM production_jobs WHERE id = $1', [id]);
  if (cur.rows.length === 0) return null;
  const rc = Number(cur.rows[0].retry_count) + 1;
  const max = Number(cur.rows[0].max_retry);
  const failed = rc > max;
  const status = failed ? 'failed' : 'pending';
  const r = await pool.query(
    'UPDATE production_jobs SET status = $1, retry_count = $2, error_message = $3, ' +
    "worker_name = CASE WHEN $1 = 'pending' THEN NULL ELSE worker_name END, " +
    'started_at = NULL, ' +
    "completed_at = CASE WHEN $1 = 'failed' THEN now() ELSE NULL END " +
    'WHERE id = $4 RETURNING *',
    [status, rc, errorMessage || null, id]
  );
  return { job: r.rows[0], requeued: !failed };
}

// Retry manual (hanya untuk job 'failed' / 'cancelled'): reset ke 'pending'.
async function retryJob(id) {
  const r = await pool.query(
    "UPDATE production_jobs SET status = 'pending', retry_count = 0, error_message = NULL, " +
    'worker_name = NULL, started_at = NULL, completed_at = NULL, result_json = NULL ' +
    "WHERE id = $1 AND status IN ('failed','cancelled') RETURNING *",
    [id]
  );
  return r.rows[0] || null;
}

async function cancelJob(id) {
  const r = await pool.query(
    "UPDATE production_jobs SET status = 'cancelled', worker_name = NULL, completed_at = now() " +
    "WHERE id = $1 AND status IN ('pending','claimed','running') RETURNING *",
    [id]
  );
  return r.rows[0] || null;
}

// ---- Workers --------------------------------------------------------------
async function registerWorker(workerName) {
  const r = await pool.query(
    "INSERT INTO workers (worker_name, status, last_heartbeat) VALUES ($1, 'online', now()) " +
    "ON CONFLICT (worker_name) DO UPDATE SET status = 'online', last_heartbeat = now() RETURNING *",
    [workerName]
  );
  return r.rows[0];
}

async function heartbeat(workerName, fields) {
  const f = fields || {};
  const r = await pool.query(
    'UPDATE workers SET last_heartbeat = now(), ' +
    'status = COALESCE($2, status), current_job = $3, ' +
    'cpu_usage = COALESCE($4, cpu_usage), ram_usage = COALESCE($5, ram_usage), gpu_usage = COALESCE($6, gpu_usage) ' +
    'WHERE worker_name = $1 RETURNING *',
    [workerName,
      f.status !== undefined ? f.status : null,
      f.current_job !== undefined ? f.current_job : null,
      f.cpu_usage !== undefined ? f.cpu_usage : null,
      f.ram_usage !== undefined ? f.ram_usage : null,
      f.gpu_usage !== undefined ? f.gpu_usage : null]
  );
  return r.rows[0] || null;
}

// ---- Dummy worker (in-process) --------------------------------------------
// claim → running → sleep(3000) → complete. Boleh dimatikan dengan env
// DISABLE_DUMMY_WORKER=1 (digunakan semasa ujian).
const DUMMY_NAME = 'dummy-worker-1';
let dummyTimer = null;
let dummyBusy = false;

function rand(min, max) { return Math.round((min + Math.random() * (max - min)) * 10) / 10; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function dummyTick() {
  if (dummyBusy) return;
  dummyBusy = true;
  try {
    await registerWorker(DUMMY_NAME);
    await heartbeat(DUMMY_NAME, { status: 'online', cpu_usage: rand(3, 35), ram_usage: rand(20, 60), gpu_usage: 0 });
    const job = await claimNextJob(DUMMY_NAME);
    if (job) {
      await heartbeat(DUMMY_NAME, { status: 'busy', current_job: job.id, cpu_usage: rand(40, 85), ram_usage: rand(40, 80), gpu_usage: 0 });
      await startJob(job.id, DUMMY_NAME);
      // Fasa 10: worker TIDAK lagi sleep() sendiri — ia memanggil AI Adapter.
      // Dummy adapter masih sleep(1000) → behaviour sistem kekal sama.
      // Fasa 10/11/12: worker memanggil adapter. job_type IMAGE_GENERATION
      // dirutekan ke Image Adapter; semua job lain kekal ke AI Adapter.
      // Adapter TIDAK pernah crash — ia pulang { success:false } jika gagal.
      let aiResult;
      try {
        // IMAGE_GENERATION: selesaikan prompt sebenar dari image_prompts (per
        // panel_id) sebelum hantar ke adapter — supaya %PROMPT% dalam turbo.json
        // diganti dengan prompt panel sebenar, bukan literal %PROMPT%.
        let imagePayload = job.payload_json;
        if (job.job_type === 'IMAGE_GENERATION') {
          try { imagePayload = await resolveImagePrompt(job.payload_json); }
          catch (e) { console.error('[production] resolve prompt:', e.message); }
          // Log ringkas untuk QA: sahkan prompt sebenar dihantar ke adapter.
          const _p = (imagePayload && imagePayload.prompt) || '';
          if (_p) console.log('[production] IMAGE_GENERATION job#' + job.id + ' prompt="' + _p.slice(0, 80) + (_p.length > 80 ? '…' : '') + '"');
        }
        aiResult = (job.job_type === 'IMAGE_GENERATION')
          ? await imageAdapter.runJob(job.job_type, imagePayload)
          : await aiAdapter.runJob(job.job_type, job.payload_json);
      } catch (e) {
        aiResult = { success: false, error: 'Adapter ralat: ' + (e && e.message ? e.message : String(e)) };
      }
      if (aiResult && aiResult.success === false) {
        // Production Engine yang tentukan status: gagal terkawal (retry/failed Fasa 9).
        const msg = aiResult.error || aiResult.message || 'AI job gagal';
        await failJob(job.id, msg);
      } else {
        // IMAGE_GENERATION sahaja: link imej janaan ke panel (Fasa 8) sebelum
        // menanda job selesai — supaya halaman Image & Preview boleh baca automatik.
        let linked = null;
        if (job.job_type === 'IMAGE_GENERATION' && aiResult && aiResult.image) {
          try { linked = await linkGeneratedImage(job, aiResult); }
          catch (e) { console.error('[production] link image:', e.message); }
        }
        await completeJob(job.id, Object.assign({
          simulated: !!(aiResult && (aiResult.provider === 'dummy' || aiResult.provider === 'dummy-image')),
          finished_at: new Date().toISOString()
        }, aiResult, linked ? { panel_image_linked: linked } : {}));
      }
      await heartbeat(DUMMY_NAME, { status: 'online', current_job: null, cpu_usage: rand(3, 20), ram_usage: rand(20, 50), gpu_usage: 0 });
    }
  } catch (e) {
    console.error('[production] dummy worker:', e.message);
  } finally {
    dummyBusy = false;
  }
}

function startDummyWorker() {
  if (dummyTimer) return;
  dummyTimer = setInterval(function () { dummyTick(); }, 2000);
  if (dummyTimer.unref) dummyTimer.unref();
  console.log('[production] dummy worker dimulakan (' + DUMMY_NAME + ', melalui AI adapter)');
}
function stopDummyWorker() {
  if (dummyTimer) { clearInterval(dummyTimer); dummyTimer = null; }
}

module.exports = {
  JOB_TYPES, JOB_STATUS, PRIORITIES, WORKER_STATUS,
  claimNextJob, startJob, completeJob, failJob, retryJob, cancelJob,
  registerWorker, heartbeat,
  linkGeneratedImage,
  resolveImagePrompt,
  startDummyWorker, stopDummyWorker,
  DUMMY_NAME
};
