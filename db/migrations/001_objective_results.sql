-- 001 — record which objectives a game completed vs. failed.
--
-- Apply with:
--   npm run db:migrate              (local dev database)
--   npm run db:migrate:staging
--   npm run db:migrate:production
--
-- NOT idempotent: SQLite has no ALTER TABLE ... ADD COLUMN IF NOT EXISTS,
-- so a second run fails with "duplicate column name". That is the intended
-- failure — it means the migration already landed. Run it once per
-- database. db/schema.sql already carries all of this, so a database
-- created after this migration must not be migrated.
--
-- Backfill note: every pre-existing row is marked mode_id='endless',
-- outcome='active'. That is accurate for production, which never served a
-- build with the splash screen — every game recorded there was the endless
-- board. Staging predates that too but is throwaway either way.

ALTER TABLE games ADD COLUMN mode_id             TEXT    NOT NULL DEFAULT 'endless';
ALTER TABLE games ADD COLUMN difficulty          TEXT;
ALTER TABLE games ADD COLUMN outcome             TEXT    NOT NULL DEFAULT 'active';
ALTER TABLE games ADD COLUMN outcome_reason      TEXT;
ALTER TABLE games ADD COLUMN objectives_total    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN objectives_complete INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS game_objectives (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id      INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  type         TEXT    NOT NULL,
  params       TEXT    NOT NULL,
  cost         INTEGER,
  description  TEXT    NOT NULL,
  goal         INTEGER NOT NULL,
  final_value  INTEGER NOT NULL,
  enduring     INTEGER NOT NULL DEFAULT 0,
  completed    INTEGER NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_game_objectives_tuning
  ON game_objectives (type, params);
CREATE INDEX IF NOT EXISTS idx_game_objectives_game
  ON game_objectives (game_id, position);

-- The bests queries now filter on mode_id, so the old score-only indexes
-- no longer serve them. See db/schema.sql for the replacements.
CREATE INDEX IF NOT EXISTS idx_games_mode_score
  ON games (mode_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_games_mode_player_score
  ON games (mode_id, player_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_games_mode_difficulty
  ON games (mode_id, difficulty);

DROP INDEX IF EXISTS idx_games_score;
DROP INDEX IF EXISTS idx_games_player_score;
