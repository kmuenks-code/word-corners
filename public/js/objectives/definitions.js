// The objective catalog — which is now a *shape* rather than a list.
//
// Every objective the game can set is one sentence with four blanks:
//
//     Score {constraint} {count} {property} {in scope}{, none excluded}
//
//   property    which scored words count      (properties.js)
//   exclude     which of those don't, or ''   (properties.js)
//   scope       where they have to land       — global, or one corner
//   constraint  which way the count is read   — at least N, or fewer than N
//
// Those three axes are enumerated and priced in generator.js; this file is
// the single definition they all instantiate. There is deliberately no
// second, hand-written definition and no escape hatch for one: an objective
// that can't be said in this sentence doesn't exist, which is what makes the
// space enumerable, priceable, and checkable for contradictions. The former
// catalog of seven bespoke types is gone, and with it `cornerOnlyLength`
// (a conjunction, unsayable here) and `totalScore` (measured in points, not
// words).
//
// The definition contract, unchanged except where noted:
//   id          stable string key, used in specs and any stored data
//   label       short human name
//   defaults    the full parameter set; a spec states only what it changes
//   describe    (params) -> plain-text goal
//   goal        (params) -> the number `measure` is compared against
//   initial     (params) -> starting progress
//   advance     (progress, event, params) -> next progress. Pure.
//   measure     (progress, params) -> number
//   enduring    (params) -> boolean. NOW A FUNCTION of params, because
//               whether an objective is a limit or a target is the
//               constraint axis rather than a property of the type.
//   failed      (progress, params) -> true to fail immediately
//
// Difficulty is still deliberately absent here. An objective's numbers are
// fixed by its params; how *hard* a given combination is comes out of the
// cost model in generator.js, and a difficulty tier is a budget of costs.

import { propertyMatches, propertyModifier, propertyNoun } from './properties.js';

// The scope axis. `global` counts words anywhere on the board; a corner
// scope counts only words scored in that corner. Corner ids stay nw/ne/sw/se
// throughout the data model — the player is shown a shape instead (see
// js/cornerSymbols.js), but renaming them would have split every corner
// tuning's recorded history in two for a purely visual change.
export const GLOBAL_SCOPE = 'global';
export const CORNERS = Object.freeze(['nw', 'ne', 'sw', 'se']);
export const SCOPES = Object.freeze([GLOBAL_SCOPE, ...CORNERS]);

// Which corner an objective is bound to, or null for a global one. The
// snapshot carries this so no renderer has to know how scope is spelled.
export function scopeCorner(scope) {
  return scope === GLOBAL_SCOPE ? null : scope;
}

// `a ⊆ b` for scopes: a corner is inside global, and inside itself. Corners
// are disjoint from each other. The counterpart of propertySubsumes, and the
// other half of the possibility check.
export function scopeSubsumes(a, b) {
  return a === b || b === GLOBAL_SCOPE;
}

// The constraint axis.
//
// AT_LEAST is a target: reaching `count` completes it, and it can complete
// early, which is what lets a deal be won with corners still open.
//
// FEWER_THAN is a limit: it fails the moment the count reaches `count`, and
// it can never complete early — surviving to game end *is* the condition, so
// it is `enduring`. Limits are generated for corner scopes only (see
// generator.js); a global "score fewer than N words" would fight the entire
// board rather than ask anything of a place on it.
//
// There is no EXACTLY. It would have to stay live to game end like a limit
// while also being a target, so any deal containing one could only ever be
// won by playing the board all the way closed — a third status shape for
// something at-least and fewer-than already express between them.
export const Constraint = Object.freeze({
  AT_LEAST: 'atLeast',
  FEWER_THAN: 'fewerThan',
});

export const CONSTRAINTS = Object.freeze([Constraint.AT_LEAST, Constraint.FEWER_THAN]);

// The head noun of every property phrase is "word", so pluralizing means
// touching that one token rather than appending to the end — "word of 6+
// letters" becomes "words of 6+ letters", not "word of 6+ letterss".
function pluralizeNoun(noun) {
  return noun.replace(/\bword\b/, 'words');
}

function nounFor(params, count) {
  const noun = propertyNoun(params);
  return count === 1 ? noun : pluralizeNoun(noun);
}

// A description never names its corner: the renderer draws the corner as a
// shape in a leading column, so these strings describe only the task and
// read as if the shape were their subject. That means the four per-corner
// variants of one tuning describe identically, and anything identifying a
// row by its text has to add the scope back (the pool validator does).
//
// The `__word__` emphasis marker (rendered as an underline by ui.js) is
// spent on the limit's "fewer"/"no". In a list where every other line asks
// the player to score *more*, the inverted sense is the one thing worth
// making impossible to skim past.
// The exclusion clause, or '' — "…, __none__ starting with a vowel".
//
// This is where the emphasis marker is spent now that a standalone limit is
// no longer generated, and for the same reason it was spent on "fewer"/"no"
// before: in a list where every clause asks the player to score *more*, the
// one inverted word is the thing worth making impossible to skim past. A
// singular reads "__not__ starting with a vowel", since "none" needs a plural
// to be none of.
function excludeClause(params, count) {
  const modifier = params.exclude ? propertyModifier(params.exclude) : null;
  if (!modifier) return '';
  return count === 1 ? `, __not__ ${modifier}` : `, __none__ ${modifier}`;
}

function describe(params) {
  const { constraint, count } = params;
  if (constraint === Constraint.FEWER_THAN) {
    return count === 1
      ? `Score __no__ ${pluralizeNoun(propertyNoun(params))}`
      : `Score __fewer__ than ${count} ${nounFor(params, count)}`;
  }
  return count === 1
    ? `Score a ${nounFor(params, 1)}${excludeClause(params, 1)}`
    : `Score ${count} or more ${nounFor(params, count)}${excludeClause(params, count)}`;
}

// A word counts when it matches the property *and* landed in scope. Scope is
// checked here rather than in the property so that every property works at
// every scope for free — which is the entire point of the two being separate
// axes.
function countsFor(event, params) {
  if (params.scope !== GLOBAL_SCOPE && event.corner !== params.scope) return false;
  return propertyMatches(params, event);
}

const composed = Object.freeze({
  id: 'composed',
  label: 'Composed objective',
  defaults: Object.freeze({
    property: 'any',
    // The id of a property whose words don't count, or '' for none. Empty
    // string rather than null because resolved params are posted to the API,
    // which takes flat primitives only — see canonicalParams in
    // src/api/games.js, where a null fails the whole request.
    exclude: '',
    scope: GLOBAL_SCOPE,
    constraint: Constraint.AT_LEAST,
    count: 5,
  }),
  describe,
  goal: (p) => p.count,
  initial: () => 0,
  advance: (progress, event, params) => (countsFor(event, params) ? progress + 1 : progress),
  measure: (progress) => progress,
  enduring: (p) => p.constraint === Constraint.FEWER_THAN,
  // Only a limit can fail before the game would otherwise end, and it fails
  // on the move that reaches the limit — an instant loss in Objective mode,
  // with corners still open and other goals possibly nearly done. That is
  // deliberate: a limit the player blew is a limit they blew.
  failed: (progress, p) => p.constraint === Constraint.FEWER_THAN && progress >= p.count,
});

const DEFINITIONS = [composed];

const BY_ID = Object.freeze(
  DEFINITIONS.reduce((map, definition) => {
    map[definition.id] = definition;
    return map;
  }, {})
);

export const COMPOSED_TYPE = composed.id;

// Throws rather than degrading: a typo in a generated row should surface the
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

// Every definition, for a future objective editor.
export function listDefinitions() {
  return DEFINITIONS.map((d) => ({ id: d.id, label: d.label, defaults: { ...d.defaults } }));
}

// Fills a partial spec's params in from the definition's defaults, so a
// generated row only has to state what it chooses.
export function resolveParams(type, params = {}) {
  return { ...getDefinition(type).defaults, ...params };
}

// One-line text for a spec without instantiating it — used by the pool
// validator's error messages, and available to any screen that wants to list
// objectives before a game starts.
export function describeSpec(spec) {
  const definition = getDefinition(spec.type);
  return spec.description ?? definition.describe(resolveParams(spec.type, spec.params));
}
