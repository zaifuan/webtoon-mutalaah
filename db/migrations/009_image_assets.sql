-- ===========================================================================
-- 009_image_assets.sql — Fasa 8: Local Image Workflow
--
-- Jadual metadata gambar panel (BUKAN binari — hanya path). Satu gambar aktif
-- bagi setiap panel (UNIQUE panel_id). Idempotent.
--
-- Juga menambah status projek 'image_ready' ke CHECK projects_status_check.
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS image_assets (
  id             BIGSERIAL PRIMARY KEY,
  project_id     BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id       BIGINT REFERENCES scenes(id) ON DELETE CASCADE,
  panel_id       BIGINT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
  prompt_id      BIGINT REFERENCES image_prompts(id) ON DELETE SET NULL,
  image_filename TEXT,
  image_path     TEXT,
  thumbnail_path TEXT,
  source_type    TEXT NOT NULL DEFAULT 'manual_upload',
  provider       TEXT NOT NULL DEFAULT 'manual',
  status         TEXT NOT NULL DEFAULT 'uploaded',
  width          INTEGER,
  height         INTEGER,
  file_size      BIGINT,
  mime_type      TEXT,
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu gambar aktif setiap panel.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'image_assets_panel_id_key') THEN
    ALTER TABLE image_assets ADD CONSTRAINT image_assets_panel_id_key UNIQUE (panel_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'image_assets_source_type_check') THEN
    ALTER TABLE image_assets ADD CONSTRAINT image_assets_source_type_check
      CHECK (source_type IN ('manual_upload', 'local_import', 'external_file', 'future_generator'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'image_assets_provider_check') THEN
    ALTER TABLE image_assets ADD CONSTRAINT image_assets_provider_check
      CHECK (provider IN ('manual', 'comfyui', 'forge', 'automatic1111', 'unknown'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'image_assets_status_check') THEN
    ALTER TABLE image_assets ADD CONSTRAINT image_assets_status_check
      CHECK (status IN ('draft', 'uploaded', 'linked', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_image_assets_project ON image_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_image_assets_panel   ON image_assets(panel_id);
CREATE INDEX IF NOT EXISTS idx_image_assets_scene   ON image_assets(scene_id);
CREATE INDEX IF NOT EXISTS idx_image_assets_status  ON image_assets(status);

-- updated_at automatik (guna fungsi set_updated_at() dari migration 001).
DROP TRIGGER IF EXISTS trg_image_assets_updated_at ON image_assets;
CREATE TRIGGER trg_image_assets_updated_at
  BEFORE UPDATE ON image_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tambah status 'image_ready' (selepas prompt_ready). Senarai penuh dikekalkan.
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
    'image_ready',
    'image_prompt_ready',
    'image_generated',
    'published'
  ));

COMMIT;
