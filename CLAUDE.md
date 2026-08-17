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
The game itself is vanilla HTML/CSS/JS, ES modules, no build step, no
runtime dependencies — open `public/index.html` directly or serve
`public/` statically and it works, offline included.

Deployed as a **Cloudflare Worker with static assets** — one Worker both
serves `public/` and handles the `/api` routes — backed by a D1 (SQLite)
database that records one row per completed game and serves the
personal/all-time best scores. The API is strictly
additive: nothing in `public/js/` except `api.js` knows it exists, and the
game stays fully playable when it's unreachable. See "Backend" below.

There are **two** such Workers, production and staging, from the same
source tree — read "Environments" next, before deploying anything.

Not Cloudflare **Pages** — an earlier version of this setup was, and the
mismatch cost an evening. See "Why a Worker, not Pages" below before
changing anything about the deploy.

## Environments
**Default to staging. Production is only ever deployed on purpose, by
the user's explicit say-so.** If a change hasn't been played on staging,
it doesn't go to production — and pushing it to production is the user's
call to make, not something to fold into "finishing" a change.

|            | Worker                 | URL                                              | D1 database            | How it deploys                                |
|------------|------------------------|--------------------------------------------------|------------------------|-----------------------------------------------|
| production | `word-corners`         | https://word-corners.muenks-kevin.workers.dev         | `word-corners`         | Cloudflare Workers Builds, on every push to `master` |
| staging    | `word-corners-staging` | https://word-corners-staging.muenks-kevin.workers.dev | `word-corners-staging` | `npm run deploy:staging` (or a push to `dev`, if Workers Builds is wired up for it) |

Same code, same assets, in both. The only differences are the Worker
name and which database `env.DB` points at — so a game finished on
staging can never land in production's leaderboard, and staging's "Your
Best" / "All-Time Best" are its own.

Git mirrors this: **`dev` is the working branch**, `master` is
production. Commit and push to `dev`; merging `dev` into `master` is the
deliberate act that ships (and, via Workers Builds, deploys) to
production. Never commit straight to `master` — a push there is a
production deploy.

GitHub's default branch is `dev` as well, so a fresh clone and any new
PR start there rather than on production. That is only a GitHub setting:
Workers Builds keeps its own "production branch" per Worker, and the
`word-corners` build still watches `master` — changing one does not
change the other.

Commands, all from the project root:

| Command | What it does |
|---|---|
| `npm run dev` | Local wrangler dev on :8787, staging config, **local** D1 file. Touches nothing remote. |
| `npm run deploy` | Alias for `deploy:staging` — the safe default when you type it out of habit. |
| `npm run deploy:staging` | Deploys the staging Worker. |
| `npm run deploy:production` | Deploys production by hand. Normally unnecessary (master push does it) and normally not yours to run — ask first. |

Anything that isn't the production hostname — staging, `npm run dev`,
a version preview URL, `index.html` opened off disk — shows a gold
**TEST** badge in the top bar. That check is a hostname comparison in
`public/js/env.js`; it's a whitelist, so a hostname change makes the
badge appear on production (loud, harmless) rather than vanish from
staging (silent, and the exact confusion the badge exists to prevent).
If the production URL ever changes, `PRODUCTION_HOSTNAME` in that file
has to change with it.

## Layout
```
public/     static assets served to the browser (the game, unchanged)
src/        the Worker: index.js routes, api/ handles /api/*
db/         D1 schema
wrangler.toml, package.json   Worker config + wrangler dev dependency
```
Only `public/` is uploaded as browser-reachable assets — that's the reason
for the split, so `CLAUDE.md`, `.claude/`, `db/`, and `src/` aren't
publicly served.

## Files
Paths below are relative to `public/` unless the entry says otherwise.

- `index.html` — markup: `#top-bar` (`#env-badge` + `#game-logo` + `#score-badge` holding `#score-label`/`#score-value` — `#env-badge` is the non-production "TEST" marker, shipped empty and `hidden` so production never flashes it before `main.js` runs, and filled in by `main.js` on every other host; see "Environments" above) + 4 `.corner` divs (`id="corner-nw|ne|sw|se"`, `data-corner="nw|ne|sw|se"`, each with just a `.word` span — the corner itself is the tap target, no button element) + `#center-stack` (containing `#center-row`) + `#hint-bar` (inline-SVG bulb + `#hint-text`) + `#game-over` overlay (`#final-score` + `#new-game-btn`) + `#blank-picker` overlay (see below). `#center-row` holds, in order: `#undo-btn` (inline-SVG icon button, its own `.row-slot`), a `.row-slot` holding `#preview-bubble`/`#preview-letter` (the upcoming-letter preview, cream/corner-colored, not grabbable — labeled "Next"), two `.row-slot.choice-slot` wrappers each containing a `.choice-bubble` (`id="choice-0|1"`) with a `.choice-letter` (`id="choice-letter-0|1"`) inside, and a `.row-slot` with `id="blank-slot"` (`hidden` attribute by default) holding the star-icon `.choice-bubble#blank-bubble` plus a "Blank" `.row-label` — this slot occupies the same grid column the two-choice system's plain `.center-row-spacer` filler used to (that spacer element is gone; `#blank-slot`, toggled via its `hidden` attribute in `main.js`, both fills that role when inactive and becomes real content once a blank is pending — see "Blank letter" below). A separate, hidden (`hidden` attribute) `#legacy-controls` div outside `#center-row` holds `#next-letter-preview`/`#next-letter`, `#center`/`#current-letter`, and `#hold-slot`/`#hold-letter` — the previous single-letter/hold markup, kept only so the idle JS in `main.js` that references those ids doesn't error; not part of the active layout or grid. (These idle ids are unrelated to the active `#preview-bubble`/`#preview-letter` pair, which are new elements added for the two-choice-plus-preview system.) `#blank-picker` (`hidden` by default, sibling of `#game-over` inside `#board`) is the forced letter-choice overlay: a centered `#blank-picker-card` with a title and `#blank-picker-grid`, which `main.js` populates at startup with 26 `.blank-picker-btn` buttons (`renderBlankPickerOptions` in `js/ui.js`) rather than hand-writing them in markup. Inside `#game-over`, between the final-score line and `#new-game-btn`, a `#best-scores` `<dl>` holds two `.best-row` divs (`#personal-best-row`/`#personal-best` and `#global-best-row`/`#global-best`), both `hidden` by default — they're filled from the database at game over (see "Backend" below) and each stays hidden if there's no number for it.
- `css/style.css` — the board is a phone-shaped column (`#board`, `width: min(100%, 560px)`, centered) over a teal radial-gradient background lit from the top-center, with faint decorative bubbles painted by `#board::before` (`pointer-events: none`). Vertical space is carved into bands by `:root` custom properties: `--top-band` (title + score badge), `--bottom-band` (hint bar), `--center-band` (the strip the center row lives in), with `--corner-height` a `clamp()` of *whatever is left over, halved* — so the four tiles always fit the viewport instead of colliding with the center row, on any screen height. Corners are absolutely positioned inside `#board` (`#corner-nw|ne|sw|se` rules offsetting from those bands plus `env(safe-area-inset-*)`), sized off `--corner-width`/`--corner-height` on independent axes. Their raised "sticker" look is layered `box-shadow` only (a hard offset edge for thickness, a soft drop shadow, an inset top highlight, an inset bottom shade) rather than a border — `.drop-target` swaps in the mint gradient and lifts with `translateY`, `.closed` swaps in the dusty-rose gradient and flattens the shadow. `cursor:pointer` signals the whole box is tappable, `.closed` switches it to `not-allowed`. `.invalid` shake animation unchanged. The teal bubbles (`.choice-bubble`, `#undo-btn`, `#new-game-btn`) share the same recipe: an off-center `radial-gradient` for the gloss plus that same four-layer shadow stack; `#score-badge` shares a lighter cream version of it. `#env-badge` (the TEST marker) is a small gold pill in the same `--accent` family as the blank tile, kept at the far left of `#top-bar` by `margin-right: auto` against that bar's `justify-content: flex-end`, clear of the absolutely centered `#game-logo`; it needs its own `#env-badge[hidden] { display: none; }` for the same reason `.row-slot`/`#blank-picker`/`.best-row` do — its `display: inline-flex` would otherwise beat the UA stylesheet and show the badge on production. `#center-stack` is absolutely positioned to span *exactly* the gap between the top and bottom tiles (top/bottom offsets built from the same band variables) and flex-centers `#center-row` inside it — deliberately **transform-free**, because a transformed ancestor would become the containing block for the `position: fixed` letter `input.js` drags and throw off its viewport-based coordinates. `#center-row` is a 5-column CSS grid (`grid-template-columns: var(--small-bubble) var(--small-bubble) var(--choice-bubble) var(--choice-bubble) var(--small-bubble)`, matching column widths explicitly rather than `1fr` — an auto-sized grid container doesn't equalize `1fr` tracks by itself) so `#undo-btn`, `#preview-bubble`, the two choice bubbles, and the spacer land in that order, with the two choice bubbles in equal-width columns. `--small-bubble`/`--choice-bubble`/`--center-row-gap` (all `:root` custom properties, `clamp(...)`/`min()` with viewport-relative middle values) are the single knobs for the whole row's scale — every bubble in the row sizes off one of them, as do the letter glyphs inside them (`font-size: calc(var(--…-bubble) * 0.42)`), so the row shrinks as a unit on narrow phones instead of any one piece overflowing the viewport while the rest don't; their minimums were tuned so the row's total minimum width (5 columns + 4 gaps) fits down to a 320px-wide screen without clipping. `--choice-bubble` is additionally capped by `--center-band` minus a reserve for the halo/shadow, since keying bubble size to viewport *width* alone lets it spill into the tiles on a short, wide viewport. `#undo-btn`, `#preview-bubble`, and the spacer all share `--small-bubble` exactly. `#undo-btn:disabled` is dimmed and un-clickable; since it lives inside `#center-row`, `body.game-over` hiding that row hides the button too, with no separate rule needed. `#preview-bubble`/`#preview-letter` are styled cream/corner-colored (same gradient recipe as `.corner`, via the same idle `#next-letter-preview` look) rather than teal, signaling it isn't grabbable the way the two choice bubbles are. `.choice-bubble` carries `cursor:grab`/`touch-action:none` since it's the drag-start hit target for each choice — see `input.js`. A letter in flight (`.dragging`) flips to dark teal with a cream halo, since it crosses both the teal board and the cream tiles and has to stay legible over either — applies to `.choice-letter.dragging` (active) and `#current-letter.dragging`/`#hold-letter.dragging` (idle, see below). `body.game-over` hides `#center-row` and `#hint-bar` (the top bar, and so the score, stays visible) and shows the `#game-over` overlay. Rules for `#center`, `#next-letter-preview` (the idle one inside `#legacy-controls`), `#hold-slot`, and `.pill-label` are still present but idle — they style the hidden `#legacy-controls` markup and aren't reachable in the active layout. Two `[hidden]` overrides matter here and are easy to lose: `.row-slot[hidden] { display: none; }` and `#blank-picker[hidden] { display: none; }` — both elements also carry an unconditional `display: flex` rule (`.row-slot`, `#blank-picker`) for when they're visible, and since an author stylesheet's declaration beats the UA stylesheet's `[hidden] { display: none }` at equal or lower specificity, that `display: flex` would otherwise win and keep the element visible even with the `hidden` attribute set — the `[hidden]` override rules exist specifically to re-assert the hide. `.choice-bubble.blocked` (the two normal choice bubbles while a blank is pending) swaps in a muted gray gradient, `cursor: not-allowed`, and `pointer-events: none` in place of the usual teal — signals they're temporarily unusable without changing the letters printed on them (see "Blank letter" below). `.blank-bubble` reuses `.choice-bubble`'s size/shape but an amber/gold radial-gradient (via `--accent`) instead of teal, and is sized off `--small-bubble` (matching `#undo-btn`/`#preview-bubble`) since it lives in that same grid column, not `--choice-bubble` — critically, it also has its **own** `box-shadow`, copied from `#undo-btn`'s (scaled for `--small-bubble`) rather than inherited from `.choice-bubble` (scaled for the much larger `--choice-bubble`, ~26px blur vs. ~16px). Leaving that bigger shadow un-overridden was a real bug: on the smaller bubble it blurred past its own edge and visually bled into the neighboring choice bubble even though the actual grid gap was already identical to the gap between the two choice bubbles — worth remembering if any other small bubble ever borrows `.choice-bubble` styling again. `#blank-picker` is a full-board `position: absolute; inset: 0` backdrop (`rgba(12, 58, 68, 0.45)`, `z-index: 50` — above `#game-over`'s 30) with no dismiss affordance, centering `#blank-picker-card` (same card recipe as `#game-over`) containing a 6-column `#blank-picker-grid` of `.blank-picker-btn` circles styled like a smaller `#undo-btn`/`.choice-bubble`. `.word-feedback` (the length/points popup on a corner, see `js/ui.js` below) is entirely `color: var(--accent)` already, so the optional third `.word-feedback-blank` line ("Blank Tile Earned") can't stand out through color alone — it's styled as a small gold pill using `.blank-bubble`'s own gradient, uppercase cream text, so it reads as a distinct bonus line rather than a third line of the same accent-colored text. `.blank-letter` (wraps a single blank-derived character inside a corner's `.word`, see `js/ui.js`'s `renderCorner`) is just `color: var(--accent)` — the same gold as `.blank-bubble`/`.word-feedback-blank` — since it's an inline span sitting in already-styled corner text and doesn't need its own size/shape/shadow treatment the way the standalone bubbles do. `#best-scores` on the game-over card is a flex column with a hairline `border-top` separating it from the final score; `.best-row` puts its `dt` (small, uppercase, dimmed) and `dd` (bold, `--accent` gold) at opposite ends. Two hiding rules matter: `.best-row[hidden] { display: none; }` re-asserts the hide over `.best-row`'s own `display: flex` (the same UA-stylesheet trap as `.row-slot`/`#blank-picker` above), and `#best-scores:not(:has(.best-row:not([hidden]))) { display: none; }` collapses the whole block when neither row has a score — without it the empty `<dl>` would still consume one of `#game-over`'s 14px gaps and leave a hole above the button.
- `js/gameState.js` — game data only: `corners`, `blankIndices` (per-corner arrays of character positions placed via the blank/wildcard letter — see "Blank letter" below), `closedCorners`, `choices` (array of 2 letters, the active turn state), `nextLetter` (the upcoming letter shown in the preview bubble — actively used, not idle), `blankPending` (true from the moment a 5+ letter valid word is submitted until the awarded blank is placed and given a letter — see `js/main.js`), `score`, `gameOver`, plus idle `currentLetter`/`holdLetter` (unused by the active flow, kept for the single-letter/hold system — see `js/main.js`). Mutators: `appendLetterToCorner`, `appendBlankLetterToCorner` (same, but also records the position in `blankIndices` — the only way a position ends up marked), `clearCorner` (also resets that corner's `blankIndices` to `[]`), `removeLastLetter` (undo's corner-side reversal; also pops the last `blankIndices` entry if it matches the position just removed, which is what lets undoing a blank placement un-mark it), `addScore`, `closeCorner` (marks a corner dead, flips `gameOver` once all four are closed), `reopenCorner` (undo's reversal of `closeCorner`), `setChoiceLetter(state, index, letter)` (writes one of the two active choice slots), `setNextLetter(state, letter)` (writes the preview letter — used by both the active flow and, still, the idle legacy code; see the caution in `js/main.js`'s legacy comment block), `setBlankPending(state, pending)` (writes `blankPending`; the blank itself doesn't have a stored letter — the player's picker choice is appended straight to the corner, see `js/main.js`). `setHoldLetter`, `clearHoldLetter`, `setCurrentLetter` remain but are only called from the idle code in `main.js`. Also `stats` — the per-game telemetry posted to the database at game over (`startedAt`, `wordsTotal`, `words3`/`words4`/`words5`/`words6Plus`, `blanksEarned`), with mutators `markGameStarted(state)` (restarts the duration clock; called from `initRound` so the word list's load time isn't counted as play time), `recordWordSubmitted(state, wordLength)` (bumps `wordsTotal` plus the matching length bucket — the four buckets are a strict partition of `wordsTotal`, which the API re-checks server-side), and `recordBlankEarned(state)`. Only successful scoring submissions are counted; invalid or too-short attempts aren't. No DOM.
- `js/version.js` (relative to `public/`) — exports `GAME_VERSION`, recorded with every game row so results can be sliced by which iteration of the rules produced them. Bump it whenever a change makes results non-comparable with the previous version (scoring formula, letter distribution, length thresholds, new mechanics); cosmetic changes don't need a bump. Keep it in step with `version` in the root `package.json`.
- `js/env.js` (relative to `public/`) — exports `PRODUCTION_HOSTNAME` and `isProduction()`, the whole of the client's environment awareness. Both Workers serve byte-identical files and there's no build step to bake a flag into, so this is a `location.hostname` comparison: production is exactly one host, everything else counts as non-production and gets the TEST badge (`main.js` → `renderEnvBadge` in `js/ui.js`). Deliberately a whitelist rather than a "does the hostname contain 'staging'" test — the failure mode is then a badge on production, not a missing badge on staging. Asking the server instead was rejected: the badge has to render with no network, same as the rest of the game.
- `js/api.js` (relative to `public/`) — the only client module that talks to the server; no game logic, no DOM. `getPlayerId()` returns an anonymous per-browser UUID kept in `localStorage` (not an account — clearing site data makes a new "player"; falls back to a per-session id when storage is unavailable). `submitGame({score, stats})` POSTs one finished game to `/api/games` and resolves to the refreshed bests the server computed *after* storing it. `fetchHighScores()` GETs `/api/scores`. Every call is best-effort by design — a 6s timeout, and any failure (offline, error status, bad JSON) resolves to `null` instead of throwing, so the game never depends on the network being there.
- `js/letterSource.js` — draws letters in two stages: first vowel-vs-consonant, then a specific letter within that category. `LETTER_FREQUENCIES` (standard Scrabble tile distribution) is split by `isVowel(letter)` into `VOWEL_FREQUENCIES`/`CONSONANT_FREQUENCIES`, the per-letter weights used for the second stage. `CATEGORY_WEIGHTS` (`{ vowel: 42, consonant: 56 }` by default, the two categories' combined tile weights) drives the first stage — edit these two numbers to rebalance how often vowels vs. consonants come up, independent of individual letter rarity (which is tuned via `LETTER_FREQUENCIES` instead). `MAX_SAME_CATEGORY_AMONG_CHOICES` (default `2`) is the no-3-of-a-kind rule's threshold: `getRandomLetter(otherLetters = [])` counts vowels/consonants in `otherLetters` and forces the opposite category once one category already has this many, overriding the normal `CATEGORY_WEIGHTS` roll. `otherLetters` is meant to be the other letters currently visible among the two choice slots + the preview (excluding whichever one is being redrawn) — passing `[]` (the default) draws with no category constraint. This same mechanism is what lets the two choice slots freely match each other's category (only 1 other letter is ever known when drawing a choice slot, below the threshold of 2) while still forcing the preview to differ once both choices already share a category — see `js/main.js` for how the three draws are sequenced to produce that asymmetry. All three constants are plain exported values, meant to be the tuning knobs for future difficulty/balance changes.
- `js/wordValidator.js` — `loadWordList()` (async, fetches `data/wordlist.txt` into a `Set`) + `isValidWord(word)` (sync, throws if called before load) + `hasWordWithPrefix(prefix)` (sync, true if any dictionary word starts with `prefix`; used to detect dead corners). Real dictionary, not a stub.
- `js/scoring.js` — `scoreWord(word)`: `n*(n-1)/2`, superlinear by design. Single function, edit here only to change the formula.
- `js/input.js` — `initDrag(dragEl, targetEls, onDrop, hitEl = dragEl)`: Pointer Events drag-and-drop, reports which target via `onDrop(target.dataset.corner)`. `hitEl` is what listens for `pointerdown` (defaults to `dragEl` itself); passing the surrounding bubble (`.choice-bubble`) instead of the letter glyph makes the whole bubble grabbable, not just the text — `dragEl` is still what visually moves. A `hitEl` with the `.empty` class (idle guard, relevant only to the legacy hold slot) or the `.blocked` class (a choice bubble frozen out while a blank is pending, see `js/main.js`) never starts a drag. Skips targets with the `.closed` or `.occupied` class as drop points. No game/DOM-render knowledge beyond drag visuals and those CSS classes. `main.js` calls it once per choice bubble (two times total), once more for `#blank-bubble` (the preview bubble is never draggable, blank or otherwise), each with targets = the four corners and its own `hitEl`/`dragEl` pair, wrapping `onDrop` in a closure that passes that bubble's index (or, for the blank, nothing — see below) through to the relevant handler.
- `js/ui.js` — pure render functions (`renderCorner`, `renderLetter`, `renderScore`, `flashInvalid`, `renderClosedCorner`, `resetCornerVisuals`, `renderGameOver`, `hideGameOver`, `renderHold`, `renderUndoAvailability`, `renderBlankPickerOptions`, `showBlankPicker`, `hideBlankPicker`, `renderBlankBubble`, `setChoicesBlocked`, `renderEnvBadge`). No game logic. `renderCorner(cornerEl, word, blankIndices = [])` rebuilds the corner's `.word` span's children rather than setting `textContent`: characters at positions listed in `blankIndices` (see `js/gameState.js`) are wrapped in a `.blank-letter` span (styled gold via `--accent`, `css/style.css`), everything else is a plain text node — every call site passes the corner's `state.blankIndices[corner]` (`main.js`) so this stays in sync with which letters were placed via the blank. `renderLetter` is generic — used for both choice-letter elements, the preview-letter element, and (in the idle code) the legacy current/next-letter elements. `renderHold(holdSlotEl, holdLetterEl, letter)` sets the letter text and toggles `.occupied`/`.empty` on the slot — only called from idle code now. `renderClosedCorner`/`resetCornerVisuals` only toggle the `.closed`/`.invalid` classes on the corner div itself — there's no separate submit button to enable/disable. `renderUndoAvailability(undoBtn, available)` toggles `undoBtn.disabled`. `showWordFeedback(cornerEl, wordLength, points, blankAwarded = false)` takes an optional fourth argument; when true it adds a third `.word-feedback-blank` ("Blank Tile Earned") span alongside the length/points ones — `main.js` passes `word.length >= BLANK_AWARD_LENGTH && !hadBlank` for it, so the message and the actual blank award (`awardBlankIfEligible`, called separately right after) always agree on both the length threshold and the "word already contains a blank" exclusion (see "Blank letter" below). `renderBlankPickerOptions(gridEl)` builds the 26 `.blank-picker-btn` letter buttons into `#blank-picker-grid` once at startup (`main.js` then attaches a single delegated click listener, rather than one per letter). `showBlankPicker`/`hideBlankPicker` toggle the `hidden` attribute on `#blank-picker`. `renderBlankBubble(slotEl, pending)` toggles `hidden` on `#blank-slot`. `setChoicesBlocked(bubbleEls, blocked)` toggles the `.blocked` class on the two `.choice-bubble` elements. `renderEnvBadge(badgeEl, label)` writes the top-bar environment badge and hides it again when `label` is empty — which environment deserves which label (or none) is decided in `js/env.js`/`main.js`, not here. `renderBestScore(rowEl, valueEl, score)` fills one game-over best-score row, or hides the row entirely when `score` isn't a number — so a missing best (nothing recorded yet, or the request failed) shows nothing rather than a placeholder dash.
- `js/main.js` — wires modules together, owns the turn loop and corner-tap handlers, awaits `loadWordList()` before enabling drag. `start()` opens by calling `renderEnvBadge(envBadgeEl, isProduction() ? null : 'Test')` — the single line that decides whether the TEST badge shows, before anything else happens, so a mid-load error can't leave a test build looking like production. `drawNextLetter()` draws one fresh letter into `state.nextLetter` (the preview) and re-renders `#preview-letter`, passing `getRandomLetter` both current choice slots' letters (`state.choices.filter(Boolean)`) so the vowel/consonant no-3-of-a-kind rule in `letterSource.js` can see them. `advanceChoice(index)` is the refill step: it moves the current `state.nextLetter` into `state.choices[index]`, re-renders that bubble, then calls `drawNextLetter()` to draw a new preview — this "queue advances" behavior (both choice slots pulling from one shared upcoming-letter preview) is the core mechanic, replacing the old three-choice system's independent per-slot redraw. `initRound()` draws both choice slots fresh (unconstrained for slot 0, constrained against slot 0 for slot 1 — so the two choices are free to share a category) and then calls `drawNextLetter()` once, so the preview is the one draw constrained against both choices. `handleDrop(index, targetName)` (guarded by `state.blankPending` — a normal choice can't be dropped while a blank is pending, on top of the `.blocked` class already stopping the drag from starting) appends `state.choices[index]` to the target corner, closes the corner immediately if the resulting letters have no valid completion (rechecked after every append, not just once 5+ letters), then calls `advanceChoice(index)`, and records `lastMove = { type: 'choice', ... }` for undo. Each `.corner` has a `click` listener calling `handleSubmit(cornerEl.dataset.corner)` directly — the corner box itself is the submit button; `handleSubmit` is also a no-op while `state.blankPending` is true, since word submission is disabled until the blank is placed. `handleSubmit` only scores when `word.length >= MIN_WORD_LENGTH` (`3`) *and* `isValidWord(word)` — a dictionary-valid word shorter than that is treated the same as an invalid one (shake, corner left as-is), so the player can keep building past it rather than being stuck. On a valid submit, `handleSubmit` first reads `state.blankIndices[cornerName].length > 0` into `hadBlank` (before `clearCorner` resets it) and calls `awardBlankIfEligible(word, hadBlank)`, which sets `blankPending` only when `!hadBlank && word.length >= BLANK_AWARD_LENGTH` (`5`, the one tuning knob for the length side of this feature) and re-renders the blank bubble/blocked choices via `renderBlankState()` — see "Blank letter" below for why a word containing a blank-derived letter is excluded. `handleBlankDrop(targetName)` (the `onDrop` for `#blank-bubble`'s `initDrag`) just records `targetName` in the module-level `pendingBlankCorner` and opens `#blank-picker` — it doesn't touch game state yet, since the letter isn't chosen. `handleBlankLetterChosen(letter)` (wired to a single delegated click listener on `#blank-picker-grid`) is what actually appends `letter` to `pendingBlankCorner`'s word via `appendBlankLetterToCorner` (not `appendLetterToCorner` — this is what marks the position gold and blank-award-ineligible), runs the same immediate dead-end closing check as `handleDrop`, clears `blankPending`, hides the picker, and records `lastMove = { type: 'blank', corner, closedNow }` — there's no `letter` needed in that record since undoing a blank placement never restores a specific letter into a slot, it just re-arms `blankPending` (see "Undo" below). `endGame()` is the single game-over path (called from both `handleDrop` and `handleBlankLetterChosen`, replacing the direct `renderGameOver` calls those used to make): it shows the overlay immediately using the module-level `cachedBests` — seeded by a `fetchHighScores()` at startup that is deliberately *not* awaited, since the bests are only needed on the game-over screen and shouldn't delay the first turn — then posts the game via `submitGame` and re-renders with the bests the server returns, so a new personal or all-time high appears on the same screen that set it. A `gameRecorded` flag makes the post idempotent, and a failed post is silent (the overlay just keeps showing the previous bests, or none). `resetGame` (wired to `#new-game-btn`) rebuilds `state` and re-renders everything, including a fresh `initRound()`, for a new game — also hides the blank picker/bubble and clears `pendingBlankCorner`. A module-level `lastMove` variable holds a single-level undo record, tagged by `type` (`'choice'`: `{index, corner, closedNow, prevChoiceLetter, prevNextLetter}`, or `'blank'`: `{corner, closedNow}`) written by `handleDrop`/`handleBlankLetterChosen` and consumed by `handleUndo` (wired to `#undo-btn`), which branches on `lastMove.type`. See "Undo" below for the full behavior. Below `start()`, a block of `legacy*`-prefixed functions (`legacyNextTurn`, `legacyHandleHoldDrop`, `legacyHandleDropToHold`) reproduces the previous single-letter + hold turn loop; they are never called and depend on the hidden `#legacy-controls` elements — kept only in case that flow (or a hold mechanic layered onto the two-choice-plus-preview board) is revisited. That legacy code reads/writes `state.nextLetter` directly, the same field the active preview logic uses — harmless only because it's never called; if the legacy flow is ever revisited it would need its own field or explicit handoff logic.
- `src/index.js` (project root, **not** under `public/`) — the Worker entry point. Its `fetch` handler routes `POST /api/games` and `GET /api/scores` to `src/api/`, and hands anything else to `env.ASSETS.fetch(request)`. Worth understanding: static assets are matched *before* the Worker runs (that's the default with `[assets]` in `wrangler.toml`, absent `run_worker_first`), so this handler only ever sees `/api/*` plus paths that match no file — which is why the non-API branch just delegates back to the assets binding for its 404 rather than inventing one.
- `src/api/games.js`, `src/api/scores.js`, `src/api/shared.js` — the two route handlers plus their shared helpers. `shared.js` holds `json()` and `readBests(env, playerId)`, which runs the two `MAX(score)` queries as one `env.DB.batch(...)` and returns `{ globalBest, personalBest }` — the identical shape both routes return, so the client has one response format to handle. `games.js` validates every numeric field as a non-negative integer under a generous cap and rejects payloads whose per-length word counts don't sum to `wordsTotal`; those checks exist to keep a typo or stray script out of the dataset, not to stop a determined cheater (nothing client-side can), so widen the caps rather than working around them if real play ever exceeds them.
- `db/schema.sql` (project root) — the single `games` table plus its two indexes, one row per completed game. Both databases use it. Apply it with `npm run db:init` (local), `npm run db:init:staging`, or `npm run db:init:production`.
- `wrangler.toml`, `package.json` (project root) — `main = "src/index.js"` plus `[assets] directory = "./public"` is the Worker-with-static-assets setup; `directory` is what keeps everything else out of the deploy, and `binding = "ASSETS"` is what makes `env.ASSETS` available to `src/index.js`. `[[d1_databases]]` binds `env.DB`. The top-level block *is* the production environment; `[env.staging]` below it overrides the Worker name and the D1 database. Bindings are never inherited by a named environment, so `[env.staging.assets]` and `[[env.staging.d1_databases]]` are repeated in full — delete either one and the staging Worker quietly loses its assets or its database rather than failing loudly. `package.json` exists only for `wrangler` and for the deploy/db scripts (see the table under "Environments"); the game still has no runtime dependencies and no build step. Two script details worth keeping: `deploy` is an alias for `deploy:staging`, so the habitual `npm run deploy` can't hit production; and `deploy:production` passes `--env=""`, which is how wrangler wants the top-level environment named explicitly once any named environment exists (a bare `wrangler deploy` still targets production, but warns). Cloudflare Workers Builds runs `npx wrangler deploy` directly, not through npm, so it is unaffected by the alias — if that build command is ever changed to `npm run deploy`, master pushes would start deploying *staging*.
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
corner submits it: valid word of `MIN_WORD_LENGTH` (3) or more letters →
scored (superlinear formula) and corner clears; anything else (invalid
dictionary word, or a valid word shorter than 3 letters) → corner shakes
and stays as-is (word not cleared,
player can keep adding letters or retap). Score shown in a badge in the
top-right, opposite the "Word Corners" title. A hint bar pinned along the
bottom restates the two core actions.

A corner closes (shaded dusty rose, drag/tap-submit disabled) as soon as no
dictionary word starts with its current letters
(`hasWordWithPrefix` in `wordValidator.js`) — rechecked after every letter
is appended, from the very first letter onward, since a prefix that could
still become legal can lose that potential the moment the next letter is
added. When all 4 corners are closed the game ends: `#center-row` (undo, the preview,
and the two letter choices) and `#hint-bar` hide while `#top-bar` — and
so the score badge — stays visible, a centered overlay shows the final
score, "Your Best" and "All-Time Best" pulled from the database (each
line omitted if there's no number for it), and a "New Game" button that
rebuilds game state and resumes play. The finished game is posted to the
database at that moment — see "Backend" below.

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

Undoing a `'choice'` move restores the preview letter to what it was
before that move's `advanceChoice()` ran (`prevNextLetter`, already
stored on `lastMove`) — but the letter that `advanceChoice()` had freshly
drawn into the preview isn't simply discarded. `handleUndo` banks it into
a module-level `bankedPreviewLetter` in `js/main.js`, and `drawNextLetter()`
checks that bank first, consuming and clearing it, before falling back to
a random draw. Without this, drop-then-undo is a free no-op that reveals
what the next preview letter *would* be with no cost, since undo already
puts every other piece of state back exactly where it was — a player
could repeat that cycle to "shop" for a preview letter they like. Banking
the discarded letter closes that: the same letter that showed up before
the undo comes up again the next time any choice slot advances, so
undoing never yields new information for free, only a second-guess. The
bank is a single slot (matching the rest of undo being single-level) and
is cleared by `resetGame`; it's untouched by the blank-letter undo path,
since that path never calls `drawNextLetter()`/touches the preview at
all.

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
corner's word via `appendBlankLetterToCorner` (see below — *not* the
normal `appendLetterToCorner`), runs the normal 5+-letter dead-end
closing check, clears `blankPending`, and hides the picker. If the
corner the blank was dropped on is `.closed` by the time the drop lands,
the drop is rejected the same way a normal choice drop would be, and the
blank stays pending. The blank's only interaction with the rest of the
letter-supply system is that it doesn't touch it at all — it isn't drawn
from `getRandomLetter`, doesn't consume or advance
`state.nextLetter`/the preview, and doesn't count toward the
two-choice-slot state; it's a fully separate one-shot letter, tracked
only by the `blankPending` boolean plus (transiently, only while the
picker is open) the module-level `pendingBlankCorner` variable in
`js/main.js`.

Once placed, a blank-derived letter stays marked for as long as it sits
in that corner's (not-yet-submitted) word: `state.blankIndices[corner]`
(`js/gameState.js`) holds the character positions placed via
`appendBlankLetterToCorner`, populated only by that function (never
`appendLetterToCorner`) and kept in sync by `removeLastLetter` (pops the
last index if it matches the letter just removed — this is also how
undoing a blank placement un-marks it) and `clearCorner` (resets to
`[]`). Two effects read this list: `ui.js`'s `renderCorner(cornerEl,
word, blankIndices)` renders those positions as gold `.blank-letter`
spans instead of plain text (same `--accent` gold as the blank
bubble/picker), and `main.js`'s `handleSubmit` checks
`state.blankIndices[cornerName].length > 0` before clearing the corner
to decide `hadBlank`, which it passes to `awardBlankIfEligible` — a word
that contains a blank-derived letter anywhere never awards a new blank,
even at 5+ letters, closing the loophole of chaining blanks off each
other. Because a valid submit always clears the corner immediately
after, "contains a blank anywhere" and "used a blank in this specific
submission" are the same condition in practice — the word never
survives past that one check. `showWordFeedback`'s "Blank Tile Earned"
pill is likewise gated on `!hadBlank`, so the on-screen feedback always
agrees with whether a blank was actually awarded.

## Backend
One Cloudflare Worker serves both `public/` (as static assets) and the
API, on the same origin — so no CORS anywhere. D1 is Cloudflare's SQLite,
bound as `env.DB` via `wrangler.toml`.

Same-origin is also what makes the two environments free: the staging
build fetches `/api/...` off its own hostname and therefore hits the
staging database, with no environment switch anywhere in `public/js/` to
get wrong. `env.DB` resolving to a different database per environment is
the *only* place the split exists.

Two routes, both returning `{ globalBest, personalBest }` (either may be
`null` when nothing is recorded yet):
- `GET  /api/scores?playerId=…` — read the bests. Called once at startup.
- `POST /api/games` — store one finished game, then return the refreshed
  bests. Called once at game over.

One row per *completed* game (all four corners closed). Abandoned games
are not recorded — an accepted gap, since there's no reliable moment to
post one. Each row carries score, duration, total words, the 3/4/5/6+
length breakdown, blanks earned, the anonymous player id, and
`GAME_VERSION`; `db/schema.sql` is the authoritative list.

The whole feature is designed to fail open. `api.js` swallows every
error, `endGame` renders the overlay before the network call resolves,
and no game rule reads anything from the server — so the game behaves
identically offline, minus the two best-score lines.

Local development: `npm run dev` (`wrangler dev --env staging`, port
8787) serves the assets and the Worker together against a **local** D1
file under `.wrangler/`, so nothing you do while developing touches
either remote database. `npm run db:init` creates the tables in that
local database — note that local D1 files are keyed by `database_id`, so
changing that value in `wrangler.toml` silently orphans the old local
database and you have to re-run `db:init` (the symptom is `no such table:
games` from a dev server that worked five minutes ago). Switching `dev`
between environments has the same effect, for the same reason.
`npm run db:games` dumps the most recent **staging** rows;
`npm run db:games:production` does the same for production. For real
analysis, query D1 from the Cloudflare dashboard — note there are now two
databases listed there, and `word-corners-staging` is full of throwaway
games.

Player identity is an anonymous UUID in `localStorage` — enough to make
"your best" meaningful, but it is per-browser, not per-person. The
`player_name` column exists and is unused, reserved for the initials
entry described below.

## Why a Worker, not Pages
This started as a Cloudflare **Pages** project (`functions/` directory,
`pages_build_output_dir`, `wrangler pages deploy`) and was converted. If
you find yourself reintroducing any of that, read this first.

The dashboard's "Workers & Pages → Create" flow provisions a **Worker
with Workers Builds**, not a Pages project, and its default deploy command
is `npx wrangler deploy`. Pointing a Pages-shaped repo at it produces a
chain of errors that each look like an unrelated auth/config problem:
`Missing entry-point to Worker script` (because `wrangler deploy` wants
`main`, which a Pages config doesn't have), then `Authentication error
[code: 10000]` once the deploy command is overridden to `wrangler pages
deploy` (because that tries to create a *separate* Pages project from
inside a Worker's pipeline), then build-token errors. The tell that
settles it: `wrangler pages project list` returns empty while
`wrangler deployments list` finds the Worker.

The current setup matches what that dashboard flow actually creates, so
the default deploy command is correct and no override is needed:
Workers Builds runs `npx wrangler deploy` on each push to `master` and
that deploys production. The staging Worker was created by
`wrangler deploy --env staging` from an authenticated machine
(`wrangler login`), and — if it's wired into Workers Builds too — is
built from the `dev` branch with `npx wrangler deploy --env staging`.
Both are Workers; neither is a Pages project.

## Not yet built (ask before assuming scope)
- Initials/nickname entry on the game-over screen, and a real top-10
  leaderboard. The schema's `player_name` column and the
  `readBests`-shaped API response are the two places that would change.
- Any analysis/dashboard view over the collected games; right now
  reading the data means querying D1 directly.
- Difficulty scaling (letterSource.js is set up to accept it — see above)
- Any persistent high-score / stats tracking across games
