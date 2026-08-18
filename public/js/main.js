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
  removeLastLetter,
  reopenCorner,
  markGameStarted,
  recordWordSubmitted,
  recordBlankEarned,
  setGameOver,
} from './gameState.js';
import {
  GameEvent,
  createObjectiveRuntime,
  NO_OBJECTIVES,
  createMode,
  listGameModes,
  listDifficulties,
} from './objectives/index.js';
import { submitGame, fetchHighScores } from './api.js';
import { isProduction } from './env.js';
import { getRandomLetter } from './letterSource.js';
import { loadWordList, isValidWord, hasWordWithPrefix } from './wordValidator.js';
import { scoreWord } from './scoring.js';
import { initDrag } from './input.js';
import {
  renderCorner,
  renderCornerSymbol,
  renderLetter,
  renderScore,
  flashInvalid,
  renderClosedCorner,
  resetCornerVisuals,
  renderGameOver,
  hideGameOver,
  showWordFeedback,
  renderUndoAvailability,
  renderBlankPickerOptions,
  showBlankPicker,
  hideBlankPicker,
  renderBlankBubble,
  setChoicesBlocked,
  renderBestScore,
  renderEnvBadge,
  renderModeOptions,
  renderDifficultyOptions,
  showSplash,
  hideSplash,
  renderSplashStep,
  renderObjectiveFlag,
  pulseObjectiveFlag,
  buildCornerFlags,
  renderCornerObjectiveFlag,
  pulseCornerFlag,
  showCornerPopover,
  hideCornerPopover,
  renderObjectiveList,
  showObjectivePanel,
  hideObjectivePanel,
  showHowToPlay,
  hideHowToPlay,
  renderVerdict,
  renderGameOverObjectives,
} from './ui.js';

const CHOICE_COUNT = 2;
const BLANK_AWARD_LENGTH = 5;
const MIN_WORD_LENGTH = 3;

let state = createGameState();
// Reads the game's events, never writes to it. Everything it knows arrives
// through objectives.emit(); see js/objectives/events.js for the vocabulary.
// Starts objective-free; the splash swaps in the chosen mode via
// objectives.reset(mode) before the first turn is dealt, so nothing is
// tracked until a player has actually picked something.
const objectives = createObjectiveRuntime(NO_OBJECTIVES);
// Which mode button is awaiting a difficulty choice on the splash. Set when
// a mode that uses difficulty is tapped, cleared once the game starts.
let pendingModeId = null;
// The last rendered objective progress, as a cheap comparable string. Used
// to tell "an objective actually advanced" from the far more frequent "some
// event arrived", so the flag only bumps when there's something to notice.
let lastObjectiveSignature = '';
// The same idea per corner flag, so one corner's progress bumps only its
// own flag. Keyed by corner; a missing entry means "first render".
let lastCornerSignatures = {};
// Which corner's flag popover is open, or null. Also what keeps that
// popover's contents current as its objective advances.
let openFlagCorner = null;
// Single-level undo: records enough to reverse the most recent drop.
// Cleared whenever a word is submitted, since that's a checkpoint.
// { type: 'choice', index, corner, closedNow, prevChoiceLetter, prevNextLetter }
// or { type: 'blank', corner, closedNow } for a blank-letter placement.
// Both also carry objectiveMark — the objective runtime's position in its
// event stream just before the move, which is how undo reverses objective
// progress too (see js/objectives/runtime.js).
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
const finalScoreRowEl = document.getElementById('final-score-row');
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
const envBadgeEl = document.getElementById('env-badge');
const gameOverLabelEl = document.getElementById('game-over-label');
const gameOverObjectivesEl = document.getElementById('game-over-objectives');
const splashEl = document.getElementById('splash');
const splashModesEl = document.getElementById('splash-modes');
const splashDifficultyEl = document.getElementById('splash-difficulty');
const splashModeOptionsEl = document.getElementById('splash-mode-options');
const splashDifficultyOptionsEl = document.getElementById('splash-difficulty-options');
const splashBackBtn = document.getElementById('splash-back');
const objectiveFlagEl = document.getElementById('objective-flag');
const objectiveFlagBadgeEl = document.getElementById('objective-flag-badge');
const objectivePanelEl = document.getElementById('objective-panel');
const objectiveListEl = document.getElementById('objective-list');
const objectivePanelCloseBtn = document.getElementById('objective-panel-close');
const cornerFlagsEl = document.getElementById('corner-flags');
const cornerPopoverEl = document.getElementById('corner-popover');
const cornerPopoverListEl = document.getElementById('corner-popover-list');
const hintBarEl = document.getElementById('hint-bar');
const howToPlayEl = document.getElementById('how-to-play');
const howToPlayCloseBtn = document.getElementById('how-to-play-close');

// Built once from the corners already in the markup, so a fifth tile would
// get its flag with no change here.
const cornerFlagEls = buildCornerFlags(
  cornerFlagsEl,
  cornerEls.map((el) => el.dataset.corner)
);

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

// Only Endless is ranked, and the server's bests are filtered to match (see
// readBests in src/api/shared.js). Showing them on an Objective game-over
// card would invite a comparison against a number this game was never
// eligible for — the objective summary is that card's scoreboard instead.
function renderBests(view = objectives.snapshot()) {
  const ranked = view.mode.id === 'endless';
  renderBestScore(personalBestRowEl, personalBestEl, ranked ? cachedBests.personalBest : null);
  renderBestScore(globalBestRowEl, globalBestEl, ranked ? cachedBests.globalBest : null);
}

// ---------- Objective HUD ----------

// Everything the flag and its panel show comes from objectives.snapshot()
// and nothing else — no game state is read here, which is what keeps the
// objective layering intact once it has a UI (see js/objectives/index.js).
// Subscribed to the runtime in start(), so it re-renders on every change
// including the rewind an undo performs — and takes the snapshot the
// runtime already built for that notification, falling back to asking for
// one only on the direct calls that have no snapshot in hand.
function renderObjectiveState(view = objectives.snapshot()) {
  const list = view.objectives;
  const done = list.filter((o) => o.status === 'complete').length;

  renderObjectiveFlag(objectiveFlagEl, objectiveFlagBadgeEl, {
    visible: list.length > 0,
    done,
    total: list.length,
  });
  renderObjectiveList(objectiveListEl, list);

  // A corner-scoped objective gets a second home, on a flag beside the tile
  // it belongs to. `params.corner` is the only signal that an objective is
  // corner-scoped — the same convention the objective list's shape column
  // uses — and the selector deals at most one objective per corner, so this
  // lookup is one-to-one by construction (see "One objective per corner").
  const byCorner = new Map();
  list.forEach((objective) => {
    const corner = objective.params?.corner;
    if (corner) byCorner.set(corner, objective);
  });
  cornerFlagEls.forEach((flagEl, corner) => {
    const objective = byCorner.get(corner) ?? null;
    renderCornerObjectiveFlag(flagEl, objective);
    const signature = objective ? `${objective.current}:${objective.status}` : '';
    if (signature !== lastCornerSignatures[corner]) {
      // An absent previous signature is this game's first render, which is
      // no more progress than the whole-board flag's first render is.
      if (lastCornerSignatures[corner]) pulseCornerFlag(flagEl);
      lastCornerSignatures[corner] = signature;
    }
  });

  // An open popover tracks its objective live, so progress shows without
  // closing and reopening it. If that objective is gone — a new deal — the
  // popover has nothing left to show.
  if (openFlagCorner) {
    const objective = byCorner.get(openFlagCorner);
    if (objective) renderObjectiveList(cornerPopoverListEl, [objective]);
    else closeCornerPopover();
  }

  // The runtime notifies on every event, but most events move nothing an
  // objective cares about. Bumping the flag only when this signature
  // changes keeps it meaningful — it fires on real progress, not on every
  // letter placed. An empty previous signature means "first render of this
  // game", which shouldn't pulse.
  const signature = list.map((o) => `${o.current}:${o.status}`).join('|');
  if (signature !== lastObjectiveSignature) {
    if (lastObjectiveSignature !== '') pulseObjectiveFlag(objectiveFlagEl);
    lastObjectiveSignature = signature;
  }
}

// Tapping a corner flag opens that one objective beside it; tapping again
// (or anywhere else) closes it. Like the flag panel it reads only from a
// snapshot, and it renders through the same list renderer, so a corner's
// goal reads identically wherever the player meets it.
function toggleCornerPopover(corner) {
  if (openFlagCorner === corner) {
    closeCornerPopover();
    return;
  }
  const objective = objectives
    .snapshot()
    .objectives.find((o) => o.params?.corner === corner);
  if (!objective) return;
  openFlagCorner = corner;
  renderObjectiveList(cornerPopoverListEl, [objective]);
  showCornerPopover(cornerPopoverEl, corner);
}

function closeCornerPopover() {
  openFlagCorner = null;
  hideCornerPopover(cornerPopoverEl);
}

// ---------- Splash ----------

function showModeStep() {
  pendingModeId = null;
  renderSplashStep(splashModesEl, splashDifficultyEl, 'modes');
}

// The tier buttons carry nothing but their labels. Two things that could
// go on them were tried and dropped: the budget itself reads as a target
// next to the score badge, since the game already means "score" by
// "points"; and the range of deal sizes a tier can produce overlaps so
// heavily between tiers that it discriminated between them by almost
// nothing. See "Not yet built" in CLAUDE.md before adding a third.
function showDifficultyStep(modeId) {
  pendingModeId = modeId;
  renderDifficultyOptions(splashDifficultyOptionsEl, listDifficulties());
  renderSplashStep(splashModesEl, splashDifficultyEl, 'difficulty');
}

function handleModeChosen(modeId) {
  const mode = listGameModes().find((m) => m.id === modeId);
  if (!mode) return;
  if (mode.usesDifficulty) {
    showDifficultyStep(modeId);
    return;
  }
  startGame(createMode(modeId));
}

function handleDifficultyChosen(difficulty) {
  if (!pendingModeId) return;
  startGame(createMode(pendingModeId, difficulty));
}

// Where "New Game" goes: every game begins from the mode choice, which is
// also the only way to switch modes without reloading.
function returnToSplash() {
  hideGameOver(document.body);
  hideObjectivePanel(objectivePanelEl);
  closeCornerPopover();
  showModeStep();
  showSplash(splashEl);
}

// The game is over — all four corners closed, or an objective mode
// declaring it won or lost. Shows the overlay right away with whatever
// bests we already know, then posts this game and re-renders with the bests
// the server computed after storing it — so a new personal or all-time high
// shows up on the same screen that set it. A failed post is silent: the
// overlay just keeps showing the previous (or no) bests.
function endGame() {
  // Covers the objective-mode ending too, where the game is over with
  // corners still open and nothing else would have set this.
  setGameOver(state);
  // The flags hide with the rest of the board furniture; a popover left
  // open would sit over the game-over card saying what it already says.
  closeCornerPopover();
  // Both are idempotent, so a second endGame() call can't double-count.
  // finish() resolves the mode's verdict and returns the final snapshot:
  // enduring objectives that never failed become complete, unfinished
  // targets become failed.
  objectives.emit(GameEvent.GAME_ENDED, { score: state.score });
  const final = objectives.finish();

  // 'won' can only come from an objective mode. An endless game finishes
  // 'active' — it was never a contest — and keeps the neutral heading, so
  // Endless reads exactly as it always has.
  renderVerdict(gameOverLabelEl, final.status === 'won' ? 'You Win!' : 'Game Over');
  // No renderObjectiveState() here: finish() notifies its listeners before
  // returning, so the flag and panel are already showing `final`.
  renderGameOverObjectives(gameOverObjectivesEl, final.objectives);

  renderGameOver(document.body, finalScoreEl, state.score);
  // Score isn't ranked in Objective mode (see "Recording objective
  // results" in CLAUDE.md), and it's not a meaningful summary either — the
  // objective list above already says how the game went, so the row is
  // hidden rather than shown alongside it.
  finalScoreRowEl.hidden = final.mode.id !== 'endless';
  renderBests(final);

  if (gameRecorded) return;
  gameRecorded = true;
  // `final` carries the mode, the verdict, and every objective's tuning and
  // final state — the whole of what a recorded Objective game is for.
  submitGame({ score: state.score, stats: state.stats, result: final }).then((bests) => {
    if (!bests) return;
    cachedBests = bests;
    renderBests(final);
  });
}

// The game is over when the board says so, or when the objective mode
// declares a winner or a loser. With NO_OBJECTIVES the second half is
// always false, leaving today's behavior untouched.
function maybeEndGame() {
  if (state.gameOver || objectives.status !== 'active') endGame();
}

function initRound() {
  markGameStarted(state);
  objectives.emit(GameEvent.GAME_STARTED);
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

  const objectiveMark = objectives.mark();
  const prevChoiceLetter = state.choices[index];
  const prevNextLetter = state.nextLetter;

  appendLetterToCorner(state, targetName, prevChoiceLetter);
  const word = state.corners[targetName];
  const cornerEl = cornerElFor(targetName);
  renderCorner(cornerEl, word, state.blankIndices[targetName]);
  objectives.emit(GameEvent.LETTER_PLACED, {
    corner: targetName,
    letter: prevChoiceLetter,
    word,
    blank: false,
  });

  let closedNow = false;
  if (!hasWordWithPrefix(word)) {
    closeCorner(state, targetName);
    renderClosedCorner(cornerEl);
    objectives.emit(GameEvent.CORNER_CLOSED, { corner: targetName, word });
    closedNow = true;
  }

  advanceChoice(index);

  lastMove = { type: 'choice', index, corner: targetName, closedNow, prevChoiceLetter, prevNextLetter, objectiveMark };
  renderUndoAvailability(undoBtn, true);

  maybeEndGame();
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
function awardBlankIfEligible(cornerName, word, hadBlank) {
  if (hadBlank || word.length < BLANK_AWARD_LENGTH) return;
  setBlankPending(state, true);
  recordBlankEarned(state);
  objectives.emit(GameEvent.BLANK_AWARDED, { corner: cornerName, word });
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

  const objectiveMark = objectives.mark();
  appendBlankLetterToCorner(state, targetName, letter);
  const word = state.corners[targetName];
  const cornerEl = cornerElFor(targetName);
  renderCorner(cornerEl, word, state.blankIndices[targetName]);
  objectives.emit(GameEvent.LETTER_PLACED, { corner: targetName, letter, word, blank: true });

  let closedNow = false;
  if (!hasWordWithPrefix(word)) {
    closeCorner(state, targetName);
    renderClosedCorner(cornerEl);
    objectives.emit(GameEvent.CORNER_CLOSED, { corner: targetName, word });
    closedNow = true;
  }

  setBlankPending(state, false);
  renderBlankState();
  pendingBlankCorner = null;
  hideBlankPicker(blankPickerEl);

  lastMove = { type: 'blank', corner: targetName, closedNow, objectiveMark };
  renderUndoAvailability(undoBtn, true);

  maybeEndGame();
}

function handleUndo() {
  if (!lastMove || state.gameOver) return;

  // Both undo paths reverse exactly one move, so both rewind the objective
  // stream the same way — objectives never need their own undo branch.
  objectives.rewindTo(lastMove.objectiveMark);

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
    objectives.emit(GameEvent.WORD_SCORED, {
      corner: cornerName,
      word,
      length: word.length,
      points,
      usedBlank: hadBlank,
    });
    clearCorner(state, cornerName);
    renderCorner(cornerEl, '');
    lastMove = null;
    // Same checkpoint as clearing lastMove: nothing before this can be
    // undone any more, so the objective runtime can drop its event log.
    objectives.commit();
    renderUndoAvailability(undoBtn, false);
    awardBlankIfEligible(cornerName, word, hadBlank);
    maybeEndGame();
  } else {
    objectives.emit(GameEvent.WORD_REJECTED, {
      corner: cornerName,
      word,
      length: word.length,
      reason: word.length < MIN_WORD_LENGTH ? 'tooShort' : 'notAWord',
    });
    flashInvalid(cornerEl);
  }
}

// Starts a fresh game under `mode` — the single entry point for beginning
// play, whichever splash path got here. objectives.reset(mode) re-runs the
// mode's selectObjectives(), so a pool-backed mode draws a new random set
// every game rather than replaying the one it was built with.
function startGame(mode) {
  state = createGameState();
  lastMove = null;
  pendingBlankCorner = null;
  bankedPreviewLetter = null;
  gameRecorded = false;
  pendingModeId = null;
  // Cleared before reset so the first render of the new set can't be
  // mistaken for progress and pulse the flags.
  lastObjectiveSignature = '';
  lastCornerSignatures = {};
  objectives.reset(mode);
  renderUndoAvailability(undoBtn, false);
  hideGameOver(document.body);
  hideBlankPicker(blankPickerEl);
  hideObjectivePanel(objectivePanelEl);
  closeCornerPopover();
  hideHowToPlay(howToPlayEl);
  renderBlankState();
  renderScore(scoreEl, state.score);
  cornerEls.forEach((cornerEl) => {
    resetCornerVisuals(cornerEl);
    renderCorner(cornerEl, '');
  });
  renderObjectiveState();
  hideSplash(splashEl);
  initRound();
}

async function start() {
  // Anything that isn't the production host — staging, `npm run dev`,
  // a preview URL — says so in the top bar, so a test session can't be
  // mistaken for the real game (or vice versa).
  renderEnvBadge(envBadgeEl, isProduction() ? null : 'Test');

  // The corners' shape badges: fixed for the life of the page, so they're
  // drawn once here rather than re-rendered per turn or per game.
  cornerEls.forEach((cornerEl) => renderCornerSymbol(cornerEl, cornerEl.dataset.corner));

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
  newGameBtn.addEventListener('click', returnToSplash);
  undoBtn.addEventListener('click', handleUndo);

  // One delegated listener per option group, so rebuilding the buttons
  // never leaves stale handlers behind.
  splashModeOptionsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.splash-btn');
    if (btn) handleModeChosen(btn.dataset.mode);
  });
  splashDifficultyOptionsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.splash-btn');
    if (btn) handleDifficultyChosen(btn.dataset.difficulty);
  });
  splashBackBtn.addEventListener('click', showModeStep);

  // The bottom hint bar is the rules button. Dismisses like the objective
  // panel — backdrop or button — since it's informational too.
  hintBarEl.addEventListener('click', () => showHowToPlay(howToPlayEl));
  howToPlayCloseBtn.addEventListener('click', () => hideHowToPlay(howToPlayEl));
  howToPlayEl.addEventListener('click', (e) => {
    if (e.target === howToPlayEl) hideHowToPlay(howToPlayEl);
  });

  // One delegated listener for all four corner flags, since ui.js builds
  // them. The popover closes on any tap inside it — there's nothing in it
  // to interact with, and its backdrop is what keeps that tap off the board.
  cornerFlagsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.corner-flag');
    if (btn) toggleCornerPopover(btn.dataset.corner);
  });
  cornerPopoverEl.addEventListener('click', closeCornerPopover);

  objectiveFlagEl.addEventListener('click', () => showObjectivePanel(objectivePanelEl));
  objectivePanelCloseBtn.addEventListener('click', () => hideObjectivePanel(objectivePanelEl));
  // Backdrop dismiss — informational panel, unlike the blank picker, which
  // deliberately has no way out.
  objectivePanelEl.addEventListener('click', (e) => {
    if (e.target === objectivePanelEl) hideObjectivePanel(objectivePanelEl);
  });
  // Re-render whenever the runtime changes, undo rewinds included.
  objectives.onChange(renderObjectiveState);

  // Only now are the mode buttons drawn: the dictionary is loaded, so the
  // first tap can start a real game rather than one whose word checks throw.
  renderModeOptions(splashModeOptionsEl, listGameModes());
  showModeStep();
  showSplash(splashEl);
}

start();
