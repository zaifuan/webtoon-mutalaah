'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const healthRouter = require('./routes/health');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ---------------------------------------------------------------------------
// Middleware asas
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Laluan API
// ---------------------------------------------------------------------------
app.use('/api', healthRouter);

// Apa-apa laluan /api/* yang tidak dikenali → 404 JSON yang kemas.
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Laluan API tidak dijumpai' });
});

// ---------------------------------------------------------------------------
// Frontend statik (mobile-first, tanpa React)
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------------------------------------------------------------------
// Mula pelayan
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[webtoon-mutalaah] Pelayan berjalan di port ${PORT}`);
});

module.exports = app;
