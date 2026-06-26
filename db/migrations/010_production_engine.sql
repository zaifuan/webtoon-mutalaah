-- ===========================================================================
-- 010_production_engine.sql — Fasa 9: Production Engine (LOCAL-FIRST)
--
-- Infrastruktur queue/worker yang GENERIK. project_id/scene_id/panel_id ialah
-- rujukan longgar (BIGINT nullable, TANPA FK) supaya enjin tidak terikat kepada
-- Webtoon Mutalaah sahaja — projek lain (cth. Smart I'rab) boleh guna jadual
-- yang sama. Worker hanya menerima Job.
--
-- TIADA perubahan kepada pipeline kandungan / projects_status_check.
-- Idempotent.
-- ===========================================================================

BEGIN;

-- ---- production_jobs -------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_jobs (
  id              BIGSERIAL PRIMARY KEY,
  project_id      BIGINT,
  scene_id        BIGINT,
  panel_id        BIGINT,
  job_type        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  priority        TEXT NOT NULL DEFAULT 'normal',
  worker_name     TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retry       INTEGER NOT NULL DEFAULT 3,
  depends_on_job  BIGINT REFERENCES production_jobs(id) ON DELETE SET NULL,
  payload_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json     JSONB,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_jobs_type_check') THEN
    ALTER TABLE production_jobs ADD CONSTRAINT production_jobs_type_check
      CHECK (job_type IN (
        'TEXT_PARSE','CHARACTER_GENERATION','SCENE_GENERATION','PANEL_GENERATION',
        'SCRIPT_GENERATION','VISUAL_GENERATION','PROMPT_GENERATION','IMAGE_GENERATION',
        'REVIEW','EXPORT'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_jobs_status_check') THEN
    ALTER TABLE production_jobs ADD CONSTRAINT production_jobs_status_check
      CHECK (status IN ('pending','claimed','running','completed','failed','cancelled'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_jobs_priority_check') THEN
    ALTER TABLE production_jobs ADD CONSTRAINT production_jobs_priority_check
      CHECK (priority IN ('high','normal','low'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pjobs_status     ON production_jobs(status);
CREATE INDEX IF NOT EXISTS idx_pjobs_priority   ON production_jobs(priority);
CREATE INDEX IF NOT EXISTS idx_pjobs_project    ON production_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_pjobs_depends    ON production_jobs(depends_on_job);
CREATE INDEX IF NOT EXISTS idx_pjobs_created    ON production_jobs(created_at);

DROP TRIGGER IF EXISTS trg_pjobs_updated_at ON production_jobs;
CREATE TRIGGER trg_pjobs_updated_at
  BEFORE UPDATE ON production_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---- workers ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workers (
  id             BIGSERIAL PRIMARY KEY,
  worker_name    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'online',
  last_heartbeat TIMESTAMPTZ,
  current_job    BIGINT,
  cpu_usage      REAL,
  ram_usage      REAL,
  gpu_usage      REAL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workers_worker_name_key') THEN
    ALTER TABLE workers ADD CONSTRAINT workers_worker_name_key UNIQUE (worker_name);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workers_status_check') THEN
    ALTER TABLE workers ADD CONSTRAINT workers_status_check
      CHECK (status IN ('online','offline','busy'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);

DROP TRIGGER IF EXISTS trg_workers_updated_at ON workers;
CREATE TRIGGER trg_workers_updated_at
  BEFORE UPDATE ON workers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
