// All DOM reads/writes live here. Pure rendering functions; no game logic.

// blankIndices marks which character positions in `word` were placed via
// the blank/wildcard letter — those render gold via .blank-letter.
export function renderCorner(cornerEl, word, blankIndices = []) {
  const wordEl = cornerEl.querySelector('.word');
  wordEl.innerHTML = '';
  const blankSet = new Set(blankIndices);
  [...word].forEach((char, i) => {
    if (blankSet.has(i)) {
      const span = document.createElement('span');
      span.className = 'blank-letter';
      span.textContent = char;
      wordEl.appendChild(span);
    } else {
      wordEl.appendChild(document.createTextNode(char));
    }
  });
}

export function renderLetter(letterEl, letter) {
  letterEl.textContent = letter;
}

export function renderScore(scoreEl, score) {
  scoreEl.textContent = score;
}

export function flashInvalid(cornerEl) {
  cornerEl.classList.remove('invalid');
  // force reflow so the animation restarts if triggered again quickly
  void cornerEl.offsetWidth;
  cornerEl.classList.add('invalid');
}

export function renderHold(holdSlotEl, holdLetterEl, letter) {
  holdLetterEl.textContent = letter || '';
  holdSlotEl.classList.toggle('occupied', !!letter);
  holdSlotEl.classList.toggle('empty', !letter);
}

export function showWordFeedback(cornerEl, wordLength, points, blankAwarded = false) {
  const existing = cornerEl.querySelector('.word-feedback');
  if (existing) existing.remove();

  const feedbackEl = document.createElement('div');
  feedbackEl.className = 'word-feedback';
  feedbackEl.innerHTML = `<span class="word-feedback-length">${wordLength} Letter Word</span><span class="word-feedback-points">+${points} Points</span>${blankAwarded ? '<span class="word-feedback-blank">Blank Tile Earned</span>' : ''}`;
  cornerEl.appendChild(feedbackEl);

  feedbackEl.addEventListener('animationend', () => feedbackEl.remove());
}

export function renderUndoAvailability(undoBtn, available) {
  undoBtn.disabled = !available;
}

export function renderClosedCorner(cornerEl) {
  cornerEl.classList.add('closed');
}

export function resetCornerVisuals(cornerEl) {
  cornerEl.classList.remove('closed', 'invalid');
}

export function renderGameOver(bodyEl, finalScoreEl, score) {
  finalScoreEl.textContent = score;
  bodyEl.classList.add('game-over');
}

export function hideGameOver(bodyEl) {
  bodyEl.classList.remove('game-over');
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Builds the 26 letter buttons in the blank-letter picker once. Callers
// wire up a single delegated click listener on gridEl.
export function renderBlankPickerOptions(gridEl) {
  gridEl.innerHTML = '';
  ALPHABET.forEach((letter) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'blank-picker-btn';
    btn.textContent = letter;
    btn.dataset.letter = letter;
    gridEl.appendChild(btn);
  });
}

export function showBlankPicker(pickerEl) {
  pickerEl.hidden = false;
}

export function hideBlankPicker(pickerEl) {
  pickerEl.hidden = true;
}

export function renderBlankBubble(slotEl, pending) {
  slotEl.hidden = !pending;
}

export function setChoicesBlocked(bubbleEls, blocked) {
  bubbleEls.forEach((el) => el.classList.toggle('blocked', blocked));
}
