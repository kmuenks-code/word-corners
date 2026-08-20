// Holds all mutable game data. No DOM, no rendering, no input logic here.

export function createGameState() {
  return {
    corners: { nw: '', ne: '', sw: '', se: '' },
    // Index positions within each corner's word that were placed via the
    // blank/wildcard letter (see appendBlankLetterToCorner) — drives the
    // bright-teal rendering of those letters. See main.js.
    blankIndices: { nw: [], ne: [], sw: [], se: [] },
    closedCorners: { nw: false, ne: false, sw: false, se: false },
    choices: [null, null],
    // The upcoming letter shown in the preview bubble. Advances into
    // whichever choice slot is used next. See main.js.
    nextLetter: null,
    // How many unused blanks the player is holding. Earned every time total
    // score crosses a 25-point mark (see BLANK_SCORE_INTERVAL in main.js)
    // and kept until spent, so they stack: an award while one is still in
    // hand adds to the pile rather than being lost. While any is held a
    // third bubble joins the two choices in the center row and is draggable
    // exactly like them — nothing else about the turn changes. See main.js.
    blanksHeld: 0,
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
      // Letters placed that stuck — an undone drop doesn't count, so this
      // measures the board a game actually consumed rather than every
      // gesture made at it.
      //
      // Nothing bounds it today. `limits.moves` in the objective runtime is
      // wired end to end (runtime.js counts it, standardEvaluate checks it)
      // and deliberately left unset: a move budget is the second pressure
      // axis, and it wants real distributions behind its numbers before a
      // tier tries to impose one. This is how those get collected.
      movesTotal: 0,
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

// One letter placed on a corner, blank-derived or not. Paired with
// unrecordLetterPlaced rather than left to accumulate, so the count means
// "letters on the board" and not "drops attempted" — the objective runtime's
// own move counter behaves the same way, since undo replays it from a
// baseline.
export function recordLetterPlaced(state) {
  state.stats.movesTotal += 1;
}

export function unrecordLetterPlaced(state) {
  state.stats.movesTotal -= 1;
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

export function setNextLetter(state, letter) {
  state.nextLetter = letter;
}

// Puts a blank in hand. Also the undo path for a placed blank: the letter
// comes off the corner and the blank goes back on the pile, where it can sit
// indefinitely rather than demanding to be re-placed.
export function addBlank(state) {
  state.blanksHeld += 1;
}

export function spendBlank(state) {
  state.blanksHeld -= 1;
}

export function addScore(state, points) {
  state.score += points;
}

// Ends the game outright, regardless of how many corners are still open.
// closeCorner below is the usual path there; this exists for the other
// kind of ending — an objective mode declaring the game won or lost while
// corners remain playable. Deliberately says nothing about *why*.
export function setGameOver(state) {
  state.gameOver = true;
}

// Marks a corner as dead (its word can never become legal). Also flips
// gameOver once every corner is closed.
export function closeCorner(state, corner) {
  state.closedCorners[corner] = true;
  state.gameOver = Object.values(state.closedCorners).every(Boolean);
}
