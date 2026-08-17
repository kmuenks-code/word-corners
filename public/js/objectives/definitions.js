// The catalog of objective *types*. Everything the game can ask a player
// to do is one entry here, parameterized — "score 5 three-letter words" and
// "score 20 three-letter words" are the same definition at two difficulties,
// and "score 3 five-letter words" is the same definition again with a
// different `length`.
//
// This is the balancing surface: to retune an objective, edit its defaults
// or its byDifficulty table; to invent a new one, add a definition here and
// nothing else changes — not the tracker, not the runtime, not main.js.
// Definitions are pure — no DOM, no game state, no randomness — so they can
// be replayed (see runtime.js) and serialized.
//
// A definition is:
//   id            stable string key, used in specs and any stored data
//   label         short human name for a future objective picker
//   defaults      the full parameter set, with sensible values
//   byDifficulty  optional; per-tier param overrides. Must cover every tier
//                 in DIFFICULTY_ORDER if present (the validator below
//                 enforces it). Omit entirely for an objective that doesn't
//                 scale — every tier then gets `defaults`.
//   describe      (params) -> plain-text goal, e.g. "Score 5 3-letter words"
//   goal          (params) -> the number `measure` is climbing toward
//   initial       (params) -> starting progress (any JSON-serializable value)
//   advance       (progress, event, params) -> next progress. Pure.
//   measure       (progress, params) -> number, compared against goal
//   enduring      optional; true = can't be completed early, only survived.
//                 Resolves to complete at game end if it hasn't failed.
//                 For these, `goal` reads as a *limit* rather than a target.
//   failed        optional; (progress, params) -> true to fail immediately
//
// Params resolve in three layers, each overriding the one before:
//   defaults  <  byDifficulty[tier]  <  the spec's own params
// So a spec that states a param explicitly always wins over the difficulty
// table, and a spec that states nothing gets the tier's tuning.

import { GameEvent } from './events.js';
import { DIFFICULTY_ORDER, assertDifficulty } from './difficulty.js';

const CORNER_LABELS = { nw: 'NW', ne: 'NE', sw: 'SW', se: 'SE' };

function cornerLabel(corner) {
  return CORNER_LABELS[corner] ?? String(corner).toUpperCase();
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// Most objectives are "count the events that match a predicate until you
// hit a number", so that case gets a one-liner. `amount` lets an event
// contribute more than 1 (points, for instance).
function counting({
  id,
  label,
  defaults,
  byDifficulty,
  describe,
  goal = (params) => params.count,
  matches,
  amount = () => 1,
}) {
  return {
    id,
    label,
    defaults,
    byDifficulty,
    describe,
    goal,
    initial: () => 0,
    advance: (progress, event, params) =>
      matches(event, params) ? progress + amount(event, params) : progress,
    measure: (progress) => progress,
  };
}

// Checks a definition at module load, so a half-filled byDifficulty table
// is a startup error rather than a tier that silently plays at default
// difficulty. Cheap insurance that gets more valuable with every objective
// and every tier added.
function defineObjective(definition) {
  const { id, byDifficulty } = definition;
  if (byDifficulty) {
    const missing = DIFFICULTY_ORDER.filter((tier) => !byDifficulty[tier]);
    if (missing.length > 0) {
      throw new Error(
        `Objective "${id}" has no params for difficulty: ${missing.join(', ')}`
      );
    }
    Object.keys(byDifficulty).forEach((tier) => assertDifficulty(tier));
  }
  return Object.freeze(definition);
}

// The one objective in play. `length`/`exact` are params rather than being
// baked in, so the same definition covers "score X 4-letter words" or
// "score X words of 5+ letters" later without a new entry here — a spec
// just states the length it wants.
//
// Difficulty scales `count` only: how *many* qualifying words, not which
// words qualify. An objective whose difficulty should change the shape of
// the task (a longer word, a tighter limit) puts that in its own
// byDifficulty table instead.
const wordsOfLength = defineObjective(
  counting({
    id: 'wordsOfLength',
    label: 'Words of a given length',
    defaults: { count: 5, length: 3, exact: true },
    byDifficulty: {
      easy: { count: 5 },
      medium: { count: 10 },
      hard: { count: 15 },
      expert: { count: 20 },
    },
    describe: (p) =>
      p.exact
        ? `Score ${plural(p.count, `${p.length}-letter word`)}`
        : `Score ${plural(p.count, 'word')} of ${p.length}+ letters`,
    matches: (event, p) =>
      event.type === GameEvent.WORD_SCORED &&
      (p.exact ? event.length === p.length : event.length >= p.length),
  })
);

// Total words cleared, any length. The "just keep playing well" objective —
// the one in the pool that never fights the others, since every scoring
// submission advances it too.
const words = defineObjective(
  counting({
    id: 'words',
    label: 'Words scored',
    defaults: { count: 10 },
    byDifficulty: { easy: { count: 6 }, medium: { count: 10 }, hard: { count: 14 }, expert: { count: 18 } },
    describe: (p) => `Score ${plural(p.count, 'word')}`,
    matches: (event) => event.type === GameEvent.WORD_SCORED,
  })
);

// Points rather than words, so it rewards long words instead of many. The
// curve accounts for scoring being superlinear (n*(n-1)/2 — a 3-letter word
// is 3 points, a 6-letter word is 15), which is why the top tier is more
// than four times the bottom.
const totalScore = defineObjective(
  counting({
    id: 'totalScore',
    label: 'Total score',
    defaults: { points: 100 },
    byDifficulty: { easy: { points: 50 }, medium: { points: 100 }, hard: { points: 160 }, expert: { points: 220 } },
    goal: (p) => p.points,
    describe: (p) => `Score ${p.points} points`,
    matches: (event) => event.type === GameEvent.WORD_SCORED,
    amount: (event) => event.points,
  })
);

// Pins the player to one corner, which pulls against the others — the
// corner it names can also close on them. Appears in the pool once per
// corner; the draw picks which (see modes.js).
const wordsInCorner = defineObjective(
  counting({
    id: 'wordsInCorner',
    label: 'Words in one corner',
    defaults: { count: 4, corner: 'nw' },
    byDifficulty: { easy: { count: 2 }, medium: { count: 4 }, hard: { count: 6 }, expert: { count: 8 } },
    describe: (p) => `Clear ${plural(p.count, 'word')} in the ${cornerLabel(p.corner)} corner`,
    matches: (event, p) => event.type === GameEvent.WORD_SCORED && event.corner === p.corner,
  })
);

const DEFINITIONS = [wordsOfLength, words, totalScore, wordsInCorner];

const BY_ID = Object.freeze(
  DEFINITIONS.reduce((map, definition) => {
    map[definition.id] = definition;
    return map;
  }, {})
);

// Throws rather than degrading: a typo in a game mode's objective list
// should surface the moment that data is loaded, not silently produce an
// objective that can never be completed.
export function getDefinition(type) {
  const definition = BY_ID[type];
  if (!definition) {
    throw new Error(
      `Unknown objective type "${type}". Known types: ${Object.keys(BY_ID).join(', ')}`
    );
  }
  return definition;
}

// Every definition, for a future objective picker or for building mode
// tables programmatically.
export function listDefinitions() {
  return DEFINITIONS.map((d) => ({ id: d.id, label: d.label, defaults: { ...d.defaults } }));
}

// Fills a partial spec's params in from the definition's defaults and the
// chosen difficulty tier — so a spec only has to state what it changes.
// `difficulty` may be null, meaning "plain defaults".
//
// `specByDifficulty` is an optional per-spec curve that overrides the
// definition's for this spec only. It exists so two *variants* of one
// definition can scale differently: "score N 3-letter words" and "score N
// 4-letter words" are the same definition, but four-letter words are much
// harder to land, so they can't share one N. Without this the choice would
// be either a duplicate definition or a hard-coded count in `params` — and
// a hard-coded count would stop difficulty flushing through at all, which
// is the whole point of the tier.
export function resolveParams(type, params = {}, difficulty = null, specByDifficulty = null) {
  const definition = getDefinition(type);
  const tier = assertDifficulty(difficulty);
  const tuned = tier ? definition.byDifficulty?.[tier] : null;
  const variantTuned = tier ? specByDifficulty?.[tier] : null;
  return { ...definition.defaults, ...tuned, ...variantTuned, ...params };
}

// One-line text for a spec, without instantiating it — handy for a mode
// select screen that lists objectives before the game starts.
export function describeSpec(spec, difficulty = null) {
  const definition = getDefinition(spec.type);
  return (
    spec.description ??
    definition.describe(
      resolveParams(spec.type, spec.params, spec.difficulty ?? difficulty, spec.byDifficulty)
    )
  );
}
