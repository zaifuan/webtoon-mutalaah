'use strict';

const { Pool } = require('pg');

// Connection pool PostgreSQL.
// Jika DATABASE_URL disediakan, ia digunakan; jika tidak, kita guna
// pemboleh ubah PG* yang berasingan (lebih mudah dibaca semasa dev/docker).
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.PGHOST || 'db',
      port: parseInt(process.env.PGPORT || '5432', 10),
      user: process.env.PGUSER || 'webtoon',
      password: process.env.PGPASSWORD || 'webtoon',
      database: process.env.PGDATABASE || 'webtoon_mutalaah',
      max: parseInt(process.env.PG_POOL_MAX || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

// Elakkan proses tergantung jika berlaku ralat pada klien yang melahu.
pool.on('error', (err) => {
  console.error('[webtoon-mutalaah] Ralat tak dijangka pada PostgreSQL pool:', err.message);
});

module.exports = pool;
