// Holds all mutable game data. No DOM, no rendering, no input logic here.

export function createGameState() {
  return {
    corners: { nw: '', ne: '', sw: '', se: '' },
    closedCorners: { nw: false, ne: false, sw: false, se: false },
    choices: [null, null],
    // The upcoming letter shown in the preview bubble. Advances into
    // whichever choice slot is used next. See main.js.
    nextLetter: null,
    // Idle: unused by the active turn loop, kept in case the single-letter
    // + hold flow is revisited. See main.js.
    currentLetter: null,
    holdLetter: null,
    score: 0,
    gameOver: false,
  };
}

export function setChoiceLetter(state, index, letter) {
  state.choices[index] = letter;
}

export function appendLetterToCorner(state, corner, letter) {
  state.corners[corner] += letter;
}

export function clearCorner(state, corner) {
  state.corners[corner] = '';
}

export function removeLastLetter(state, corner) {
  state.corners[corner] = state.corners[corner].slice(0, -1);
}

export function reopenCorner(state, corner) {
  state.closedCorners[corner] = false;
  state.gameOver = false;
}

export function setCurrentLetter(state, letter) {
  state.currentLetter = letter;
}

export function setNextLetter(state, letter) {
  state.nextLetter = letter;
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
