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

export function renderBlankBubble(slotEl, pending) {
  slotEl.hidden = !pending;
}

export function setChoicesBlocked(bubbleEls, blocked) {
  bubbleEls.forEach((el) => el.classList.toggle('blocked', blocked));
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

export function showObjectivePanel(panelEl) {
  panelEl.hidden = false;
}

export function hideObjectivePanel(panelEl) {
  panelEl.hidden = true;
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
