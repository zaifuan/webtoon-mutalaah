'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const healthRouter = require('./routes/health');
const projectsRouter = require('./routes/projects');
const textsRouter = require('./routes/texts');
const charactersRouter = require('./routes/characters');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ---------------------------------------------------------------------------
// Middleware asas
// ---------------------------------------------------------------------------
// Had 1mb supaya teks Mutalaah yang panjang boleh disimpan.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---------------------------------------------------------------------------
// Laluan API
// ---------------------------------------------------------------------------
app.use('/api', healthRouter);

// Fasa 1 — modul projek & teks.
// Kedua-dua router dipasang pada /api/projects; laluan mereka tidak bertindih
// ('/' & '/:id' untuk projek; '/:id/text' untuk teks).
app.use('/api/projects', projectsRouter);
app.use('/api/projects', textsRouter);

// Fasa 2 — character engine. Dipasang pada /api kerana ia merangkumi
// laluan /projects/:id/characters dan /characters/:id.
app.use('/api', charactersRouter);

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
