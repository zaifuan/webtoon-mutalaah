-- ===========================================================================
-- 006_visual_director.sql
-- Fasa 5: Visual Director Engine. Satu rekod `visuals` bagi setiap panel (1:1).
-- Idempotent: CREATE TABLE IF NOT EXISTS, ADD COLUMN/constraint berpandu guard,
-- dan cipta semula CHECK status projek untuk menambah 'visual_ready'.
-- Tidak menyentuh jadual/medan/migration lama.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS visuals (
  id                BIGSERIAL PRIMARY KEY,
  project_id        BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id          BIGINT REFERENCES scenes(id) ON DELETE CASCADE,
  panel_id          BIGINT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,

  -- Camera
  camera            TEXT,
  shot              TEXT,
  angle             TEXT,
  lens              TEXT,
  composition       TEXT,
  camera_movement   TEXT,

  -- Character layout / continuity (array objek per-watak)
  characters_layout JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Environment
  location          TEXT,
  weather           TEXT,
  time_of_day       TEXT,
  lighting          TEXT,
  atmosphere        TEXT,
  foreground_object TEXT,
  background_object TEXT,

  -- Art direction
  color_palette     TEXT,
  detail_level      TEXT,
  depth             TEXT,
  focus             TEXT,
  visual_priority   TEXT,

  -- Safety
  face_policy       TEXT,
  visual_notes      TEXT,
  sensitive_object  TEXT,

  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visuals_project_id ON visuals(project_id);
CREATE INDEX IF NOT EXISTS idx_visuals_scene_id ON visuals(scene_id);
CREATE INDEX IF NOT EXISTS idx_visuals_panel_id ON visuals(panel_id);

-- Satu visual bagi setiap panel.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visuals_panel_id_key') THEN
    ALTER TABLE visuals ADD CONSTRAINT visuals_panel_id_key UNIQUE (panel_id);
  END IF;
END $$;

-- CHECK bagi medan terbendung utama (selebihnya divalidasi di lapisan aplikasi).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visuals_face_policy_check') THEN
    ALTER TABLE visuals ADD CONSTRAINT visuals_face_policy_check
      CHECK (face_policy IS NULL OR face_policy IN ('normal', 'glowing_light'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visuals_shot_check') THEN
    ALTER TABLE visuals ADD CONSTRAINT visuals_shot_check
      CHECK (shot IS NULL OR shot IN
        ('establishing_shot','wide_shot','full_shot','medium_shot','medium_close_up',
         'close_up','extreme_close_up','over_the_shoulder','insert_detail'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visuals_angle_check') THEN
    ALTER TABLE visuals ADD CONSTRAINT visuals_angle_check
      CHECK (angle IS NULL OR angle IN
        ('eye_level','low_angle','high_angle','birds_eye','worms_eye','dutch_angle'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visuals_lighting_check') THEN
    ALTER TABLE visuals ADD CONSTRAINT visuals_lighting_check
      CHECK (lighting IS NULL OR lighting IN
        ('soft_daylight','warm_sunlight','golden_light','overcast_diffuse',
         'dramatic_shadow','backlight','moonlight','divine_glow'));
  END IF;
END $$;

-- Trigger updated_at.
DROP TRIGGER IF EXISTS trg_visuals_updated_at ON visuals;
CREATE TRIGGER trg_visuals_updated_at
  BEFORE UPDATE ON visuals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tambah status projek 'visual_ready' (antara panel_ready dan image_prompt_ready).
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
    'image_prompt_ready',
    'image_generated',
    'published'
  ));
