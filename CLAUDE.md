# Word Corners

Mobile-friendly word game. Four corners of the screen are word-building
zones; three letters sit in the center as interchangeable choices; the
player drags any one of them into a corner to append it to that corner's
word, and a fresh letter refills that slot.

## Stack
Vanilla HTML/CSS/JS, ES modules, no build step, no dependencies. Open
`index.html` directly or serve statically.

## Files
- `index.html` — markup: `#top-bar` (`#game-title` + `#score-badge` holding `#score-label`/`#score-value`) + 4 `.corner` divs (`id="corner-nw|ne|sw|se"`, `data-corner="nw|ne|sw|se"`, each with just a `.word` span — the corner itself is the tap target, no button element) + `#center-stack` (containing `#center-row`) + `#hint-bar` (inline-SVG bulb + `#hint-text`) + `#game-over` overlay (`#final-score` + `#new-game-btn`). `#center-row` holds, in order: `#undo-btn` (inline-SVG icon button), three `.row-slot.choice-slot` wrappers each containing a `.choice-bubble` (`id="choice-0|1|2"`) with a `.choice-letter` (`id="choice-letter-0|1|2"`) inside, and a `.center-row-spacer` — an empty div that mirrors `#undo-btn`'s grid column on the far right purely so the grid stays symmetric. A separate, hidden (`hidden` attribute) `#legacy-controls` div outside `#center-row` holds `#next-letter-preview`/`#next-letter`, `#center`/`#current-letter`, and `#hold-slot`/`#hold-letter` — the previous single-letter/hold markup, kept only so the idle JS in `main.js` that references those ids doesn't error; not part of the active layout or grid.
- `css/style.css` — the board is a phone-shaped column (`#board`, `width: min(100%, 560px)`, centered) over a teal radial-gradient background lit from the top-center, with faint decorative bubbles painted by `#board::before` (`pointer-events: none`). Vertical space is carved into bands by `:root` custom properties: `--top-band` (title + score badge), `--bottom-band` (hint bar), `--center-band` (the strip the center row lives in), with `--corner-height` a `clamp()` of *whatever is left over, halved* — so the four tiles always fit the viewport instead of colliding with the center row, on any screen height. Corners are absolutely positioned inside `#board` (`#corner-nw|ne|sw|se` rules offsetting from those bands plus `env(safe-area-inset-*)`), sized off `--corner-width`/`--corner-height` on independent axes. Their raised "sticker" look is layered `box-shadow` only (a hard offset edge for thickness, a soft drop shadow, an inset top highlight, an inset bottom shade) rather than a border — `.drop-target` swaps in the mint gradient and lifts with `translateY`, `.closed` swaps in the dusty-rose gradient and flattens the shadow. `cursor:pointer` signals the whole box is tappable, `.closed` switches it to `not-allowed`. `.invalid` shake animation unchanged. The teal bubbles (`.choice-bubble`, `#undo-btn`, `#new-game-btn`) share the same recipe: an off-center `radial-gradient` for the gloss plus that same four-layer shadow stack; `#score-badge` shares a lighter cream version of it. `#center-stack` is absolutely positioned to span *exactly* the gap between the top and bottom tiles (top/bottom offsets built from the same band variables) and flex-centers `#center-row` inside it — deliberately **transform-free**, because a transformed ancestor would become the containing block for the `position: fixed` letter `input.js` drags and throw off its viewport-based coordinates. `#center-row` is a 5-column CSS grid (`grid-template-columns: var(--small-bubble) var(--choice-bubble) var(--choice-bubble) var(--choice-bubble) var(--small-bubble)`, matching column widths explicitly rather than `1fr` — an auto-sized grid container doesn't equalize `1fr` tracks by itself) so the three choice bubbles land in equal-width columns flanked by `#undo-btn` and the matching `.center-row-spacer`. `--small-bubble`/`--choice-bubble`/`--center-row-gap` (all `:root` custom properties, `clamp(...)`/`min()` with viewport-relative middle values) are the single knobs for the whole row's scale — every bubble in the row sizes off one of them, as do the letter glyphs inside them (`font-size: calc(var(--…-bubble) * 0.42)`), so the row shrinks as a unit on narrow phones instead of any one piece overflowing the viewport while the rest don't; their minimums were tuned so the row's total minimum width (5 columns + 4 gaps) fits down to a 320px-wide screen without clipping. `--choice-bubble` is additionally capped by `--center-band` minus a reserve for the halo/shadow, since keying bubble size to viewport *width* alone lets it spill into the tiles on a short, wide viewport. `#undo-btn` and the spacer share `--small-bubble` exactly, one visible circle mirrored by one invisible `.center-row-spacer` circle of the same size. `#undo-btn:disabled` is dimmed and un-clickable; since it lives inside `#center-row`, `body.game-over` hiding that row hides the button too, with no separate rule needed. `.choice-bubble` carries `cursor:grab`/`touch-action:none` since it's the drag-start hit target for each choice — see `input.js`. A letter in flight (`.dragging`) flips to dark teal with a cream halo, since it crosses both the teal board and the cream tiles and has to stay legible over either — applies to `.choice-letter.dragging` (active) and `#current-letter.dragging`/`#hold-letter.dragging` (idle, see below). `body.game-over` hides `#center-row` and `#hint-bar` (the top bar, and so the score, stays visible) and shows the `#game-over` overlay. Rules for `#center`, `#next-letter-preview`, `#hold-slot`, and `.pill-label` are still present but idle — they style the hidden `#legacy-controls` markup and aren't reachable in the active layout.
- `js/gameState.js` — game data only: `corners`, `closedCorners`, `choices` (array of 3 letters, the active turn state), `score`, `gameOver`, plus idle `currentLetter`/`nextLetter`/`holdLetter` (unused by the active flow, kept for the single-letter/hold system — see `js/main.js`). Mutators: `appendLetterToCorner`, `clearCorner`, `removeLastLetter` (undo's corner-side reversal), `addScore`, `closeCorner` (marks a corner dead, flips `gameOver` once all four are closed), `reopenCorner` (undo's reversal of `closeCorner`), `setChoiceLetter(state, index, letter)` (writes one of the three active choice slots). `setHoldLetter`, `clearHoldLetter`, `setCurrentLetter`, `setNextLetter` remain but are only called from the idle code in `main.js`. No DOM.
- `js/letterSource.js` — draws letters in two stages: first vowel-vs-consonant, then a specific letter within that category. `LETTER_FREQUENCIES` (standard Scrabble tile distribution) is split by `isVowel(letter)` into `VOWEL_FREQUENCIES`/`CONSONANT_FREQUENCIES`, the per-letter weights used for the second stage. `CATEGORY_WEIGHTS` (`{ vowel: 42, consonant: 56 }` by default, the two categories' combined tile weights) drives the first stage — edit these two numbers to rebalance how often vowels vs. consonants come up, independent of individual letter rarity (which is tuned via `LETTER_FREQUENCIES` instead). `MAX_SAME_CATEGORY_AMONG_CHOICES` (default `2`) is the no-3-of-a-kind rule's threshold: `getRandomLetter(otherLetters = [])` counts vowels/consonants in `otherLetters` and forces the opposite category once one category already has this many, overriding the normal `CATEGORY_WEIGHTS` roll. `otherLetters` is meant to be the player's other current choice-slot letters (excluding the slot being redrawn) — passing `[]` (the default) draws with no category constraint. All three constants are plain exported values, meant to be the tuning knobs for future difficulty/balance changes.
- `js/wordValidator.js` — `loadWordList()` (async, fetches `data/wordlist.txt` into a `Set`) + `isValidWord(word)` (sync, throws if called before load) + `hasWordWithPrefix(prefix)` (sync, true if any dictionary word starts with `prefix`; used to detect dead corners). Real dictionary, not a stub.
- `js/scoring.js` — `scoreWord(word)`: `n*(n-1)/2`, superlinear by design. Single function, edit here only to change the formula.
- `js/input.js` — `initDrag(dragEl, targetEls, onDrop, hitEl = dragEl)`: Pointer Events drag-and-drop, reports which target via `onDrop(target.dataset.corner)`. `hitEl` is what listens for `pointerdown` (defaults to `dragEl` itself); passing the surrounding bubble (`.choice-bubble`) instead of the letter glyph makes the whole bubble grabbable, not just the text — `dragEl` is still what visually moves. A `hitEl` with the `.empty` class never starts a drag (idle guard, relevant only to the legacy hold slot). Skips targets with the `.closed` or `.occupied` class as drop points. No game/DOM-render knowledge beyond drag visuals and those CSS classes. `main.js` calls it once per choice bubble (three times total), each with targets = the four corners and its own `hitEl`/`dragEl` pair, wrapping `onDrop` in a closure that passes that bubble's index through to `handleDrop`.
- `js/ui.js` — pure render functions (`renderCorner`, `renderLetter`, `renderScore`, `flashInvalid`, `renderClosedCorner`, `resetCornerVisuals`, `renderGameOver`, `hideGameOver`, `renderHold`, `renderUndoAvailability`). No game logic. `renderLetter` is generic — used for all three choice-letter elements (and, in the idle code, the legacy current/next-letter elements). `renderHold(holdSlotEl, holdLetterEl, letter)` sets the letter text and toggles `.occupied`/`.empty` on the slot — only called from idle code now. `renderClosedCorner`/`resetCornerVisuals` only toggle the `.closed`/`.invalid` classes on the corner div itself — there's no separate submit button to enable/disable. `renderUndoAvailability(undoBtn, available)` toggles `undoBtn.disabled`.
- `js/main.js` — wires modules together, owns the turn loop and corner-tap handlers, awaits `loadWordList()` before enabling drag. `drawChoice(index)` draws one fresh random letter into `state.choices[index]` and re-renders that bubble, passing `getRandomLetter` the *other* two choice slots' current letters (`state.choices` filtered to exclude `index` and any still-`null` slot) so the vowel/consonant no-3-of-a-kind rule in `letterSource.js` can see them; `initChoices()` calls it for all three slots in order at game start and on reset — filling slot 2 last means it's the one that can end up category-forced by the two already-filled slots. `handleDrop(index, targetName)` appends `state.choices[index]` to the target corner, closes the corner once its word hits 5 letters with no valid completion, then calls `drawChoice(index)` to refill that slot — refilling, not advancing a shared "next letter" queue, is the core change from the previous single-letter system. Each `.corner` has a `click` listener calling `handleSubmit(cornerEl.dataset.corner)` directly — the corner box itself is the submit button. `resetGame` (wired to `#new-game-btn`) rebuilds `state` and re-renders everything, including a fresh `initChoices()`, for a new game. A module-level `lastMove` variable holds a single-level undo record (`{index, corner, closedNow, prevChoiceLetter}`) written by `handleDrop` and consumed by `handleUndo` (wired to `#undo-btn`), which removes the last letter from the corner, reopens it if the drop had closed it, and restores `state.choices[index]` to the letter that was dropped (discarding the letter `drawChoice` drew to refill it); a successful word submission in `handleSubmit` clears `lastMove` since it's a checkpoint past which undo shouldn't reach. See "Undo" below for the full behavior. Below `start()`, a block of `legacy*`-prefixed functions (`legacyNextTurn`, `legacyHandleHoldDrop`, `legacyHandleDropToHold`) reproduces the previous single-letter + hold turn loop; they are never called and depend on the hidden `#legacy-controls` elements — kept only in case that flow (or a hold mechanic layered onto the three-choice board) is revisited.
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
Working: three interchangeable letter choices sit in the center row, each
grabbable from anywhere in its bubble (not just the glyph); dragging any
one of them to a corner appends it to that corner's word and refills just
that slot with a new random letter — the other two choices are untouched.
The draw (`getRandomLetter` in `letterSource.js`) first rolls vowel vs.
consonant, then a specific letter within that category, and never lets a
third same-category letter appear among the three choice slots at once
(see the `letterSource.js` entry above for the tuning knobs). Real word
list loads at startup. Tapping anywhere in a corner submits it: valid
word → scored (superlinear formula) and
corner clears; invalid word → corner shakes and stays as-is (word not
cleared, player can keep adding letters or retap). Score shown in a badge
in the top-right, opposite the "Word Corners" title. A hint bar pinned
along the bottom restates the two core actions.

A corner closes (shaded dusty rose, drag/tap-submit disabled) once its word is 5+
letters long and no dictionary word starts with it
(`hasWordWithPrefix` in `wordValidator.js`) — rechecked on every letter
added from length 5 onward, since a word that could still become legal
at 5 letters can lose that potential when a 6th letter is added. When
all 4 corners are closed the game ends: `#center-row` (undo + the three
letter choices) and `#hint-bar` hide while `#top-bar` — and so the score
badge — stays visible, a centered overlay shows the final score and a
"New Game" button that rebuilds game state and resumes play.

The previous single-letter + next-letter-preview + "Hold" slot system
(drag the one live letter to a corner or to Hold, next letter advances
in) has been replaced by the three-choice system above. Its state fields,
render functions, and turn-loop logic are still in the codebase but idle
— see the `js/gameState.js`, `js/ui.js`, and `js/main.js` entries above —
in case it's revisited, or the hold mechanic is layered onto the
three-choice board instead.

## Undo
A circular undo-arrow icon button (inline SVG) sits in `#center-row`, to
the left of the three choice bubbles (its own grid column; a matching
invisible spacer on the far right of the row keeps the row visually
balanced — see `css/style.css` notes above), sized via the shared
`--small-bubble` custom property. It reverses the single most recent
drop, putting the dropped letter back into the choice slot it came from
(discarding whatever new letter had been drawn to refill that slot). It's
a *single-level* undo, not a full history: making another move, or
submitting a word (valid or not — actually only a valid submit clears it,
since an invalid submit doesn't change any state), overwrites/clears what
can be undone. If the drop had just closed a corner (5+ letters,
dead-ended), undoing it reopens that corner too. The button is disabled
(dimmed, inert) whenever there's nothing to undo, and is hidden entirely
on the game-over screen along with the rest of `#center-row`'s controls —
sidesteps the harder case of undoing a game-ending move, since the
overlay can't be interacted with anyway. `resetGame` clears undo state
along with everything else.

## Not yet built (ask before assuming scope)
- Difficulty scaling (letterSource.js is set up to accept it — see above)
- Any persistent high-score / stats tracking across games
