'use strict';

// ===========================================================================
// routes/workers.js — Fasa 9: Worker registry & monitor
//
//   GET  /api/workers               senarai
//   GET  /api/workers/:id           detail
//   POST /api/workers/register      daftar (upsert ikut worker_name)
//   POST /api/workers/:id/heartbeat kemas kini heartbeat + metrik
// ===========================================================================

const express = require('express');
const router = express.Router();

const pool = require('../db/pool');
const eng = require('../services/productionEngine');

function parseId(v) { const n = Number.parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; }

function workerView(w) {
  if (!w) return null;
  return {
    id: w.id,
    worker_name: w.worker_name,
    status: w.status,
    last_heartbeat: w.last_heartbeat,
    current_job: w.current_job,
    cpu_usage: w.cpu_usage,
    ram_usage: w.ram_usage,
    gpu_usage: w.gpu_usage,
    created_at: w.created_at,
    updated_at: w.updated_at
  };
}

// GET /api/workers
router.get('/workers', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM workers ORDER BY worker_name ASC');
    const sm = await pool.query(
      'SELECT ' +
      "count(*) FILTER (WHERE status='online') AS online, " +
      "count(*) FILTER (WHERE status='offline') AS offline, " +
      "count(*) FILTER (WHERE status='busy') AS busy, " +
      'count(*) AS total FROM workers'
    );
    const row = sm.rows[0];
    res.json({
      ok: true,
      summary: { online: Number(row.online), offline: Number(row.offline), busy: Number(row.busy), total: Number(row.total) },
      workers: r.rows.map(workerView)
    });
  } catch (err) {
    console.error('[workers] list:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memuatkan worker' });
  }
});

// GET /api/workers/:id
router.get('/workers/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID worker tidak sah' });
  try {
    const r = await pool.query('SELECT * FROM workers WHERE id = $1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ ok: false, error: 'Worker tidak dijumpai' });
    res.json({ ok: true, worker: workerView(r.rows[0]) });
  } catch (err) {
    console.error('[workers] get:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal memuatkan worker' });
  }
});

// POST /api/workers/register
router.post('/workers/register', async (req, res) => {
  const name = req.body && req.body.worker_name;
  if (!name || !String(name).trim()) return res.status(400).json({ ok: false, error: 'worker_name diperlukan' });
  try {
    const w = await eng.registerWorker(String(name).trim());
    res.status(201).json({ ok: true, worker: workerView(w) });
  } catch (err) {
    console.error('[workers] register:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mendaftar worker' });
  }
});

// POST /api/workers/:id/heartbeat
router.post('/workers/:id/heartbeat', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID worker tidak sah' });
  const b = req.body || {};
  if (b.status !== undefined && eng.WORKER_STATUS.indexOf(b.status) === -1) {
    return res.status(400).json({ ok: false, error: 'status worker tidak sah' });
  }
  try {
    const found = await pool.query('SELECT worker_name FROM workers WHERE id = $1', [id]);
    if (found.rows.length === 0) return res.status(404).json({ ok: false, error: 'Worker tidak dijumpai' });
    const w = await eng.heartbeat(found.rows[0].worker_name, {
      status: b.status, current_job: b.current_job,
      cpu_usage: b.cpu_usage, ram_usage: b.ram_usage, gpu_usage: b.gpu_usage
    });
    res.json({ ok: true, worker: workerView(w) });
  } catch (err) {
    console.error('[workers] heartbeat:', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mengemas kini heartbeat' });
  }
});

module.exports = router;
