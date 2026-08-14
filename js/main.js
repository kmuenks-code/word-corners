import {
  createGameState,
  appendLetterToCorner,
  clearCorner,
  addScore,
  closeCorner,
  setChoiceLetter,
  setHoldLetter,
  clearHoldLetter,
  removeLastLetter,
  reopenCorner,
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

const CHOICE_COUNT = 3;

let state = createGameState();
// Single-level undo: records enough to reverse the most recent drop.
// Cleared whenever a word is submitted, since that's a checkpoint.
let lastMove = null;

const cornerEls = Array.from(document.querySelectorAll('.corner'));
const scoreEl = document.getElementById('score-value');
const finalScoreEl = document.getElementById('final-score');
const newGameBtn = document.getElementById('new-game-btn');
const undoBtn = document.getElementById('undo-btn');
const choiceBubbleEls = Array.from({ length: CHOICE_COUNT }, (_, i) =>
  document.getElementById(`choice-${i}`)
);
const choiceLetterEls = Array.from({ length: CHOICE_COUNT }, (_, i) =>
  document.getElementById(`choice-letter-${i}`)
);

function cornerElFor(cornerName) {
  return cornerEls.find((c) => c.dataset.corner === cornerName);
}

// Draws a fresh random letter into one of the three choice slots, following
// the same weighting/logic as the previous single-letter draw, plus the
// vowel/consonant balancing rule in letterSource.js (never 3 vowels or 3
// consonants across the choice slots at once) — enforced by telling it
// what the other two slots currently hold.
function drawChoice(index) {
  const otherLetters = state.choices.filter((letter, i) => i !== index && letter);
  const letter = getRandomLetter(otherLetters);
  setChoiceLetter(state, index, letter);
  renderLetter(choiceLetterEls[index], letter);
}

function initChoices() {
  for (let i = 0; i < CHOICE_COUNT; i++) drawChoice(i);
}

function handleDrop(index, targetName) {
  if (state.gameOver) return;
  if (state.closedCorners[targetName]) return;

  const prevChoiceLetter = state.choices[index];

  appendLetterToCorner(state, targetName, prevChoiceLetter);
  const word = state.corners[targetName];
  const cornerEl = cornerElFor(targetName);
  renderCorner(cornerEl, word);

  let closedNow = false;
  if (word.length >= 5 && !hasWordWithPrefix(word)) {
    closeCorner(state, targetName);
    renderClosedCorner(cornerEl);
    closedNow = true;
  }

  drawChoice(index);

  lastMove = { index, corner: targetName, closedNow, prevChoiceLetter };
  renderUndoAvailability(undoBtn, true);

  if (state.gameOver) {
    renderGameOver(document.body, finalScoreEl, state.score);
  }
}

function handleUndo() {
  if (!lastMove || state.gameOver) return;

  const { index, corner, closedNow, prevChoiceLetter } = lastMove;
  removeLastLetter(state, corner);
  const cornerEl = cornerElFor(corner);
  renderCorner(cornerEl, state.corners[corner]);
  if (closedNow) {
    reopenCorner(state, corner);
    resetCornerVisuals(cornerEl);
  }
  setChoiceLetter(state, index, prevChoiceLetter);
  renderLetter(choiceLetterEls[index], prevChoiceLetter);

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
  cornerEls.forEach((cornerEl) => {
    resetCornerVisuals(cornerEl);
    renderCorner(cornerEl, '');
  });
  initChoices();
}

async function start() {
  choiceLetterEls.forEach((el) => renderLetter(el, '…')); // loading indicator
  await loadWordList();

  choiceBubbleEls.forEach((bubbleEl, index) => {
    initDrag(choiceLetterEls[index], cornerEls, (target) => handleDrop(index, target), bubbleEl);
  });
  cornerEls.forEach((cornerEl) => {
    cornerEl.addEventListener('click', () => handleSubmit(cornerEl.dataset.corner));
  });
  newGameBtn.addEventListener('click', resetGame);
  undoBtn.addEventListener('click', handleUndo);

  initChoices();
}

start();

// ---------------------------------------------------------------------
// Idle: the previous single-letter + hold turn loop this replaced. Not
// called from start() or anywhere else — kept in case that flow (or the
// hold mechanic layered onto the new three-choice board) is revisited.
// Depends on the hidden #legacy-controls markup in index.html and the
// currentLetter/nextLetter/holdLetter fields still tracked in gameState.js.
// ---------------------------------------------------------------------

function legacyNextTurn(currentLetterEl, nextLetterEl) {
  state.currentLetter = state.nextLetter ?? getRandomLetter();
  state.nextLetter = getRandomLetter();
  renderLetter(currentLetterEl, state.currentLetter);
  renderLetter(nextLetterEl, state.nextLetter);
}

function legacyHandleHoldDrop(cornerName, holdSlotEl, holdLetterEl) {
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

function legacyHandleDropToHold(holdSlotEl, holdLetterEl, currentLetterEl, nextLetterEl) {
  if (state.gameOver || state.holdLetter) return;
  setHoldLetter(state, state.currentLetter);
  renderHold(holdSlotEl, holdLetterEl, state.holdLetter);
  legacyNextTurn(currentLetterEl, nextLetterEl);
}
