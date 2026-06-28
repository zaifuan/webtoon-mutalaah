'use strict';

// ===========================================================================
// src/services/pipelineEngine.js — Fasa 14: Auto Production Pipeline
//
// Orchestrator yang menyusun queue (Fasa 9) secara automatik. TIDAK mengubah
// Queue/Worker/Adapter/Engine — ia hanya MEMBINA job + dependency sedia ada:
//
//   SCRIPT → VISUAL → PROMPT → IMAGE → REVIEW
//
// Semua kebergantungan guna depends_on_job (Fasa 9). Tiada scheduler / worker /
// jadual / migration baru. REVIEW bergantung pada job IMAGE terakhir — di bawah
// satu worker FIFO (priority sama → urutan id), semua imej selesai sebelum REVIEW.
// ===========================================================================

const pool = require('../db/pool');

const PIPELINE_TYPES = ['SCRIPT_GENERATION', 'VISUAL_GENERATION', 'PROMPT_GENERATION', 'IMAGE_GENERATION', 'REVIEW'];
const ACTIVE = ['pending', 'claimed', 'running'];

const STAGE_DEFS = [
  ['script', 'SCRIPT_GENERATION'],
  ['visual', 'VISUAL_GENERATION'],
  ['prompt', 'PROMPT_GENERATION'],
  ['image', 'IMAGE_GENERATION'],
  ['review', 'REVIEW']
];

function asJsonb(v) { return v == null ? null : JSON.stringify(v); }
function stageLabel(jt) {
  const m = { SCRIPT_GENERATION: 'Script', VISUAL_GENERATION: 'Visual', PROMPT_GENERATION: 'Prompt', IMAGE_GENERATION: 'Image', REVIEW: 'Review' };
  return m[jt] || jt;
}

async function insertJob(client, j) {
  const r = await client.query(
    'INSERT INTO production_jobs ' +
    '(project_id, scene_id, panel_id, job_type, status, priority, max_retry, depends_on_job, payload_json) ' +
    "VALUES ($1, $2, $3, $4, 'pending', 'normal', 3, $5, $6) RETURNING id",
    [j.project_id, j.scene_id != null ? j.scene_id : null, j.panel_id != null ? j.panel_id : null,
     j.job_type, j.depends_on != null ? j.depends_on : null, asJsonb(j.payload)]
  );
  return r.rows[0].id;
}

// ---- Bina pipeline -----------------------------------------------------------
async function buildProjectPipeline(projectId) {
  const pid = Number(projectId);
  if (!Number.isFinite(pid)) return { ok: false, error: 'projectId tidak sah' };

  // 1) Project wujud?
  const proj = await pool.query('SELECT id, title_ms, status FROM projects WHERE id = $1', [pid]);
  if (!proj.rows.length) return { ok: false, error: 'Projek tidak dijumpai' };

  // 2) Ada panel?
  const panelsRes = await pool.query(
    'SELECT p.id, p.scene_id, p.panel_no, p.visual_ms, p.dialogue_ar, p.mood, p.camera, s.scene_no, s.summary_ms ' +
    'FROM panels p LEFT JOIN scenes s ON p.scene_id = s.id ' +
    'WHERE p.project_id = $1 ORDER BY p.panel_no ASC, p.id ASC',
    [pid]
  );
  if (!panelsRes.rows.length) return { ok: false, error: 'Tiada panel. Sila jana panel dahulu sebelum memulakan pipeline.' };

  // Anti-duplikat: jika ada job aktif, JANGAN tambah duplicate.
  const act = await pool.query(
    'SELECT COUNT(*)::int AS n FROM production_jobs WHERE project_id = $1 AND status = ANY($2)',
    [pid, ACTIVE]
  );
  if (act.rows[0].n > 0) {
    return { ok: true, already_running: true, created: 0, panels: panelsRes.rows.length, message: 'Pipeline sedang berjalan — tiada job duplikat ditambah.' };
  }

  // Larian baharu: bersihkan job pipeline lama (semua sudah terminal) untuk status bersih.
  // Nota: ini hanya memadam BARIS job — fail imej (Fasa 8) TIDAK disentuh.
  await pool.query('DELETE FROM production_jobs WHERE project_id = $1 AND job_type = ANY($2)', [pid, PIPELINE_TYPES]);

  const projInfo = { id: pid, title_ms: proj.rows[0].title_ms || '' };
  const client = await pool.connect();
  let created = 0;
  const imageIds = [];
  try {
    await client.query('BEGIN');
    for (const pn of panelsRes.rows) {
      const ctx = {
        project: projInfo,
        scene: { id: pn.scene_id, scene_no: pn.scene_no, summary_ms: pn.summary_ms },
        panel: { id: pn.id, panel_no: pn.panel_no, visual_ms: pn.visual_ms, dialogue_ar: pn.dialogue_ar, mood: pn.mood, camera: pn.camera }
      };
      const sj = await insertJob(client, { project_id: pid, scene_id: pn.scene_id, panel_id: pn.id, job_type: 'SCRIPT_GENERATION', depends_on: null, payload: Object.assign({ task: 'SCRIPT_GENERATION' }, ctx) });
      const vj = await insertJob(client, { project_id: pid, scene_id: pn.scene_id, panel_id: pn.id, job_type: 'VISUAL_GENERATION', depends_on: sj, payload: Object.assign({ task: 'VISUAL_GENERATION' }, ctx) });
      const pj = await insertJob(client, { project_id: pid, scene_id: pn.scene_id, panel_id: pn.id, job_type: 'PROMPT_GENERATION', depends_on: vj, payload: Object.assign({ task: 'PROMPT_GENERATION' }, ctx) });
      const ij = await insertJob(client, { project_id: pid, scene_id: pn.scene_id, panel_id: pn.id, job_type: 'IMAGE_GENERATION', depends_on: pj, payload: Object.assign({ task: 'IMAGE_GENERATION' }, ctx) });
      imageIds.push(ij);
      created += 4;
    }
    // REVIEW bergantung pada job IMAGE terakhir (gate semua imej di bawah FIFO).
    const lastImage = imageIds.length ? imageIds[imageIds.length - 1] : null;
    const rj = await insertJob(client, { project_id: pid, scene_id: null, panel_id: null, job_type: 'REVIEW', depends_on: lastImage, payload: { task: 'REVIEW', project: projInfo, image_jobs: imageIds.length } });
    created += 1;
    await client.query('COMMIT');
    return { ok: true, created: created, panels: panelsRes.rows.length, image_jobs: imageIds.length, review_job: rj };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* abai */ }
    return { ok: false, error: 'Gagal membina pipeline: ' + (e && e.message ? e.message : String(e)) };
  } finally {
    client.release();
  }
}

// ---- Live activity -----------------------------------------------------------
async function getLiveActivity(projectId) {
  const r = await pool.query(
    'SELECT w.worker_name, w.status AS worker_status, j.id AS job_id, j.job_type, j.panel_id ' +
    'FROM workers w LEFT JOIN production_jobs j ON w.current_job = j.id ' +
    "WHERE w.status <> 'offline' AND w.current_job IS NOT NULL AND j.project_id = $1 " +
    'ORDER BY w.worker_name ASC',
    [projectId]
  );
  return r.rows.map(function (row) {
    return { worker: row.worker_name, job_id: row.job_id, job_type: row.job_type, panel_id: row.panel_id, stage: stageLabel(row.job_type) };
  });
}

// ---- Status ------------------------------------------------------------------
async function getPipelineStatus(projectId) {
  const pid = Number(projectId);
  if (!Number.isFinite(pid)) return { ok: false, error: 'projectId tidak sah' };
  const proj = await pool.query('SELECT id, title_ms, status FROM projects WHERE id = $1', [pid]);
  if (!proj.rows.length) return { ok: false, error: 'Projek tidak dijumpai' };

  const panelsCount = (await pool.query('SELECT COUNT(*)::int AS n FROM panels WHERE project_id = $1', [pid])).rows[0].n;
  const jobsRes = await pool.query(
    'SELECT id, job_type, status, panel_id, worker_name, started_at, completed_at, retry_count, error_message ' +
    'FROM production_jobs WHERE project_id = $1 AND job_type = ANY($2) ORDER BY id ASC',
    [pid, PIPELINE_TYPES]
  );
  const jobs = jobsRes.rows;

  const stages = {};
  for (const def of STAGE_DEFS) {
    const key = def[0], jt = def[1];
    const st = jobs.filter(function (j) { return j.job_type === jt; });
    stages[key] = {
      total: st.length,
      completed: st.filter(function (j) { return j.status === 'completed'; }).length,
      running: st.filter(function (j) { return j.status === 'claimed' || j.status === 'running'; }).length,
      pending: st.filter(function (j) { return j.status === 'pending'; }).length,
      failed: st.filter(function (j) { return j.status === 'failed'; }).length,
      cancelled: st.filter(function (j) { return j.status === 'cancelled'; }).length
    };
  }

  const total = jobs.length;
  const completed = jobs.filter(function (j) { return j.status === 'completed'; }).length;
  const running = jobs.filter(function (j) { return j.status === 'claimed' || j.status === 'running'; }).length;
  const pending = jobs.filter(function (j) { return j.status === 'pending'; }).length;
  const failed = jobs.filter(function (j) { return j.status === 'failed'; }).length;
  const cancelled = jobs.filter(function (j) { return j.status === 'cancelled'; }).length;
  const remaining = total - completed - failed - cancelled;

  // ETA = purata tempoh job completed × baki (anggaran sahaja).
  const durs = jobs
    .filter(function (j) { return j.status === 'completed' && j.started_at && j.completed_at; })
    .map(function (j) { return new Date(j.completed_at).getTime() - new Date(j.started_at).getTime(); })
    .filter(function (d) { return d >= 0; });
  let avgMs = null;
  if (durs.length) avgMs = durs.reduce(function (a, b) { return a + b; }, 0) / durs.length;
  const etaSeconds = (avgMs != null && remaining > 0) ? Math.round((avgMs * remaining) / 1000) : (remaining === 0 && total > 0 ? 0 : null);

  let pipeline_status;
  if (total === 0) pipeline_status = 'idle';
  else if (completed === total) pipeline_status = 'completed';
  else if (running > 0 || pending > 0) pipeline_status = 'running';
  else if (failed > 0) pipeline_status = 'failed';
  else if (cancelled > 0) pipeline_status = 'cancelled';
  else pipeline_status = 'running';

  const reviewJob = jobs.find(function (j) { return j.job_type === 'REVIEW'; });
  const review_failed = !!(reviewJob && reviewJob.status === 'failed');

  // Jika lengkap → tandai projek (status sah; CHECK tiada 'completed', guna 'image_generated').
  if (pipeline_status === 'completed') {
    try { await pool.query("UPDATE projects SET status = 'image_generated' WHERE id = $1 AND status <> 'published'", [pid]); } catch (e) { /* abai */ }
  }

  const projectStatus = (await pool.query('SELECT status FROM projects WHERE id = $1', [pid])).rows[0].status;
  const live = await getLiveActivity(pid);

  return {
    ok: true,
    project_id: pid,
    project_status: projectStatus,
    pipeline_status: pipeline_status,
    review_failed: review_failed,
    panels: panelsCount,
    summary: {
      total_jobs: total,
      completed: completed,
      running: running,
      pending: pending,
      failed: failed,
      cancelled: cancelled,
      remaining: remaining,
      eta_seconds: etaSeconds,
      avg_job_ms: avgMs != null ? Math.round(avgMs) : null
    },
    stages: stages,
    live_activity: live
  };
}

// ---- Cancel ------------------------------------------------------------------
async function cancelProjectPipeline(projectId) {
  const pid = Number(projectId);
  if (!Number.isFinite(pid)) return { ok: false, error: 'projectId tidak sah' };
  // Hanya batal job AKTIF (pending/claimed/running). Job completed + fail imej kekal.
  const r = await pool.query(
    "UPDATE production_jobs SET status = 'cancelled' WHERE project_id = $1 AND job_type = ANY($2) AND status = ANY($3) RETURNING id",
    [pid, PIPELINE_TYPES, ACTIVE]
  );
  return { ok: true, cancelled: (r.rows ? r.rows.length : (r.rowCount || 0)) };
}

module.exports = {
  PIPELINE_TYPES,
  buildProjectPipeline,
  getPipelineStatus,
  cancelProjectPipeline,
  getLiveActivity
};
