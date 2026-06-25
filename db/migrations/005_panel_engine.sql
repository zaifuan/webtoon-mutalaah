-- ===========================================================================
-- 005_panel_engine.sql
-- Fasa 4: medan tambahan untuk Panel/Storyboard Draft Engine pada jadual
-- `panels`. Idempotent. Jadual `panels` sudah ada (001) dengan: id, project_id,
-- scene_id, page_id, panel_no, visual_ms, dialogue_ar, translation_ms,
-- caption_ar, caption_ms, camera, mood, image_prompt, image_url, status,
-- created_at, updated_at.
-- ===========================================================================

ALTER TABLE panels ADD COLUMN IF NOT EXISTS panel_order     INTEGER;
ALTER TABLE panels ADD COLUMN IF NOT EXISTS panel_type      TEXT;
ALTER TABLE panels ADD COLUMN IF NOT EXISTS characters_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE panels ADD COLUMN IF NOT EXISTS location        TEXT;
ALTER TABLE panels ADD COLUMN IF NOT EXISTS action_ms       TEXT;
ALTER TABLE panels ADD COLUMN IF NOT EXISTS emotion_ms      TEXT;
ALTER TABLE panels ADD COLUMN IF NOT EXISTS visual_notes    TEXT;
ALTER TABLE panels ADD COLUMN IF NOT EXISTS composition     TEXT;
ALTER TABLE panels ADD COLUMN IF NOT EXISTS shot_type       TEXT;
ALTER TABLE panels ADD COLUMN IF NOT EXISTS dialogue_ms     TEXT;
ALTER TABLE panels ADD COLUMN IF NOT EXISTS needs_image     BOOLEAN NOT NULL DEFAULT TRUE;

-- panel_type: nilai asas (benarkan NULL untuk baris lama).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'panels_panel_type_check') THEN
    ALTER TABLE panels
      ADD CONSTRAINT panels_panel_type_check
      CHECK (panel_type IS NULL OR panel_type IN
        ('establishing', 'character', 'dialogue', 'action', 'reaction', 'transition', 'reveal', 'closing'));
  END IF;
END $$;

-- shot_type: nilai asas (benarkan NULL untuk baris lama).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'panels_shot_type_check') THEN
    ALTER TABLE panels
      ADD CONSTRAINT panels_shot_type_check
      CHECK (shot_type IS NULL OR shot_type IN
        ('wide', 'medium', 'close_up', 'over_shoulder', 'low_angle', 'high_angle', 'detail'));
  END IF;
END $$;

-- Idempotensi generate: satu panel_no bagi setiap babak.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'panels_scene_panel_no_key') THEN
    ALTER TABLE panels
      ADD CONSTRAINT panels_scene_panel_no_key UNIQUE (scene_id, panel_no);
  END IF;
END $$;
