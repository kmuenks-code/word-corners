# Word Corners

Mobile-friendly word game. Four corners of the screen are word-building
zones; a letter sits in the center; the player drags it into a corner to
append it to that corner's word.

## Stack
Vanilla HTML/CSS/JS, ES modules, no build step, no dependencies. Open
`index.html` directly or serve statically.

## Files
- `index.html` — markup: 4 `.corner` divs (`id="corner-nw|ne|sw|se"`, `data-corner="nw|ne|sw|se"`, each with just a `.word` span — the corner itself is the tap target, no button element) + `#center-stack` (containing `#score-display` and `#center-row`) + `#game-over` overlay (`#final-score` + `#new-game-btn`). `#center-row` holds, in order: `#undo-btn` (icon button), `#next-letter-preview`/`#next-letter`, `#center`/`#current-letter`, `#hold-section` (`#hold-label` + `#hold-slot`/`#hold-letter`, `data-corner="hold"`), and a `.center-row-spacer` — an empty div that mirrors `#undo-btn`'s grid column on the far right purely so the grid stays symmetric and `#center` stays visually centered.
- `css/style.css` — corners are large, absolutely-positioned boxes pinned to the four true screen corners (`#corner-nw|ne|sw|se` position rules using `env(safe-area-inset-*)`, sized off `--corner-width`/`--corner-height`, independent axes since the viewport is taller than it is wide), filling most of the screen and leaving only a tight band around the center group; `cursor:pointer` signals the whole box is tappable, `.closed` switches it to `not-allowed`. Drag styling + `.invalid` shake animation + `.corner.closed` red shading. `#center-stack` is the absolutely-centered flex column holding `#score-display` directly above `#center-row`. `#center-row` is a 5-column CSS grid (`grid-template-columns: clamp(undo) clamp(next-letter) auto clamp(hold) clamp(spacer)`, matching column widths explicitly rather than `1fr` — an auto-sized grid container doesn't equalize `1fr` tracks by itself) so `#center` stays truly centered: `#undo-btn` and `.center-row-spacer` share the same column width (so the invisible spacer exactly offsets the button), and `#next-letter-preview`/`#hold-section` also share a matching width. `#undo-btn:disabled` is dimmed and un-clickable; since it lives inside `#center-row`, `body.game-over` hiding that row hides the button too, with no separate rule needed. `#center` and `#hold-slot` (the bubbles, not just the letter glyphs inside them) carry `cursor:grab`/`touch-action:none` since they're the drag-start hit targets — see `input.js`. `#hold-slot` is dashed/empty when unoccupied and solid/`.occupied` when holding a letter (an `.empty` `#hold-slot` sets `pointer-events: none` on `#hold-letter` so an empty hold can't be dragged). `body.game-over` hides `#center-row` (score stays visible) and shows the `#game-over` overlay.
- `js/gameState.js` — game data only (`corners`, `closedCorners`, `currentLetter`, `nextLetter`, `holdLetter`, `score`, `gameOver`) + mutators `appendLetterToCorner`, `clearCorner`, `removeLastLetter` (undo's corner-side reversal), `addScore`, `closeCorner` (marks a corner dead, flips `gameOver` once all four are closed), `reopenCorner` (undo's reversal of `closeCorner`), `setHoldLetter`, `clearHoldLetter`, `setCurrentLetter`, `setNextLetter` (undo's reversal of `nextTurn`'s letter draw). No DOM.
- `js/letterSource.js` — `LETTER_FREQUENCIES` (standard Scrabble tile distribution) + `getRandomLetter(frequencies = LETTER_FREQUENCIES)`. Takes an optional frequency table so future difficulty scaling can pass adjusted weights without changing the selection logic.
- `js/wordValidator.js` — `loadWordList()` (async, fetches `data/wordlist.txt` into a `Set`) + `isValidWord(word)` (sync, throws if called before load) + `hasWordWithPrefix(prefix)` (sync, true if any dictionary word starts with `prefix`; used to detect dead corners). Real dictionary, not a stub.
- `js/scoring.js` — `scoreWord(word)`: `n*(n-1)/2`, superlinear by design. Single function, edit here only to change the formula.
- `js/input.js` — `initDrag(dragEl, targetEls, onDrop, hitEl = dragEl)`: Pointer Events drag-and-drop, reports which target via `onDrop(target.dataset.corner)`. `hitEl` is what listens for `pointerdown` (defaults to `dragEl` itself); passing the surrounding bubble (`#center` / `#hold-slot`) instead of the letter glyph makes the whole bubble grabbable, not just the text — `dragEl` is still what visually moves. A `hitEl` with the `.empty` class never starts a drag (guards the empty hold slot). Skips targets with the `.closed` or `.occupied` class as drop points (used respectively for dead corners and an already-full hold slot). No game/DOM-render knowledge beyond drag visuals and those CSS classes. `main.js` calls it twice: once for the current letter (targets = corners + hold slot, hitEl = `#center`) and once for the held letter (targets = corners only, hitEl = `#hold-slot`).
- `js/ui.js` — pure render functions (`renderCorner`, `renderLetter`, `renderScore`, `flashInvalid`, `renderClosedCorner`, `resetCornerVisuals`, `renderGameOver`, `hideGameOver`, `renderHold`, `renderUndoAvailability`). No game logic. `renderLetter` is generic — used for both the current-letter and next-letter elements. `renderHold(holdSlotEl, holdLetterEl, letter)` sets the letter text and toggles `.occupied`/`.empty` on the slot. `renderClosedCorner`/`resetCornerVisuals` only toggle the `.closed`/`.invalid` classes on the corner div itself — there's no separate submit button to enable/disable. `renderUndoAvailability(undoBtn, available)` toggles `undoBtn.disabled`.
- `js/main.js` — wires modules together, owns the turn loop and corner-tap handlers, awaits `loadWordList()` before enabling drag. `nextTurn()` advances `state.nextLetter` into `state.currentLetter` and draws a fresh `nextLetter`. `handleDrop` routes to hold-slot logic when the drop target is `'hold'` (only accepted if hold is empty; consumes the turn like a normal drop) or otherwise appends to a corner and closes it once its word hits 5 letters with no valid completion. `handleHoldDrop` appends the held letter to a corner and clears the hold slot — this does *not* consume a turn, since it's an alternate move independent of the current-letter draw. Each `.corner` has a `click` listener calling `handleSubmit(cornerEl.dataset.corner)` directly — the corner box itself is the submit button. `resetGame` (wired to `#new-game-btn`) rebuilds `state`, clears the hold slot, and re-renders everything for a fresh game. A module-level `lastMove` variable holds a single-level undo record (`{type: 'corner'|'toHold'|'fromHold', ...}`) written by `handleDrop`/`handleHoldDrop` and consumed by `handleUndo` (wired to `#undo-btn`); a successful word submission in `handleSubmit` clears `lastMove` since it's a checkpoint past which undo shouldn't reach. See "Undo" below for the full behavior.
- `data/wordlist.txt` — ENABLE1 word list, uppercase, one word/line, public domain. See `data/WORDLIST_LICENSE.txt` for provenance (chosen over NASPA's NWL2023 because that source has no license — see "Word list decision" below).

## Architecture rule
Keep layers separate: state / input / rendering / validation / scoring are
independent modules that only talk through plain function calls from
`main.js`. Don't let e.g. `input.js` touch `gameState` directly, or
`ui.js` contain game rules.

## Word list decision
NASPA's official NWL2023 (via github.com/scrabblewords/scrabblewords) has
no LICENSE and includes copyrighted Collins/NASPA definitions — not safe
to ship in a published game. Using ENABLE1 instead (public domain,
words-only, close-but-not-identical Scrabble-legal approximation). If
official NWL accuracy matters later, revisit licensing that source
directly rather than scraping the unlicensed repo.

## Current prototype status
Working: drag letter to a corner (grabbable from anywhere in the bubble
around it, not just the glyph), letter appends to that corner's word,
new random letter appears, real word list loads at startup. Tapping
anywhere in a corner submits it: valid word → scored (superlinear
formula) and corner clears; invalid word → corner shakes and stays
as-is (word not cleared, player can keep adding letters or retap).
Score shown just above the current letter. Next-letter preview shown
in a smaller circle to the left of the draggable current letter.

A corner closes (shaded red, drag/tap-submit disabled) once its word is 5+
letters long and no dictionary word starts with it
(`hasWordWithPrefix` in `wordValidator.js`) — rechecked on every letter
added from length 5 onward, since a word that could still become legal
at 5 letters can lose that potential when a 6th letter is added. When
all 4 corners are closed the game ends: `#center-row` (letter, next-letter
preview, and hold section) hides while `#score-display` stays visible, a
centered overlay shows the final score and a "New Game" button that
rebuilds game state and resumes play.

A "Hold" slot sits to the right of the current letter. Dragging the
current letter onto it (only while empty) stores it there instead of a
corner and still advances the turn like a normal drop. Once occupied,
the held letter itself becomes draggable to any open corner; using it
clears the slot but does *not* advance the turn or touch the current/next
letters, since it's a separate move from the main draw. A second letter
can't be dragged into an already-occupied hold slot.

## Undo
A circular ↶ icon button sits in `#center-row`, to the left of the
next-letter preview bubble (its own grid column, independent of
`#score-display`; a matching invisible spacer on the far right of the
row keeps `#center` truly centered — see `css/style.css` notes above).
It reverses the single most recent drop — corner or hold — putting the letter back
in the center as the current letter (and restoring whatever the
next-letter preview showed before that drop). It's a *single-level*
undo, not a full history: making another move, or submitting a word
(valid or not — actually only a valid submit clears it, since an
invalid submit doesn't change any state), overwrites/clears what can be
undone. If the drop had just closed a corner (5+ letters, dead-ended),
undoing it reopens that corner too. The button is disabled (dimmed,
inert) whenever there's nothing to undo, and is hidden entirely on the
game-over screen along with the rest of `#center-row`'s controls —
sidesteps the harder case of undoing a game-ending move, since the
overlay can't be interacted with anyway. `resetGame` clears undo state
along with everything else.

## Not yet built (ask before assuming scope)
- Difficulty scaling (letterSource.js is set up to accept it — see above)
- Any persistent high-score / stats tracking across games
