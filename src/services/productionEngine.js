'use strict';

// ===========================================================================
// productionEngine.js — Fasa 9: Production Engine (GENERIK, LOCAL-FIRST)
//
// Logik queue/worker tanpa pengetahuan tentang Webtoon Mutalaah. Worker hanya
// menerima Job. Tiada AI, tiada API luar — dummy worker hanya:
//   claim → sleep(3000) → complete
// supaya Fasa 10 (AI Worker) / Fasa 11 (Ollama) hanya perlu ganti tugas dummy.
// ===========================================================================

const pool = require('../db/pool');
const aiAdapter = require('../ai/adapter');
const imageAdapter = require('../image/adapter');

const JOB_TYPES = [
  'TEXT_PARSE', 'CHARACTER_GENERATION', 'SCENE_GENERATION', 'PANEL_GENERATION',
  'SCRIPT_GENERATION', 'VISUAL_GENERATION', 'PROMPT_GENERATION', 'IMAGE_GENERATION',
  'REVIEW', 'EXPORT'
];
const JOB_STATUS = ['pending', 'claimed', 'running', 'completed', 'failed', 'cancelled'];
const PRIORITIES = ['high', 'normal', 'low'];
const WORKER_STATUS = ['online', 'offline', 'busy'];

const PRIORITY_SQL = "CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END";

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
        aiResult = (job.job_type === 'IMAGE_GENERATION')
          ? await imageAdapter.runJob(job.job_type, job.payload_json)
          : await aiAdapter.runJob(job.job_type, job.payload_json);
      } catch (e) {
        aiResult = { success: false, error: 'Adapter ralat: ' + (e && e.message ? e.message : String(e)) };
      }
      if (aiResult && aiResult.success === false) {
        // Production Engine yang tentukan status: gagal terkawal (retry/failed Fasa 9).
        const msg = aiResult.error || aiResult.message || 'AI job gagal';
        await failJob(job.id, msg);
      } else {
        await completeJob(job.id, Object.assign({
          simulated: !!(aiResult && (aiResult.provider === 'dummy' || aiResult.provider === 'dummy-image')),
          finished_at: new Date().toISOString()
        }, aiResult));
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
  startDummyWorker, stopDummyWorker,
  DUMMY_NAME
};
