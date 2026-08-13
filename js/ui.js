// All DOM reads/writes live here. Pure rendering functions; no game logic.

export function renderCorner(cornerEl, word) {
  cornerEl.querySelector('.word').textContent = word;
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

export function showWordFeedback(cornerEl, wordLength, points) {
  const existing = cornerEl.querySelector('.word-feedback');
  if (existing) existing.remove();

  const feedbackEl = document.createElement('div');
  feedbackEl.className = 'word-feedback';
  feedbackEl.innerHTML = `<span class="word-feedback-length">${wordLength} Letter Word</span><span class="word-feedback-points">+${points} Points</span>`;
  cornerEl.appendChild(feedbackEl);

  feedbackEl.addEventListener('animationend', () => feedbackEl.remove());
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
