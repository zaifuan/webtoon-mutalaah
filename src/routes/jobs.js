'use strict';

// ===========================================================================
// routes/jobs.js — Fasa 9: Production Jobs + Dummy Worker endpoints
//
//   POST   /api/jobs                 cipta job
//   GET    /api/jobs                 senarai (filter/search/sort) + ringkasan
//   GET    /api/jobs/next            claim job seterusnya (worker)
//   GET    /api/jobs/:id             detail
//   DELETE /api/jobs/:id             padam
//   POST   /api/jobs/:id/retry       retry (failed/cancelled)
//   POST   /api/jobs/:id/cancel      cancel
//   POST   /api/jobs/:id/start       worker: mula (running)
//   POST   /api/jobs/:id/complete    worker: selesai
//   POST   /api/jobs/:id/fail        worker: gagal (retry/failed)
// ===========================================================================

const express = require('express');
const router = express.Router();

const pool = require('../db/pool');
const eng = require('../services/productionEngine');

function parseId(v) { const n = Number.parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; }
function asJsonb(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch (e) { return null; }
}
function jget(v) { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; }

function jobView(j) {
  if (!j) return null;
  return {
    id: j.id,
    project_id: j.project_id,
    scene_id: j.scene_id,
    panel_id: j.panel_id,
    job_type: j.job_type,
    status: j.status,
    priority: j.priority,
    worker_name: j.worker_name,
    started_at: j.started_at,
    completed_at: j.completed_at,
    retry_count: j.retry_count,
    max_retry: j.max_retry,
    depends_on_job: j.depends_on_job,
    payload_json: jget(j.payload_json),
    result_json: jget(j.result_json),
    error_message: j.error_message,
    created_at: j.created_at,
    updated_at: j.updated_at
  };
}

// ---------------------------------------------------------------------------
// POST /api/jobs — cipta job
// ---------------------------------------------------------------------------
router.post('/jobs', async (req, res) => {
  const b = req.body || {};
  if (!b.job_type || eng.JOB_TYPES.indexOf(b.job_type) === -1) {
    return res.status(400).json({ ok: false, error: 'job_type tidak sah' });
  }
  const priority = b.priority || 'normal';
  if (eng.PRIORITIES.indexOf(priority) === -1) {
    return res.status(400).json({ ok: false, error: 'priority tidak sah' });
  }
  const maxRetry = Number.isInteger(b.max_retry) ? b.max_retry : 3;
  try {
    if (b.depends_on_job != null) {
      const dep = await pool.query('SELECT 1 FROM production_jobs WHERE id = $1', [b.depends_on_job]);
      if (dep.rows.length === 0) return res.status(400).json({ ok: false, error: 'depends_on_job tidak wujud' });
    }
    const r = await pool.query(
      'INSERT INTO production_jobs ' +
      '(project_id, scene_id, panel_id, job_type, status, priority, max_retry, depends_on_job, payload_json) ' +
      "VALUES ($1,$2,$3,$4,'pending',$5,$6,$7, COALESCE($8,'{}'::jsonb)) RETURNING *",
      [b.project_id != null ? b.project_id : null,
        b.scene_id != null ? b.scene_id : null,
        b.panel_id != null ? b.panel_id : null,
        b.job_type, priority, maxRetry,
        b.depends_on_job != null ? b.depends_on_job : null,
        asJsonb(b.payload_json)]
    );
    res.status(201).json({ ok: true, job: jobView(r.rows[0]) });
  } catch (err) {
    console.error('[jobs] create:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mencipta job' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs — senarai + ringkasan (filter: status, priority, job_type,
// project_id; search: q; sort: created_at|priority|status)
// ---------------------------------------------------------------------------
router.get('/jobs', async (req, res) => {
  try {
    const where = [];
    const vals = [];
    let i = 1;
    const q = req.query || {};
    if (q.status) { where.push('status = $' + (i++)); vals.push(String(q.status)); }
    if (q.priority) { where.push('priority = $' + (i++)); vals.push(String(q.priority)); }
    if (q.job_type) { where.push('job_type = $' + (i++)); vals.push(String(q.job_type)); }
    if (q.project_id) { where.push('project_id = $' + (i++)); vals.push(Number(q.project_id)); }
    if (q.q) {
      where.push('(job_type ILIKE $' + i + ' OR worker_name ILIKE $' + i + ' OR error_message ILIKE $' + i + ')');
      vals.push('%' + String(q.q) + '%'); i++;
    }
    let order = 'created_at DESC';
    if (q.sort === 'priority') order = "CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END ASC, created_at DESC";
    else if (q.sort === 'status') order = 'status ASC, created_at DESC';
    else if (q.sort === 'oldest') order = 'created_at ASC';

    const sql = 'SELECT * FROM production_jobs' + (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ' ORDER BY ' + order + ' LIMIT 500';
    const r = await pool.query(sql, vals);

    const sm = await pool.query(
      'SELECT ' +
      "count(*) FILTER (WHERE status='pending')   AS pending, " +
      "count(*) FILTER (WHERE status='claimed')   AS claimed, " +
      "count(*) FILTER (WHERE status='running')   AS running, " +
      "count(*) FILTER (WHERE status='completed') AS completed, " +
      "count(*) FILTER (WHERE status='failed')    AS failed, " +
      "count(*) FILTER (WHERE status='cancelled') AS cancelled, " +
      'count(*) AS total FROM production_jobs'
    );
    const row = sm.rows[0];
    const summary = {
      pending: Number(row.pending), claimed: Number(row.claimed), running: Number(row.running),
      completed: Number(row.completed), failed: Number(row.failed), cancelled: Number(row.cancelled),
      total: Number(row.total)
    };

    res.json({ ok: true, summary: summary, jobs: r.rows.map(jobView) });
  } catch (err) {
    console.error('[jobs] list:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memuatkan senarai job' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs/next — worker claim (DIDAHULUKAN sebelum /jobs/:id)
// ---------------------------------------------------------------------------
router.get('/jobs/next', async (req, res) => {
  const worker = (req.query && req.query.worker_name) || (req.body && req.body.worker_name) || null;
  try {
    const job = await eng.claimNextJob(worker);
    res.json({ ok: true, job: job ? jobView(job) : null });
  } catch (err) {
    console.error('[jobs] next:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal claim job' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id
// ---------------------------------------------------------------------------
router.get('/jobs/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID job tidak sah' });
  try {
    const r = await pool.query('SELECT * FROM production_jobs WHERE id = $1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ ok: false, error: 'Job tidak dijumpai' });
    res.json({ ok: true, job: jobView(r.rows[0]) });
  } catch (err) {
    console.error('[jobs] get:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memuatkan job' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/jobs/:id
// ---------------------------------------------------------------------------
router.delete('/jobs/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID job tidak sah' });
  try {
    const r = await pool.query('DELETE FROM production_jobs WHERE id = $1 RETURNING id', [id]);
    if (r.rows.length === 0) return res.status(404).json({ ok: false, error: 'Job tidak dijumpai' });
    res.json({ ok: true, deleted: true });
  } catch (err) {
    console.error('[jobs] delete:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memadam job' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:id/retry
// ---------------------------------------------------------------------------
router.post('/jobs/:id/retry', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID job tidak sah' });
  try {
    const exists = await pool.query('SELECT status FROM production_jobs WHERE id = $1', [id]);
    if (exists.rows.length === 0) return res.status(404).json({ ok: false, error: 'Job tidak dijumpai' });
    const job = await eng.retryJob(id);
    if (!job) return res.status(409).json({ ok: false, error: 'Hanya job failed/cancelled boleh di-retry' });
    res.json({ ok: true, job: jobView(job) });
  } catch (err) {
    console.error('[jobs] retry:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal retry job' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:id/cancel
// ---------------------------------------------------------------------------
router.post('/jobs/:id/cancel', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID job tidak sah' });
  try {
    const exists = await pool.query('SELECT status FROM production_jobs WHERE id = $1', [id]);
    if (exists.rows.length === 0) return res.status(404).json({ ok: false, error: 'Job tidak dijumpai' });
    const job = await eng.cancelJob(id);
    if (!job) return res.status(409).json({ ok: false, error: 'Job sudah selesai/gagal, tidak boleh dibatalkan' });
    res.json({ ok: true, job: jobView(job) });
  } catch (err) {
    console.error('[jobs] cancel:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal membatalkan job' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:id/start  (worker)
// ---------------------------------------------------------------------------
router.post('/jobs/:id/start', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID job tidak sah' });
  try {
    const worker = (req.body && req.body.worker_name) || null;
    const job = await eng.startJob(id, worker);
    if (!job) return res.status(409).json({ ok: false, error: 'Job tidak boleh dimulakan (status tidak sesuai)' });
    res.json({ ok: true, job: jobView(job) });
  } catch (err) {
    console.error('[jobs] start:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memulakan job' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:id/complete  (worker)
// ---------------------------------------------------------------------------
router.post('/jobs/:id/complete', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID job tidak sah' });
  try {
    const job = await eng.completeJob(id, (req.body && req.body.result_json) || null);
    if (!job) return res.status(409).json({ ok: false, error: 'Job tidak boleh diselesaikan' });
    res.json({ ok: true, job: jobView(job) });
  } catch (err) {
    console.error('[jobs] complete:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menyelesaikan job' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:id/fail  (worker) — retry atau failed
// ---------------------------------------------------------------------------
router.post('/jobs/:id/fail', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID job tidak sah' });
  try {
    const out = await eng.failJob(id, (req.body && req.body.error_message) || null);
    if (!out) return res.status(404).json({ ok: false, error: 'Job tidak dijumpai' });
    res.json({ ok: true, job: jobView(out.job), requeued: out.requeued });
  } catch (err) {
    console.error('[jobs] fail:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal menanda job gagal' });
  }
});

module.exports = router;
