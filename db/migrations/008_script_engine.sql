-- ===========================================================================
-- 008_script_engine.sql
-- Fasa 7: Script Engine. Jadual `scripts` sebenar (1:N bagi setiap panel).
--
-- Satu panel boleh mempunyai lebih daripada satu script item (narration,
-- dialogue, thought, sfx, dll). Hubungan sebenar:
--   Project -> Scene -> Panel -> Scripts (1:N)
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, constraint berpandu guard, dan
-- cipta semula CHECK status projek. Tidak menyentuh jadual/medan/migration
-- lama. Cascade delete apabila panel dipadam. TIADA panggilan AI / imej.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS scripts (
  id              BIGSERIAL PRIMARY KEY,
  project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id        BIGINT REFERENCES scenes(id) ON DELETE CASCADE,
  panel_id        BIGINT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,

  script_order    INTEGER NOT NULL CHECK (script_order > 0),
  script_type     TEXT NOT NULL DEFAULT 'narration',
  speaker_code    TEXT NOT NULL DEFAULT '',
  speaker_name    TEXT NOT NULL DEFAULT '',

  text_ar         TEXT NOT NULL DEFAULT '',
  text_ms         TEXT NOT NULL DEFAULT '',

  emotion         TEXT NOT NULL DEFAULT 'neutral',
  bubble_type     TEXT NOT NULL DEFAULT 'narration',
  reading_order   INTEGER NOT NULL DEFAULT 1 CHECK (reading_order > 0),

  status          TEXT NOT NULL DEFAULT 'draft',
  notes           TEXT NOT NULL DEFAULT '',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scripts_project_id ON scripts(project_id);
CREATE INDEX IF NOT EXISTS idx_scripts_scene_id   ON scripts(scene_id);
CREATE INDEX IF NOT EXISTS idx_scripts_panel_id   ON scripts(panel_id);

-- Idempotensi generate: gabungan (panel_id, script_order) mestilah unik.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scripts_panel_script_order_key') THEN
    ALTER TABLE scripts ADD CONSTRAINT scripts_panel_script_order_key UNIQUE (panel_id, script_order);
  END IF;
END $$;

-- script_type: narration | dialogue | thought | dua | sfx | caption | reaction.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scripts_script_type_check') THEN
    ALTER TABLE scripts ADD CONSTRAINT scripts_script_type_check
      CHECK (script_type IN
        ('narration', 'dialogue', 'thought', 'dua', 'sfx', 'caption', 'reaction'));
  END IF;
END $$;

-- bubble_type: speech | thought | narration | dua | sfx | caption | none.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scripts_bubble_type_check') THEN
    ALTER TABLE scripts ADD CONSTRAINT scripts_bubble_type_check
      CHECK (bubble_type IN
        ('speech', 'thought', 'narration', 'dua', 'sfx', 'caption', 'none'));
  END IF;
END $$;

-- emotion: neutral | calm | solemn | sad | happy | angry | fear | surprised
--          | thinking | respectful | wonder.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scripts_emotion_check') THEN
    ALTER TABLE scripts ADD CONSTRAINT scripts_emotion_check
      CHECK (emotion IN
        ('neutral', 'calm', 'solemn', 'sad', 'happy', 'angry', 'fear',
         'surprised', 'thinking', 'respectful', 'wonder'));
  END IF;
END $$;

-- status: draft | approved.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scripts_status_check') THEN
    ALTER TABLE scripts ADD CONSTRAINT scripts_status_check
      CHECK (status IN ('draft', 'approved'));
  END IF;
END $$;

-- Trigger updated_at (guna fungsi sedia ada set_updated_at() daripada 001).
DROP TRIGGER IF EXISTS trg_scripts_updated_at ON scripts;
CREATE TRIGGER trg_scripts_updated_at
  BEFORE UPDATE ON scripts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
