-- ===========================================================================
-- 007_prompt_engine.sql
-- Fasa 6: Image Prompt Engine. Satu rekod `image_prompts` bagi setiap panel
-- (1:1). Idempotent: CREATE TABLE IF NOT EXISTS, constraint berpandu guard,
-- dan cipta semula CHECK status projek untuk menambah 'prompt_ready'.
-- Tidak menyentuh jadual/medan/migration lama. TIADA panggilan AI / imej.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS image_prompts (
  id              BIGSERIAL PRIMARY KEY,
  project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id        BIGINT REFERENCES scenes(id) ON DELETE CASCADE,
  panel_id        BIGINT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,

  prompt_text     TEXT NOT NULL DEFAULT '',
  negative_prompt TEXT NOT NULL DEFAULT '',
  style_preset    TEXT NOT NULL DEFAULT 'webtoon_mutalaah',
  language        TEXT NOT NULL DEFAULT 'en',
  prompt_version  TEXT NOT NULL DEFAULT 'v1',

  status          TEXT NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_prompts_project_id ON image_prompts(project_id);
CREATE INDEX IF NOT EXISTS idx_image_prompts_scene_id ON image_prompts(scene_id);
CREATE INDEX IF NOT EXISTS idx_image_prompts_panel_id ON image_prompts(panel_id);

-- Satu prompt bagi setiap panel.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'image_prompts_panel_id_key') THEN
    ALTER TABLE image_prompts ADD CONSTRAINT image_prompts_panel_id_key UNIQUE (panel_id);
  END IF;
END $$;

-- Status prompt: draft | ready | approved.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'image_prompts_status_check') THEN
    ALTER TABLE image_prompts ADD CONSTRAINT image_prompts_status_check
      CHECK (status IN ('draft', 'ready', 'approved'));
  END IF;
END $$;

-- Trigger updated_at.
DROP TRIGGER IF EXISTS trg_image_prompts_updated_at ON image_prompts;
CREATE TRIGGER trg_image_prompts_updated_at
  BEFORE UPDATE ON image_prompts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tambah status projek 'prompt_ready' (antara visual_ready dan image_prompt_ready).
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN (
    'draft',
    'text_ready',
    'character_ready',
    'scene_ready',
    'storyboard_ready',
    'script_ready',
    'panel_ready',
    'visual_ready',
    'prompt_ready',
    'image_prompt_ready',
    'image_generated',
    'published'
  ));
