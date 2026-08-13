# Word Corners

Mobile-friendly word game. Four corners of the screen are word-building
zones; a letter sits in the center; the player drags it into a corner to
append it to that corner's word.

## Stack
Vanilla HTML/CSS/JS, ES modules, no build step, no dependencies. Open
`index.html` directly or serve statically.

## Files
- `index.html` — markup: 4 `.corner` divs (`id="corner-nw|ne|sw|se"`, `data-corner="nw|ne|sw|se"`, each with `.word` span + `.submit-btn`) + `#score-display` + `#center-row` (containing `#next-letter-preview`/`#next-letter` and `#center`/`#current-letter`) + `#hold-section` (`#hold-label` + `#hold-slot`/`#hold-letter`, `data-corner="hold"`) + `#game-over` overlay (`#final-score` + `#new-game-btn`).
- `css/style.css` — corners are small, absolutely-positioned boxes pinned to the four true screen corners (`#corner-nw|ne|sw|se` position rules, sized off `--corner-size`), leaving open space in the middle for the center letter, hold section, and future controls. Drag styling + `.invalid` shake animation + `.corner.closed` red shading. `#center-row` is the absolutely-centered flex container holding the next-letter preview circle and the draggable current-letter circle side by side. `#hold-section` is pinned to the right-middle edge; `#hold-slot` is dashed/empty when unoccupied and solid/`.occupied` when holding a letter (an `.empty` `#hold-slot` sets `pointer-events: none` on `#hold-letter` so an empty hold can't be dragged). `body.game-over` hides `#center-row` and `#hold-section` and shows the `#game-over` overlay.
- `js/gameState.js` — game data only (`corners`, `closedCorners`, `currentLetter`, `nextLetter`, `holdLetter`, `score`, `gameOver`) + mutators `appendLetterToCorner`, `clearCorner`, `addScore`, `closeCorner` (marks a corner dead, flips `gameOver` once all four are closed), `setHoldLetter`, `clearHoldLetter`. No DOM.
- `js/letterSource.js` — `LETTER_FREQUENCIES` (standard Scrabble tile distribution) + `getRandomLetter(frequencies = LETTER_FREQUENCIES)`. Takes an optional frequency table so future difficulty scaling can pass adjusted weights without changing the selection logic.
- `js/wordValidator.js` — `loadWordList()` (async, fetches `data/wordlist.txt` into a `Set`) + `isValidWord(word)` (sync, throws if called before load) + `hasWordWithPrefix(prefix)` (sync, true if any dictionary word starts with `prefix`; used to detect dead corners). Real dictionary, not a stub.
- `js/scoring.js` — `scoreWord(word)`: `n*(n-1)/2`, superlinear by design. Single function, edit here only to change the formula.
- `js/input.js` — `initDrag(dragEl, targetEls, onDrop)`: Pointer Events drag-and-drop, reports which target via `onDrop(target.dataset.corner)`. Skips targets with the `.closed` or `.occupied` class as drop points (used respectively for dead corners and an already-full hold slot). No game/DOM-render knowledge beyond drag visuals and those CSS classes. `main.js` calls it twice: once for the current letter (targets = corners + hold slot) and once for the held letter (targets = corners only).
- `js/ui.js` — pure render functions (`renderCorner`, `renderLetter`, `renderScore`, `flashInvalid`, `renderClosedCorner`, `resetCornerVisuals`, `renderGameOver`, `hideGameOver`, `renderHold`). No game logic. `renderLetter` is generic — used for both the current-letter and next-letter elements. `renderHold(holdSlotEl, holdLetterEl, letter)` sets the letter text and toggles `.occupied`/`.empty` on the slot.
- `js/main.js` — wires modules together, owns the turn loop and submit-button handlers, awaits `loadWordList()` before enabling drag. `nextTurn()` advances `state.nextLetter` into `state.currentLetter` and draws a fresh `nextLetter`. `handleDrop` routes to hold-slot logic when the drop target is `'hold'` (only accepted if hold is empty; consumes the turn like a normal drop) or otherwise appends to a corner and closes it once its word hits 5 letters with no valid completion. `handleHoldDrop` appends the held letter to a corner and clears the hold slot — this does *not* consume a turn, since it's an alternate move independent of the current-letter draw. `resetGame` (wired to `#new-game-btn`) rebuilds `state`, clears the hold slot, and re-renders everything for a fresh game.
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
Working: drag letter to a corner, letter appends to that corner's word,
new random letter appears, real word list loads at startup. Each corner
has a Submit button: valid word → scored (superlinear formula) and
corner clears; invalid word → corner shakes and stays as-is (word not
cleared, player can keep adding letters or resubmit). Score shown in a
top-center badge. Next-letter preview shown in a smaller circle to the
left of the draggable current letter.

A corner closes (shaded red, drag/submit disabled) once its word is 5+
letters long and no dictionary word starts with it
(`hasWordWithPrefix` in `wordValidator.js`) — rechecked on every letter
added from length 5 onward, since a word that could still become legal
at 5 letters can lose that potential when a 6th letter is added. When
all 4 corners are closed the game ends: `#center-row` and `#hold-section`
hide, a centered overlay shows the final score and a "New Game" button
that rebuilds game state and resumes play.

A "Hold" slot sits to the right of the current letter. Dragging the
current letter onto it (only while empty) stores it there instead of a
corner and still advances the turn like a normal drop. Once occupied,
the held letter itself becomes draggable to any open corner; using it
clears the slot but does *not* advance the turn or touch the current/next
letters, since it's a separate move from the main draw. A second letter
can't be dragged into an already-occupied hold slot.

## Not yet built (ask before assuming scope)
- Difficulty scaling (letterSource.js is set up to accept it — see above)
- Any persistent high-score / stats tracking across games
