// The property axis: what makes a scored word "count" for an objective.
//
// This is the first of the three layers an objective is generated from —
// property, scope, constraint (see generator.js). A property is a predicate
// over a WORD_SCORED event, plus two things the generator needs and the
// tracker doesn't:
//
//   rarity   roughly what fraction of the words a player scores will match.
//            This is the whole basis of the cost model — a property that
//            matches one word in ten makes every objective built on it ten
//            times as demanding. See RARITY NOTES below.
//   subsumes which other properties this one implies, so the possibility
//            check can tell that "6+ letter words" are a subset of "words"
//            and therefore that a target on the first can contradict a
//            limit on the second.
//
// A property is:
//   id        stable key, stored in params and in the recorded row
//   arg       name of the param carrying its argument ('length'), or null
//   values    the arguments worth generating, for an arg-carrying property
//   matches   (event, params) -> boolean. Pure, and reads only the event.
//   noun      (params) -> singular noun phrase: "3-letter word", "word
//             starting with a vowel". The describer pluralizes the head noun.
//   rarity    (params) -> 0..1
//
// Nothing here knows about scopes, constraints, counts or costs.

import { GameEvent } from './events.js';

// ---------------------------------------------------------------------
// RARITY NOTES
//
// These are estimates of what players *score*, which is not the same as
// what the dictionary contains — the board closes corners as they grow, so
// short words are submitted far out of proportion to how many exist.
//
// LENGTH_SHARE is the single most influential number in the whole system:
// every length-based cost is derived from it.
//
// It started as a pure guess (0.45 / 0.28 / 0.15 / 0.08 …) and was corrected
// once against actual play. A scripted player banking every valid word the
// moment it existed produced 89% three-letter, 10% four-letter, ~1% five-plus
// over 25 games. That player is one extreme — maximising word *count* means
// always submitting at three letters — and a human chasing the superlinear
// score will grow words further, so the values below sit between the two,
// leaning toward what was measured.
//
// Still not validated against human play. It is directly measurable: the
// `games` table already stores words3 / words4 / words5 / words6Plus per
// game, so `npm run db:games` has the real distribution in it as soon as
// enough games are played. Replace these with the observed shares.
//
// The vowel rates, by contrast, ARE measured: over ENABLE1, weighted by
// LENGTH_SHARE, 16.1% of words start with a vowel and 20.4% end with one.
// Those are dictionary base rates, though, and a player who is *trying* to
// hit a vowel objective steers toward it — they choose which corner a vowel
// opens and when to stop a word. STEERING is that boost, applied to the two
// properties a player can deliberately chase. It is a guess; the per-tuning
// success rates from `npm run db:objectives` are what should correct it.
// ---------------------------------------------------------------------

const LENGTH_SHARE = Object.freeze({ 3: 0.55, 4: 0.27, 5: 0.11, 6: 0.05, 7: 0.015, 8: 0.005 });

const MAX_TRACKED_LENGTH = 8;

const STEERING = 1.35;
const DICTIONARY_VOWEL_START = 0.161;
const DICTIONARY_VOWEL_END = 0.204;

function shareAtLeast(length) {
  let total = 0;
  for (let n = length; n <= MAX_TRACKED_LENGTH; n++) total += LENGTH_SHARE[n] ?? 0;
  return total;
}

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

// Y is not a vowel here. Deliberately a local set rather than isVowel() from
// js/letterSource.js: that one exists to balance the letter *draw*, and a
// property that reaches outside this directory stops being a pure function
// over the event. They agree today and are free to diverge.
function firstLetter(word) {
  return typeof word === 'string' && word.length > 0 ? word.charAt(0).toUpperCase() : '';
}
function lastLetter(word) {
  return typeof word === 'string' && word.length > 0 ? word.charAt(word.length - 1).toUpperCase() : '';
}

// Only WORD_SCORED can ever match — an objective counts words the player
// actually banked, never letters placed or submissions that shook.
function scored(event) {
  return event.type === GameEvent.WORD_SCORED;
}

const PROPERTIES = [
  {
    id: 'any',
    arg: null,
    matches: scored,
    noun: () => 'word',
    rarity: () => 1,
  },
  {
    id: 'lengthExactly',
    arg: 'length',
    values: [3, 4, 5, 6, 7],
    matches: (event, p) => scored(event) && event.length === p.length,
    noun: (p) => `${p.length}-letter word`,
    rarity: (p) => LENGTH_SHARE[p.length] ?? 0,
  },
  {
    // lengthAtLeast(3) is deliberately absent from `values`: MIN_WORD_LENGTH
    // is 3, so it would be an exact synonym for `any` at a different id —
    // two families generating identical objectives, and a subsumption pair
    // the possibility check would have to keep discarding.
    id: 'lengthAtLeast',
    arg: 'length',
    values: [4, 5, 6, 7],
    matches: (event, p) => scored(event) && event.length >= p.length,
    noun: (p) => `word of ${p.length}+ letters`,
    rarity: (p) => shareAtLeast(p.length),
  },
  {
    id: 'startsWithVowel',
    arg: null,
    matches: (event) => scored(event) && VOWELS.has(firstLetter(event.word)),
    noun: () => 'word starting with a vowel',
    rarity: () => DICTIONARY_VOWEL_START * STEERING,
  },
  {
    id: 'endsWithVowel',
    arg: null,
    matches: (event) => scored(event) && VOWELS.has(lastLetter(event.word)),
    noun: () => 'word ending in a vowel',
    rarity: () => DICTIONARY_VOWEL_END * STEERING,
  },
];

const BY_ID = Object.freeze(
  PROPERTIES.reduce((map, property) => {
    map[property.id] = property;
    return map;
  }, {})
);

// Throws rather than degrading, same as getDefinition did: a typo in a
// generated row should surface at module load, not as an objective that can
// never be completed.
export function getProperty(id) {
  const property = BY_ID[id];
  if (!property) {
    throw new Error(
      `Unknown word property "${id}". Known properties: ${Object.keys(BY_ID).join(', ')}`
    );
  }
  return property;
}

// Every (property, argument) pair worth generating, as the params fragment
// that identifies it. An arg-free property contributes exactly one.
export function listPropertyTunings() {
  return PROPERTIES.flatMap((property) =>
    property.arg
      ? property.values.map((value) => ({ property: property.id, [property.arg]: value }))
      : [{ property: property.id }]
  );
}

export function propertyMatches(params, event) {
  return getProperty(params.property).matches(event, params);
}

export function propertyNoun(params) {
  return getProperty(params.property).noun(params);
}

export function propertyRarity(params) {
  return getProperty(params.property).rarity(params);
}

// ---------------------------------------------------------------------
// The implication lattice
//
// `propertySubsumes(a, b)` is true when every word matching `a` also matches
// `b` — "a ⊆ b". This is what lets the possibility check (generator.js) see
// that "score 3 or more words starting with a vowel here" and "score fewer
// than 3 words here" cannot both hold: vowel-initial words *are* words, so
// the first forces the second's counter to 3.
//
// Deliberately conservative. Two properties that merely overlap are not
// related — "starts with a vowel" and "4-letter word" are incomparable even
// though plenty of words are both, because neither implies the other and
// nothing about their combination is decidable from counts alone. Only
// containments that are true by definition are declared, which is what keeps
// this a small fixed table rather than a growing conflict matrix. The cost
// is that the check is sound but not complete: it never rejects a winnable
// deal, and it can pass an unwinnable one whose contradiction needs
// reasoning it doesn't have.
// ---------------------------------------------------------------------
export function propertySubsumes(a, b) {
  if (a.property === b.property) {
    const arg = getProperty(a.property).arg;
    if (!arg) return true;
    // Longer-or-equal minimums are subsets: 6+ letter words are all 5+
    // letter words. Exact lengths only contain themselves.
    if (a.property === 'lengthAtLeast') return a[arg] >= b[arg];
    return a[arg] === b[arg];
  }
  // Everything is a word.
  if (b.property === 'any') return true;
  // An exact length is inside every minimum it clears.
  if (a.property === 'lengthExactly' && b.property === 'lengthAtLeast') {
    return a.length >= b.length;
  }
  return false;
}
