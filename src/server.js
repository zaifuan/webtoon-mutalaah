'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const healthRouter = require('./routes/health');
const projectsRouter = require('./routes/projects');
const textsRouter = require('./routes/texts');
const charactersRouter = require('./routes/characters');
const scenesRouter = require('./routes/scenes');
const panelsRouter = require('./routes/panels');
const visualsRouter = require('./routes/visuals');
const promptsRouter = require('./routes/prompts');
const scriptsRouter = require('./routes/scripts');
const reviewRouter = require('./routes/review');
const imagesRouter = require('./routes/images');
const imageAssetService = require('./services/imageAssetService');
const jobsRouter = require('./routes/jobs');
const workersRouter = require('./routes/workers');
const productionEngine = require('./services/productionEngine');
const aiRouter = require('./routes/ai');
const promptContextRouter = require('./routes/promptContext');
const imageRouter = require('./routes/image');
const pipelineRouter = require('./routes/pipeline');
const previewRouter = require('./routes/preview');

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

// Fasa 3 — scene/babak engine. Juga dipasang pada /api kerana ia merangkumi
// laluan /projects/:id/scenes, /projects/:id/scenes/reorder dan /scenes/:id.
app.use('/api', scenesRouter);

// Fasa 4 — panel/storyboard draft engine. Dipasang pada /api kerana ia
// merangkumi /projects/:id/panels, /scenes/:id/panels, /panels/:id, dll.
app.use('/api', panelsRouter);

// Fasa 5 — visual director engine. Dipasang pada /api kerana ia merangkumi
// /projects/:id/visuals, /panels/:id/visual, /visuals/:id, dll.
app.use('/api', visualsRouter);

// Fasa 6 — image prompt engine. Dipasang pada /api kerana ia merangkumi
// /projects/:id/prompts, /panels/:id/generate-prompt, /prompts/:id, dll.
app.use('/api', promptsRouter);

// Fasa 7 — script engine. Dipasang pada /api kerana ia merangkumi
// /projects/:id/scripts, /panels/:id/generate-scripts, /scripts/:id, dll.
app.use('/api', scriptsRouter);

// Fasa 7B — review & QA (read-only). Merangkumi /projects/:id/review,
// /panels/:id/review, /projects/:id/review/export.
app.use('/api', reviewRouter);

// Fasa 8 — local image workflow. Merangkumi /projects/:id/images,
// /panels/:id/image, /panels/:id/image/upload, /projects/:id/images/import-local,
// /images/:id (PUT & DELETE).
app.use('/api', imagesRouter);

// Fasa 9 — production engine (generik). Merangkumi /jobs (+ /jobs/next,
// /jobs/:id/start|complete|fail|retry|cancel) dan /workers (+ register/heartbeat).
app.use('/api', jobsRouter);
app.use('/api', workersRouter);

// Fasa 10 — AI Worker abstraction. /ai/providers, /ai/default (GET & POST).
app.use('/api', aiRouter);

// Fasa 11B — Prompt Context Builder preview. /prompts/context, /prompts/templates.
app.use('/api', promptContextRouter);

// Fasa 12 — Image Generator abstraction. /image/providers, /image/default, health.
app.use('/api', imageRouter);

// Fasa 14 — Auto Production Pipeline. /projects/:id/production/{start,status,cancel}.
app.use('/api', pipelineRouter);

// Fasa 15 — Webtoon Preview Engine (read-only). /projects/:id/preview.
app.use('/api', previewRouter);

// Apa-apa laluan /api/* yang tidak dikenali → 404 JSON yang kemas.
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Laluan API tidak dijumpai' });
});

// ---------------------------------------------------------------------------
// Frontend statik (mobile-first, tanpa React)
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fasa 8 — sajikan gambar yang dimuat naik secara statik di /uploads/images/...
// Pastikan folder asas wujud (uploads/images) supaya muat naik & import berfungsi.
imageAssetService.ensureBaseDirSync();
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ---------------------------------------------------------------------------
// Mula pelayan
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[webtoon-mutalaah] Pelayan berjalan di port ${PORT}`);
  // Fasa 9 — mulakan dummy worker in-process (claim → sleep 3s → complete).
  // Boleh dimatikan dengan DISABLE_DUMMY_WORKER=1 (cth. semasa ujian).
  if (process.env.DISABLE_DUMMY_WORKER !== '1') {
    productionEngine.startDummyWorker();
  }
});

module.exports = app;
