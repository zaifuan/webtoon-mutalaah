'use strict';

// ===========================================================================
// scripts/link-orphan-images.js — ONE-OFF RECOVERY (bukan code production)
//
// Kesan imej janaan "anak yatim": job IMAGE_GENERATION sudah 'completed' &
// result_json ada image.path (cth. images/_generated/gen-xxx.png), TETAPI belum
// dikaitkan ke panel (tiada baris image_assets bagi panel_id itu). Link semula
// guna logik sama di productionEngine.linkGeneratedImage().
//
// Selamat dijalankan berulangkali (idempotent): ia langkau panel yang sudah ada
// image_assets aktif. Tidak menyentuh ComfyUI; tidak menjana imej baru.
//
// Cara guna:  node scripts/link-orphan-images.js [projectId]
// ===========================================================================

require('dotenv').config();

const pool = require('../src/db/pool');
const eng = require('../src/services/productionEngine');

function parseResult(v) {
  if (v == null) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } }
  return v;
}

async function main() {
  const projectId = process.argv[2] ? Number(process.argv[2]) : null;

  const where = "job_type = 'IMAGE_GENERATION' AND status = 'completed' AND result_json IS NOT NULL";
  const sql = projectId
    ? 'SELECT id, project_id, scene_id, panel_id, result_json FROM production_jobs WHERE ' + where + ' AND project_id = $1 ORDER BY id ASC'
    : 'SELECT id, project_id, scene_id, panel_id, result_json FROM production_jobs WHERE ' + where + ' ORDER BY id ASC';
  const params = projectId ? [projectId] : [];
  const r = await pool.query(sql, params);

  let linked = 0, skipped = 0, errors = 0;
  for (const job of r.rows) {
    const result = parseResult(job.result_json);
    const img = result && result.image;
    if (!img || !img.path) { skipped++; continue; }
    if (!job.panel_id || !job.project_id) { skipped++; continue; }
    try {
      const out = await eng.linkGeneratedImage(job, result);
      if (out) { linked++; console.log('LINKED job#' + job.id + ' panel#' + job.panel_id + ' -> ' + out.image_path); }
      else { skipped++; console.log('SKIP job#' + job.id + ' (tiada sumber / panel tidak sah)'); }
    } catch (e) {
      errors++; console.error('ERROR job#' + job.id + ':', e.message);
    }
  }

  console.log('---');
  console.log('linked=' + linked + ' skipped=' + skipped + ' errors=' + errors);
  await pool.end();
}

main().catch(function (e) {
  console.error('FATAL:', e && e.message ? e.message : e);
  process.exit(1);
});
