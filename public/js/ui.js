// All DOM reads/writes live here. Pure rendering functions; no game logic.

import { createCornerSymbol, cornerShapeLabel } from './cornerSymbols.js';

// Draws the corner's shape badge into its `.corner-mark` slot. Called once
// per corner at startup — the badge never changes, so nothing re-renders
// it. Purely an identity marker, so it's aria-hidden: the shape is how the
// objective list names this corner, not information in itself.
export function renderCornerSymbol(cornerEl, corner) {
  const markEl = cornerEl.querySelector('.corner-mark');
  if (!markEl) return;
  markEl.innerHTML = '';
  const symbol = createCornerSymbol(corner);
  if (symbol) markEl.appendChild(symbol);
}

// blankIndices marks which character positions in `word` were placed via
// the blank/wildcard letter — those render in the bubbles' bright teal via
// .blank-letter, matching the bubble they came from.
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

// fillEl fills left-to-right with progress toward the next blank-tile
// threshold (score % interval). A score that lands exactly on a threshold
// has already earned that blank, so it reads as 0% progress toward the
// next one rather than 100% toward the one just paid out.
export function renderScore(scoreEl, score, fillEl, blankScoreInterval) {
  scoreEl.textContent = score;
  if (fillEl) {
    const progress = (score % blankScoreInterval) / blankScoreInterval;
    fillEl.style.width = `${progress * 100}%`;
  }
}

export function flashInvalid(cornerEl) {
  cornerEl.classList.remove('invalid');
  // force reflow so the animation restarts if triggered again quickly
  void cornerEl.offsetWidth;
  cornerEl.classList.add('invalid');
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

// A blank award is about total score, not the word that happened to cross
// the threshold, so its feedback lives next to the score box instead of in
// the corner that submitted — see #blank-toast-anchor in index.html.
export function showBlankEarnedToast(anchorEl) {
  const existing = anchorEl.querySelector('.blank-toast');
  if (existing) existing.remove();

  const toastEl = document.createElement('div');
  toastEl.className = 'blank-toast';
  toastEl.textContent = 'Blank Earned';
  anchorEl.appendChild(toastEl);

  toastEl.addEventListener('animationend', () => toastEl.remove());
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

// Fills one "Your Best" / "All-Time Best" row on the game-over overlay, or
// hides it when there's no number to show — a null score (nothing recorded
// yet, or the request failed) leaves the overlay showing just the final score
// rather than a placeholder dash.
export function renderBestScore(rowEl, valueEl, score) {
  const hasScore = typeof score === 'number';
  rowEl.hidden = !hasScore;
  if (hasScore) valueEl.textContent = score;
}

// Shows the top-bar environment badge with the given label, or hides it
// when the label is empty — production passes nothing and the badge stays
// exactly as the markup left it: hidden and blank. Deciding *which* label
// (or none) belongs to js/env.js; this only draws it.
export function renderEnvBadge(badgeEl, label) {
  badgeEl.textContent = label || '';
  badgeEl.hidden = !label;
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

// The blank slot joins the center row only while the player is holding at
// least one, and takes a ×N badge from the second onward — one bubble
// stands for the whole pile, since they're interchangeable. The `hidden`
// attribute set here is also what collapses the row's fifth grid column,
// via a :has() rule in the stylesheet — nothing else needs telling.
export function renderBlankBubble(slotEl, countEl, count) {
  slotEl.hidden = count === 0;
  countEl.hidden = count < 2;
  countEl.textContent = `×${count}`;
}

/* ---------- Splash ---------- */

// Both option groups are built from the mode/difficulty tables rather than
// written into markup, so adding a mode or a tier shows up on the splash
// with no HTML change. Callers wire one delegated click listener per
// container and read the id off dataset.
export function renderModeOptions(containerEl, modes) {
  containerEl.innerHTML = '';
  modes.forEach((mode) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'splash-btn';
    btn.dataset.mode = mode.id;
    btn.innerHTML = `<span class="splash-btn-name"></span><span class="splash-btn-note"></span>`;
    btn.querySelector('.splash-btn-name').textContent = mode.label;
    btn.querySelector('.splash-btn-note').textContent = mode.blurb;
    containerEl.appendChild(btn);
  });
}

export function renderDifficultyOptions(containerEl, difficulties) {
  containerEl.innerHTML = '';
  difficulties.forEach((difficulty) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'splash-btn difficulty-btn';
    btn.dataset.difficulty = difficulty.id;
    btn.innerHTML = `<span class="splash-btn-name"></span>`;
    btn.querySelector('.splash-btn-name').textContent = difficulty.label;
    containerEl.appendChild(btn);
  });
}

export function showSplash(splashEl) {
  splashEl.hidden = false;
}

export function hideSplash(splashEl) {
  splashEl.hidden = true;
}

// Which of the splash's two steps is showing. 'modes' or 'difficulty'.
export function renderSplashStep(modesEl, difficultyEl, step) {
  modesEl.hidden = step !== 'modes';
  difficultyEl.hidden = step !== 'difficulty';
}

/* ---------- Objectives ---------- */

// The right-edge flag. Hidden outright in a mode with no objectives, so
// Endless looks exactly as it always did.
export function renderObjectiveFlag(flagEl, badgeEl, { visible, done, total }) {
  flagEl.hidden = !visible;
  if (!visible) return;
  badgeEl.textContent = `${done}/${total}`;
  flagEl.classList.toggle('all-complete', total > 0 && done === total);
}

// Briefly re-triggers the flag's bump animation. Called when an objective
// advances, so progress made behind a closed panel still registers.
export function pulseObjectiveFlag(flagEl) {
  if (flagEl.hidden) return;
  flagEl.classList.remove('pulse');
  void flagEl.offsetWidth; // force reflow so the animation restarts
  flagEl.classList.add('pulse');
}

// Renders a snapshot's objective array into a <ul>. Used for both the flag
// panel and the game-over summary, which is why it takes the list element:
// the two differ only in where they sit.
//
// `current` arrives raw from the runtime (a 214-point game against a
// 150-point goal reports 214), so the meter clamps it while the numbers
// print it as-is. An `enduring` objective's goal is a limit rather than a
// target, so it gets no meter — a bar filling up would read as progress
// when it actually means trouble.
// A description may wrap one word in `__..__` to call it out — e.g.
// "Score __only__ 1 6-letter word" — which renders as an underline. Plain
// text otherwise; there's no general markdown support here, just this one
// emphasis marker.
function renderObjectiveDescription(el, text) {
  const match = text.match(/^(.*)__(.+?)__(.*)$/);
  if (!match) {
    el.textContent = text;
    return;
  }
  const [, before, emphasized, after] = match;
  if (before) el.appendChild(document.createTextNode(before));
  const u = document.createElement('u');
  u.textContent = emphasized;
  el.appendChild(u);
  if (after) el.appendChild(document.createTextNode(after));
}

export function renderObjectiveList(listEl, objectives) {
  listEl.innerHTML = '';
  objectives.forEach((objective) => {
    const { status, description, current, goal, enduring } = objective;
    const corner = objective.params?.corner ?? null;
    const item = document.createElement('li');
    item.className = `objective-row ${status}`;

    const mark = document.createElement('span');
    mark.className = 'objective-status';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = status === 'complete' ? '✓' : status === 'failed' ? '✗' : '';

    // Which corner an objective is bound to reads off its resolved params
    // — no objective type has to declare itself "corner-scoped", the param
    // being there is the whole signal. The cell is emitted either way so a
    // corner-free objective ("Score 13 words") leaves a blank gutter and
    // every description still starts at the same x.
    const symbol = document.createElement('span');
    symbol.className = 'objective-symbol';
    const symbolArt = corner
      ? createCornerSymbol(corner, { title: `${cornerShapeLabel(corner)} corner` })
      : null;
    if (symbolArt) symbol.appendChild(symbolArt);

    const body = document.createElement('span');
    body.className = 'objective-body';
    const desc = document.createElement('span');
    desc.className = 'objective-desc';
    renderObjectiveDescription(desc, description);
    body.appendChild(desc);

    if (!enduring) {
      const meter = document.createElement('span');
      meter.className = 'objective-meter';
      const fill = document.createElement('span');
      fill.className = 'objective-meter-fill';
      const pct = goal > 0 ? Math.min(100, (current / goal) * 100) : 0;
      fill.style.width = `${pct}%`;
      meter.appendChild(fill);
      body.appendChild(meter);
    }

    const progress = document.createElement('span');
    progress.className = 'objective-progress';
    progress.textContent = enduring ? `${current}/${goal}` : `${Math.min(current, goal)}/${goal}`;

    item.append(mark, symbol, body, progress);
    listEl.appendChild(item);
  });
}

/* ---------- Per-corner objective flags ---------- */

// Built here rather than written out four times in markup, for the same
// reason the splash's buttons are: one source for the art and the class
// names. Every flag starts hidden — renderCornerObjectiveFlag shows only
// the ones a deal actually bound to a corner. Returns them as a
// corner-keyed Map, since the caller renders each one by name.
const CORNER_FLAG_ICON =
  '<svg class="corner-flag-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M6 21V4"/><path d="M6 4.5h11l-2.6 4 2.6 4H6z" fill="currentColor" stroke="none"/></svg>';

export function buildCornerFlags(containerEl, corners) {
  containerEl.innerHTML = '';
  const flags = new Map();
  corners.forEach((corner) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'corner-flag';
    btn.id = `corner-flag-${corner}`;
    btn.dataset.corner = corner;
    btn.hidden = true;
    // Named by shape, like everywhere else a corner is spoken about.
    btn.setAttribute('aria-label', `${cornerShapeLabel(corner)} corner objective`);
    btn.innerHTML =
      `${CORNER_FLAG_ICON}<span class="corner-flag-mark" aria-hidden="true"></span>` +
      '<span class="corner-flag-badge"></span>';
    containerEl.appendChild(btn);
    flags.set(corner, btn);
  });
  return flags;
}

// One flag's whole state, from the objective bound to that corner — or
// `null`, which hides it (an Endless game, or a corner this deal made no
// demands of). The counter follows the objective list's convention: raw for
// an `enduring` limit, clamped for a target.
export function renderCornerObjectiveFlag(flagEl, objective) {
  flagEl.hidden = !objective;
  if (!objective) return;

  const { status, current, goal, enduring } = objective;
  flagEl.classList.toggle('complete', status === 'complete');
  flagEl.classList.toggle('failed', status === 'failed');
  flagEl.querySelector('.corner-flag-mark').textContent =
    status === 'complete' ? '✓' : status === 'failed' ? '✗' : '';
  flagEl.querySelector('.corner-flag-badge').textContent = enduring
    ? `${current}/${goal}`
    : `${Math.min(current, goal)}/${goal}`;
}

// Same "something actually moved" bump as the right-edge flag's.
export function pulseCornerFlag(flagEl) {
  if (flagEl.hidden) return;
  flagEl.classList.remove('pulse');
  void flagEl.offsetWidth; // force reflow so the animation restarts
  flagEl.classList.add('pulse');
}

// The popover a corner flag opens. `corner` drives which edge the card and
// its pointer sit on, entirely in CSS — nothing here measures the flag.
export function showCornerPopover(popoverEl, corner) {
  popoverEl.dataset.corner = corner;
  popoverEl.hidden = false;
}

export function hideCornerPopover(popoverEl) {
  popoverEl.hidden = true;
}

export function showObjectivePanel(panelEl) {
  panelEl.hidden = false;
}

export function hideObjectivePanel(panelEl) {
  panelEl.hidden = true;
}

// The rules overlay. Its content is static markup (index.html) — there is
// nothing per-game to render into it, so these only toggle visibility.
export function showHowToPlay(overlayEl) {
  overlayEl.hidden = false;
}

export function hideHowToPlay(overlayEl) {
  overlayEl.hidden = true;
}

// The game-over headline. Objective mode resolves to a real verdict; an
// endless game was never a contest, so it keeps the neutral wording.
export function renderVerdict(labelEl, text) {
  labelEl.textContent = text;
}

// The objective summary on the game-over card — same list renderer, hidden
// entirely when there were no objectives to report on.
export function renderGameOverObjectives(listEl, objectives) {
  listEl.hidden = objectives.length === 0;
  if (objectives.length === 0) return;
  renderObjectiveList(listEl, objectives);
}
