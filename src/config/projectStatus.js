'use strict';

// ---------------------------------------------------------------------------
// Status projek mengikut urutan aliran kerja (draf → diterbitkan).
// Nilai ini MESTI selaras dengan CHECK constraint dalam
// db/migrations/002_phase1.sql.
// ---------------------------------------------------------------------------
const PROJECT_STATUS = Object.freeze({
  DRAFT: 'draft',
  TEXT_READY: 'text_ready',
  CHARACTER_READY: 'character_ready',
  SCENE_READY: 'scene_ready',
  STORYBOARD_READY: 'storyboard_ready',
  SCRIPT_READY: 'script_ready',
  PANEL_READY: 'panel_ready',
  IMAGE_PROMPT_READY: 'image_prompt_ready',
  IMAGE_GENERATED: 'image_generated',
  PUBLISHED: 'published'
});

const PROJECT_STATUS_VALUES = Object.freeze(Object.values(PROJECT_STATUS));

// Peringkat awal yang status-nya masih dikawal oleh kehadiran teks Arab.
// Jika projek sudah melepasi peringkat ini (Fasa 2+), menyimpan teks TIDAK
// akan mensurutkan statusnya semula.
const EARLY_STAGES = Object.freeze([
  PROJECT_STATUS.DRAFT,
  PROJECT_STATUS.TEXT_READY
]);

module.exports = {
  PROJECT_STATUS,
  PROJECT_STATUS_VALUES,
  EARLY_STAGES
};
