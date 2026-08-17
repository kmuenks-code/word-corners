import {
  createGameState,
  appendLetterToCorner,
  appendBlankLetterToCorner,
  clearCorner,
  addScore,
  closeCorner,
  setChoiceLetter,
  setNextLetter,
  setBlankPending,
  setHoldLetter,
  clearHoldLetter,
  removeLastLetter,
  reopenCorner,
  markGameStarted,
  recordWordSubmitted,
  recordBlankEarned,
} from './gameState.js';
import { submitGame, fetchHighScores } from './api.js';
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
  renderBlankPickerOptions,
  showBlankPicker,
  hideBlankPicker,
  renderBlankBubble,
  setChoicesBlocked,
  renderBestScore,
} from './ui.js';

const CHOICE_COUNT = 2;
const BLANK_AWARD_LENGTH = 5;
const MIN_WORD_LENGTH = 3;

let state = createGameState();
// Single-level undo: records enough to reverse the most recent drop.
// Cleared whenever a word is submitted, since that's a checkpoint.
// { type: 'choice', index, corner, closedNow, prevChoiceLetter, prevNextLetter }
// or { type: 'blank', corner, closedNow } for a blank-letter placement.
let lastMove = null;
// Set while the blank-letter picker is open, to the corner it was
// dropped on; consumed (and cleared) when a letter is chosen.
let pendingBlankCorner = null;
// Set by handleUndo when a 'choice' move is undone, to the preview letter
// that move's advanceChoice() had just freshly drawn (and is being
// discarded). drawNextLetter() consumes this on its next call instead of
// drawing a new random letter, so an undo can't be used to re-roll the
// preview for free by dropping and undoing repeatedly — the same letter
// that would have come up keeps coming up until it's actually drawn.
let bankedPreviewLetter = null;
// Last known { globalBest, personalBest } from the server. Seeded at
// startup and refreshed from the response to each game we post, so the
// game-over overlay can render immediately instead of waiting on a request.
// Both stay null until a request succeeds, which is also the offline state.
let cachedBests = { globalBest: null, personalBest: null };
// Guards against posting the same finished game twice.
let gameRecorded = false;

const cornerEls = Array.from(document.querySelectorAll('.corner'));
const scoreEl = document.getElementById('score-value');
const finalScoreEl = document.getElementById('final-score');
const newGameBtn = document.getElementById('new-game-btn');
const undoBtn = document.getElementById('undo-btn');
const previewLetterEl = document.getElementById('preview-letter');
const choiceBubbleEls = Array.from({ length: CHOICE_COUNT }, (_, i) =>
  document.getElementById(`choice-${i}`)
);
const choiceLetterEls = Array.from({ length: CHOICE_COUNT }, (_, i) =>
  document.getElementById(`choice-letter-${i}`)
);
const blankSlotEl = document.getElementById('blank-slot');
const blankBubbleEl = document.getElementById('blank-bubble');
const blankPickerEl = document.getElementById('blank-picker');
const blankPickerGridEl = document.getElementById('blank-picker-grid');
const personalBestRowEl = document.getElementById('personal-best-row');
const personalBestEl = document.getElementById('personal-best');
const globalBestRowEl = document.getElementById('global-best-row');
const globalBestEl = document.getElementById('global-best');

function cornerElFor(cornerName) {
  return cornerEls.find((c) => c.dataset.corner === cornerName);
}

// Draws a fresh preview letter, following the vowel/consonant balancing
// rule in letterSource.js (never 3 vowels or 3 consonants among the two
// choice slots + the preview at once) — enforced by telling it what both
// choice slots currently hold. The two choice slots themselves are free to
// match each other's category; only the preview is constrained against them.
function drawNextLetter() {
  if (bankedPreviewLetter !== null) {
    const letter = bankedPreviewLetter;
    bankedPreviewLetter = null;
    setNextLetter(state, letter);
    renderLetter(previewLetterEl, letter);
    return;
  }
  const otherLetters = state.choices.filter(Boolean);
  const letter = getRandomLetter(otherLetters);
  setNextLetter(state, letter);
  renderLetter(previewLetterEl, letter);
}

// Moves the current preview letter into a choice slot, then draws a new
// preview. This is the "queue advances" refill: both choice slots pull
// from the same single upcoming-letter preview.
function advanceChoice(index) {
  const incoming = state.nextLetter;
  setChoiceLetter(state, index, incoming);
  renderLetter(choiceLetterEls[index], incoming);
  drawNextLetter();
}

function renderBests() {
  renderBestScore(personalBestRowEl, personalBestEl, cachedBests.personalBest);
  renderBestScore(globalBestRowEl, globalBestEl, cachedBests.globalBest);
}

// All four corners are closed. Shows the overlay right away with whatever
// bests we already know, then posts this game and re-renders with the bests
// the server computed after storing it — so a new personal or all-time high
// shows up on the same screen that set it. A failed post is silent: the
// overlay just keeps showing the previous (or no) bests.
function endGame() {
  renderGameOver(document.body, finalScoreEl, state.score);
  renderBests();

  if (gameRecorded) return;
  gameRecorded = true;
  submitGame({ score: state.score, stats: state.stats }).then((bests) => {
    if (!bests) return;
    cachedBests = bests;
    renderBests();
  });
}

function initRound() {
  markGameStarted(state);
  const letters = [];
  for (let i = 0; i < CHOICE_COUNT; i++) {
    const letter = getRandomLetter(letters);
    setChoiceLetter(state, i, letter);
    letters.push(letter);
    renderLetter(choiceLetterEls[i], letter);
  }
  drawNextLetter();
}

function handleDrop(index, targetName) {
  if (state.gameOver) return;
  if (state.blankPending) return;
  if (state.closedCorners[targetName]) return;

  const prevChoiceLetter = state.choices[index];
  const prevNextLetter = state.nextLetter;

  appendLetterToCorner(state, targetName, prevChoiceLetter);
  const word = state.corners[targetName];
  const cornerEl = cornerElFor(targetName);
  renderCorner(cornerEl, word, state.blankIndices[targetName]);

  let closedNow = false;
  if (!hasWordWithPrefix(word)) {
    closeCorner(state, targetName);
    renderClosedCorner(cornerEl);
    closedNow = true;
  }

  advanceChoice(index);

  lastMove = { type: 'choice', index, corner: targetName, closedNow, prevChoiceLetter, prevNextLetter };
  renderUndoAvailability(undoBtn, true);

  if (state.gameOver) {
    endGame();
  }
}

// Awards a blank/star letter whenever a valid word of BLANK_AWARD_LENGTH+
// is submitted. Blocks the two normal choice bubbles and word submission
// until the player drags the blank to a corner and picks a letter — see
// handleBlankDrop/handleBlankLetterChosen.
function renderBlankState() {
  renderBlankBubble(blankSlotEl, state.blankPending);
  setChoicesBlocked(choiceBubbleEls, state.blankPending);
}

// hadBlank: whether the submitted word already contained a blank-letter —
// a word that used a blank can't earn another one, even at 5+ letters.
function awardBlankIfEligible(word, hadBlank) {
  if (hadBlank || word.length < BLANK_AWARD_LENGTH) return;
  setBlankPending(state, true);
  recordBlankEarned(state);
  renderBlankState();
}

function handleBlankDrop(targetName) {
  if (!state.blankPending || state.gameOver) return;
  if (state.closedCorners[targetName]) return;
  pendingBlankCorner = targetName;
  showBlankPicker(blankPickerEl);
}

function handleBlankLetterChosen(letter) {
  const targetName = pendingBlankCorner;
  if (!targetName) return;

  appendBlankLetterToCorner(state, targetName, letter);
  const word = state.corners[targetName];
  const cornerEl = cornerElFor(targetName);
  renderCorner(cornerEl, word, state.blankIndices[targetName]);

  let closedNow = false;
  if (!hasWordWithPrefix(word)) {
    closeCorner(state, targetName);
    renderClosedCorner(cornerEl);
    closedNow = true;
  }

  setBlankPending(state, false);
  renderBlankState();
  pendingBlankCorner = null;
  hideBlankPicker(blankPickerEl);

  lastMove = { type: 'blank', corner: targetName, closedNow };
  renderUndoAvailability(undoBtn, true);

  if (state.gameOver) {
    endGame();
  }
}

function handleUndo() {
  if (!lastMove || state.gameOver) return;

  if (lastMove.type === 'blank') {
    const { corner, closedNow } = lastMove;
    removeLastLetter(state, corner);
    const cornerEl = cornerElFor(corner);
    renderCorner(cornerEl, state.corners[corner], state.blankIndices[corner]);
    if (closedNow) {
      reopenCorner(state, corner);
      resetCornerVisuals(cornerEl);
    }
    setBlankPending(state, true);
    renderBlankState();
    lastMove = null;
    renderUndoAvailability(undoBtn, false);
    return;
  }

  const { index, corner, closedNow, prevChoiceLetter, prevNextLetter } = lastMove;
  removeLastLetter(state, corner);
  const cornerEl = cornerElFor(corner);
  renderCorner(cornerEl, state.corners[corner], state.blankIndices[corner]);
  if (closedNow) {
    reopenCorner(state, corner);
    resetCornerVisuals(cornerEl);
  }
  setChoiceLetter(state, index, prevChoiceLetter);
  renderLetter(choiceLetterEls[index], prevChoiceLetter);
  bankedPreviewLetter = state.nextLetter;
  setNextLetter(state, prevNextLetter);
  renderLetter(previewLetterEl, prevNextLetter);

  lastMove = null;
  renderUndoAvailability(undoBtn, false);
}

function handleSubmit(cornerName) {
  if (state.closedCorners[cornerName] || state.gameOver || state.blankPending) return;

  const word = state.corners[cornerName];
  if (!word) return;

  const cornerEl = cornerElFor(cornerName);

  if (word.length >= MIN_WORD_LENGTH && isValidWord(word)) {
    const hadBlank = state.blankIndices[cornerName].length > 0;
    const points = scoreWord(word);
    addScore(state, points);
    recordWordSubmitted(state, word.length);
    renderScore(scoreEl, state.score);
    showWordFeedback(cornerEl, word.length, points, word.length >= BLANK_AWARD_LENGTH && !hadBlank);
    clearCorner(state, cornerName);
    renderCorner(cornerEl, '');
    lastMove = null;
    renderUndoAvailability(undoBtn, false);
    awardBlankIfEligible(word, hadBlank);
  } else {
    flashInvalid(cornerEl);
  }
}

function resetGame() {
  state = createGameState();
  lastMove = null;
  pendingBlankCorner = null;
  bankedPreviewLetter = null;
  gameRecorded = false;
  renderUndoAvailability(undoBtn, false);
  hideGameOver(document.body);
  hideBlankPicker(blankPickerEl);
  renderBlankState();
  renderScore(scoreEl, state.score);
  cornerEls.forEach((cornerEl) => {
    resetCornerVisuals(cornerEl);
    renderCorner(cornerEl, '');
  });
  initRound();
}

async function start() {
  choiceLetterEls.forEach((el) => renderLetter(el, '…')); // loading indicator
  renderLetter(previewLetterEl, '…');

  // Not awaited: the bests are only needed on the game-over overlay, so
  // there's no reason to hold up the first turn on a network round trip.
  fetchHighScores().then((bests) => {
    if (bests) cachedBests = bests;
  });

  await loadWordList();

  choiceBubbleEls.forEach((bubbleEl, index) => {
    initDrag(choiceLetterEls[index], cornerEls, (target) => handleDrop(index, target), bubbleEl);
  });
  initDrag(blankBubbleEl, cornerEls, handleBlankDrop, blankBubbleEl);
  renderBlankPickerOptions(blankPickerGridEl);
  blankPickerGridEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.blank-picker-btn');
    if (!btn) return;
    handleBlankLetterChosen(btn.dataset.letter);
  });
  cornerEls.forEach((cornerEl) => {
    cornerEl.addEventListener('click', () => handleSubmit(cornerEl.dataset.corner));
  });
  newGameBtn.addEventListener('click', resetGame);
  undoBtn.addEventListener('click', handleUndo);

  initRound();
}

start();

// ---------------------------------------------------------------------
// Idle: the previous single-letter + hold turn loop this replaced. Not
// called from start() or anywhere else — kept in case that flow (or the
// hold mechanic layered onto the two-choice-plus-preview board) is
// revisited. Depends on the hidden #legacy-controls markup in index.html
// and the currentLetter/holdLetter fields still tracked in gameState.js
// (state.nextLetter is shared with the active preview logic above, so this
// legacy code and the active game would stomp on each other's use of it if
// both ran — harmless only because this code is never called).
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
