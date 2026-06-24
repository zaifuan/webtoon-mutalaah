-- ===========================================================================
-- 003_character_engine.sql
-- Fasa 2: medan tambahan untuk Character Engine pada jadual `characters`.
-- Idempotent: ADD COLUMN IF NOT EXISTS + guard pg_constraint.
-- Jadual `characters` sudah ada (001): id, project_id, name_ar, name_ms,
-- character_type (CHECK), role, visual_dna JSONB, status, created_at, updated_at.
-- ===========================================================================

ALTER TABLE characters ADD COLUMN IF NOT EXISTS character_code      TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS face_policy         TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS appearance_notes    TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS canonical_character BOOLEAN NOT NULL DEFAULT TRUE;

-- face_policy: normal | glowing_light  (benarkan NULL untuk baris lama).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'characters_face_policy_check'
  ) THEN
    ALTER TABLE characters
      ADD CONSTRAINT characters_face_policy_check
      CHECK (face_policy IS NULL OR face_policy IN ('normal', 'glowing_light'));
  END IF;
END $$;

-- character_code mesti unik dalam project yang sama.
-- (UNIQUE membenarkan banyak NULL, jadi selamat untuk baris sedia ada.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'characters_project_code_key'
  ) THEN
    ALTER TABLE characters
      ADD CONSTRAINT characters_project_code_key UNIQUE (project_id, character_code);
  END IF;
END $$;
