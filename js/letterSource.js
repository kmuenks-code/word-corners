// Produces the sequence of letters the player receives.
// Frequencies match the standard English Scrabble tile distribution
// (98 letter tiles, blanks excluded).

export const LETTER_FREQUENCIES = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1,
  K: 1, L: 4, M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6,
  U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
};

// Accepts an alternate frequency table so future difficulty scaling can
// pass in adjusted weights (e.g. rarer letters boosted or suppressed)
// without touching the selection logic below.
export function getRandomLetter(frequencies = LETTER_FREQUENCIES) {
  const entries = Object.entries(frequencies);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);

  let roll = Math.random() * total;
  for (const [letter, weight] of entries) {
    roll -= weight;
    if (roll < 0) return letter;
  }
  return entries[entries.length - 1][0]; // floating-point fallback
}
