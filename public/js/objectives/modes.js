// Modes: which objectives are in play, and what ends the game.
//
// A mode is the layer where "endless with no objectives" and any future
// game mode differ from each other. Everything below them — the
// definitions, the tracker, the runtime — is identical in every mode, so
// adding a mode never touches game logic.
//
// A mode is:
//   id, label         identity
//   difficulty        the tier the player chose, carried for labelling only
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
import { describeSpec } from './definitions.js';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_LABELS,
  DIFFICULTY_ORDER,
  assertDifficulty,
} from './difficulty.js';

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

  // An enduring objective is a limit, not a target: it never reports
  // COMPLETE mid-game, only at game end via finalizeObjectives. So "every
  // objective COMPLETE" would never be true for a set containing one, and
  // a deal of three targets plus one limit could only ever be won by
  // playing the board all the way closed — with the limit live the whole
  // time, so playing on can only lose a game that is already won.
  //
  // The win condition is therefore "nothing left to do": every *target* is
  // complete, and no objective — target or limit — has failed. A limit
  // that is currently being kept is being kept; stopping here is exactly
  // what finalizeObjectives would resolve it as anyway.
  //
  // `targets.length > 0` is what stops a hypothetical all-limits deal from
  // being won on move zero for doing nothing. Such a deal can't be dealt
  // today (one row per type, and the one enduring type's rungs cost less
  // than any budget), and if one ever can be, it plays to the normal
  // all-corners-closed ending instead of resolving instantly.
  const targets = objectives.filter((o) => !o.enduring);
  const allComplete =
    targets.length > 0 &&
    targets.every((o) => o.status === ObjectiveStatus.COMPLETE) &&
    objectives.every((o) => o.status !== ObjectiveStatus.FAILED);
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

// A bare type name is shorthand for a spec with no param overrides.
function toSpec(entry) {
  return typeof entry === 'string' ? { type: entry } : entry;
}

// A fixed set of objectives — the straightforward "here is your list" mode.
export function challenge({
  id = 'challenge',
  label = 'Challenge',
  objectives = [],
  difficulty = null,
  limits,
  ...rest
}) {
  const specs = objectives.map(toSpec);
  return defineMode({ id, label, difficulty, selectObjectives: () => specs, limits, ...rest });
}

// ---------------------------------------------------------------------
// The Objective mode: a points budget, spent on priced objectives
// ---------------------------------------------------------------------

// What each difficulty tier is worth. A tier does NOT fix how many
// objectives you get — it fixes their combined `cost`, so an Easy game is
// one 4-cost objective, or two 2-cost ones, or a 3 and a 1, and so on.
// This is the single knob for how much a tier asks of the player.
export const POINT_BUDGETS = Object.freeze({
  easy: 4,
  medium: 8,
  hard: 12,
  expert: 16,
});

const CORNERS = ['nw', 'ne', 'sw', 'se'];

// One priced row per corner, since "clear N words in the NW corner" and the
// same in SE are the same task in different places — writing all four out
// by hand would quadruple this table for no extra information.
function perCorner(count, cost) {
  return CORNERS.map((corner) => ({ type: 'wordsInCorner', params: { corner, count }, cost }));
}

// Same idea for the two restrictive corner types below.
function perCornerOnlyLength(length, cost) {
  return CORNERS.map((corner) => ({
    type: 'cornerOnlyLength',
    params: { corner, length, count: 1 },
    cost,
  }));
}
function perCornerWordLimit(limit, cost) {
  return CORNERS.map((corner) => ({ type: 'cornerWordLimit', params: { corner, limit }, cost }));
}

// The priced catalog the Objective mode draws from.
//
// `cost` is this exact tuning's difficulty in budget points — the whole
// balancing surface now lives in this column. It is deliberately NOT called
// `points`: the game already means "score" by that word (see `event.points`
// and totalScore's `params.points`, which sits right next to it here).
//
// Rows sharing a `type` are alternative tunings of one objective; a deal
// takes at most one row per type (see selectWithinBudget), so a player is
// never handed "score 8 three-letter words" alongside "score 18" of them,
// where the first is just a milestone of the second.
//
// Costs are reasoned, not playtested — see the warning in CLAUDE.md. The
// ladder runs 1 / 2 / 3 / 4 / 6, and every type has a 1-cost rung so any
// leftover budget can always be filled.
export const OBJECTIVE_POOL = Object.freeze([
  // Word hunts by exact length. Longer words are far harder to land, so
  // the counts drop sharply as `length` rises for the same cost.
  { type: 'wordsOfLength', params: { length: 3, exact: true, count: 4 }, cost: 1 },
  { type: 'wordsOfLength', params: { length: 3, exact: true, count: 8 }, cost: 2 },
  { type: 'wordsOfLength', params: { length: 3, exact: true, count: 13 }, cost: 3 },
  { type: 'wordsOfLength', params: { length: 3, exact: true, count: 18 }, cost: 4 },
  { type: 'wordsOfLength', params: { length: 3, exact: true, count: 25 }, cost: 6 },
  { type: 'wordsOfLength', params: { length: 4, exact: true, count: 2 }, cost: 1 },
  { type: 'wordsOfLength', params: { length: 4, exact: true, count: 4 }, cost: 2 },
  { type: 'wordsOfLength', params: { length: 4, exact: true, count: 6 }, cost: 4 },
  { type: 'wordsOfLength', params: { length: 4, exact: true, count: 8 }, cost: 5 },
  { type: 'wordsOfLength', params: { length: 5, exact: false, count: 2 }, cost: 4 },
  { type: 'wordsOfLength', params: { length: 5, exact: false, count: 4 }, cost: 5 },
  { type: 'wordsOfLength', params: { length: 5, exact: false, count: 7 }, cost: 8 },
  { type: 'wordsOfLength', params: { length: 6, exact: false, count: 2 }, cost: 6 },
  { type: 'wordsOfLength', params: { length: 7, exact: true, count: 1 }, cost: 6 },

  // Total words cleared, any length.
  { type: 'words', params: { count: 6 }, cost: 1 },
  { type: 'words', params: { count: 12 }, cost: 2 },
  { type: 'words', params: { count: 18 }, cost: 3 },
  { type: 'words', params: { count: 24 }, cost: 4 },
  { type: 'words', params: { count: 32 }, cost: 6 },

  // Words that begin with a vowel. Roughly a third of the draw is vowels
  // (CATEGORY_WEIGHTS in letterSource.js) and a vowel is only useful as an
  // opener if the corner is empty when it arrives, so these counts sit well
  // below the equivalent `words` rungs at the same cost. No 1-cost rung: the
  // cheapest ask here is already three words that had to start a corner a
  // particular way. Other types carry the pool's 1-cost rows, so a remainder
  // is still always fillable — same arrangement as cornerOnlyLength.
  { type: 'wordsStartingWithVowel', params: { count: 3 }, cost: 2 },
  { type: 'wordsStartingWithVowel', params: { count: 6 }, cost: 4 },
  { type: 'wordsStartingWithVowel', params: { count: 9 }, cost: 6 },
  { type: 'wordsStartingWithVowel', params: { count: 12 }, cost: 8 },

  // Points. Climbs steeply because word scoring is superlinear.
  { type: 'totalScore', params: { points: 20 }, cost: 1 },
  { type: 'totalScore', params: { points: 40 }, cost: 2 },
  { type: 'totalScore', params: { points: 60 }, cost: 3 },
  { type: 'totalScore', params: { points: 80 }, cost: 4 },
  { type: 'totalScore', params: { points: 100 }, cost: 6 },

  // One named corner, all four available at each rung.
  ...perCorner(3, 1),
  ...perCorner(5, 2),
  ...perCorner(7, 3),
  ...perCorner(9, 4),
  ...perCorner(11, 6),

  // Restrictive: only this exact length may ever be scored in the named
  // corner, and landing one is the whole objective (see cornerOnlyLength
  // in definitions.js — a wrong-length word there fails it on the spot).
  // Priced steeper than the equivalent wordsOfLength row for the same
  // length: needing exactly one word is easy on its own, but the corner
  // stays a live landmine for the rest of the game, and every other
  // objective that would naturally want to use this corner now has to
  // route around it too. Deliberately no 1- or 2-cost rung — this type is
  // meant to be out of reach at Easy's smallest budgets. (Feasibility at
  // every tier still holds: other types already carry the pool's 1-cost
  // rows, which is all `selectWithinBudget` needs to fill a remainder —
  // see the "1-cost rung for every type" note in CLAUDE.md, which is
  // about *this type's own* reachability, not a hard requirement.)
  ...perCornerOnlyLength(5, 4),
  ...perCornerOnlyLength(6, 6),

  // Restrictive: the named corner must never reach `limit` words, total —
  // 0 is a pass (see cornerWordLimit in definitions.js). Priced lighter
  // than cornerOnlyLength: "mostly leave this corner alone" is a real
  // strategy (just don't drop letters there), where "land exactly the
  // right length" is not. Lower limit is the harsher constraint, so it
  // costs more.
  ...perCornerWordLimit(2, 2),
  ...perCornerWordLimit(3, 1),
]);

function groupByType(pool) {
  const byType = new Map();
  pool.forEach((row) => {
    if (!byType.has(row.type)) byType.set(row.type, []);
    byType.get(row.type).push(row);
  });
  return byType;
}

function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// What a row claims exclusively, so no deal can contain two rows claiming
// the same thing.
//
// A row always claims its type — rows sharing one are alternative tunings,
// and "score 8 three-letter words" alongside "score 18" of them is just a
// milestone of the bigger one. A corner-scoped row *additionally* claims its
// corner, because the three corner types make demands of one corner that
// don't survive being combined: "clear 5 words here" and "score fewer than 2
// words here" are each reasonable and jointly unwinnable, and "land one
// 6-letter word here and nothing else" is winnable beside "clear 5 words
// here" only if the 6-letter word happens to land first — a rule the player
// is never shown. Rather than enumerate which pairs conflict (a table that
// grows with every type added, and that someone has to remember to extend),
// the corner is treated as the scarce thing, exactly as the type already is.
//
// Note no objective type declares itself corner-scoped: carrying a `corner`
// param *is* the signal, the same convention renderObjectiveList (ui.js)
// uses to decide whether to draw a shape. A future corner type therefore
// gets this for free.
function exclusionKeys(row) {
  const keys = [`type:${row.type}`];
  if (row.params?.corner) keys.push(`corner:${row.params.corner}`);
  return keys;
}

// Exhaustive depth-first search for a set of rows that spends `remaining`
// *exactly*, claiming each exclusion key at most once and taking exactly
// `need` rows in total. Returns null only when no such set exists — every
// affordable row is tried at each type, plus the branch that skips the type
// — so a null is proof of infeasibility rather than an unlucky roll.
//
// Fixing `need` up front is what keeps deal sizes varied. Searching without
// it biases hard toward using every type (the "take a row" branches vastly
// outnumber the single "skip" branch), which would make an Easy game four
// 1-cost objectives almost every time instead of sometimes one 4-cost one.
//
// `used` is mutated and restored around each branch rather than copied. That
// is safe only because a row whose key is already claimed is filtered out
// before the branch is taken, so every key this frame adds is one it owns.
function findCombination(types, index, remaining, need, byType, random, used = new Set()) {
  if (need === 0) return remaining === 0 ? [] : null;
  if (index >= types.length) return null;
  if (types.length - index < need) return null; // not enough types left

  const affordable = byType
    .get(types[index])
    .filter((row) => row.cost <= remaining && !exclusionKeys(row).some((key) => used.has(key)));
  for (const row of shuffled(affordable, random)) {
    const keys = exclusionKeys(row);
    keys.forEach((key) => used.add(key));
    const rest = findCombination(
      types,
      index + 1,
      remaining - row.cost,
      need - 1,
      byType,
      random,
      used
    );
    keys.forEach((key) => used.delete(key));
    if (rest) return [row, ...rest];
  }
  return findCombination(types, index + 1, remaining, need, byType, random, used);
}

// Which deal sizes a budget can be spent on exactly. Deterministic — the
// search is exhaustive, so the random order only affects which combination
// comes back, never whether one exists.
export function feasibleDealSizes(pool, budget) {
  const byType = groupByType(pool);
  const types = [...byType.keys()];
  const sizes = [];
  for (let need = 1; need <= types.length; need++) {
    if (findCombination(types, 0, budget, need, byType, () => 0)) sizes.push(need);
  }
  return sizes;
}

// Deals a set of objectives costing exactly `budget`.
//
// Picks the deal size first, uniformly among the sizes that can be spent
// exactly, then finds a combination of that size. So an Easy budget of 4 is
// as likely to be one 4-cost objective as it is four 1-cost ones.
export function selectWithinBudget(pool, budget, random = Math.random) {
  const byType = groupByType(pool);
  const sizes = feasibleDealSizes(pool, budget);
  if (sizes.length === 0) {
    throw new Error(
      `No combination of objectives costs exactly ${budget}. ` +
        `Available costs: ${[...new Set(pool.map((r) => r.cost))].sort((a, b) => a - b).join(', ')}`
    );
  }
  const need = sizes[Math.floor(random() * sizes.length)];
  const types = shuffled([...byType.keys()], random);
  return findCombination(types, 0, budget, need, byType, random);
}

// ---------------------------------------------------------------------
// The mode table
// ---------------------------------------------------------------------

// The game modes on offer, in the order the splash screen lists them. Pure
// data: a mode is a name plus the objectives it asks for — a fixed
// `objectives` array, or a `pool` plus `budgets` for a priced draw.
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
    budgets: POINT_BUDGETS,
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

// Compiles one row of GAME_MODES into a live mode at the chosen difficulty.
// This is the whole "swap in objectives by game mode and difficulty" story:
// createMode('objective', Difficulty.HARD).
//
// For a pool-backed mode the draw happens inside selectObjectives(), which
// the runtime calls at game start and on every reset — so each new game
// re-rolls its set rather than replaying the one drawn when the mode object
// was built.
//
// The live mode keeps the table row's `id` unsuffixed — the tier lives in
// `difficulty`, which is on the mode and in the snapshot beside it, so
// folding it into the id too would only make the recorded `mode_id` say
// "objective-hard" and force a LIKE to group all Objective games. The
// human-facing tier is in `label`.
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
    const budget = mode.budgets?.[tier] ?? 0;
    return defineMode({
      id: mode.id,
      label,
      difficulty: tier,
      selectObjectives: () => selectWithinBudget(mode.pool, budget, random),
      limits: mode.limits,
      ...flags,
    });
  }

  return challenge({
    id: mode.id,
    label,
    objectives: mode.objectives,
    difficulty: tier,
    limits: mode.limits,
    ...flags,
  });
}

// Checked once at module load, for the same reason getDefinition throws on
// an unknown type: a budget the pool can't spend exactly is a data bug, and
// it should surface at startup naming the tier rather than at the moment a
// player picks that difficulty and the deal comes back empty.
(function validatePool() {
  // A corner-scoped objective's description no longer names its corner —
  // the UI shows that as a shape (see js/cornerSymbols.js) — so the four
  // per-corner variants of a rung describe identically. An error message
  // has to say which row it means, hence the corner key spliced back in.
  const rowLabel = (row) =>
    row.params?.corner ? `${describeSpec(row)} [${row.params.corner}]` : describeSpec(row);

  GAME_MODES.filter((mode) => mode.pool).forEach((mode) => {
    // Every row must name a real definition and carry a usable cost.
    mode.pool.forEach((row) => {
      describeSpec(row); // throws on an unknown type or bad params
      if (!Number.isInteger(row.cost) || row.cost < 1) {
        throw new Error(
          `Objective pool row "${rowLabel(row)}" has an invalid cost ${row.cost}; ` +
            'costs must be positive integers.'
        );
      }
    });
    DIFFICULTY_ORDER.forEach((tier) => {
      const budget = mode.budgets?.[tier];
      if (budget === undefined) {
        throw new Error(`Game mode "${mode.id}" has no point budget for difficulty "${tier}".`);
      }
      if (feasibleDealSizes(mode.pool, budget).length === 0) {
        throw new Error(
          `Game mode "${mode.id}" cannot spend its ${tier} budget of ${budget} exactly ` +
            'with one objective per type. Add a cheaper rung, or change the budget.'
        );
      }
    });
  });
})();
