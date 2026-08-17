// POST /api/games — record one completed game, return the refreshed bests.
// `env.DB` is the D1 binding from wrangler.toml; the table it writes to is
// defined in db/schema.sql.

import { readBests, json } from './shared.js';

// Plausibility bounds. This is a friends-and-family prototype, not a public
// leaderboard — these exist to keep a typo or a stray script from writing
// nonsense into the dataset, not to stop a determined cheater (nothing
// client-side can). Widen them if real play ever exceeds them.
const MAX_SCORE = 100000;
const MAX_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_WORDS = 5000;

function intField(value, max) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > max) return null;
  return value;
}

export async function handleGamesPost(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const playerId = typeof body.playerId === 'string' ? body.playerId.slice(0, 64) : '';
  const gameVersion =
    typeof body.gameVersion === 'string' ? body.gameVersion.slice(0, 32) : '';
  if (!playerId || !gameVersion) {
    return json({ error: 'playerId and gameVersion are required' }, 400);
  }

  const score = intField(body.score, MAX_SCORE);
  const durationMs = intField(body.durationMs, MAX_DURATION_MS);
  const wordsTotal = intField(body.wordsTotal, MAX_WORDS);
  const words3 = intField(body.words3, MAX_WORDS);
  const words4 = intField(body.words4, MAX_WORDS);
  const words5 = intField(body.words5, MAX_WORDS);
  const words6Plus = intField(body.words6Plus, MAX_WORDS);
  const blanksEarned = intField(body.blanksEarned, MAX_WORDS);

  const fields = [score, durationMs, wordsTotal, words3, words4, words5, words6Plus, blanksEarned];
  if (fields.some((f) => f === null)) {
    return json({ error: 'Malformed game summary' }, 400);
  }
  // The per-length counts are a partition of wordsTotal, so a mismatch means
  // the payload didn't come from a real game.
  if (words3 + words4 + words5 + words6Plus !== wordsTotal) {
    return json({ error: 'Word counts do not sum to wordsTotal' }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO games
       (player_id, game_version, score, duration_ms, words_total,
        words_3, words_4, words_5, words_6_plus, blanks_earned)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      playerId,
      gameVersion,
      score,
      durationMs,
      wordsTotal,
      words3,
      words4,
      words5,
      words6Plus,
      blanksEarned
    )
    .run();

  return json(await readBests(env, playerId));
}
