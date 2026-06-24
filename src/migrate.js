'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const pool = require('./db/pool');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

async function run() {
  const client = await pool.connect();
  try {
    // Jadual untuk menjejak migration yang telah dijalankan (idempotent).
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('[migrate] Tiada fail migration dijumpai.');
      return;
    }

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (rows.length > 0) {
        console.log(`[migrate] Langkau (sudah dijalankan): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] Menjalankan: ${file}`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] Selesai: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Gagal pada ${file}: ${err.message}`);
      }
    }

    console.log('[migrate] Semua migration selesai.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[migrate] Ralat:', err.message);
  process.exit(1);
});
