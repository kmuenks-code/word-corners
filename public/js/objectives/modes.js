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
import { describeSpec, GLOBAL_SCOPE } from './definitions.js';
import { buildObjectivePool, familyKey, rowsIncompatible } from './generator.js';
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

// How many objectives one deal may contain, however cheap they are. The
// budget alone doesn't bound this — an Expert budget of 16 would otherwise
// admit sixteen 1-cost objectives, which is an unreadable panel rather than
// a hard game. The old pool bounded it accidentally, at the seven types it
// happened to contain.
const MAX_DEAL_SIZE = 6;

// The priced catalog the Objective mode draws from — generated, not
// written. Every combination of word property × scope × constraint that the
// cost model prices inside its bounds becomes a row here; see generator.js
// for the axes and the pricing, and properties.js for the properties
// themselves. Adding a property adds its whole column of objectives — every
// scope, both constraints, a full ladder of counts — without this file
// changing at all.
//
// `cost` is that exact combination's difficulty in budget points. It is
// deliberately NOT called `points`: the game already means "score" by that
// word (see `event.points`).
//
// Rows differing only in their count are alternative tunings of one
// objective — a "family" — and a deal takes at most one row per family, so
// a player is never handed "score 6 or more words here" alongside "score 12
// or more" of them, where the first is just a milestone of the second.
export const OBJECTIVE_POOL = buildObjectivePool();

// Rows that differ only in their count, grouped. The search takes at most
// one row per family, which is both the "no milestone of another objective"
// rule and the thing that keeps deal sizes varied.
function groupByFamily(pool) {
  const byFamily = new Map();
  pool.forEach((row) => {
    const key = familyKey(row.params);
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key).push(row);
  });
  return byFamily;
}

function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Exhaustive depth-first search for a set of rows that spends `remaining`
// *exactly*, takes at most one row per family, takes exactly `need` rows in
// total, and contains no incompatible pair. Returns null only when no such
// set exists — every affordable row is tried at each family, plus the branch
// that skips the family — so a null is proof of infeasibility rather than an
// unlucky roll. The module-load validator depends on that being true.
//
// Fixing `need` up front is what keeps deal sizes varied. Searching without
// it biases hard toward using every family (the "take a row" branches vastly
// outnumber the single "skip" branch), which would make an Easy game four
// 1-cost objectives almost every time instead of sometimes one 4-cost one.
//
// The possibility check is applied HERE, as a pruning predicate against the
// rows already chosen, rather than to a finished deal. Generating a deal and
// reshuffling it if it turns out contradictory would have given up the
// exhaustiveness above — and could spin forever on a budget whose every
// exact-spend combination happens to conflict. Pruning instead means an
// impossible deal is never built in the first place, and `null` still means
// what it always meant.
//
// `chosen` is mutated and restored around each branch rather than copied.
function findCombination(families, index, remaining, need, byFamily, random, dearest, chosen = []) {
  if (need === 0) return remaining === 0 ? [] : null;
  if (remaining < need) return null; // every row costs at least 1
  if (remaining > need * dearest) return null; // ...and at most `dearest`
  if (index >= families.length) return null;
  if (families.length - index < need) return null; // not enough families left

  const affordable = byFamily
    .get(families[index])
    .filter((row) => row.cost <= remaining && !chosen.some((taken) => rowsIncompatible(row, taken)));
  for (const row of shuffled(affordable, random)) {
    chosen.push(row);
    const rest = findCombination(
      families,
      index + 1,
      remaining - row.cost,
      need - 1,
      byFamily,
      random,
      dearest,
      chosen
    );
    chosen.pop();
    if (rest) return [row, ...rest];
  }
  return findCombination(families, index + 1, remaining, need, byFamily, random, dearest, chosen);
}

// The dearest row in the pool, which bounds how much `need` rows can cover.
// Cheap to compute and worth a lot: without it, proving an Expert budget of
// 16 unspendable on two objectives means exhausting the search rather than
// noticing that 2 × 6 < 16.
function dearestCost(pool) {
  return pool.reduce((max, row) => Math.max(max, row.cost), 0);
}

// Memoized because the answer depends on nothing else, and finding it is the
// expensive half of dealing: proving a size *infeasible* means exhausting the
// search, and every deal would otherwise redo that for all six sizes before
// dealing one. Keyed on the pool object, so a caller passing a different pool
// gets its own answers; the entry assumes a pool is not mutated after it is
// first asked about, which holds for the frozen module-level one.
const dealSizeCache = new WeakMap();

// Which deal sizes a budget can be spent on exactly. Deterministic — the
// search is exhaustive and the incompatibility relation is symmetric, so the
// random order only affects which combination comes back, never whether one
// exists.
export function feasibleDealSizes(pool, budget) {
  let byBudget = dealSizeCache.get(pool);
  if (!byBudget) {
    byBudget = new Map();
    dealSizeCache.set(pool, byBudget);
  }
  const cached = byBudget.get(budget);
  if (cached) return cached;

  const byFamily = groupByFamily(pool);
  const families = [...byFamily.keys()];
  const dearest = dearestCost(pool);
  const sizes = [];
  const largest = Math.min(MAX_DEAL_SIZE, families.length, budget);
  for (let need = 1; need <= largest; need++) {
    if (findCombination(families, 0, budget, need, byFamily, () => 0, dearest)) sizes.push(need);
  }
  byBudget.set(budget, sizes);
  return sizes;
}

// Deals a set of objectives costing exactly `budget`.
//
// Picks the deal size first, uniformly among the sizes that can be spent
// exactly, then finds a combination of that size. So an Easy budget of 4 is
// as likely to be one 4-cost objective as it is four 1-cost ones.
export function selectWithinBudget(pool, budget, random = Math.random) {
  const byFamily = groupByFamily(pool);
  const sizes = feasibleDealSizes(pool, budget);
  if (sizes.length === 0) {
    throw new Error(
      `No combination of objectives costs exactly ${budget}. ` +
        `Available costs: ${[...new Set(pool.map((r) => r.cost))].sort((a, b) => a - b).join(', ')}`
    );
  }
  const need = sizes[Math.floor(random() * sizes.length)];
  const families = shuffled([...byFamily.keys()], random);
  return findCombination(families, 0, budget, need, byFamily, random, dearestCost(pool));
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
  // A corner-scoped objective's description doesn't name its corner — the UI
  // shows that as a shape (see js/cornerSymbols.js) — so the four per-corner
  // variants of one tuning describe identically. An error message has to say
  // which row it means, hence the scope spliced back in.
  const rowLabel = (row) =>
    row.params.scope === GLOBAL_SCOPE
      ? describeSpec(row)
      : `${describeSpec(row)} [${row.params.scope}]`;

  GAME_MODES.filter((mode) => mode.pool).forEach((mode) => {
    if (mode.pool.length === 0) {
      throw new Error(`Game mode "${mode.id}" generated an empty objective pool.`);
    }
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
      // Still the real proof that a tier is playable: the search is
      // exhaustive over families *and* over the possibility check, so an
      // empty result means no compatible deal spends this budget exactly —
      // not that the roll was unlucky.
      if (feasibleDealSizes(mode.pool, budget).length === 0) {
        throw new Error(
          `Game mode "${mode.id}" cannot spend its ${tier} budget of ${budget} exactly ` +
            `with at most ${MAX_DEAL_SIZE} compatible objectives, one per family. ` +
            'Adjust the budget, or the cost bounds in generator.js.'
        );
      }
    });
  });
})();
