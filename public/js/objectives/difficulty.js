// The difficulty tiers, and nothing else.
//
// A tier is just a name. What it is *worth* lives in `POINT_BUDGETS`
// (modes.js): a tier buys a number of budget points, and the Objective
// mode spends them on priced objectives. Nothing about an objective's
// own numbers is decided here, or anywhere keyed off these names — which
// is what lets the splash, the budget table, and any future
// tier-dependent feature each key off this vocabulary independently.
//
// Adding a tier is a line here plus a number in POINT_BUDGETS; the
// validator in modes.js refuses a budget the pool cannot spend exactly,
// rather than letting a tier silently deal nothing.

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
