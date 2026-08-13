// Holds all mutable game data. No DOM, no rendering, no input logic here.

export function createGameState() {
  return {
    corners: { nw: '', ne: '', sw: '', se: '' },
    closedCorners: { nw: false, ne: false, sw: false, se: false },
    currentLetter: null,
    nextLetter: null, // reserved for next-letter preview feature
    holdLetter: null,
    score: 0,
    gameOver: false,
  };
}

export function appendLetterToCorner(state, corner, letter) {
  state.corners[corner] += letter;
}

export function clearCorner(state, corner) {
  state.corners[corner] = '';
}

export function addScore(state, points) {
  state.score += points;
}

export function setHoldLetter(state, letter) {
  state.holdLetter = letter;
}

export function clearHoldLetter(state) {
  state.holdLetter = null;
}

// Marks a corner as dead (its word can never become legal). Also flips
// gameOver once every corner is closed.
export function closeCorner(state, corner) {
  state.closedCorners[corner] = true;
  state.gameOver = Object.values(state.closedCorners).every(Boolean);
}
