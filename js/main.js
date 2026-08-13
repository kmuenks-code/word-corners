import {
  createGameState,
  appendLetterToCorner,
  clearCorner,
  addScore,
  closeCorner,
  setHoldLetter,
  clearHoldLetter,
  removeLastLetter,
  reopenCorner,
  setCurrentLetter,
  setNextLetter,
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
  renderUndoAvailability,
} from './ui.js';

let state = createGameState();
// Single-level undo: records enough to reverse the most recent drop.
// Cleared whenever a word is submitted, since that's a checkpoint.
let lastMove = null;

const cornerEls = Array.from(document.querySelectorAll('.corner'));
const currentLetterEl = document.getElementById('current-letter');
const centerEl = document.getElementById('center');
const nextLetterEl = document.getElementById('next-letter');
const scoreEl = document.getElementById('score-value');
const finalScoreEl = document.getElementById('final-score');
const newGameBtn = document.getElementById('new-game-btn');
const holdSlotEl = document.getElementById('hold-slot');
const holdLetterEl = document.getElementById('hold-letter');
const undoBtn = document.getElementById('undo-btn');

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

  const prevCurrentLetter = state.currentLetter;
  const prevNextLetter = state.nextLetter;

  if (targetName === 'hold') {
    if (state.holdLetter) return;
    setHoldLetter(state, state.currentLetter);
    renderHold(holdSlotEl, holdLetterEl, state.holdLetter);
    lastMove = { type: 'toHold', prevCurrentLetter, prevNextLetter };
    renderUndoAvailability(undoBtn, true);
    nextTurn();
    return;
  }

  if (state.closedCorners[targetName]) return;

  appendLetterToCorner(state, targetName, state.currentLetter);
  const word = state.corners[targetName];
  const cornerEl = cornerElFor(targetName);
  renderCorner(cornerEl, word);

  let closedNow = false;
  if (word.length >= 5 && !hasWordWithPrefix(word)) {
    closeCorner(state, targetName);
    renderClosedCorner(cornerEl);
    closedNow = true;
  }

  lastMove = { type: 'corner', corner: targetName, closedNow, prevCurrentLetter, prevNextLetter };
  renderUndoAvailability(undoBtn, true);

  if (state.gameOver) {
    renderGameOver(document.body, finalScoreEl, state.score);
    return;
  }

  nextTurn();
}

function handleHoldDrop(cornerName) {
  if (state.closedCorners[cornerName] || state.gameOver || !state.holdLetter) return;

  const heldLetter = state.holdLetter;
  appendLetterToCorner(state, cornerName, heldLetter);
  const word = state.corners[cornerName];
  const cornerEl = cornerElFor(cornerName);
  renderCorner(cornerEl, word);

  clearHoldLetter(state);
  renderHold(holdSlotEl, holdLetterEl, state.holdLetter);

  let closedNow = false;
  if (word.length >= 5 && !hasWordWithPrefix(word)) {
    closeCorner(state, cornerName);
    renderClosedCorner(cornerEl);
    closedNow = true;
  }

  lastMove = { type: 'fromHold', corner: cornerName, letter: heldLetter, closedNow };
  renderUndoAvailability(undoBtn, true);

  if (state.gameOver) {
    renderGameOver(document.body, finalScoreEl, state.score);
  }
}

function handleUndo() {
  if (!lastMove || state.gameOver) return;

  if (lastMove.type === 'corner') {
    const { corner, closedNow, prevCurrentLetter, prevNextLetter } = lastMove;
    removeLastLetter(state, corner);
    const cornerEl = cornerElFor(corner);
    renderCorner(cornerEl, state.corners[corner]);
    if (closedNow) {
      reopenCorner(state, corner);
      resetCornerVisuals(cornerEl);
    }
    setCurrentLetter(state, prevCurrentLetter);
    setNextLetter(state, prevNextLetter);
    renderLetter(currentLetterEl, state.currentLetter);
    renderLetter(nextLetterEl, state.nextLetter);
  } else if (lastMove.type === 'toHold') {
    clearHoldLetter(state);
    renderHold(holdSlotEl, holdLetterEl, state.holdLetter);
    setCurrentLetter(state, lastMove.prevCurrentLetter);
    setNextLetter(state, lastMove.prevNextLetter);
    renderLetter(currentLetterEl, state.currentLetter);
    renderLetter(nextLetterEl, state.nextLetter);
  } else if (lastMove.type === 'fromHold') {
    const { corner, letter, closedNow } = lastMove;
    removeLastLetter(state, corner);
    const cornerEl = cornerElFor(corner);
    renderCorner(cornerEl, state.corners[corner]);
    if (closedNow) {
      reopenCorner(state, corner);
      resetCornerVisuals(cornerEl);
    }
    setHoldLetter(state, letter);
    renderHold(holdSlotEl, holdLetterEl, state.holdLetter);
  }

  lastMove = null;
  renderUndoAvailability(undoBtn, false);
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
    lastMove = null;
    renderUndoAvailability(undoBtn, false);
  } else {
    flashInvalid(cornerEl);
  }
}

function resetGame() {
  state = createGameState();
  lastMove = null;
  renderUndoAvailability(undoBtn, false);
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
  undoBtn.addEventListener('click', handleUndo);

  nextTurn();
}

start();
