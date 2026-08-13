// Superlinear scoring: longer words are worth disproportionately more.
// To change the formula, edit only this function.

export function scoreWord(word) {
  const n = word.length;
  return (n * (n - 1)) / 2;
}
