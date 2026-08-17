// Holds all mutable game data. No DOM, no rendering, no input logic here.

export function createGameState() {
  return {
    corners: { nw: '', ne: '', sw: '', se: '' },
    // Index positions within each corner's word that were placed via the
    // blank/wildcard letter (see appendBlankLetterToCorner) — drives both
    // the gold rendering of those letters and the "a word containing a
    // blank can't earn another blank" rule. See main.js.
    blankIndices: { nw: [], ne: [], sw: [], se: [] },
    closedCorners: { nw: false, ne: false, sw: false, se: false },
    choices: [null, null],
    // The upcoming letter shown in the preview bubble. Advances into
    // whichever choice slot is used next. See main.js.
    nextLetter: null,
    // True once a 5+ letter valid word has awarded a blank, until the
    // player drags it to a corner and picks a letter. While true the two
    // normal choice bubbles are blocked and word submission is disabled —
    // the blank must be used before anything else. See main.js.
    blankPending: false,
    // Idle: unused by the active turn loop, kept in case the single-letter
    // + hold flow is revisited. See main.js.
    currentLetter: null,
    holdLetter: null,
    score: 0,
    gameOver: false,
    // Per-game telemetry, posted to the database once at game over (see
    // js/api.js and main.js). Counts only successful submissions — invalid
    // or too-short attempts aren't recorded.
    stats: {
      startedAt: Date.now(),
      wordsTotal: 0,
      // wordsByLength partitions wordsTotal; '6+' buckets everything longer.
      words3: 0,
      words4: 0,
      words5: 0,
      words6Plus: 0,
      blanksEarned: 0,
    },
  };
}

// Restarts the duration clock. Called once the first letters are actually
// dealt, so the word list's load time doesn't count as play time.
export function markGameStarted(state) {
  state.stats.startedAt = Date.now();
}

// Records one successfully scored word of the given length.
export function recordWordSubmitted(state, wordLength) {
  const s = state.stats;
  s.wordsTotal += 1;
  if (wordLength === 3) s.words3 += 1;
  else if (wordLength === 4) s.words4 += 1;
  else if (wordLength === 5) s.words5 += 1;
  else if (wordLength >= 6) s.words6Plus += 1;
}

export function recordBlankEarned(state) {
  state.stats.blanksEarned += 1;
}

export function setChoiceLetter(state, index, letter) {
  state.choices[index] = letter;
}

export function appendLetterToCorner(state, corner, letter) {
  state.corners[corner] += letter;
}

// Same as appendLetterToCorner, but also records the position as
// blank-derived — see the blankIndices field above.
export function appendBlankLetterToCorner(state, corner, letter) {
  state.blankIndices[corner].push(state.corners[corner].length);
  state.corners[corner] += letter;
}

export function clearCorner(state, corner) {
  state.corners[corner] = '';
  state.blankIndices[corner] = [];
}

export function removeLastLetter(state, corner) {
  const removedIndex = state.corners[corner].length - 1;
  state.corners[corner] = state.corners[corner].slice(0, -1);
  const blanks = state.blankIndices[corner];
  if (blanks.length && blanks[blanks.length - 1] === removedIndex) {
    blanks.pop();
  }
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

export function setBlankPending(state, pending) {
  state.blankPending = pending;
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
