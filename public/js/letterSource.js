// Produces the sequence of letters the player receives.
// Frequencies match the standard English Scrabble tile distribution
// (98 letter tiles, blanks excluded).

export const LETTER_FREQUENCIES = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1,
  K: 1, L: 4, M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6,
  U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
};

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

export function isVowel(letter) {
  return VOWELS.has(letter);
}

function sumWeights(frequencies) {
  return Object.values(frequencies).reduce((sum, weight) => sum + weight, 0);
}

function splitFrequenciesByCategory(frequencies) {
  const vowel = {};
  const consonant = {};
  for (const [letter, weight] of Object.entries(frequencies)) {
    (isVowel(letter) ? vowel : consonant)[letter] = weight;
  }
  return { vowel, consonant };
}

// Per-letter weights within each category, derived from LETTER_FREQUENCIES
// so there's a single source of truth for individual letter rarity.
const { vowel: VOWEL_FREQUENCIES, consonant: CONSONANT_FREQUENCIES } =
  splitFrequenciesByCategory(LETTER_FREQUENCIES);
export { VOWEL_FREQUENCIES, CONSONANT_FREQUENCIES };

// Vowel-vs-consonant draw weighting, kept separate from per-letter weights
// so difficulty tuning can nudge the category balance on its own. Defaults
// to each category's combined tile weight (42 vowel / 56 consonant),
// reproducing the original single-pool odds (~43% vowel / ~57% consonant).
// Edit these two numbers to rebalance how often vowels vs. consonants come
// up; edit LETTER_FREQUENCIES to rebalance individual letters within a
// category.
export const CATEGORY_WEIGHTS = {
  vowel: sumWeights(VOWEL_FREQUENCIES),
  consonant: sumWeights(CONSONANT_FREQUENCIES),
};

// The player is never shown 3 vowels or 3 consonants among their choice
// slots at once. This is how many same-category letters among the OTHER
// choice slots forces the next draw to flip category; 2 means "a third
// would make three of a kind, so force the opposite category."
export const MAX_SAME_CATEGORY_AMONG_CHOICES = 2;

function pickWeighted(frequencies) {
  const entries = Object.entries(frequencies);
  const total = sumWeights(frequencies);

  let roll = Math.random() * total;
  for (const [letter, weight] of entries) {
    roll -= weight;
    if (roll < 0) return letter;
  }
  return entries[entries.length - 1][0]; // floating-point fallback
}

function pickCategory(otherLetters) {
  const vowelCount = otherLetters.filter(isVowel).length;
  const consonantCount = otherLetters.length - vowelCount;

  if (vowelCount >= MAX_SAME_CATEGORY_AMONG_CHOICES) return 'consonant';
  if (consonantCount >= MAX_SAME_CATEGORY_AMONG_CHOICES) return 'vowel';

  const total = CATEGORY_WEIGHTS.vowel + CATEGORY_WEIGHTS.consonant;
  return Math.random() * total < CATEGORY_WEIGHTS.vowel ? 'vowel' : 'consonant';
}

// Draws one letter: first rolls vowel vs. consonant (per CATEGORY_WEIGHTS,
// overridden by the no-three-of-a-kind rule above), then rolls a specific
// letter within that category (per its share of LETTER_FREQUENCIES).
//
// otherLetters is the player's other current choice-slot letters (i.e. all
// choices except the one being redrawn) — pass [] (the default) to draw
// with no category constraint, e.g. for a table with no other choices yet.
export function getRandomLetter(otherLetters = []) {
  const category = pickCategory(otherLetters);
  return pickWeighted(category === 'vowel' ? VOWEL_FREQUENCIES : CONSONANT_FREQUENCIES);
}
