import {
  createGameState,
  appendLetterToCorner,
  clearCorner,
  addScore,
  closeCorner,
  setHoldLetter,
  clearHoldLetter,
} from './gameState.js';
import { getRandomLetter } from './letterSource.js';
import { loadWordList, isValidWord, hasWordWithPrefix } from './wordValidator.js';
import { scoreWord } from './scoring.js';
import { initDrag } from './input.js';
import {
  renderCorner,
  renderLetter,
  renderScore,
  flashInvalid,
  renderClosedCorner,
  resetCornerVisuals,
  renderGameOver,
  hideGameOver,
  renderHold,
  showWordFeedback,
} from './ui.js';

let state = createGameState();

const cornerEls = Array.from(document.querySelectorAll('.corner'));
const currentLetterEl = document.getElementById('current-letter');
const centerEl = document.getElementById('center');
const nextLetterEl = document.getElementById('next-letter');
const scoreEl = document.getElementById('score-value');
const finalScoreEl = document.getElementById('final-score');
const newGameBtn = document.getElementById('new-game-btn');
const holdSlotEl = document.getElementById('hold-slot');
const holdLetterEl = document.getElementById('hold-letter');

function cornerElFor(cornerName) {
  return cornerEls.find((c) => c.dataset.corner === cornerName);
}

function nextTurn() {
  state.currentLetter = state.nextLetter ?? getRandomLetter();
  state.nextLetter = getRandomLetter();
  renderLetter(currentLetterEl, state.currentLetter);
  renderLetter(nextLetterEl, state.nextLetter);
}

function handleDrop(targetName) {
  if (state.gameOver) return;

  if (targetName === 'hold') {
    if (state.holdLetter) return;
    setHoldLetter(state, state.currentLetter);
    renderHold(holdSlotEl, holdLetterEl, state.holdLetter);
    nextTurn();
    return;
  }

  if (state.closedCorners[targetName]) return;

  appendLetterToCorner(state, targetName, state.currentLetter);
  const word = state.corners[targetName];
  const cornerEl = cornerElFor(targetName);
  renderCorner(cornerEl, word);

  if (word.length >= 5 && !hasWordWithPrefix(word)) {
    closeCorner(state, targetName);
    renderClosedCorner(cornerEl);
  }

  if (state.gameOver) {
    renderGameOver(document.body, finalScoreEl, state.score);
    return;
  }

  nextTurn();
}

function handleHoldDrop(cornerName) {
  if (state.closedCorners[cornerName] || state.gameOver || !state.holdLetter) return;

  appendLetterToCorner(state, cornerName, state.holdLetter);
  const word = state.corners[cornerName];
  const cornerEl = cornerElFor(cornerName);
  renderCorner(cornerEl, word);

  clearHoldLetter(state);
  renderHold(holdSlotEl, holdLetterEl, state.holdLetter);

  if (word.length >= 5 && !hasWordWithPrefix(word)) {
    closeCorner(state, cornerName);
    renderClosedCorner(cornerEl);
  }

  if (state.gameOver) {
    renderGameOver(document.body, finalScoreEl, state.score);
  }
}

function handleSubmit(cornerName) {
  if (state.closedCorners[cornerName] || state.gameOver) return;

  const word = state.corners[cornerName];
  if (!word) return;

  const cornerEl = cornerElFor(cornerName);

  if (isValidWord(word)) {
    const points = scoreWord(word);
    addScore(state, points);
    renderScore(scoreEl, state.score);
    showWordFeedback(cornerEl, word.length, points);
    clearCorner(state, cornerName);
    renderCorner(cornerEl, '');
  } else {
    flashInvalid(cornerEl);
  }
}

function resetGame() {
  state = createGameState();
  hideGameOver(document.body);
  renderScore(scoreEl, state.score);
  renderHold(holdSlotEl, holdLetterEl, null);
  cornerEls.forEach((cornerEl) => {
    resetCornerVisuals(cornerEl);
    renderCorner(cornerEl, '');
  });
  nextTurn();
}

async function start() {
  renderLetter(currentLetterEl, '…'); // loading indicator
  renderHold(holdSlotEl, holdLetterEl, null);
  await loadWordList();

  initDrag(currentLetterEl, [...cornerEls, holdSlotEl], handleDrop, centerEl);
  initDrag(holdLetterEl, cornerEls, handleHoldDrop, holdSlotEl);
  cornerEls.forEach((cornerEl) => {
    cornerEl.addEventListener('click', () => handleSubmit(cornerEl.dataset.corner));
  });
  newGameBtn.addEventListener('click', resetGame);

  nextTurn();
}

start();
