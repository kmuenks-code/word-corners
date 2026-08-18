// POST /api/games — record one completed game, return the refreshed bests.
// `env.DB` is the D1 binding from wrangler.toml; the tables it writes to are
// defined in db/schema.sql.
//
// A game writes one `games` row plus one `game_objectives` row per objective
// it was dealt. An Endless game has no objectives and writes only the first.

import { readBests, json } from './shared.js';

// Plausibility bounds. This is a friends-and-family prototype, not a public
// leaderboard — these exist to keep a typo or a stray script from writing
// nonsense into the dataset, not to stop a determined cheater (nothing
// client-side can). Widen them if real play ever exceeds them.
const MAX_SCORE = 100000;
const MAX_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_WORDS = 5000;
// A deal takes at most one objective per type, so this is far above what the
// catalog can currently produce — it only bounds the batch size.
const MAX_OBJECTIVES = 20;
const MAX_GOAL = 100000;

// Mirrors GAME_MODES, Difficulty, and ModeOutcome on the client. Kept as
// literal lists rather than a free-text column so a typo in a payload is a
// 400 rather than a mode that quietly splits the dataset in two.
const MODE_IDS = ['endless', 'objective'];
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
const OUTCOMES = ['active', 'won', 'lost'];
const OUTCOME_REASONS = [
  'objectivesComplete',
  'objectivesUnfinished',
  'objectiveFailed',
  'outOfMoves',
  'outOfTime',
];

function intField(value, max) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > max) return null;
  return value;
}

function enumField(value, allowed) {
  return typeof value === 'string' && allowed.includes(value) ? value : null;
}

// Canonical JSON for an objective's resolved params: keys sorted, so the
// stored string is stable enough to GROUP BY. Two clients serializing the
// same tuning in different key orders must land in the same group, or the
// per-objective success rate splits across near-duplicate rows.
//
// Values are the primitives a definition's params are made of; anything else
// (a nested object, a function that stringified to undefined) means the
// payload didn't come from a real deal.
function canonicalParams(params) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) return null;
  const keys = Object.keys(params).sort();
  if (keys.length > 16) return null;
  const out = {};
  for (const key of keys) {
    const value = params[key];
    const ok =
      (typeof value === 'number' && Number.isFinite(value)) ||
      typeof value === 'boolean' ||
      (typeof value === 'string' && value.length <= 64);
    if (!ok) return null;
    out[key] = value;
  }
  return JSON.stringify(out);
}

// One objective's final state, as the client's objective snapshot reports it
// (see snapshotObjectives in public/js/objectives/tracker.js). Returns null
// on anything malformed, which fails the whole request rather than storing a
// partial deal — a half-recorded game would skew the success rates this
// table exists to measure.
function objectiveRow(entry) {
  if (entry === null || typeof entry !== 'object') return null;

  const type = typeof entry.type === 'string' ? entry.type.slice(0, 64) : '';
  const description =
    typeof entry.description === 'string' ? entry.description.slice(0, 200) : '';
  const params = canonicalParams(entry.params);
  if (!type || !description || params === null) return null;

  // Absent for a mode that lists its objectives outright rather than pricing
  // them, so null is legal here where it isn't for the rest.
  let cost = null;
  if (entry.cost !== null && entry.cost !== undefined) {
    cost = intField(entry.cost, 100);
    if (cost === null) return null;
  }

  const goal = intField(entry.goal, MAX_GOAL);
  const finalValue = intField(entry.finalValue, MAX_GOAL);
  if (goal === null || finalValue === null) return null;

  // finish() resolves every objective to complete or failed before the game
  // is posted, so an 'active' one here means the client posted mid-game.
  const status = enumField(entry.status, ['complete', 'failed']);
  if (status === null) return null;

  return {
    type,
    params,
    cost,
    description,
    goal,
    finalValue,
    enduring: entry.enduring === true ? 1 : 0,
    completed: status === 'complete' ? 1 : 0,
  };
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

  const modeId = enumField(body.modeId, MODE_IDS);
  const outcome = enumField(body.outcome, OUTCOMES);
  if (!modeId || !outcome) {
    return json({ error: 'Unknown modeId or outcome' }, 400);
  }
  // Both are legitimately absent: Endless asks for no tier, and an Endless
  // game has no verdict and so no reason for one.
  const difficulty = body.difficulty == null ? null : enumField(body.difficulty, DIFFICULTIES);
  const outcomeReason =
    body.outcomeReason == null ? null : enumField(body.outcomeReason, OUTCOME_REASONS);
  if (body.difficulty != null && difficulty === null) {
    return json({ error: 'Unknown difficulty' }, 400);
  }
  if (body.outcomeReason != null && outcomeReason === null) {
    return json({ error: 'Unknown outcomeReason' }, 400);
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

  const rawObjectives = body.objectives === undefined ? [] : body.objectives;
  if (!Array.isArray(rawObjectives) || rawObjectives.length > MAX_OBJECTIVES) {
    return json({ error: 'Malformed objectives' }, 400);
  }
  const objectives = rawObjectives.map(objectiveRow);
  if (objectives.some((o) => o === null)) {
    return json({ error: 'Malformed objective result' }, 400);
  }
  const objectivesComplete = objectives.filter((o) => o.completed === 1).length;

  // A 'won' game means every objective was completed, and a game with no
  // objectives can't have a verdict at all. Both are invariants the client
  // maintains; checking them here keeps a broken build from writing rows
  // that would quietly misstate the success rates.
  if (objectives.length === 0 && outcome !== 'active') {
    return json({ error: 'A game with no objectives cannot have a verdict' }, 400);
  }
  if (outcome === 'won' && objectivesComplete !== objectives.length) {
    return json({ error: 'A won game must have every objective complete' }, 400);
  }

  const inserted = await env.DB.prepare(
    `INSERT INTO games
       (player_id, game_version, mode_id, difficulty, outcome, outcome_reason,
        objectives_total, objectives_complete, score, duration_ms, words_total,
        words_3, words_4, words_5, words_6_plus, blanks_earned)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`
  )
    .bind(
      playerId,
      gameVersion,
      modeId,
      difficulty,
      outcome,
      outcomeReason,
      objectives.length,
      objectivesComplete,
      score,
      durationMs,
      wordsTotal,
      words3,
      words4,
      words5,
      words6Plus,
      blanksEarned
    )
    .first();

  const gameId = inserted?.id;
  if (objectives.length > 0 && gameId) {
    const insertObjective = env.DB.prepare(
      `INSERT INTO game_objectives
         (game_id, position, type, params, cost, description,
          goal, final_value, enduring, completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    await env.DB.batch(
      objectives.map((o, position) =>
        insertObjective.bind(
          gameId,
          position,
          o.type,
          o.params,
          o.cost,
          o.description,
          o.goal,
          o.finalValue,
          o.enduring,
          o.completed
        )
      )
    );
  }

  return json(await readBests(env, playerId));
}
