-- ===========================================================================
-- 004_scene_engine.sql
-- Fasa 3: medan tambahan untuk Scene/Babak Engine pada jadual `scenes`,
-- serta status projek baharu 'scene_ready'. Idempotent.
-- Jadual `scenes` sudah ada (001): id, project_id, scene_no, title_ar,
-- summary_ms, mood, location, status, created_at, updated_at,
-- UNIQUE(project_id, scene_no).
-- ===========================================================================

ALTER TABLE scenes ADD COLUMN IF NOT EXISTS title_ms        TEXT;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS source_hint     TEXT;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS characters_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS scene_type      TEXT;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS estimated_pages INTEGER NOT NULL DEFAULT 1;

-- scene_type: nilai asas yang dibenarkan (benarkan NULL untuk baris lama).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scenes_scene_type_check'
  ) THEN
    ALTER TABLE scenes
      ADD CONSTRAINT scenes_scene_type_check
      CHECK (scene_type IS NULL OR scene_type IN
        ('intro', 'journey', 'meeting', 'lesson', 'event', 'reveal', 'ending'));
  END IF;
END $$;

-- estimated_pages mesti 1..20.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scenes_estimated_pages_check'
  ) THEN
    ALTER TABLE scenes
      ADD CONSTRAINT scenes_estimated_pages_check
      CHECK (estimated_pages IS NULL OR (estimated_pages >= 1 AND estimated_pages <= 20));
  END IF;
END $$;

-- Tambah status projek baharu 'scene_ready' (antara character_ready dan
-- storyboard_ready). Cipta semula CHECK secara idempotent (drop + add).
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
    'image_prompt_ready',
    'image_generated',
    'published'
  ));
