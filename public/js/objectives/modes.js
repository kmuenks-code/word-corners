// Modes: which objectives are in play, at what difficulty, and what ends
// the game.
//
// A mode is the layer where "endless with no objectives" and any future
// game mode differ from each other. Everything below them — the
// definitions, the tracker, the runtime — is identical in every mode, so
// adding a mode never touches game logic.
//
// A mode is:
//   id, label         identity
//   difficulty        the tier its objectives resolve their params at, or
//                     null for plain defaults (see definitions.js)
//   selectObjectives  () -> specs[]. Called at game start and on every
//                     reset, so a mode that varies its set re-rolls per
//                     game.
//   limits            { moves, seconds } — null means no limit. `moves`
//                     counts letters placed. `seconds` needs a UI ticker
//                     calling runtime.tick(); it is otherwise only checked
//                     when an event arrives.
//   endOnComplete     finishing every objective ends the game as a win
//   endOnFailure      any failed objective ends the game as a loss
//   evaluate          (mode, view) -> { status, reason }. Defaults to the
//                     standard rules below; override for a mode that needs
//                     something else entirely.

import { ObjectiveStatus } from './tracker.js';
import { DEFAULT_DIFFICULTY, DIFFICULTY_LABELS, assertDifficulty } from './difficulty.js';

export const ModeOutcome = Object.freeze({
  // ACTIVE also means "no verdict applies" — an endless game that ended
  // with no objectives in play finishes ACTIVE, since it was never a
  // contest to win or lose.
  ACTIVE: 'active',
  WON: 'won',
  LOST: 'lost',
});

const NO_LIMITS = Object.freeze({ moves: null, seconds: null });

// view is { objectives, counters: { moves, words, score, elapsedSeconds } }.
function standardEvaluate(mode, view) {
  const { objectives, counters } = view;

  if (mode.endOnFailure && objectives.some((o) => o.status === ObjectiveStatus.FAILED)) {
    return { status: ModeOutcome.LOST, reason: 'objectiveFailed' };
  }

  // Note an enduring objective never reports COMPLETE mid-game, so a set
  // containing one can't be cleared early — you have to see the game out.
  const allComplete =
    objectives.length > 0 && objectives.every((o) => o.status === ObjectiveStatus.COMPLETE);
  if (mode.endOnComplete && allComplete) {
    return { status: ModeOutcome.WON, reason: 'objectivesComplete' };
  }

  const { moves, seconds } = mode.limits;
  if (moves !== null && counters.moves >= moves && !allComplete) {
    return { status: ModeOutcome.LOST, reason: 'outOfMoves' };
  }
  if (seconds !== null && counters.elapsedSeconds >= seconds && !allComplete) {
    return { status: ModeOutcome.LOST, reason: 'outOfTime' };
  }

  return { status: ModeOutcome.ACTIVE, reason: null };
}

export function defineMode({
  id,
  label,
  difficulty = null,
  selectObjectives = () => [],
  limits,
  endOnComplete = true,
  endOnFailure = true,
  evaluate = standardEvaluate,
}) {
  return Object.freeze({
    id,
    label,
    difficulty: assertDifficulty(difficulty),
    selectObjectives,
    limits: Object.freeze({ ...NO_LIMITS, ...limits }),
    endOnComplete,
    endOnFailure,
    evaluate,
  });
}

// The shipped default: the game exactly as it is today. No objectives, no
// limits, no verdict — the runtime detects this and skips all bookkeeping,
// so an endless game pays nothing for the system being wired in.
export const NO_OBJECTIVES = defineMode({
  id: 'none',
  label: 'Endless',
  selectObjectives: () => [],
  endOnComplete: false,
  endOnFailure: false,
});

// A bare type name is shorthand for a spec with no param overrides — the
// common case, since the difficulty tier supplies the numbers.
function toSpec(entry) {
  return typeof entry === 'string' ? { type: entry } : entry;
}

// A fixed set of objectives — the straightforward "here is your list" mode,
// and what every entry in GAME_MODES compiles down to.
export function challenge({
  id = 'challenge',
  label = 'Challenge',
  objectives = [],
  difficulty = null,
  limits,
  ...rest
}) {
  const specs = objectives.map(toSpec);
  return defineMode({
    id,
    label,
    difficulty,
    selectObjectives: () => specs,
    limits,
    ...rest,
  });
}

// ---------------------------------------------------------------------
// The Objective mode's random draw
// ---------------------------------------------------------------------

// How many objectives a player is dealt, per difficulty tier. The single
// knob for "how much are you juggling at once" — change these numbers and
// nothing else. Note this stacks with each objective's own byDifficulty
// tuning: Expert deals four objectives *and* each one asks for its expert
// number, so raising a tier here makes the game meaningfully harder in two
// ways at once.
export const OBJECTIVES_PER_DIFFICULTY = Object.freeze({
  easy: 1,
  medium: 2,
  hard: 3,
  expert: 4,
});

// What the Objective mode draws from. Plain specs, so this is a balancing
// table like any other. Entries sharing a `type` are *variants* of one
// objective — the draw picks distinct types first, then one variant of
// each, so a player never gets dealt "4 words in NW" and "4 words in SE"
// as two of their three goals. Add a variant by adding a row; add a whole
// new objective by adding a definition and one row here.
export const OBJECTIVE_POOL = Object.freeze([
  // length/exact are stated because they pick the variant; count is left
  // to a difficulty tier. The 4-letter variant carries its own curve —
  // four-letter words are much harder to land than three-letter ones, so
  // asking for the same number would make it a far steeper objective while
  // reading as an equal one. A per-spec byDifficulty is the way to do that
  // without either duplicating the definition or hard-coding a count
  // (which would stop difficulty flushing through at all).
  { type: 'wordsOfLength', params: { length: 3, exact: true } },
  {
    type: 'wordsOfLength',
    params: { length: 4, exact: true },
    byDifficulty: { easy: { count: 3 }, medium: { count: 6 }, hard: { count: 9 }, expert: { count: 12 } },
  },
  { type: 'words' },
  { type: 'totalScore' },
  { type: 'wordsInCorner', params: { corner: 'nw' } },
  { type: 'wordsInCorner', params: { corner: 'ne' } },
  { type: 'wordsInCorner', params: { corner: 'sw' } },
  { type: 'wordsInCorner', params: { corner: 'se' } },
]);

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

// Draws `count` objectives: distinct types, one random variant of each.
// Capped at the number of distinct types available, so asking for more
// objectives than the pool can distinctly supply deals what it can rather
// than repeating one.
export function drawObjectives(pool, count, random = Math.random) {
  const byType = new Map();
  pool.forEach((spec) => {
    if (!byType.has(spec.type)) byType.set(spec.type, []);
    byType.get(spec.type).push(spec);
  });

  const types = [...byType.keys()];
  const drawn = [];
  const wanted = Math.min(count, types.length);
  for (let i = 0; i < wanted; i++) {
    const type = types.splice(Math.floor(random() * types.length), 1)[0];
    drawn.push(pick(byType.get(type), random));
  }
  return drawn;
}

// ---------------------------------------------------------------------
// The mode table
// ---------------------------------------------------------------------

// The game modes on offer, in the order the splash screen lists them. Pure
// data on purpose: a mode is a name plus the objectives it asks for (fixed
// via `objectives`, or drawn via `pool` + `perDifficulty`), and the
// difficulty tier fills in the numbers — so adding a mode is a row here and
// adding an objective is an entry in definitions.js, with neither touching
// logic.
//
// `usesDifficulty` is what the splash reads to decide whether to ask for a
// tier at all. `limits` and the endOnComplete/endOnFailure flags are
// optional and fall through to defineMode's defaults.
export const GAME_MODES = Object.freeze([
  {
    id: 'endless',
    label: 'Endless',
    blurb: 'Build words until all four corners close.',
    objectives: [],
    usesDifficulty: false,
    endOnComplete: false,
    endOnFailure: false,
  },
  {
    id: 'objective',
    label: 'Objective',
    blurb: 'Complete your goals before the board closes.',
    pool: OBJECTIVE_POOL,
    perDifficulty: OBJECTIVES_PER_DIFFICULTY,
    usesDifficulty: true,
  },
]);

export function getGameMode(id) {
  return GAME_MODES.find((mode) => mode.id === id) ?? null;
}

// For the splash screen: every mode, with the copy it needs and whether it
// should ask for a difficulty.
export function listGameModes() {
  return GAME_MODES.map((mode) => ({
    id: mode.id,
    label: mode.label,
    blurb: mode.blurb ?? '',
    usesDifficulty: mode.usesDifficulty === true,
  }));
}

// How many objectives `id` deals at `difficulty` — for a difficulty picker
// that wants to say "3 objectives" next to Hard.
export function objectiveCountFor(id, difficulty) {
  const mode = getGameMode(id);
  if (!mode?.pool) return mode?.objectives?.length ?? 0;
  const wanted = mode.perDifficulty?.[assertDifficulty(difficulty)] ?? 0;
  return Math.min(wanted, new Set(mode.pool.map((s) => s.type)).size);
}

// Compiles one row of GAME_MODES into a live mode at the chosen difficulty.
// This is the whole "swap in objectives by game mode and difficulty" story:
// createMode('objective', Difficulty.HARD).
//
// For a pool-backed mode the draw happens inside selectObjectives(), which
// the runtime calls at game start and on every reset — so each new game
// re-rolls its set rather than replaying the one drawn when the mode object
// was built.
export function createMode(id, difficulty = DEFAULT_DIFFICULTY, { random = Math.random } = {}) {
  const mode = getGameMode(id);
  if (!mode) {
    throw new Error(
      `Unknown game mode "${id}". Known modes: ${GAME_MODES.map((m) => m.id).join(', ')}`
    );
  }
  const tier = assertDifficulty(mode.usesDifficulty ? difficulty : null);
  const flags = {
    ...(mode.endOnComplete === undefined ? {} : { endOnComplete: mode.endOnComplete }),
    ...(mode.endOnFailure === undefined ? {} : { endOnFailure: mode.endOnFailure }),
  };
  const label = tier ? `${mode.label} (${DIFFICULTY_LABELS[tier]})` : mode.label;

  if (mode.pool) {
    const count = mode.perDifficulty?.[tier] ?? 0;
    return defineMode({
      id: tier ? `${mode.id}-${tier}` : mode.id,
      label,
      difficulty: tier,
      selectObjectives: () => drawObjectives(mode.pool, count, random),
      limits: mode.limits,
      ...flags,
    });
  }

  return challenge({
    id: tier ? `${mode.id}-${tier}` : mode.id,
    label,
    objectives: mode.objectives,
    difficulty: tier,
    limits: mode.limits,
    ...flags,
  });
}
