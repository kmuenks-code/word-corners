// The catalog of objective *types*. Everything the game can ask a player
// to do is one entry here, parameterized — "score 8 three-letter words" and
// "score 20 three-letter words" are the same definition with different
// params, and it is the *pool* (modes.js) that decides which tunings exist
// and what each is worth.
//
// Definitions are pure functions over `(progress, event, params)` — no DOM,
// no game state, no randomness — which is what makes replay (see runtime.js)
// and serialization safe.
//
// A definition is:
//   id          stable string key, used in specs and any stored data
//   label       short human name for a future objective editor
//   defaults    the full parameter set, with sensible values. A spec only
//               has to state what it changes.
//   describe    (params) -> plain-text goal, e.g. "Score 8 3-letter words"
//   goal        (params) -> the number `measure` is climbing toward
//   initial     (params) -> starting progress (any JSON-serializable value)
//   advance     (progress, event, params) -> next progress. Pure.
//   measure     (progress, params) -> number, compared against goal
//   enduring    optional; true = can't be completed early, only survived.
//               Resolves to complete at game end if it hasn't failed.
//               For these, `goal` reads as a *limit* rather than a target.
//   failed      optional; (progress, params) -> true to fail immediately
//
// Difficulty is deliberately absent here. An objective's numbers are fixed
// by its spec; how *hard* a given tuning is gets expressed as a `cost` on
// the pool row, and a difficulty tier is a budget of those costs. See
// "Objectives" in CLAUDE.md.

import { GameEvent } from './events.js';

// A corner-scoped objective's description deliberately does NOT name its
// corner. The corner is shown as its shape (see js/cornerSymbols.js), in a
// leading column the renderer fills from `params.corner` — "◆  Clear 5
// words" rather than "Clear 5 words in the SE corner". So these strings
// describe only the task, and read as if the shape were their subject.
// Nothing here knows what the shapes are; that stays in the UI layer.

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
  describe,
  goal = (params) => params.count,
  matches,
  amount = () => 1,
}) {
  return Object.freeze({
    id,
    label,
    defaults,
    describe,
    goal,
    initial: () => 0,
    advance: (progress, event, params) =>
      matches(event, params) ? progress + amount(event, params) : progress,
    measure: (progress) => progress,
  });
}

// Words of one exact length (or a minimum, with `exact: false`). `length`
// and `exact` are params rather than baked in, so 3-, 4- and 5-letter hunts
// are all this one definition at different tunings.
const wordsOfLength = counting({
  id: 'wordsOfLength',
  label: 'Words of a given length',
  defaults: { count: 8, length: 3, exact: true },
  describe: (p) =>
    p.exact
      ? `Score ${plural(p.count, `${p.length}-letter word`)}`
      : `Score ${plural(p.count, 'word')} of ${p.length}+ letters`,
  matches: (event, p) =>
    event.type === GameEvent.WORD_SCORED &&
    (p.exact ? event.length === p.length : event.length >= p.length),
});

// Total words cleared, any length. The objective that never fights the
// others, since every scoring submission advances it too.
const words = counting({
  id: 'words',
  label: 'Words scored',
  defaults: { count: 9 },
  describe: (p) => `Score ${plural(p.count, 'word')}`,
  matches: (event) => event.type === GameEvent.WORD_SCORED,
});

// Points rather than words, so it rewards long words instead of many.
// Scoring is superlinear (n*(n-1)/2 — a 3-letter word is 3 points, a
// 6-letter word is 15), which is why the pool's high tunings climb steeply.
const totalScore = counting({
  id: 'totalScore',
  label: 'Total score',
  defaults: { points: 75 },
  goal: (p) => p.points,
  describe: (p) => `Score ${p.points} points`,
  matches: (event) => event.type === GameEvent.WORD_SCORED,
  amount: (event) => event.points,
});

// Pins the player to one corner, which pulls against the others — the
// corner it names can also close on them.
const wordsInCorner = counting({
  id: 'wordsInCorner',
  label: 'Words in one corner',
  defaults: { count: 3, corner: 'nw' },
  describe: (p) => `Clear ${plural(p.count, 'word')} here`,
  matches: (event, p) => event.type === GameEvent.WORD_SCORED && event.corner === p.corner,
});

// ---------------------------------------------------------------------
// Restrictive objectives: a constraint that can fail mid-game, not just
// a target that runs out of time. Both use `failed` — the only two
// definitions that do, so far — which `applyEventToObjective` (tracker.js)
// checks on every event, ahead of the normal goal check. In Objective mode
// (`endOnFailure: true` by default) a `failed` objective ends the run on
// the spot, on whatever move triggered it — these are the first objectives
// where that's a real, reachable outcome rather than something only
// finalizeObjectives produces at game end.
// ---------------------------------------------------------------------

// Land `count` words of exactly `length` in `corner` — and nothing else
// there, ever. Not `enduring`: once `count` is reached with no violation,
// it resolves COMPLETE and freezes (the standard goal-reached path in
// tracker.js's resolveStatus), so a wrong-length word in that corner
// *after* completion doesn't undo it — the obligation was already met.
// A wrong-length word *before* completion fails it immediately.
//
// Progress needs two independent facts per event — how many qualifying
// words landed, and whether a disqualifying one ever did — so this can't
// be a single running number the way `counting()` produces; it's the
// `{ count, violated }` shape CLAUDE.md's "Adding to it" describes for
// definitions with a progress shape counting() doesn't fit.
const cornerOnlyLength = Object.freeze({
  id: 'cornerOnlyLength',
  label: 'Only one word length in a corner',
  defaults: { corner: 'nw', length: 6, count: 1 },
  describe: (p) =>
    `Land ${plural(p.count, `${p.length}-letter word`)} here — and nothing else`,
  goal: (p) => p.count,
  initial: () => ({ count: 0, violated: false }),
  advance: (progress, event, params) => {
    if (event.type !== GameEvent.WORD_SCORED || event.corner !== params.corner) return progress;
    if (event.length === params.length) return { ...progress, count: progress.count + 1 };
    return { ...progress, violated: true };
  },
  measure: (progress) => progress.count,
  failed: (progress) => progress.violated,
});

// Score fewer than `limit` words in `corner`, total, any length — 0 is a
// pass. `enduring`, so unlike cornerOnlyLength it never resolves COMPLETE
// early: it only finalizes at game end (finalizeObjectives, runtime.js),
// same as any other enduring objective that survived without failing.
// `goal` reads as the ceiling `limit` names, not a target to reach.
const cornerWordLimitCounter = counting({
  id: 'cornerWordLimit',
  label: 'Word cap in one corner',
  defaults: { corner: 'nw', limit: 3 },
  describe: (p) => `Score fewer than ${plural(p.limit, 'word')} here`,
  goal: (p) => p.limit,
  matches: (event, p) => event.type === GameEvent.WORD_SCORED && event.corner === p.corner,
});
const cornerWordLimit = Object.freeze({
  ...cornerWordLimitCounter,
  enduring: true,
  failed: (progress, params) => progress >= params.limit,
});

const DEFINITIONS = [
  wordsOfLength,
  words,
  totalScore,
  wordsInCorner,
  cornerOnlyLength,
  cornerWordLimit,
];

const BY_ID = Object.freeze(
  DEFINITIONS.reduce((map, definition) => {
    map[definition.id] = definition;
    return map;
  }, {})
);

// Throws rather than degrading: a typo in the pool should surface the
// moment that data is loaded, not silently produce an objective that can
// never be completed.
export function getDefinition(type) {
  const definition = BY_ID[type];
  if (!definition) {
    throw new Error(
      `Unknown objective type "${type}". Known types: ${Object.keys(BY_ID).join(', ')}`
    );
  }
  return definition;
}

// Every definition, for a future objective editor or for building pools
// programmatically.
export function listDefinitions() {
  return DEFINITIONS.map((d) => ({ id: d.id, label: d.label, defaults: { ...d.defaults } }));
}

// Fills a partial spec's params in from the definition's defaults, so a
// pool row only has to state what it changes.
export function resolveParams(type, params = {}) {
  return { ...getDefinition(type).defaults, ...params };
}

// One-line text for a spec without instantiating it — used by the pool
// validator's error messages, and available to any screen that wants to
// list objectives before a game starts.
export function describeSpec(spec) {
  const definition = getDefinition(spec.type);
  return spec.description ?? definition.describe(resolveParams(spec.type, spec.params));
}
