-- ===========================================================================
-- 001_init.sql
-- Skema awal untuk Webtoon Mutalaah (Fasa 0).
-- Aliran data: projects -> texts / characters / scenes -> pages -> panels
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Fungsi pencetus untuk mengemas kini kolum updated_at secara automatik.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id          BIGSERIAL PRIMARY KEY,
  title_ar    TEXT,
  title_ms    TEXT,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- texts (teks Mutalaah asal + terjemahan)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS texts (
  id             BIGSERIAL PRIMARY KEY,
  project_id     BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  original_ar    TEXT,
  translation_ms TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_texts_project_id ON texts(project_id);

DROP TRIGGER IF EXISTS trg_texts_updated_at ON texts;
CREATE TRIGGER trg_texts_updated_at
  BEFORE UPDATE ON texts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- characters
-- character_type dihadkan kepada 3 nilai sahaja. Bagi noble_figure_no_face,
-- Fasa 1 WAJIB menyuntik peraturan: no face / no facial features /
-- face replaced by soft glowing light / respectful Islamic depiction
-- (rujuk src/config/characterTypes.js).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS characters (
  id             BIGSERIAL PRIMARY KEY,
  project_id     BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name_ar        TEXT,
  name_ms        TEXT,
  character_type TEXT NOT NULL DEFAULT 'ordinary_character'
                 CHECK (character_type IN (
                   'ordinary_character',
                   'noble_figure_no_face',
                   'background_character'
                 )),
  role           TEXT,
  visual_dna     JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'draft',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_characters_project_id ON characters(project_id);

COMMENT ON COLUMN characters.character_type IS
  'ordinary_character | noble_figure_no_face | background_character';

DROP TRIGGER IF EXISTS trg_characters_updated_at ON characters;
CREATE TRIGGER trg_characters_updated_at
  BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- scenes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenes (
  id         BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_no   INTEGER NOT NULL,
  title_ar   TEXT,
  summary_ms TEXT,
  mood       TEXT,
  location   TEXT,
  status     TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, scene_no)
);

CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);

DROP TRIGGER IF EXISTS trg_scenes_updated_at ON scenes;
CREATE TRIGGER trg_scenes_updated_at
  BEFORE UPDATE ON scenes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- pages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pages (
  id         BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id   BIGINT REFERENCES scenes(id) ON DELETE CASCADE,
  page_no    INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pages_project_id ON pages(project_id);
CREATE INDEX IF NOT EXISTS idx_pages_scene_id ON pages(scene_id);

DROP TRIGGER IF EXISTS trg_pages_updated_at ON pages;
CREATE TRIGGER trg_pages_updated_at
  BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- panels
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS panels (
  id             BIGSERIAL PRIMARY KEY,
  project_id     BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id       BIGINT REFERENCES scenes(id) ON DELETE CASCADE,
  page_id        BIGINT REFERENCES pages(id) ON DELETE CASCADE,
  panel_no       INTEGER NOT NULL,
  visual_ms      TEXT,
  dialogue_ar    TEXT,
  translation_ms TEXT,
  caption_ar     TEXT,
  caption_ms     TEXT,
  camera         TEXT,
  mood           TEXT,
  image_prompt   TEXT,
  image_url      TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_panels_project_id ON panels(project_id);
CREATE INDEX IF NOT EXISTS idx_panels_scene_id ON panels(scene_id);
CREATE INDEX IF NOT EXISTS idx_panels_page_id ON panels(page_id);

DROP TRIGGER IF EXISTS trg_panels_updated_at ON panels;
CREATE TRIGGER trg_panels_updated_at
  BEFORE UPDATE ON panels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
