// The difficulty tiers, and nothing else.
//
// A tier is just a name. What it *means* is decided per objective, in the
// `byDifficulty` table each definition carries (see definitions.js) — so
// "harder" can mean a bigger count for one objective, a longer word for
// another, and a tighter limit for a third, without this file knowing
// anything about any of them.
//
// Adding a tier is a line here plus a column in each definition's
// byDifficulty table; the validator in definitions.js will point at every
// table that still needs one rather than letting a tier silently fall back
// to defaults.

export const Difficulty = Object.freeze({
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
  EXPERT: 'expert',
});

// Easiest first. The order is meaningful — a future "next difficulty"
// button or a campaign that ramps tiers reads it from here.
export const DIFFICULTY_ORDER = Object.freeze([
  Difficulty.EASY,
  Difficulty.MEDIUM,
  Difficulty.HARD,
  Difficulty.EXPERT,
]);

export const DIFFICULTY_LABELS = Object.freeze({
  [Difficulty.EASY]: 'Easy',
  [Difficulty.MEDIUM]: 'Medium',
  [Difficulty.HARD]: 'Hard',
  [Difficulty.EXPERT]: 'Expert',
});

export const DEFAULT_DIFFICULTY = Difficulty.EASY;

export function isDifficulty(value) {
  return DIFFICULTY_ORDER.includes(value);
}

// Throws rather than degrading, for the same reason getDefinition does: a
// typo in a mode or a saved preference should surface immediately, not
// quietly hand the player an objective tuned for the wrong tier. `null` is
// allowed and means "no tier" — the objective's plain defaults apply.
export function assertDifficulty(value) {
  if (value === null || value === undefined) return null;
  if (!isDifficulty(value)) {
    throw new Error(
      `Unknown difficulty "${value}". Known difficulties: ${DIFFICULTY_ORDER.join(', ')}`
    );
  }
  return value;
}

// For a future difficulty picker: the tiers in order, with display names.
export function listDifficulties() {
  return DIFFICULTY_ORDER.map((id) => ({ id, label: DIFFICULTY_LABELS[id] }));
}
