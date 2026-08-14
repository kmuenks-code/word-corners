# Word Corners

Mobile-friendly word game. Four corners of the screen are word-building
zones; two letters sit in the center as interchangeable choices, with a
smaller "next letter" preview bubble beside them; the player drags either
choice into a corner to append it to that corner's word, that slot is
refilled with the previewed letter, and a fresh letter is drawn into the
preview. Submitting a valid word of 5+ letters awards a wildcard "blank"
letter (star icon) that must be used immediately — see "Blank letter"
below.

## Stack
Vanilla HTML/CSS/JS, ES modules, no build step, no dependencies. Open
`index.html` directly or serve statically.

## Files
- `index.html` — markup: `#top-bar` (`#game-title` + `#score-badge` holding `#score-label`/`#score-value`) + 4 `.corner` divs (`id="corner-nw|ne|sw|se"`, `data-corner="nw|ne|sw|se"`, each with just a `.word` span — the corner itself is the tap target, no button element) + `#center-stack` (containing `#center-row`) + `#hint-bar` (inline-SVG bulb + `#hint-text`) + `#game-over` overlay (`#final-score` + `#new-game-btn`) + `#blank-picker` overlay (see below). `#center-row` holds, in order: `#undo-btn` (inline-SVG icon button, its own `.row-slot`), a `.row-slot` holding `#preview-bubble`/`#preview-letter` (the upcoming-letter preview, cream/corner-colored, not grabbable — labeled "Next"), two `.row-slot.choice-slot` wrappers each containing a `.choice-bubble` (`id="choice-0|1"`) with a `.choice-letter` (`id="choice-letter-0|1"`) inside, and a `.row-slot` with `id="blank-slot"` (`hidden` attribute by default) holding the star-icon `.choice-bubble#blank-bubble` plus a "Blank" `.row-label` — this slot occupies the same grid column the two-choice system's plain `.center-row-spacer` filler used to (that spacer element is gone; `#blank-slot`, toggled via its `hidden` attribute in `main.js`, both fills that role when inactive and becomes real content once a blank is pending — see "Blank letter" below). A separate, hidden (`hidden` attribute) `#legacy-controls` div outside `#center-row` holds `#next-letter-preview`/`#next-letter`, `#center`/`#current-letter`, and `#hold-slot`/`#hold-letter` — the previous single-letter/hold markup, kept only so the idle JS in `main.js` that references those ids doesn't error; not part of the active layout or grid. (These idle ids are unrelated to the active `#preview-bubble`/`#preview-letter` pair, which are new elements added for the two-choice-plus-preview system.) `#blank-picker` (`hidden` by default, sibling of `#game-over` inside `#board`) is the forced letter-choice overlay: a centered `#blank-picker-card` with a title and `#blank-picker-grid`, which `main.js` populates at startup with 26 `.blank-picker-btn` buttons (`renderBlankPickerOptions` in `js/ui.js`) rather than hand-writing them in markup.
- `css/style.css` — the board is a phone-shaped column (`#board`, `width: min(100%, 560px)`, centered) over a teal radial-gradient background lit from the top-center, with faint decorative bubbles painted by `#board::before` (`pointer-events: none`). Vertical space is carved into bands by `:root` custom properties: `--top-band` (title + score badge), `--bottom-band` (hint bar), `--center-band` (the strip the center row lives in), with `--corner-height` a `clamp()` of *whatever is left over, halved* — so the four tiles always fit the viewport instead of colliding with the center row, on any screen height. Corners are absolutely positioned inside `#board` (`#corner-nw|ne|sw|se` rules offsetting from those bands plus `env(safe-area-inset-*)`), sized off `--corner-width`/`--corner-height` on independent axes. Their raised "sticker" look is layered `box-shadow` only (a hard offset edge for thickness, a soft drop shadow, an inset top highlight, an inset bottom shade) rather than a border — `.drop-target` swaps in the mint gradient and lifts with `translateY`, `.closed` swaps in the dusty-rose gradient and flattens the shadow. `cursor:pointer` signals the whole box is tappable, `.closed` switches it to `not-allowed`. `.invalid` shake animation unchanged. The teal bubbles (`.choice-bubble`, `#undo-btn`, `#new-game-btn`) share the same recipe: an off-center `radial-gradient` for the gloss plus that same four-layer shadow stack; `#score-badge` shares a lighter cream version of it. `#center-stack` is absolutely positioned to span *exactly* the gap between the top and bottom tiles (top/bottom offsets built from the same band variables) and flex-centers `#center-row` inside it — deliberately **transform-free**, because a transformed ancestor would become the containing block for the `position: fixed` letter `input.js` drags and throw off its viewport-based coordinates. `#center-row` is a 5-column CSS grid (`grid-template-columns: var(--small-bubble) var(--small-bubble) var(--choice-bubble) var(--choice-bubble) var(--small-bubble)`, matching column widths explicitly rather than `1fr` — an auto-sized grid container doesn't equalize `1fr` tracks by itself) so `#undo-btn`, `#preview-bubble`, the two choice bubbles, and the spacer land in that order, with the two choice bubbles in equal-width columns. `--small-bubble`/`--choice-bubble`/`--center-row-gap` (all `:root` custom properties, `clamp(...)`/`min()` with viewport-relative middle values) are the single knobs for the whole row's scale — every bubble in the row sizes off one of them, as do the letter glyphs inside them (`font-size: calc(var(--…-bubble) * 0.42)`), so the row shrinks as a unit on narrow phones instead of any one piece overflowing the viewport while the rest don't; their minimums were tuned so the row's total minimum width (5 columns + 4 gaps) fits down to a 320px-wide screen without clipping. `--choice-bubble` is additionally capped by `--center-band` minus a reserve for the halo/shadow, since keying bubble size to viewport *width* alone lets it spill into the tiles on a short, wide viewport. `#undo-btn`, `#preview-bubble`, and the spacer all share `--small-bubble` exactly. `#undo-btn:disabled` is dimmed and un-clickable; since it lives inside `#center-row`, `body.game-over` hiding that row hides the button too, with no separate rule needed. `#preview-bubble`/`#preview-letter` are styled cream/corner-colored (same gradient recipe as `.corner`, via the same idle `#next-letter-preview` look) rather than teal, signaling it isn't grabbable the way the two choice bubbles are. `.choice-bubble` carries `cursor:grab`/`touch-action:none` since it's the drag-start hit target for each choice — see `input.js`. A letter in flight (`.dragging`) flips to dark teal with a cream halo, since it crosses both the teal board and the cream tiles and has to stay legible over either — applies to `.choice-letter.dragging` (active) and `#current-letter.dragging`/`#hold-letter.dragging` (idle, see below). `body.game-over` hides `#center-row` and `#hint-bar` (the top bar, and so the score, stays visible) and shows the `#game-over` overlay. Rules for `#center`, `#next-letter-preview` (the idle one inside `#legacy-controls`), `#hold-slot`, and `.pill-label` are still present but idle — they style the hidden `#legacy-controls` markup and aren't reachable in the active layout. Two `[hidden]` overrides matter here and are easy to lose: `.row-slot[hidden] { display: none; }` and `#blank-picker[hidden] { display: none; }` — both elements also carry an unconditional `display: flex` rule (`.row-slot`, `#blank-picker`) for when they're visible, and since an author stylesheet's declaration beats the UA stylesheet's `[hidden] { display: none }` at equal or lower specificity, that `display: flex` would otherwise win and keep the element visible even with the `hidden` attribute set — the `[hidden]` override rules exist specifically to re-assert the hide. `.choice-bubble.blocked` (the two normal choice bubbles while a blank is pending) swaps in a muted gray gradient, `cursor: not-allowed`, and `pointer-events: none` in place of the usual teal — signals they're temporarily unusable without changing the letters printed on them (see "Blank letter" below). `.blank-bubble` reuses `.choice-bubble`'s size/shape but an amber/gold radial-gradient (via `--accent`) instead of teal, and is sized off `--small-bubble` (matching `#undo-btn`/`#preview-bubble`) since it lives in that same grid column, not `--choice-bubble` — critically, it also has its **own** `box-shadow`, copied from `#undo-btn`'s (scaled for `--small-bubble`) rather than inherited from `.choice-bubble` (scaled for the much larger `--choice-bubble`, ~26px blur vs. ~16px). Leaving that bigger shadow un-overridden was a real bug: on the smaller bubble it blurred past its own edge and visually bled into the neighboring choice bubble even though the actual grid gap was already identical to the gap between the two choice bubbles — worth remembering if any other small bubble ever borrows `.choice-bubble` styling again. `#blank-picker` is a full-board `position: absolute; inset: 0` backdrop (`rgba(12, 58, 68, 0.45)`, `z-index: 50` — above `#game-over`'s 30) with no dismiss affordance, centering `#blank-picker-card` (same card recipe as `#game-over`) containing a 6-column `#blank-picker-grid` of `.blank-picker-btn` circles styled like a smaller `#undo-btn`/`.choice-bubble`. `.word-feedback` (the length/points popup on a corner, see `js/ui.js` below) is entirely `color: var(--accent)` already, so the optional third `.word-feedback-blank` line ("Blank Tile Earned") can't stand out through color alone — it's styled as a small gold pill using `.blank-bubble`'s own gradient, uppercase cream text, so it reads as a distinct bonus line rather than a third line of the same accent-colored text.
- `js/gameState.js` — game data only: `corners`, `closedCorners`, `choices` (array of 2 letters, the active turn state), `nextLetter` (the upcoming letter shown in the preview bubble — actively used, not idle), `blankPending` (true from the moment a 5+ letter valid word is submitted until the awarded blank is placed and given a letter — see `js/main.js`), `score`, `gameOver`, plus idle `currentLetter`/`holdLetter` (unused by the active flow, kept for the single-letter/hold system — see `js/main.js`). Mutators: `appendLetterToCorner`, `clearCorner`, `removeLastLetter` (undo's corner-side reversal), `addScore`, `closeCorner` (marks a corner dead, flips `gameOver` once all four are closed), `reopenCorner` (undo's reversal of `closeCorner`), `setChoiceLetter(state, index, letter)` (writes one of the two active choice slots), `setNextLetter(state, letter)` (writes the preview letter — used by both the active flow and, still, the idle legacy code; see the caution in `js/main.js`'s legacy comment block), `setBlankPending(state, pending)` (writes `blankPending`; the blank itself doesn't have a stored letter — the player's picker choice is appended straight to the corner, see `js/main.js`). `setHoldLetter`, `clearHoldLetter`, `setCurrentLetter` remain but are only called from the idle code in `main.js`. No DOM.
- `js/letterSource.js` — draws letters in two stages: first vowel-vs-consonant, then a specific letter within that category. `LETTER_FREQUENCIES` (standard Scrabble tile distribution) is split by `isVowel(letter)` into `VOWEL_FREQUENCIES`/`CONSONANT_FREQUENCIES`, the per-letter weights used for the second stage. `CATEGORY_WEIGHTS` (`{ vowel: 42, consonant: 56 }` by default, the two categories' combined tile weights) drives the first stage — edit these two numbers to rebalance how often vowels vs. consonants come up, independent of individual letter rarity (which is tuned via `LETTER_FREQUENCIES` instead). `MAX_SAME_CATEGORY_AMONG_CHOICES` (default `2`) is the no-3-of-a-kind rule's threshold: `getRandomLetter(otherLetters = [])` counts vowels/consonants in `otherLetters` and forces the opposite category once one category already has this many, overriding the normal `CATEGORY_WEIGHTS` roll. `otherLetters` is meant to be the other letters currently visible among the two choice slots + the preview (excluding whichever one is being redrawn) — passing `[]` (the default) draws with no category constraint. This same mechanism is what lets the two choice slots freely match each other's category (only 1 other letter is ever known when drawing a choice slot, below the threshold of 2) while still forcing the preview to differ once both choices already share a category — see `js/main.js` for how the three draws are sequenced to produce that asymmetry. All three constants are plain exported values, meant to be the tuning knobs for future difficulty/balance changes.
- `js/wordValidator.js` — `loadWordList()` (async, fetches `data/wordlist.txt` into a `Set`) + `isValidWord(word)` (sync, throws if called before load) + `hasWordWithPrefix(prefix)` (sync, true if any dictionary word starts with `prefix`; used to detect dead corners). Real dictionary, not a stub.
- `js/scoring.js` — `scoreWord(word)`: `n*(n-1)/2`, superlinear by design. Single function, edit here only to change the formula.
- `js/input.js` — `initDrag(dragEl, targetEls, onDrop, hitEl = dragEl)`: Pointer Events drag-and-drop, reports which target via `onDrop(target.dataset.corner)`. `hitEl` is what listens for `pointerdown` (defaults to `dragEl` itself); passing the surrounding bubble (`.choice-bubble`) instead of the letter glyph makes the whole bubble grabbable, not just the text — `dragEl` is still what visually moves. A `hitEl` with the `.empty` class (idle guard, relevant only to the legacy hold slot) or the `.blocked` class (a choice bubble frozen out while a blank is pending, see `js/main.js`) never starts a drag. Skips targets with the `.closed` or `.occupied` class as drop points. No game/DOM-render knowledge beyond drag visuals and those CSS classes. `main.js` calls it once per choice bubble (two times total), once more for `#blank-bubble` (the preview bubble is never draggable, blank or otherwise), each with targets = the four corners and its own `hitEl`/`dragEl` pair, wrapping `onDrop` in a closure that passes that bubble's index (or, for the blank, nothing — see below) through to the relevant handler.
- `js/ui.js` — pure render functions (`renderCorner`, `renderLetter`, `renderScore`, `flashInvalid`, `renderClosedCorner`, `resetCornerVisuals`, `renderGameOver`, `hideGameOver`, `renderHold`, `renderUndoAvailability`, `renderBlankPickerOptions`, `showBlankPicker`, `hideBlankPicker`, `renderBlankBubble`, `setChoicesBlocked`). No game logic. `renderLetter` is generic — used for both choice-letter elements, the preview-letter element, and (in the idle code) the legacy current/next-letter elements. `renderHold(holdSlotEl, holdLetterEl, letter)` sets the letter text and toggles `.occupied`/`.empty` on the slot — only called from idle code now. `renderClosedCorner`/`resetCornerVisuals` only toggle the `.closed`/`.invalid` classes on the corner div itself — there's no separate submit button to enable/disable. `renderUndoAvailability(undoBtn, available)` toggles `undoBtn.disabled`. `showWordFeedback(cornerEl, wordLength, points, blankAwarded = false)` takes an optional fourth argument; when true it adds a third `.word-feedback-blank` ("Blank Tile Earned") span alongside the length/points ones — `main.js` passes `word.length >= BLANK_AWARD_LENGTH` for it, so the message and the actual blank award (`awardBlankIfEligible`, called separately right after) always agree on the same threshold. `renderBlankPickerOptions(gridEl)` builds the 26 `.blank-picker-btn` letter buttons into `#blank-picker-grid` once at startup (`main.js` then attaches a single delegated click listener, rather than one per letter). `showBlankPicker`/`hideBlankPicker` toggle the `hidden` attribute on `#blank-picker`. `renderBlankBubble(slotEl, pending)` toggles `hidden` on `#blank-slot`. `setChoicesBlocked(bubbleEls, blocked)` toggles the `.blocked` class on the two `.choice-bubble` elements.
- `js/main.js` — wires modules together, owns the turn loop and corner-tap handlers, awaits `loadWordList()` before enabling drag. `drawNextLetter()` draws one fresh letter into `state.nextLetter` (the preview) and re-renders `#preview-letter`, passing `getRandomLetter` both current choice slots' letters (`state.choices.filter(Boolean)`) so the vowel/consonant no-3-of-a-kind rule in `letterSource.js` can see them. `advanceChoice(index)` is the refill step: it moves the current `state.nextLetter` into `state.choices[index]`, re-renders that bubble, then calls `drawNextLetter()` to draw a new preview — this "queue advances" behavior (both choice slots pulling from one shared upcoming-letter preview) is the core mechanic, replacing the old three-choice system's independent per-slot redraw. `initRound()` draws both choice slots fresh (unconstrained for slot 0, constrained against slot 0 for slot 1 — so the two choices are free to share a category) and then calls `drawNextLetter()` once, so the preview is the one draw constrained against both choices. `handleDrop(index, targetName)` (guarded by `state.blankPending` — a normal choice can't be dropped while a blank is pending, on top of the `.blocked` class already stopping the drag from starting) appends `state.choices[index]` to the target corner, closes the corner once its word hits 5 letters with no valid completion, then calls `advanceChoice(index)`, and records `lastMove = { type: 'choice', ... }` for undo. Each `.corner` has a `click` listener calling `handleSubmit(cornerEl.dataset.corner)` directly — the corner box itself is the submit button; `handleSubmit` is also a no-op while `state.blankPending` is true, since word submission is disabled until the blank is placed. On a valid submit, `handleSubmit` calls `awardBlankIfEligible(word)`, which sets `blankPending` once `word.length >= BLANK_AWARD_LENGTH` (`5`, the one tuning knob for this feature) and re-renders the blank bubble/blocked choices via `renderBlankState()`. `handleBlankDrop(targetName)` (the `onDrop` for `#blank-bubble`'s `initDrag`) just records `targetName` in the module-level `pendingBlankCorner` and opens `#blank-picker` — it doesn't touch game state yet, since the letter isn't chosen. `handleBlankLetterChosen(letter)` (wired to a single delegated click listener on `#blank-picker-grid`) is what actually appends `letter` to `pendingBlankCorner`'s word, runs the same 5+-letter dead-end closing check as `handleDrop`, clears `blankPending`, hides the picker, and records `lastMove = { type: 'blank', corner, closedNow }` — there's no `letter` needed in that record since undoing a blank placement never restores a specific letter into a slot, it just re-arms `blankPending` (see "Undo" below). `resetGame` (wired to `#new-game-btn`) rebuilds `state` and re-renders everything, including a fresh `initRound()`, for a new game — also hides the blank picker/bubble and clears `pendingBlankCorner`. A module-level `lastMove` variable holds a single-level undo record, tagged by `type` (`'choice'`: `{index, corner, closedNow, prevChoiceLetter, prevNextLetter}`, or `'blank'`: `{corner, closedNow}`) written by `handleDrop`/`handleBlankLetterChosen` and consumed by `handleUndo` (wired to `#undo-btn`), which branches on `lastMove.type`. See "Undo" below for the full behavior. Below `start()`, a block of `legacy*`-prefixed functions (`legacyNextTurn`, `legacyHandleHoldDrop`, `legacyHandleDropToHold`) reproduces the previous single-letter + hold turn loop; they are never called and depend on the hidden `#legacy-controls` elements — kept only in case that flow (or a hold mechanic layered onto the two-choice-plus-preview board) is revisited. That legacy code reads/writes `state.nextLetter` directly, the same field the active preview logic uses — harmless only because it's never called; if the legacy flow is ever revisited it would need its own field or explicit handoff logic.
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
Working: two interchangeable letter choices sit in the center row, each
grabbable from anywhere in its bubble (not just the glyph), with a
smaller, cream/corner-colored "Next" preview bubble to their left showing
the upcoming letter. Dragging either choice to a corner appends it to
that corner's word; that slot is then refilled with the letter that was
in the preview, and a fresh letter is drawn into the preview — both
choice slots pull from this one shared upcoming-letter queue, so using
either slot advances the same preview. The draw (`getRandomLetter` in
`letterSource.js`) first rolls vowel vs. consonant, then a specific
letter within that category, and never lets a third same-category letter
appear among the two choice slots + the preview at once — but the two
choice slots are free to match each other's category (e.g. both vowels),
since the rule only kicks in for the preview once both choices already
share one (see the `letterSource.js` and `js/main.js` entries above for
how the draws are sequenced to produce that asymmetry, and for the
tuning knobs). Real word list loads at startup. Tapping anywhere in a
corner submits it: valid word → scored (superlinear formula) and corner
clears; invalid word → corner shakes and stays as-is (word not cleared,
player can keep adding letters or retap). Score shown in a badge in the
top-right, opposite the "Word Corners" title. A hint bar pinned along the
bottom restates the two core actions.

A corner closes (shaded dusty rose, drag/tap-submit disabled) once its word is 5+
letters long and no dictionary word starts with it
(`hasWordWithPrefix` in `wordValidator.js`) — rechecked on every letter
added from length 5 onward, since a word that could still become legal
at 5 letters can lose that potential when a 6th letter is added. When
all 4 corners are closed the game ends: `#center-row` (undo, the preview,
and the two letter choices) and `#hint-bar` hide while `#top-bar` — and
so the score badge — stays visible, a centered overlay shows the final
score and a "New Game" button that rebuilds game state and resumes play.

The previous single-letter + next-letter-preview + "Hold" slot system
(drag the one live letter to a corner or to Hold, next letter advances
in) — and the three-interchangeable-choices system that replaced it in
turn — have both been superseded by the two-choice-plus-preview system
above. The single-letter/hold system's state fields, render functions,
and turn-loop logic are still in the codebase but idle — see the
`js/gameState.js`, `js/ui.js`, and `js/main.js` entries above — in case
it's revisited, or the hold mechanic is layered onto the current board
instead.

## Undo
A circular undo-arrow icon button (inline SVG) sits in `#center-row`, to
the left of the preview bubble and the two choice bubbles (its own grid
column; a matching invisible spacer on the far right of the row keeps the
row visually balanced — see `css/style.css` notes above), sized via the
shared `--small-bubble` custom property. It reverses the single most
recent drop: it puts the dropped letter back into the choice slot it came
from, and puts the preview letter back to what it was *before* that
drop's advance (discarding whatever new letter had been drawn into the
preview as a result of the advance). It's a *single-level* undo, not a
full history: making another move, or submitting a word (valid or not —
actually only a valid submit clears it, since an invalid submit doesn't
change any state), overwrites/clears what can be undone. If the drop had
just closed a corner (5+ letters, dead-ended), undoing it reopens that
corner too. The button is disabled (dimmed, inert) whenever there's
nothing to undo, and is hidden entirely on the game-over screen along
with the rest of `#center-row`'s controls — sidesteps the harder case of
undoing a game-ending move, since the overlay can't be interacted with
anyway. `resetGame` clears undo state along with everything else.

Undoing a blank-letter placement (see "Blank letter" below) works the
same way but through a separate code path in `handleUndo`, keyed off
`lastMove.type === 'blank'`: it removes the last letter from the corner
the blank was dropped on (reopening the corner if that placement had
closed it, exactly like the normal-drop case), then re-arms
`state.blankPending` instead of restoring a choice-slot letter — there's
nothing to put back into a choice bubble, since the blank bubble and the
two normal choices are entirely separate. This is what makes undo
respect the "must use the blank immediately" rule: since `blankPending`
comes back `true`, the two normal choices are re-blocked and word
submission is re-disabled the instant the undo completes, the same as
right after the blank was originally awarded — the player is forced
straight back into placing it.

## Blank letter
Submitting a valid word of `BLANK_AWARD_LENGTH` (5) or more letters
awards a wildcard "blank" letter, regardless of whether that submission
also closes a corner (it can't — a valid submit always clears the corner
it came from, so scoring and closing a corner never happen from the same
move; see `js/main.js`). The award sets `state.blankPending = true`,
which drives three simultaneous UI changes via `renderBlankState()`: the
star-icon `#blank-bubble` (amber/gold, not teal — see `css/style.css`)
appears in `#blank-slot`, the two normal `.choice-bubble` elements turn
gray and stop accepting drags (the `.blocked` class — both visual and,
via `js/input.js`'s guard, functional), and tapping any corner to submit
a word becomes a no-op (`handleSubmit` early-returns on
`state.blankPending`). All three reverse together the instant the blank
is used or undone. This is deliberate: the blank must be resolved before
anything else happens, so there's no window where the player could earn
a second blank, or abandon the first one mid-turn, while it's still
pending.

Dragging `#blank-bubble` to an open corner (`handleBlankDrop`) doesn't
place a letter directly — it opens `#blank-picker`, a full-board overlay
with no dismiss affordance (no backdrop-click, no Escape; see
`css/style.css`) showing all 26 letters. Tapping a letter
(`handleBlankLetterChosen`, wired to a single delegated listener on
`#blank-picker-grid`) is what actually appends that letter to the
corner's word, runs the normal 5+-letter dead-end closing check, clears
`blankPending`, and hides the picker — from that point the chosen letter
is indistinguishable from any other letter in the corner's word (no
special rendering, scoring, or behavior carries over). If the corner the
blank was dropped on is `.closed` by the time the drop lands, the drop is
rejected the same way a normal choice drop would be, and the blank stays
pending. The blank's only interaction with the rest of the letter-supply
system is that it doesn't touch it at all — it isn't drawn from
`getRandomLetter`, doesn't consume or advance `state.nextLetter`/the
preview, and doesn't count toward the two-choice-slot state; it's a
fully separate one-shot letter, tracked only by the `blankPending`
boolean plus (transiently, only while the picker is open) the
module-level `pendingBlankCorner` variable in `js/main.js`.

## Not yet built (ask before assuming scope)
- Difficulty scaling (letterSource.js is set up to accept it — see above)
- Any persistent high-score / stats tracking across games
