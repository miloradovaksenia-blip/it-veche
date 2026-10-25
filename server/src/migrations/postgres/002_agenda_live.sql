-- Повестка вече (вопрос) и режим показа голосов в реальном времени.
ALTER TABLE voting_sessions ADD COLUMN agenda TEXT NOT NULL DEFAULT 'Какой формат «цифровых 15 минут» выбираем дальше?';
ALTER TABLE voting_sessions ADD COLUMN live_results INTEGER NOT NULL DEFAULT 0 CHECK (live_results IN (0, 1));
