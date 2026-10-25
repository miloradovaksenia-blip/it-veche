-- IT-ВЕЧЕ: исходная схема (PostgreSQL). Повторяет migrations/sqlite/001_init.sql.

CREATE TABLE options (
  id          TEXT PRIMARY KEY,
  position    INTEGER NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  accent      TEXT NOT NULL CHECK (accent IN ('coral', 'blue', 'emerald'))
);

CREATE TABLE voting_sessions (
  id                    TEXT PRIMARY KEY,
  slug                  TEXT NOT NULL UNIQUE,
  title                 TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'decided', 'archived')),
  is_demo               INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  access_mode           TEXT NOT NULL DEFAULT 'open' CHECK (access_mode IN ('open', 'codes')),
  expected_participants INTEGER CHECK (expected_participants IS NULL OR expected_participants BETWEEN 1 AND 1000),
  created_at            TEXT NOT NULL
);
CREATE INDEX idx_sessions_created ON voting_sessions (is_demo, created_at);

CREATE TABLE voting_rounds (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES voting_sessions (id) ON DELETE CASCADE,
  number              INTEGER NOT NULL,
  type                TEXT NOT NULL CHECK (type IN ('main', 'tiebreak', 'runoff', 'revote')),
  status              TEXT NOT NULL CHECK (status IN ('open', 'closed', 'published')),
  eligible_option_ids TEXT NOT NULL,
  slots               INTEGER,
  carried_option_ids  TEXT NOT NULL DEFAULT '[]',
  outcome             TEXT,
  opened_at           TEXT NOT NULL,
  closed_at           TEXT,
  published_at        TEXT,
  UNIQUE (session_id, number)
);
CREATE INDEX idx_rounds_session ON voting_rounds (session_id, number);
CREATE UNIQUE INDEX uq_rounds_one_open ON voting_rounds (session_id) WHERE status = 'open';

CREATE TABLE votes (
  id                  TEXT PRIMARY KEY,
  round_id            TEXT NOT NULL REFERENCES voting_rounds (id) ON DELETE CASCADE,
  option_id           TEXT NOT NULL REFERENCES options (id),
  anonymous_voter_key TEXT NOT NULL,
  is_synthetic        INTEGER NOT NULL DEFAULT 0 CHECK (is_synthetic IN (0, 1)),
  created_at          TEXT NOT NULL,
  UNIQUE (round_id, anonymous_voter_key)
);
CREATE INDEX idx_votes_round_option ON votes (round_id, option_id);

CREATE TABLE final_decisions (
  session_id          TEXT PRIMARY KEY REFERENCES voting_sessions (id) ON DELETE CASCADE,
  winning_option_id   TEXT NOT NULL REFERENCES options (id),
  confirmed_at        TEXT NOT NULL,
  confirmation_method TEXT NOT NULL CHECK (confirmation_method IN ('vote', 'ceo')),
  source_round_id     TEXT REFERENCES voting_rounds (id) ON DELETE SET NULL
);

CREATE TABLE volunteer_ideas (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES voting_sessions (id) ON DELETE CASCADE,
  idea       TEXT NOT NULL CHECK (length(idea) BETWEEN 1 AND 2000),
  contact    TEXT NOT NULL CHECK (length(contact) BETWEEN 1 AND 300),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_volunteers_session ON volunteer_ideas (session_id);

CREATE TABLE access_codes (
  code_hash  TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES voting_sessions (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_codes_session ON access_codes (session_id);

CREATE TABLE admin_audit_log (
  id         BIGSERIAL PRIMARY KEY,
  action     TEXT NOT NULL,
  session_id TEXT,
  round_id   TEXT,
  details    TEXT,
  ip_hash    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_session ON admin_audit_log (session_id, created_at);

-- Серверные гарантии на уровне БД.
CREATE FUNCTION veche_votes_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r_status   TEXT;
  r_eligible TEXT;
  s_demo     INTEGER;
BEGIN
  SELECT r.status, r.eligible_option_ids, s.is_demo INTO r_status, r_eligible, s_demo
  FROM voting_rounds r JOIN voting_sessions s ON s.id = r.session_id
  WHERE r.id = NEW.round_id;
  IF r_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'round_not_open';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM json_array_elements_text(r_eligible::json) e WHERE e = NEW.option_id) THEN
    RAISE EXCEPTION 'option_not_eligible';
  END IF;
  IF NEW.is_synthetic = 1 AND s_demo = 0 THEN
    RAISE EXCEPTION 'synthetic_votes_demo_only';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_votes_guard BEFORE INSERT ON votes FOR EACH ROW EXECUTE FUNCTION veche_votes_guard();

CREATE FUNCTION veche_votes_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'votes_are_immutable';
END $$;

CREATE TRIGGER trg_votes_immutable BEFORE UPDATE ON votes FOR EACH ROW EXECUTE FUNCTION veche_votes_immutable();
