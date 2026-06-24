-- ===========================================================================
-- 002_phase1.sql
-- Fasa 1: kuatkuasa nilai status projek + satu rekod teks bagi setiap projek.
-- Idempotent: guard pg_constraint supaya selamat walaupun dijalankan berulang.
-- ===========================================================================

-- 1) CHECK constraint bagi projects.status (9 nilai aliran kerja).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_status_check
      CHECK (status IN (
        'draft',
        'text_ready',
        'character_ready',
        'storyboard_ready',
        'script_ready',
        'panel_ready',
        'image_prompt_ready',
        'image_generated',
        'published'
      ));
  END IF;
END $$;

-- 2) Satu rekod teks bagi setiap projek.
--    Membolehkan upsert pada PUT /api/projects/:id/text (ON CONFLICT).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'texts_project_id_key'
  ) THEN
    ALTER TABLE texts
      ADD CONSTRAINT texts_project_id_key UNIQUE (project_id);
  END IF;
END $$;
