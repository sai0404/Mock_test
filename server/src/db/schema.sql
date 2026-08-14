-- ============================================================
-- Mock Test Portal — Database Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'student', -- 'student' | 'admin'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One uploaded source file can produce one exam (with multiple sections)
CREATE TABLE IF NOT EXISTS exams (
  id                SERIAL PRIMARY KEY,
  title             TEXT NOT NULL,               -- name given by uploader, e.g. "UPUMS 2021 Mock Paper I - PCB"
  description       TEXT,
  category          TEXT,                        -- e.g. "Medical Entrance", "Engineering", "Banking"
  source_filename   TEXT,
  duration_minutes  INTEGER NOT NULL DEFAULT 120,
  marks_correct     NUMERIC NOT NULL DEFAULT 1,
  marks_negative    NUMERIC NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'processing',
                     -- 'processing' | 'needs_review' | 'published' | 'failed'
  parse_warnings    JSONB DEFAULT '[]',
  uploaded_by       INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_exams_title_trgm ON exams USING gin (to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_exams_status ON exams (status);

-- A section within an exam, e.g. Physics / Chemistry / Biology
CREATE TABLE IF NOT EXISTS sections (
  id          SERIAL PRIMARY KEY,
  exam_id     INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS questions (
  id                SERIAL PRIMARY KEY,
  exam_id           INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  section_id        INTEGER REFERENCES sections(id) ON DELETE CASCADE,
  question_number   INTEGER NOT NULL,
  question_type     TEXT NOT NULL DEFAULT 'mcq',   -- 'mcq' | 'numerical'  (numerical = JEE Mains-style value answer, no options)
  question_text     TEXT NOT NULL,
  options           JSONB,                -- { "a": "...", "b": "...", "c": "...", "d": "..." } — null for numerical
  correct_option    TEXT,                 -- "a" | "b" | "c" | "d" — null for numerical
  numeric_answer    NUMERIC,              -- correct value — null for mcq
  numeric_tolerance NUMERIC DEFAULT 0,    -- allowed +/- tolerance when checking numeric answers (e.g. 0.01)
  explanation       TEXT,
  needs_review      BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (exam_id, question_number)
);

CREATE TABLE IF NOT EXISTS attempts (
  id            SERIAL PRIMARY KEY,
  exam_id       INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id),
  student_name  TEXT,                    -- allows guest attempts without login
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at  TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress' | 'submitted' | 'auto_submitted'
  violation_count INTEGER NOT NULL DEFAULT 0,
  score         NUMERIC,
  total_marks   NUMERIC
);

CREATE TABLE IF NOT EXISTS attempt_answers (
  id              SERIAL PRIMARY KEY,
  attempt_id      INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option TEXT,                  -- null = not answered (mcq)
  numeric_value   NUMERIC,               -- null = not answered (numerical type)
  status          TEXT NOT NULL DEFAULT 'not_visited',
                   -- 'not_visited' | 'not_answered' | 'answered' | 'marked_review' | 'answered_marked_review'
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS proctor_events (
  id            SERIAL PRIMARY KEY,
  attempt_id    INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,  -- 'tab_switch' | 'fullscreen_exit' | 'copy_attempt' | 'devtools' | 'blur'
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
