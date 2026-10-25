-- IT-ВЕЧЕ: исходная схема (SQLite).
PRAGMA foreign_keys = ON;

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
  eligible_option_ids TEXT NOT NULL,            -- JSON-массив id вариантов
  slots               INTEGER,                  -- tiebreak: сколько мест разыгрывается
  carried_option_ids  TEXT NOT NULL DEFAULT '[]', -- tiebreak: уже прошедшие финалисты
  outcome             TEXT,                     -- JSON итога, вычисляется при закрытии
  opened_at           TEXT NOT NULL,
  closed_at           TEXT,
  published_at        TEXT,
  UNIQUE (session_id, number)
);
CREATE INDEX idx_rounds_session ON voting_rounds (session_id, number);
-- Не больше одного открытого тура в сессии.
CREATE UNIQUE INDEX uq_rounds_one_open ON voting_rounds (session_id) WHERE status = 'open';

CREATE TABLE votes (
  id                  TEXT PRIMARY KEY,
  round_id            TEXT NOT NULL REFERENCES voting_rounds (id) ON DELETE CASCADE,
  option_id           TEXT NOT NULL REFERENCES options (id),
  anonymous_voter_key TEXT NOT NULL,            -- HMAC-SHA256 от ключа устройства или кода; исходный ключ не хранится
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

-- Добровольцы эстафеты. Намеренно НЕТ связи с голосами или ключами участников.
CREATE TABLE volunteer_ideas (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES voting_sessions (id) ON DELETE CASCADE,
  idea       TEXT NOT NULL CHECK (length(idea) BETWEEN 1 AND 2000),
  contact    TEXT NOT NULL CHECK (length(contact) BETWEEN 1 AND 300),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_volunteers_session ON volunteer_ideas (session_id);

-- Одноразовые коды без привязки к именам (опциональный режим). Хранится только HMAC кода.
CREATE TABLE access_codes (
  code_hash  TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES voting_sessions (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_codes_session ON access_codes (session_id);

-- Журнал действий организатора. Без персональных данных участников.
CREATE TABLE admin_audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT NOT NULL,
  session_id TEXT,
  round_id   TEXT,
  details    TEXT,
  ip_hash    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_session ON admin_audit_log (session_id, created_at);

-- Серверные гарантии на уровне БД (дополнительно к проверкам в API).
-- Голос можно записать только в открытый тур.
CREATE TRIGGER trg_votes_round_open BEFORE INSERT ON votes
WHEN (SELECT status FROM voting_rounds WHERE id = NEW.round_id) IS NOT 'open'
BEGIN SELECT RAISE(ABORT, 'round_not_open'); END;

-- Вариант должен быть допущен к туру.
CREATE TRIGGER trg_votes_option_eligible BEFORE INSERT ON votes
WHEN NOT EXISTS (
  SELECT 1 FROM voting_rounds r, json_each(r.eligible_option_ids) e
  WHERE r.id = NEW.round_id AND e.value = NEW.option_id
)
BEGIN SELECT RAISE(ABORT, 'option_not_eligible'); END;

-- Синтетические голоса допустимы только в демо-сессиях.
CREATE TRIGGER trg_votes_synthetic_demo_only BEFORE INSERT ON votes
WHEN NEW.is_synthetic = 1 AND (
  SELECT s.is_demo FROM voting_rounds r JOIN voting_sessions s ON s.id = r.session_id WHERE r.id = NEW.round_id
) = 0
BEGIN SELECT RAISE(ABORT, 'synthetic_votes_demo_only'); END;

-- Голоса неизменяемы.
CREATE TRIGGER trg_votes_immutable BEFORE UPDATE ON votes
BEGIN SELECT RAISE(ABORT, 'votes_are_immutable'); END;
