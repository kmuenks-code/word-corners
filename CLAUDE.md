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
  js/objectives/   the objective system (see "Objectives" below)
src/        the Worker: index.js routes, api/ handles /api/*
db/         D1 schema
wrangler.toml, package.json   Worker config + wrangler dev dependency
```
Only `public/` is uploaded as browser-reachable assets — that's the reason
for the split, so `CLAUDE.md`, `.claude/`, `db/`, and `src/` aren't
publicly served.

## Files
Paths below are relative to `public/` unless the entry says otherwise.

- `index.html` — **splash / objective additions**, on top of the board described next: `#splash` (the opening screen and where "New Game" returns; deliberately **not** `hidden` in markup so it covers the board from first paint — `#splash-logo` sits *outside* `#splash-card` on the teal backdrop, because the logo art is light-on-teal and vanishes against the card's cream; inside the card, two `.splash-step` divs — `#splash-modes` holding `#splash-mode-options`, and `#splash-difficulty` holding `#splash-difficulty-options` plus `#splash-back` — with both option groups built by `js/ui.js` from the mode/difficulty tables rather than hand-written, so a new mode or tier appears with no markup change; `#splash-mode-options` ships a `.splash-loading` placeholder that `main.js` replaces only after the word list resolves, so the first tap can't start a game whose word checks would throw), `#objective-flag` (the right-edge flag button + `#objective-flag-badge`, `hidden` until a mode with objectives is chosen), `#objective-panel` (`hidden`; `#objective-panel-card` → `#objective-list` + `#objective-panel-close`, dismissible by backdrop click *and* the button, unlike `#blank-picker`), and `#game-over-objectives` (a `hidden` `<ul>` inside `#game-over`, between the score line and `#new-game-btn`, showing the same list resolved to its final ✓/✗ state). The rest of the markup: `#top-bar` (`#env-badge` + `#game-logo` + `#score-badge` holding `#score-label`/`#score-value` — `#env-badge` is the non-production "TEST" marker, shipped empty and `hidden` so production never flashes it before `main.js` runs, and filled in by `main.js` on every other host; see "Environments" above) + 4 `.corner` divs (`id="corner-nw|ne|sw|se"`, `data-corner="nw|ne|sw|se"`, each with an empty `.corner-mark` span — filled with that corner's shape badge by `main.js` at startup via `renderCornerSymbol`, see "Corner symbols" below — plus a `.word` span; the corner itself is the tap target, no button element) + `#center-stack` (containing `#center-row`) + `#hint-bar` (inline-SVG bulb + `#hint-text` — a real `<button>`: it's the "How to Play" trigger, see `#how-to-play` below) + `#game-over` overlay (`#final-score` + `#new-game-btn`) + `#blank-picker` overlay (see below). `#center-row` holds, in order: `#undo-btn` (inline-SVG icon button, its own `.row-slot`), a `.row-slot` holding `#preview-bubble`/`#preview-letter` (the upcoming-letter preview, cream/corner-colored, not grabbable — labeled "Next"), two `.row-slot.choice-slot` wrappers each containing a `.choice-bubble` (`id="choice-0|1"`) with a `.choice-letter` (`id="choice-letter-0|1"`) inside, and a `.row-slot` with `id="blank-slot"` (`hidden` attribute by default) holding the star-icon `.choice-bubble#blank-bubble` plus a "Blank" `.row-label` — this slot occupies the same grid column the two-choice system's plain `.center-row-spacer` filler used to (that spacer element is gone; `#blank-slot`, toggled via its `hidden` attribute in `main.js`, both fills that role when inactive and becomes real content once a blank is pending — see "Blank letter" below). `#blank-picker` (`hidden` by default, sibling of `#game-over` inside `#board`) is the forced letter-choice overlay: a centered `#blank-picker-card` with a title and `#blank-picker-grid`, which `main.js` populates at startup with 26 `.blank-picker-btn` buttons (`renderBlankPickerOptions` in `js/ui.js`) rather than hand-writing them in markup. Inside `#game-over`, between the final-score line and `#new-game-btn`, a `#best-scores` `<dl>` holds two `.best-row` divs (`#personal-best-row`/`#personal-best` and `#global-best-row`/`#global-best`), both `hidden` by default — they're filled from the database at game over (see "Backend" below) and each stays hidden if there's no number for it. Finally, `#how-to-play` (`hidden`, sibling of `#objective-panel`) is the rules overlay `#hint-bar` opens: `#how-to-play-card` → `#how-to-play-title` + a `#how-to-play-list` of five `.htp-row` items + `#how-to-play-close`. It is **entirely static markup** — nothing in `js/` renders into it, so a wording change is an edit here and nowhere else. Each row is a `.htp-glyph` (built from small copies of the board's own parts — a teal `.htp-bubble` with an arrow, a cream `.htp-tile` with a shape badge and a tap ripple, `.htp-bars`, a gold `.htp-star`, a rose `.htp-tile.closed` with a cross) plus a `.htp-body` holding `.htp-title` and `.htp-text`. See "How to Play overlay" below for what it does and doesn't say.
- `css/style.css` — **splash / objective additions** (three blocks appended at the end): `#objective-flag` is an absolutely-positioned gold tab on the board's right edge at `top: 50%`, sized in `clamp()`s, with a `.pulse` bump animation (`flag-bump` re-declares `translateY(-50%)` in every keyframe — the positioning transform would otherwise be dropped mid-animation and the flag would jump), an `.all-complete` teal variant, and `body.game-over #objective-flag { display: none }` since the game-over card carries its own summary. `#objective-panel` is a dismissible backdrop at `z-index: 55` (above `#blank-picker`'s 50), and `#splash` sits at `70` above everything — it is the one screen that must never be played through. `.objective-row` is a 4-column grid (status mark / corner symbol / description + meter / progress) shared by the panel and the game-over summary, so both render from one `renderObjectiveList`; the symbol column is a fixed width and is emitted even for objectives that name no corner, so the descriptions stay left-aligned with each other. `.objective-symbol` deliberately carries a *darker* ink than `.corner-mark` does — the tile badge's near-transparent teal disappears at list size on a cream card — while still reading as secondary to the description it precedes. `.corner-mark` is the badge itself: absolutely positioned in each tile's *outer* corner (the one nearest the screen edge, per-corner offsets under `#corner-nw|ne|sw|se .corner-mark`), sized in a `clamp()`, dimmed tile ink, `pointer-events: none`, and `position: absolute` specifically so it stays out of `.corner`'s centered flex column and can't nudge the word. `.corner.closed .corner-mark` re-tints it dusty rose to follow the closed tile's ink. `#splash` is a flex **column** (logo above card). Four `[hidden]` overrides are load-bearing here for the usual reason — `#objective-flag`, `#objective-panel`, `#splash`, `.splash-step`, and `#game-over-objectives` all carry an unconditional `display` that would otherwise beat the UA stylesheet's `[hidden] { display: none }`; `.splash-step` is the one that bites hardest, since losing it shows both splash steps at once. The rest: the board is a phone-shaped column (`#board`, `width: min(100%, 560px)`, centered) over a teal radial-gradient background lit from the top-center, with faint decorative bubbles painted by `#board::before` (`pointer-events: none`). Vertical space is carved into bands by `:root` custom properties: `--top-band` (title + score badge), `--bottom-band` (hint bar), `--center-band` (the strip the center row lives in), with `--corner-height` a `clamp()` of *whatever is left over, halved* — so the four tiles always fit the viewport instead of colliding with the center row, on any screen height. Corners are absolutely positioned inside `#board` (`#corner-nw|ne|sw|se` rules offsetting from those bands plus `env(safe-area-inset-*)`), sized off `--corner-width`/`--corner-height` on independent axes. Their raised "sticker" look is layered `box-shadow` only (a hard offset edge for thickness, a soft drop shadow, an inset top highlight, an inset bottom shade) rather than a border — `.drop-target` swaps in the mint gradient and lifts with `translateY`, `.closed` swaps in the dusty-rose gradient and flattens the shadow. `cursor:pointer` signals the whole box is tappable, `.closed` switches it to `not-allowed`. `.invalid` shake animation unchanged. The teal bubbles (`.choice-bubble`, `#undo-btn`, `#new-game-btn`) share the same recipe: an off-center `radial-gradient` for the gloss plus that same four-layer shadow stack; `#score-badge` shares a lighter cream version of it. `#env-badge` (the TEST marker) is a small gold pill in the same `--accent` family as the blank tile, kept at the far left of `#top-bar` by `margin-right: auto` against that bar's `justify-content: flex-end`, clear of the absolutely centered `#game-logo`; it needs its own `#env-badge[hidden] { display: none; }` for the same reason `.row-slot`/`#blank-picker`/`.best-row` do — its `display: inline-flex` would otherwise beat the UA stylesheet and show the badge on production. `#center-stack` is absolutely positioned to span *exactly* the gap between the top and bottom tiles (top/bottom offsets built from the same band variables) and flex-centers `#center-row` inside it — deliberately **transform-free**, because a transformed ancestor would become the containing block for the `position: fixed` letter `input.js` drags and throw off its viewport-based coordinates. `#center-row` is a 5-column CSS grid (`grid-template-columns: var(--small-bubble) var(--small-bubble) var(--choice-bubble) var(--choice-bubble) var(--small-bubble)`, matching column widths explicitly rather than `1fr` — an auto-sized grid container doesn't equalize `1fr` tracks by itself) so `#undo-btn`, `#preview-bubble`, the two choice bubbles, and `#blank-slot` land in that order, with the two choice bubbles in equal-width columns. `--small-bubble`/`--choice-bubble`/`--center-row-gap` (all `:root` custom properties, `clamp(...)`/`min()` with viewport-relative middle values) are the single knobs for the whole row's scale — every bubble in the row sizes off one of them, as do the letter glyphs inside them (`font-size: calc(var(--…-bubble) * 0.42)`), so the row shrinks as a unit on narrow phones instead of any one piece overflowing the viewport while the rest don't; their minimums were tuned so the row's total minimum width (5 columns + 4 gaps) fits down to a 320px-wide screen without clipping. `--choice-bubble` is additionally capped by `--center-band` minus a reserve for the halo/shadow, since keying bubble size to viewport *width* alone lets it spill into the tiles on a short, wide viewport. `#undo-btn`, `#preview-bubble`, and the spacer all share `--small-bubble` exactly. `#undo-btn:disabled` is dimmed and un-clickable; since it lives inside `#center-row`, `body.game-over` hiding that row hides the button too, with no separate rule needed. `#preview-bubble`/`#preview-letter` are styled cream/corner-colored (same gradient recipe as `.corner`) rather than teal, signaling it isn't grabbable the way the two choice bubbles are. `.choice-bubble` carries `cursor:grab`/`touch-action:none` since it's the drag-start hit target for each choice — see `input.js`. A letter in flight (`.dragging`) flips to dark teal with a cream halo, since it crosses both the teal board and the cream tiles and has to stay legible over either (`.choice-letter.dragging`). `body.game-over` hides `#center-row` and `#hint-bar` (the top bar, and so the score, stays visible) and shows the `#game-over` overlay. Two `[hidden]` overrides matter here and are easy to lose: `.row-slot[hidden] { display: none; }` and `#blank-picker[hidden] { display: none; }` — both elements also carry an unconditional `display: flex` rule (`.row-slot`, `#blank-picker`) for when they're visible, and since an author stylesheet's declaration beats the UA stylesheet's `[hidden] { display: none }` at equal or lower specificity, that `display: flex` would otherwise win and keep the element visible even with the `hidden` attribute set — the `[hidden]` override rules exist specifically to re-assert the hide. `.choice-bubble.blocked` (the two normal choice bubbles while a blank is pending) swaps in a muted gray gradient, `cursor: not-allowed`, and `pointer-events: none` in place of the usual teal — signals they're temporarily unusable without changing the letters printed on them (see "Blank letter" below). `.blank-bubble` reuses `.choice-bubble`'s size/shape but an amber/gold radial-gradient (via `--accent`) instead of teal, and is sized off `--small-bubble` (matching `#undo-btn`/`#preview-bubble`) since it lives in that same grid column, not `--choice-bubble` — critically, it also has its **own** `box-shadow`, copied from `#undo-btn`'s (scaled for `--small-bubble`) rather than inherited from `.choice-bubble` (scaled for the much larger `--choice-bubble`, ~26px blur vs. ~16px). Leaving that bigger shadow un-overridden was a real bug: on the smaller bubble it blurred past its own edge and visually bled into the neighboring choice bubble even though the actual grid gap was already identical to the gap between the two choice bubbles — worth remembering if any other small bubble ever borrows `.choice-bubble` styling again. `#blank-picker` is a full-board `position: absolute; inset: 0` backdrop (`rgba(12, 58, 68, 0.45)`, `z-index: 50` — above `#game-over`'s 30) with no dismiss affordance, centering `#blank-picker-card` (same card recipe as `#game-over`) containing a 6-column `#blank-picker-grid` of `.blank-picker-btn` circles styled like a smaller `#undo-btn`/`.choice-bubble`. `.word-feedback` (the length/points popup on a corner, see `js/ui.js` below) is entirely `color: var(--accent)` already, so the optional third `.word-feedback-blank` line ("Blank Tile Earned") can't stand out through color alone — it's styled as a small gold pill using `.blank-bubble`'s own gradient, uppercase cream text, so it reads as a distinct bonus line rather than a third line of the same accent-colored text. `.blank-letter` (wraps a single blank-derived character inside a corner's `.word`, see `js/ui.js`'s `renderCorner`) is just `color: var(--accent)` — the same gold as `.blank-bubble`/`.word-feedback-blank` — since it's an inline span sitting in already-styled corner text and doesn't need its own size/shape/shadow treatment the way the standalone bubbles do. `#best-scores` on the game-over card is a flex column with a hairline `border-top` separating it from the final score; `.best-row` puts its `dt` (small, uppercase, dimmed) and `dd` (bold, `--accent` gold) at opposite ends. Two hiding rules matter: `.best-row[hidden] { display: none; }` re-asserts the hide over `.best-row`'s own `display: flex` (the same UA-stylesheet trap as `.row-slot`/`#blank-picker` above), and `#best-scores:not(:has(.best-row:not([hidden]))) { display: none; }` collapses the whole block when neither row has a score — without it the empty `<dl>` would still consume one of `#game-over`'s 14px gaps and leave a hole above the button. **How to Play block** (appended last): `#how-to-play` is the same dismissible-backdrop recipe as `#objective-panel` at `z-index: 62` — above the `.dragging` letter's 60, below `#splash`'s 70 — with the usual load-bearing `#how-to-play[hidden] { display: none; }` re-assert. It differs from `#objective-panel-card` in one deliberate way: the **list** scrolls, not the card (`#how-to-play-list` gets `overflow-y: auto` plus the `min-height: 0` that actually lets a flex item shrink below its content), so the title and the dismiss button can never scroll out of reach — five rules don't fit a 568px-tall phone, where they do fit an 812px one. `.htp-row` is a `46px 1fr` grid, matching `.objective-row`'s fixed-symbol-column trick so every rule's text starts at the same x. The glyphs re-derive the board's looks at small size rather than reusing its classes, since every one of those is sized off a `--*-bubble` custom property tuned for the board: `.htp-bubble` and `.htp-star` copy `.choice-bubble`/`.blank-bubble`'s gradient with their own scaled-down shadows (the same trap noted for `.blank-bubble` above), and `.htp-tile`/`.htp-tile.closed` copy `.corner`'s cream and dusty-rose gradients. `.htp-tap`'s cream `drop-shadow` is doing real work — without it the ripple's arcs and the tile edge underneath blur together at 24px.
- `js/gameState.js` — game data only: `corners`, `blankIndices` (per-corner arrays of character positions placed via the blank/wildcard letter — see "Blank letter" below), `closedCorners`, `choices` (array of 2 letters, the active turn state), `nextLetter` (the upcoming letter shown in the preview bubble), `blankPending` (true from the moment a 5+ letter valid word is submitted until the awarded blank is placed and given a letter — see `js/main.js`), `score`, `gameOver`. Mutators: `appendLetterToCorner`, `appendBlankLetterToCorner` (same, but also records the position in `blankIndices` — the only way a position ends up marked), `clearCorner` (also resets that corner's `blankIndices` to `[]`), `removeLastLetter` (undo's corner-side reversal; also pops the last `blankIndices` entry if it matches the position just removed, which is what lets undoing a blank placement un-mark it), `addScore`, `closeCorner` (marks a corner dead, flips `gameOver` once all four are closed), `reopenCorner` (undo's reversal of `closeCorner`), `setChoiceLetter(state, index, letter)` (writes one of the two active choice slots), `setNextLetter(state, letter)` (writes the preview letter), `setBlankPending(state, pending)` (writes `blankPending`; the blank itself doesn't have a stored letter — the player's picker choice is appended straight to the corner, see `js/main.js`), `setGameOver(state)` (ends the game outright with corners still open — the *other* way a game can end, used when an objective mode declares a win or loss; deliberately says nothing about why, so it stays a neutral core mutator rather than objective logic leaking into `gameState.js`). Also `stats` — the per-game telemetry posted to the database at game over (`startedAt`, `wordsTotal`, `words3`/`words4`/`words5`/`words6Plus`, `blanksEarned`), with mutators `markGameStarted(state)` (restarts the duration clock; called from `initRound` so the word list's load time isn't counted as play time), `recordWordSubmitted(state, wordLength)` (bumps `wordsTotal` plus the matching length bucket — the four buckets are a strict partition of `wordsTotal`, which the API re-checks server-side), and `recordBlankEarned(state)`. Only successful scoring submissions are counted; invalid or too-short attempts aren't. No DOM.
- `js/version.js` (relative to `public/`) — exports `GAME_VERSION`, recorded with every game row so results can be sliced by which iteration of the rules produced them. Bump it whenever a change makes results non-comparable with the previous version (scoring formula, letter distribution, length thresholds, new mechanics); cosmetic changes don't need a bump. Keep it in step with `version` in the root `package.json`.
- `js/cornerSymbols.js` (relative to `public/`) — the four corners' shape identities (`nw`→square, `ne`→circle, `sw`→triangle, `se`→diamond), exporting `CORNER_SHAPES`, `cornerShape`, `cornerShapeLabel` (`"Square"`, for accessible labels and any prose that has to name one), and `createCornerSymbol(corner, {className, title})`, which builds the inline SVG in a 24×24 box filled with `currentColor`. Presentation only — see "Corner symbols" below for why the data model stays on `nw/ne/sw/se`. It is the single art source for both places a shape appears (the badge on the tile and an objective row's leading symbol), which is what stops those two from drifting; `ui.js` is its only consumer.
- `js/env.js` (relative to `public/`) — exports `PRODUCTION_HOSTNAME` and `isProduction()`, the whole of the client's environment awareness. Both Workers serve byte-identical files and there's no build step to bake a flag into, so this is a `location.hostname` comparison: production is exactly one host, everything else counts as non-production and gets the TEST badge (`main.js` → `renderEnvBadge` in `js/ui.js`). Deliberately a whitelist rather than a "does the hostname contain 'staging'" test — the failure mode is then a badge on production, not a missing badge on staging. Asking the server instead was rejected: the badge has to render with no network, same as the rest of the game.
- `js/api.js` (relative to `public/`) — the only client module that talks to the server; no game logic, no DOM. `getPlayerId()` returns an anonymous per-browser UUID kept in `localStorage` (not an account — clearing site data makes a new "player"; falls back to a per-session id when storage is unavailable). `submitGame({score, stats, result})` POSTs one finished game to `/api/games` and resolves to the refreshed bests the server computed *after* storing it — `result` is the snapshot `objectives.finish()` returned, and supplies the mode, the difficulty, the verdict, and one entry per objective (its type, resolved `params`, `cost`, `goal`, raw `finalValue`, and complete/failed status). Endless posts an empty objective list. `fetchHighScores()` GETs `/api/scores`. Every call is best-effort by design — a 6s timeout, and any failure (offline, error status, bad JSON) resolves to `null` instead of throwing, so the game never depends on the network being there.
- `js/letterSource.js` — draws letters in two stages: first vowel-vs-consonant, then a specific letter within that category. `LETTER_FREQUENCIES` (standard Scrabble tile distribution) is split by `isVowel(letter)` into `VOWEL_FREQUENCIES`/`CONSONANT_FREQUENCIES`, the per-letter weights used for the second stage. `CATEGORY_WEIGHTS` (`{ vowel: 42, consonant: 56 }` by default, the two categories' combined tile weights) drives the first stage — edit these two numbers to rebalance how often vowels vs. consonants come up, independent of individual letter rarity (which is tuned via `LETTER_FREQUENCIES` instead). `MAX_SAME_CATEGORY_AMONG_CHOICES` (default `2`) is the no-3-of-a-kind rule's threshold: `getRandomLetter(otherLetters = [])` counts vowels/consonants in `otherLetters` and forces the opposite category once one category already has this many, overriding the normal `CATEGORY_WEIGHTS` roll. `otherLetters` is meant to be the other letters currently visible among the two choice slots + the preview (excluding whichever one is being redrawn) — passing `[]` (the default) draws with no category constraint. This same mechanism is what lets the two choice slots freely match each other's category (only 1 other letter is ever known when drawing a choice slot, below the threshold of 2) while still forcing the preview to differ once both choices already share a category — see `js/main.js` for how the three draws are sequenced to produce that asymmetry. All three constants are plain exported values, meant to be the tuning knobs for future difficulty/balance changes.
- `js/wordValidator.js` — `loadWordList()` (async, fetches `data/wordlist.txt` into a **sorted array**) + `isValidWord(word)` (sync, throws if called before load) + `hasWordWithPrefix(prefix)` (sync, true if any dictionary word starts with `prefix`; used to detect dead corners). Real dictionary, not a stub. Sorted, not a `Set`, because of `hasWordWithPrefix`: it runs after *every* letter placed (the most frequent interaction in the game), and answering it from a `Set` means scanning until a match — the whole 172,823-word list when the answer is no, measured at ~1.6 ms a call. Both lookups are now a `lowerBound` binary search: `hasWordWithPrefix` checks whether the first word at or after the prefix `startsWith` it (nothing later can share more of it), and `isValidWord` checks that same slot for equality. ~1600× faster on the prefix check, and `isValidWord` was never the hot one. Two things to preserve if this is touched: the sort must use the same ordering as the `<` in `lowerBound` (plain `sort()` and `<` are both UTF-16 code-unit order — a locale-aware comparator would silently break the search), and the load sorts rather than trusting the file, which happens to be sorted already; that costs one pass inside an already-awaited load and removes a silent dependency on how `wordlist.txt` is written.
- `js/scoring.js` — `scoreWord(word)`: `n*(n-1)/2`, superlinear by design. Single function, edit here only to change the formula.
- `js/input.js` — `initDrag(dragEl, targetEls, onDrop, hitEl = dragEl)`: Pointer Events drag-and-drop, reports which target via `onDrop(target.dataset.corner)`. `hitEl` is what listens for `pointerdown` (defaults to `dragEl` itself); passing the surrounding bubble (`.choice-bubble`) instead of the letter glyph makes the whole bubble grabbable, not just the text — `dragEl` is still what visually moves. A `hitEl` with the `.blocked` class (a choice bubble frozen out while a blank is pending, see `js/main.js`) never starts a drag. Skips targets with the `.closed` class as drop points. No game/DOM-render knowledge beyond drag visuals and those CSS classes. **Two guards keep a multi-touch gesture from becoming two moves**, and both are load-bearing on a phone: a module-level `activeDrag` means only one drag can be live across all three `initDrag` calls, and each drag records the `pointerId` it began with, which every `pointermove`/`pointerup`/`pointercancel` handler checks before acting. Without them a second thumb on the other choice bubble puts two closures in the dragging state, the window `pointerup` from the first lift fires for *both* (two letters appended to one corner from one gesture, only one of them undoable), and moves from either finger drag both letters. `pointercancel` is handled alongside `pointerup` and runs the same cleanup minus the `onDrop` — if the browser takes the gesture away (system gesture, interrupting call, too many touch points) and nothing resets, the letter stays `position: fixed` mid-flight and the next unrelated `pointerup` anywhere on screen drops it wherever the pointer happens to be. Cleanup lives in one `endDrag()` for exactly that reason; a second copy is how the two paths drift. `main.js` calls it once per choice bubble (two times total), once more for `#blank-bubble` (the preview bubble is never draggable, blank or otherwise), each with targets = the four corners and its own `hitEl`/`dragEl` pair, wrapping `onDrop` in a closure that passes that bubble's index (or, for the blank, nothing — see below) through to the relevant handler.
- `js/ui.js` — pure render functions (`renderCorner`, `renderCornerSymbol`, `renderLetter`, `renderScore`, `flashInvalid`, `renderClosedCorner`, `resetCornerVisuals`, `renderGameOver`, `hideGameOver`, `renderUndoAvailability`, `renderBlankPickerOptions`, `showBlankPicker`, `hideBlankPicker`, `renderBlankBubble`, `setChoicesBlocked`, `renderEnvBadge`). No game logic. **Splash/objective additions:** `renderModeOptions(containerEl, modes)` and `renderDifficultyOptions(containerEl, difficulties)` build the two splash button groups from plain data (a difficulty button is just its label; the tiers used to carry a `note` naming how many goals the tier could deal, and that was removed along with `dealSizeRangeFor` — the range overlapped too much between tiers to tell them apart); `showSplash`/`hideSplash`/`renderSplashStep(modesEl, difficultyEl, step)` drive the two-step flow; `renderObjectiveFlag(flagEl, badgeEl, {visible, done, total})` and `pulseObjectiveFlag(flagEl)` drive the edge flag; `renderObjectiveList(listEl, objectives)` renders a snapshot's objective array and is shared by the panel and the game-over summary (it clamps `current` for the meter while printing the raw number, and gives `enduring` objectives no meter at all, since their goal is a limit rather than a target; it also emits the leading `.objective-symbol` cell, reading `objective.params?.corner` — no objective type declares itself "corner-scoped", the param being present *is* the signal — and emits the cell empty when there is no corner, so every description starts at the same x); `showObjectivePanel`/`hideObjectivePanel`; `showHowToPlay`/`hideHowToPlay`, which only toggle `hidden` on `#how-to-play` — its content is static markup, so there is deliberately no `renderHowToPlay`; `renderVerdict(labelEl, text)` writes the game-over headline; `renderGameOverObjectives(listEl, objectives)` fills the game-over summary and hides it entirely when there were no objectives. `renderCorner(cornerEl, word, blankIndices = [])` rebuilds the corner's `.word` span's children rather than setting `textContent`: characters at positions listed in `blankIndices` (see `js/gameState.js`) are wrapped in a `.blank-letter` span (styled gold via `--accent`, `css/style.css`), everything else is a plain text node — every call site passes the corner's `state.blankIndices[corner]` (`main.js`) so this stays in sync with which letters were placed via the blank. `renderCornerSymbol(cornerEl, corner)` fills that corner's `.corner-mark` span with its shape badge (`aria-hidden` — the shape is how the objective list *names* the corner, not information in its own right); `main.js` calls it once per corner at startup, since the badge never changes. `renderLetter` is generic — used for both choice-letter elements and the preview-letter element. `renderClosedCorner`/`resetCornerVisuals` only toggle the `.closed`/`.invalid` classes on the corner div itself — there's no separate submit button to enable/disable. `renderUndoAvailability(undoBtn, available)` toggles `undoBtn.disabled`. `showWordFeedback(cornerEl, wordLength, points, blankAwarded = false)` takes an optional fourth argument; when true it adds a third `.word-feedback-blank` ("Blank Tile Earned") span alongside the length/points ones — `main.js` passes `word.length >= BLANK_AWARD_LENGTH && !hadBlank` for it, so the message and the actual blank award (`awardBlankIfEligible`, called separately right after) always agree on both the length threshold and the "word already contains a blank" exclusion (see "Blank letter" below). `renderBlankPickerOptions(gridEl)` builds the 26 `.blank-picker-btn` letter buttons into `#blank-picker-grid` once at startup (`main.js` then attaches a single delegated click listener, rather than one per letter). `showBlankPicker`/`hideBlankPicker` toggle the `hidden` attribute on `#blank-picker`. `renderBlankBubble(slotEl, pending)` toggles `hidden` on `#blank-slot`. `setChoicesBlocked(bubbleEls, blocked)` toggles the `.blocked` class on the two `.choice-bubble` elements. `renderEnvBadge(badgeEl, label)` writes the top-bar environment badge and hides it again when `label` is empty — which environment deserves which label (or none) is decided in `js/env.js`/`main.js`, not here. `renderBestScore(rowEl, valueEl, score)` fills one game-over best-score row, or hides the row entirely when `score` isn't a number — so a missing best (nothing recorded yet, or the request failed) shows nothing rather than a placeholder dash.
- `js/main.js` — wires modules together, owns the turn loop and corner-tap handlers, awaits `loadWordList()` before enabling drag. `start()` opens by calling `renderEnvBadge(envBadgeEl, isProduction() ? null : 'Test')` — the single line that decides whether the TEST badge shows, before anything else happens, so a mid-load error can't leave a test build looking like production. `drawNextLetter()` draws one fresh letter into `state.nextLetter` (the preview) and re-renders `#preview-letter`, passing `getRandomLetter` both current choice slots' letters (`state.choices.filter(Boolean)`) so the vowel/consonant no-3-of-a-kind rule in `letterSource.js` can see them. `advanceChoice(index)` is the refill step: it moves the current `state.nextLetter` into `state.choices[index]`, re-renders that bubble, then calls `drawNextLetter()` to draw a new preview — this "queue advances" behavior (both choice slots pulling from one shared upcoming-letter preview) is the core mechanic, replacing the old three-choice system's independent per-slot redraw. `initRound()` draws both choice slots fresh (unconstrained for slot 0, constrained against slot 0 for slot 1 — so the two choices are free to share a category) and then calls `drawNextLetter()` once, so the preview is the one draw constrained against both choices. `handleDrop(index, targetName)` (guarded by `state.blankPending` — a normal choice can't be dropped while a blank is pending, on top of the `.blocked` class already stopping the drag from starting) appends `state.choices[index]` to the target corner, closes the corner immediately if the resulting letters have no valid completion (rechecked after every append, not just once 5+ letters), then calls `advanceChoice(index)`, and records `lastMove = { type: 'choice', ... }` for undo. Each `.corner` has a `click` listener calling `handleSubmit(cornerEl.dataset.corner)` directly — the corner box itself is the submit button; `handleSubmit` is also a no-op while `state.blankPending` is true, since word submission is disabled until the blank is placed. `handleSubmit` only scores when `word.length >= MIN_WORD_LENGTH` (`3`) *and* `isValidWord(word)` — a dictionary-valid word shorter than that is treated the same as an invalid one (shake, corner left as-is), so the player can keep building past it rather than being stuck. On a valid submit, `handleSubmit` first reads `state.blankIndices[cornerName].length > 0` into `hadBlank` (before `clearCorner` resets it) and calls `awardBlankIfEligible(word, hadBlank)`, which sets `blankPending` only when `!hadBlank && word.length >= BLANK_AWARD_LENGTH` (`5`, the one tuning knob for the length side of this feature) and re-renders the blank bubble/blocked choices via `renderBlankState()` — see "Blank letter" below for why a word containing a blank-derived letter is excluded. `handleBlankDrop(targetName)` (the `onDrop` for `#blank-bubble`'s `initDrag`) just records `targetName` in the module-level `pendingBlankCorner` and opens `#blank-picker` — it doesn't touch game state yet, since the letter isn't chosen. `handleBlankLetterChosen(letter)` (wired to a single delegated click listener on `#blank-picker-grid`) is what actually appends `letter` to `pendingBlankCorner`'s word via `appendBlankLetterToCorner` (not `appendLetterToCorner` — this is what marks the position gold and blank-award-ineligible), runs the same immediate dead-end closing check as `handleDrop`, clears `blankPending`, hides the picker, and records `lastMove = { type: 'blank', corner, closedNow }` — there's no `letter` needed in that record since undoing a blank placement never restores a specific letter into a slot, it just re-arms `blankPending` (see "Undo" below). `endGame()` is the single game-over path (called from both `handleDrop` and `handleBlankLetterChosen`, replacing the direct `renderGameOver` calls those used to make): it shows the overlay immediately using the module-level `cachedBests` — seeded by a `fetchHighScores()` at startup that is deliberately *not* awaited, since the bests are only needed on the game-over screen and shouldn't delay the first turn — then posts the game via `submitGame` and re-renders with the bests the server returns, so a new personal or all-time high appears on the same screen that set it. A `gameRecorded` flag makes the post idempotent, and a failed post is silent (the overlay just keeps showing the previous bests, or none). The `submitGame` call passes `objectives.finish()`'s snapshot as `result`, which is what carries the mode, verdict, and per-objective outcomes into the database. `renderBests(view)` reads the snapshot's `mode.id` (taking the one `endGame` already has, rather than asking for another) and renders nothing unless it's `endless` — only Endless is ranked, and `readBests` filters to match (see "Recording objective results"). `endGame` also resolves the objective verdict: `objectives.finish()` returns the final snapshot, from which it writes the headline (`'You Win!'` only when the status is `won`; an endless game finishes `active` and keeps `'Game Over'`) and fills `#game-over-objectives`. **Splash flow:** `startGame(mode)` replaced `resetGame` as the single entry point for beginning play — it rebuilds `state`, calls `objectives.reset(mode)` (which re-runs the mode's `selectObjectives()`, so a pool-backed mode re-rolls per game), re-renders everything including a fresh `initRound()`, and hides the splash; `#new-game-btn` is wired to `returnToSplash` instead, so every game starts from the mode choice. **How to Play:** three listeners in `start()` and nothing else — `#hint-bar` opens `#how-to-play`, `#how-to-play-close` and a backdrop-only click on the overlay itself close it (the same pair `#objective-panel` uses) — plus a `hideHowToPlay` in `startGame` so the overlay can't survive into a fresh board. There is no state to track: the overlay's content never changes, and the game keeps running behind it (nothing is paused, and `body.game-over` already hides `#hint-bar`, so it can't be opened over the game-over card). `handleModeChosen(modeId)` either starts immediately (Endless) or calls `showDifficultyStep(modeId)`, which rebuilds the tier buttons from `listDifficulties()` alone — the buttons carry nothing but their labels. A tier fixes the combined `cost` rather than the number of objectives, and neither of the two things that could be shown instead survived: the deal-size range overlapped too much between tiers to discriminate, and the budget itself reads as a target next to the score badge because the game already means "score" by "points". The mode buttons are rendered only *after* `loadWordList()` resolves, replacing the markup's `.splash-loading` placeholder, so a first tap can't start a game whose word checks would throw. **Objective HUD:** `renderObjectiveState(view)` renders the snapshot it is handed and nothing else — no game state — and is subscribed via `objectives.onChange`, so it also re-renders on the rewind an undo performs; `view` defaults to `objectives.snapshot()` for the direct calls that have none, and `endGame` deliberately makes no such call at all (see "The HUD" under "Objectives"). It bumps the flag (`pulseObjectiveFlag`) only when a `current`/`status` signature actually changes, since the runtime notifies on every event and most events move nothing an objective cares about; `lastObjectiveSignature` is cleared in `startGame` so a new game's first render can't be mistaken for progress. A module-level `lastMove` variable holds a single-level undo record, tagged by `type` (`'choice'`: `{index, corner, closedNow, prevChoiceLetter, prevNextLetter}`, or `'blank'`: `{corner, closedNow}`) written by `handleDrop`/`handleBlankLetterChosen` and consumed by `handleUndo` (wired to `#undo-btn`), which branches on `lastMove.type`. See "Undo" below for the full behavior. **Objective wiring** (see "Objectives" below) is confined to: the module-level `objectives` runtime (created with `NO_OBJECTIVES` and swapped to the chosen mode by `startGame` — there is no build-time mode constant any more), an `objectives.emit(...)` call at each of the seven moments in `events.js`, `objectives.mark()` at the top of `handleDrop`/`handleBlankLetterChosen` (stored as `objectiveMark` on `lastMove`), `objectives.rewindTo(lastMove.objectiveMark)` at the top of `handleUndo` (before the type branch, since both branches reverse exactly one move), `objectives.commit()` where `handleSubmit` clears `lastMove`, `objectives.reset(mode)` in `startGame`, `objectives.onChange(renderObjectiveState)` in `start()`, and `objectives.emit(GAME_ENDED)` + `objectives.finish()` in `endGame`. `maybeEndGame()` replaces the old bare `if (state.gameOver) endGame()` at the end of `handleDrop`/`handleBlankLetterChosen` (and is now called from `handleSubmit` too, since completing an objective can end a game on a *submission* — something the corner-closure rule alone could never do). `awardBlankIfEligible` gained a leading `cornerName` parameter purely so the `BLANK_AWARDED` event can name the corner.
- `js/objectives/*.js` — the objective system, seven modules; see "Objectives" below for the design. `events.js` (the event vocabulary `main.js` emits, with every payload shape documented, plus which events survive an undo), `difficulty.js` (the `Difficulty` tiers — easy/medium/hard/expert — their order, labels, and `assertDifficulty`; a tier is only a name here, what it is *worth* lives in `POINT_BUDGETS`), `definitions.js` (the catalog of objective *types* and their defaults; seven entries — `wordsOfLength`, `words`, `wordsStartingWithVowel`, `totalScore`, `wordsInCorner`, `cornerOnlyLength`, `cornerWordLimit` — with no knowledge of difficulty at all: `resolveParams` layers only defaults → explicit params), `tracker.js` (specs → live instances, folding events into progress, resolving each objective's status), `modes.js` (which objectives are in play and what ends the game; `NO_OBJECTIVES`/`challenge`/`defineMode`/`createMode`, the `GAME_MODES` table with its `endless` and `objective` rows, **and the whole balancing surface** — `POINT_BUDGETS`, the priced `OBJECTIVE_POOL`, `exclusionKeys`/`selectWithinBudget`/`feasibleDealSizes`, and a module-load validator that rejects an unspendable budget, a missing tier budget, a bad `cost`, or an unknown type), `runtime.js` (the single object `main.js` holds: event log, counters, verdict, undo-by-replay), `index.js` (the facade — `main.js` imports from here and nothing else in the directory).
- `src/index.js` (project root, **not** under `public/`) — the Worker entry point. Its `fetch` handler routes `POST /api/games` and `GET /api/scores` to `src/api/`, and hands anything else to `env.ASSETS.fetch(request)`. Worth understanding: static assets are matched *before* the Worker runs (that's the default with `[assets]` in `wrangler.toml`, absent `run_worker_first`), so this handler only ever sees `/api/*` plus paths that match no file — which is why the non-API branch just delegates back to the assets binding for its 404 rather than inventing one.
- `src/api/games.js`, `src/api/scores.js`, `src/api/shared.js` — the two route handlers plus their shared helpers. `shared.js` holds `json()` and `readBests(env, playerId)`, which runs the two `MAX(score)` queries as one `env.DB.batch(...)` and returns `{ globalBest, personalBest }` — the identical shape both routes return, so the client has one response format to handle; both queries filter on `mode_id = 'endless'` (`RANKED_MODE`), since only Endless is ranked — see "Recording objective results" below. `games.js` validates every numeric field as a non-negative integer under a generous cap and rejects payloads whose per-length word counts don't sum to `wordsTotal`; those checks exist to keep a typo or stray script out of the dataset, not to stop a determined cheater (nothing client-side can), so widen the caps rather than working around them if real play ever exceeds them. `modeId`/`difficulty`/`outcome`/`outcomeReason` are validated against literal lists mirroring the client's tables, so a typo is a 400 rather than a mode that quietly splits the dataset in two, and two cross-field invariants are enforced: a game with no objectives can't carry a verdict, and a `won` game must have every objective complete. `canonicalParams()` re-serializes each objective's params with its **keys sorted** before storing them — that string is the GROUP BY key for the per-objective success rate, so two clients serializing the same tuning in different key orders have to land in the same group. A malformed objective fails the whole request rather than storing a partial deal, which would skew the very rates the table exists to measure.
- `db/schema.sql` (project root) — the `games` and `game_objectives` tables plus their indexes. Both databases use it. Apply it with `npm run db:init` (local), `npm run db:init:staging`, or `npm run db:init:production`. Every statement is `IF NOT EXISTS`, which makes re-running it safe but also means it will **not** add columns to a table that already exists — changes to an already-deployed database go in `db/migrations/` as well as here, so a fresh database still skips straight to the end state. (A test worth repeating after any schema change: build one database from `schema.sql` and another from the old schema plus the migration, and diff `PRAGMA table_info` and the index list. They must match.)
- `db/migrations/*.sql` (project root) — ordered, run-once migrations for databases that already exist. `001_objective_results.sql` adds the mode/difficulty/verdict columns to `games` and creates `game_objectives`. Deliberately **not** idempotent: SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so a second run fails with "duplicate column name" — which is the intended signal that it already landed. Apply with `npm run db:migrate` / `:staging` / `:production`.
- `wrangler.toml`, `package.json` (project root) — `main = "src/index.js"` plus `[assets] directory = "./public"` is the Worker-with-static-assets setup; `directory` is what keeps everything else out of the deploy, and `binding = "ASSETS"` is what makes `env.ASSETS` available to `src/index.js`. `[[d1_databases]]` binds `env.DB`. The top-level block *is* the production environment; `[env.staging]` below it overrides the Worker name and the D1 database. Bindings are never inherited by a named environment, so `[env.staging.assets]` and `[[env.staging.d1_databases]]` are repeated in full — delete either one and the staging Worker quietly loses its assets or its database rather than failing loudly. `package.json` exists only for `wrangler` and for the deploy/db scripts (see the table under "Environments"); the game still has no runtime dependencies and no build step. Two script details worth keeping: `deploy` is an alias for `deploy:staging`, so the habitual `npm run deploy` can't hit production; and `deploy:production` passes `--env=""`, which is how wrangler wants the top-level environment named explicitly once any named environment exists (a bare `wrangler deploy` still targets production, but warns). Cloudflare Workers Builds runs `npx wrangler deploy` directly, not through npm, so it is unaffected by the alias — if that build command is ever changed to `npm run deploy`, master pushes would start deploying *staging*.
- `data/wordlist.txt` — ENABLE1 word list, uppercase, one word/line, public domain. See `data/WORDLIST_LICENSE.txt` for provenance (chosen over NASPA's NWL2023 because that source has no license — see "Word list decision" below).

## Architecture rule
Keep layers separate: state / input / rendering / validation / scoring are
independent modules that only talk through plain function calls from
`main.js`. Don't let e.g. `input.js` touch `gameState` directly, or
`ui.js` contain game rules.

Objectives are the same rule taken one step further: they observe the game
through an event stream `main.js` emits and never read game state at all,
so game rules and objective rules can each change without disturbing the
other. Keep it that way — an objective that reaches into `state` is the
thing this design exists to prevent. See "Objectives" below.

## Word list decision
NASPA's official NWL2023 (via github.com/scrabblewords/scrabblewords) has
no LICENSE and includes copyrighted Collins/NASPA definitions — not safe
to ship in a published game. Using ENABLE1 instead (public domain,
words-only, close-but-not-identical Scrabble-legal approximation). If
official NWL accuracy matters later, revisit licensing that source
directly rather than scraping the unlicensed repo.

## Current prototype status
**The game opens on a splash screen** (`#splash`, which covers the board
from first paint) offering two modes. **Endless** is the game exactly as
production has always played it: no objectives, no verdict, ends when all
four corners close. **Objective** asks for a difficulty first (Easy /
Medium / Hard / Expert) and then deals a random set of objectives costing
exactly that tier's points budget — so the *number* of goals varies from
game to game, and Easy might be one demanding goal or four small ones. Each corner wears a small shape badge (square NW, circle NE, triangle SW,
diamond SE), and an objective bound to a corner leads with
that shape rather than naming a direction — see "Corner symbols" below. A gold flag on the right edge of the board carries a
`done/total` badge, bumps when an objective advances, and opens a panel
listing every objective with a progress meter. Completing them all ends
the game as a win on the spot, corners still open; the board closing first
ends it as a loss. Either way the game-over card names the verdict and
lists the objectives in their final state. "New Game" returns to the
splash, which is the only way to change mode or difficulty.

The rest of the board is unchanged: two interchangeable letter choices sit in the center row, each
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
top-right, opposite the "Word Corners" title. A "How to Play" button pinned
along the bottom opens the rules overlay — see "How to Play overlay" below.

A corner closes (shaded dusty rose, drag/tap-submit disabled) as soon as no
dictionary word starts with its current letters
(`hasWordWithPrefix` in `wordValidator.js`) — rechecked after every letter
is appended, from the very first letter onward, since a prefix that could
still become legal can lose that potential the moment the next letter is
added. When all 4 corners are closed the game ends: `#center-row` (undo, the preview,
and the two letter choices) and `#hint-bar` hide while `#top-bar` — and
so the score badge — stays visible, a centered overlay shows the final
score, "Your Best" and "All-Time Best" pulled from the database (each
line omitted if there's no number for it — and both omitted entirely in
Objective mode, which isn't ranked), and a "New Game" button that returns
to the splash. The finished game is posted to the database at that moment
— see "Backend" below.

Everything above describes the board itself, which is identical in both
modes — the only differences in Objective mode are the flag, the panel,
and the two extra ways a game can end. See "Objectives" below.

Two earlier turn systems led here and are **gone from the tree**: a
single live letter with a next-letter preview and a "Hold" slot (drag the
live letter to a corner or to Hold, next letter advances in), and the
three-interchangeable-choices system that replaced it. Both were kept
around as unreachable code for a while — hidden `#legacy-controls`
markup, `legacy*` functions in `main.js`, idle `currentLetter`/
`holdLetter` state, and their CSS — and all of it was deleted, since it
was code every future change had to read past to reach the live game. Git
history has it if the hold mechanic is ever wanted on the current board;
rebuild it against the two-choice-plus-preview turn loop rather than
restoring the old one, which assumed a different center row.

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

## How to Play overlay
The bottom bar (`#hint-bar`) is a button, and it opens `#how-to-play` — a
dismissible overlay of five illustrated rules. It is the simplest feature in
the codebase and should stay that way: **static markup, three listeners, no
state**. `ui.js` only toggles `hidden`; nothing renders into it.

**It covers only mechanics that are identical in every game mode.** That is
the constraint to hold onto when editing the copy, because one overlay
serves both Endless and Objective:

1. **Drag a letter** — either center letter, into a corner.
2. **Tap to score** — tap a corner to submit; real word, 3+ letters; a
   rejection shakes and leaves the letters alone.
3. **Longer is better** — stated as a direction, deliberately *not* as the
   `n*(n-1)/2` formula.
4. **Earn a blank** — 5+ letters wins one; drag it, pick any letter, use it
   immediately.
5. **Corners close** — no word can start with those letters; all four
   closed ends the game.

Three things are left out on purpose and shouldn't creep back in: the
scoring formula, any strategy advice, and anything mode-specific
(objectives, difficulty, the flag, the "you win" ending). A rule that has to
say "in Objective mode…" doesn't belong here — it belongs on the splash
blurb or the objective panel.

The exclusions are also why rule 5 says "when all four have closed, the game
is over" rather than describing the ending in full: that sentence is true in
both modes, where "and completing your goals wins early" is true in only
one.

## Objectives
Goals the game sets the player, drawn against a points budget set by the
difficulty tier they pick on the splash screen. **The system is live** —
it is what the "Objective" mode on the splash runs on. Endless is the same
runtime with an empty objective list, which the runtime detects and skips
all its bookkeeping for, so Endless plays exactly as the game always has.

**The catalog is deliberately small.** Seven definitions and two game
modes. An early draft shipped eleven definitions, a `RANDOM_POOL`, and a
three-level `CAMPAIGN_LEVELS` table on spec; all of it was removed before
any of it was used, and the catalog was rebuilt one objective at a time as
modes actually needed them. Keep doing that — add an objective when
something asks for it, not in anticipation.

### Corner symbols
The four corners are identified to the player by **shape**, not by cardinal
direction: NW is a square, NE a circle, SW a triangle, SE a diamond. A small
dimmed badge sits in each tile's outer corner, and a corner-scoped objective
leads with that same shape instead of naming a direction in its text —
"◆  Clear 5 words" rather than "Clear 5 words in the SE corner". The
directions were cognitive load with no payoff: the player has to map "SE" to
a place on screen every time they read a goal, where a shape is just
recognized.

Two things follow, and both matter:

- **The data model is untouched.** State, events, objective `params`, DOM
  ids, and the recorded `game_objectives` rows all still say
  `nw`/`ne`/`sw`/`se`. The shape is a lookup applied at draw time
  (`js/cornerSymbols.js`), so every objective row already collected stays
  comparable — a rename would have split each corner tuning's history in
  two at the version boundary, for a purely visual change.
- **A corner objective's `describe` no longer names its corner.** The
  strings in `definitions.js` describe only the task ("Clear 5 words here"),
  because the renderer supplies the corner as the leading symbol. The
  consequence to remember: the four per-corner variants of a pool rung now
  produce *identical* description text, so anything that identifies a row by
  its description has to add the corner back. `modes.js`'s pool validator
  does exactly that (`rowLabel`), and any future objective editor or debug
  listing will need to as well.

### `cost`, not `points`
Each pool row carries a **`cost`**: how hard that exact tuning is, in
budget points. It is deliberately not called `points`, because the game
already means *score* by that word — `event.points`, and `totalScore`'s
own `params.points`, which sits directly beside it on the same row:

```js
{ type: 'totalScore', params: { points: 230 }, cost: 6 }
```

Same reasoning keeps the budget off the difficulty buttons: a tier
labelled "8 points" next to a score badge reads as a target, not a
difficulty. The splash shows the range of *deal sizes* instead.

### The extension points
This is the shape the whole system is arranged around, and the thing to
preserve when adding to it. Each is edited independently of the others:

| To add… | Edit | Cost |
|---|---|---|
| an objective type | one entry in `definitions.js` + priced rows in `OBJECTIVE_POOL` | nothing else changes |
| a tuning of an existing objective | one priced row in `OBJECTIVE_POOL` | nothing else changes |
| a game mode | one row in `GAME_MODES` (`modes.js`) | appears on the splash automatically |
| a difficulty tier | one entry in `difficulty.js` + one number in `POINT_BUDGETS` | validator rejects a budget the pool can't spend |
| how demanding a tier is | one number in `POINT_BUDGETS` | nothing else changes |

A mode names *which* objectives are available and what each is worth; the
difficulty tier supplies only *how much* may be spent. That separation is
why "swap in objectives based on game mode and selected difficulty" is
`createMode(id, difficulty)` and nothing more.

### The Objective mode
`createMode('objective', tier)` deals a random set drawn from
`OBJECTIVE_POOL` costing **exactly** the tier's budget in `POINT_BUDGETS`
(Easy 4, Medium 8, Hard 12, Expert 16 — both tables are in `modes.js` and
are meant to be edited). Four things worth knowing:

- **A tier fixes the total cost, not the number of objectives.** Easy is
  one 4-cost objective, or two 2-cost ones, or a 3 and a 1, or four 1s.
  This is the whole point of the design: how *many* goals and how *big*
  each one is are free to vary as long as they sum to the budget.
- **Deal size is picked first, uniformly among the sizes that can be spent
  exactly, and only then is a combination found.** Without that, the search
  biases hard toward using every type — the "take a row" branches vastly
  outnumber the single "skip" branch at each step — and an Easy game would
  be four 1-cost objectives almost every time. With it, the four possible
  Easy sizes come up about equally (measured ~189/212/201/198 over 800
  deals).
- **At most one row per exclusion key.** A row claims its `type`, so rows
  sharing one are treated as alternative *tunings* and a player is never
  dealt "score 8 three-letter words" alongside "score 18" of them, where
  the first is just a milestone of the second. A **corner-scoped row also
  claims its corner**, so no two objectives are ever dealt against the same
  corner — see "One objective per corner" below for why. Together these cap
  a deal at one row per type, which is why Expert's budget of 16 needs
  6-cost rungs to be spendable.
- **Difficulty no longer touches an objective's params.** A harder tier
  buys bigger objectives *because it can afford dearer rows*, not because
  anything rescales — an emergent effect, and a measurable one (mean goal
  per objective is ~19 at Easy, ~55 at Expert).

`selectWithinBudget` throws if a budget can't be spent exactly, but that
should never be reached at runtime: a module-load validator in `modes.js`
checks every mode's every tier, plus that each pool row names a real
definition and carries a positive integer cost. A pool that can't pay a
budget is a startup error naming the tier, not a player picking Hard and
getting nothing. Keep **some 1-cost rungs in the pool** so any remainder is
always fillable. A type may skip its own 1-cost rung deliberately, to put
itself out of reach at the smallest budgets — `cornerOnlyLength` (cheapest
4) and `wordsStartingWithVowel` (cheapest 2) both do — as long as other
types still carry 1-cost rows. The module-load validator is what actually
proves each tier spendable; the rung rule is the habit that keeps it true.

The draw happens inside `selectObjectives()`, which the runtime calls at
game start and on every reset, so each new game re-rolls rather than
replaying the set the mode object was built with.

### One objective per corner
The three corner-scoped types make demands of a single corner that don't
survive being combined. "Clear 5 words here" beside "score fewer than 2
words here" is unwinnable outright; "land one 6-letter word here and
nothing else" beside "clear 5 words here" is winnable *only* if the
6-letter word happens to land first, since reaching `count` freezes
`cornerOnlyLength` COMPLETE before a wrong-length word can violate it — a
rule the player is never shown, so in practice it plays as a trap. Nothing
in the selector saw any of this: the three are distinct `type`s, and the
one-row-per-type rule let all three land on the same corner.

The fix generalizes the rule the selector already had rather than adding a
second one. `exclusionKeys(row)` (`modes.js`) returns what a row claims
exclusively — always `type:<type>`, plus `corner:<corner>` when the row has
a `corner` param — and `findCombination` refuses a row whose key is already
claimed. **No objective type declares itself corner-scoped; carrying a
`corner` param *is* the signal**, the same convention `renderObjectiveList`
uses to decide whether to draw a shape, so a future corner type is covered
with no further work.

Two things this deliberately does *not* do, both worth knowing before
changing it:

- It bans benign same-corner pairings too (`cornerOnlyLength` beside
  `cornerWordLimit` is satisfiable). Accepted: the alternative was a
  pairwise conflict table that grows with the catalog and that someone has
  to remember to extend, which is exactly the cost the extension-points
  table above exists to avoid. It also spreads goals across the board,
  which is a better game.
- It says nothing about conflicts that aren't corner-scoped. If two types
  ever contradict each other *globally*, this mechanism won't catch it —
  that would want a real requirements algebra (each definition declaring
  abstract claims like `minWords`/`maxWords` per scope, with satisfiability
  derived), which was considered and judged over-engineered for a
  six-entry catalog.

Feasible deal sizes are unaffected, and the module-load validator still
proves every tier spendable, because the constraint lives *inside*
`findCombination` rather than filtering its output. It can't bite:
all four corner variants of every rung exist at the same cost, and 4
corners outnumber the 3 corner-scoped types, so any deal that would have
duplicated a corner can be remapped instead of dropped. (Measured: 16,000
deals across the four tiers, every one spending exactly, none repeating a
corner or a type, and the same deal-size ranges as before.)

**These numbers have not been playtested.** Every `cost` and every budget
was chosen by reasoning about the scoring curve and how long a board
survives, not by playing games. Two independent dials to turn if a tier
feels wrong, both in `modes.js`: a row's `cost` (that tuning is mispriced
relative to its peers) and `POINT_BUDGETS` (the whole tier is too heavy or
too light). Reprice a row and every tier that can afford it shifts at
once, which is the point — but it also means a mispriced row is felt
across the board.

### The layers
Five, each ignorant of the one above it:

1. **`events.js` — the vocabulary.** The only coupling to the game.
   `main.js` calls `objectives.emit(type, payload)` at seven moments
   (game started, letter placed, word scored, word rejected, corner
   closed, blank awarded, game ended). Payloads are denormalized on
   purpose: every field an objective could want is on the event, so no
   objective ever reads `gameState` and the architecture rule holds.
   Nothing in `gameState.js`/`ui.js`/`input.js` knows objectives exist.
2. **`difficulty.js` — the tiers.** `Difficulty.EASY|MEDIUM|HARD|EXPERT`,
   plus `DIFFICULTY_ORDER` (easiest first — a future "next difficulty"
   button reads it), labels, `DEFAULT_DIFFICULTY` (`easy`), and
   `assertDifficulty`. A tier is *only a name here* — what it is worth
   lives in `POINT_BUDGETS` (`modes.js`), so this file stays a plain
   vocabulary that the splash, the budget table, and any future
   tier-dependent feature can each key off independently, without this
   file knowing
   about either. `assertDifficulty` throws on an unknown tier for the
   same reason `getDefinition` does — a typo in a mode or a saved
   preference should surface immediately, not hand the player the wrong
   tuning silently. `null` is a legal value meaning "no tier, use plain
   defaults".
3. **`definitions.js` — the catalog.** One entry per objective *type*,
   parameterized, so "8 three-letter words" and "18 three-letter words"
   are the same definition at two tunings, and "4 words of 5+ letters" is
   the same definition again with a different `length`. Definitions are
   pure functions over `(progress, event, params)` — no DOM, no state, no
   randomness, which is what makes replay (below) safe.

   Ships **seven**: `wordsOfLength` (`count`, `length`, `exact`), `words`
   (`count`), `wordsStartingWithVowel` (`count`), `totalScore` (`points`),
   `wordsInCorner` (`count`, `corner`), `cornerOnlyLength` (`corner`,
   `length`, `count`), `cornerWordLimit` (`corner`, `limit`).

   `wordsStartingWithVowel` counts scored words whose first letter is one of
   A/E/I/O/U — Y is not one, and a blank-derived opening letter counts the
   same as a drawn one, since the event carries only the finished word. The
   vowel set is a small local constant in `definitions.js` rather than
   `isVowel` imported from `js/letterSource.js`: that one exists to balance
   the letter *draw*, and importing it would make a definition depend on a
   game module. They agree today and are free to diverge.

   The last two are **restrictive**: a goal you're climbing toward isn't
   the whole story, there's also a way to fail the objective *before* the
   game would otherwise end, via an optional `failed(progress, params)`
   hook — checked on every event, ahead of the normal goal check (see
   `resolveStatus` in `tracker.js`). They're the first two definitions to
   use it; every earlier one only ever fails via `finalizeObjectives` at
   game end, when time simply runs out on an unmet goal. Since Objective
   mode's default `endOnFailure: true` ends the whole run the instant any
   objective fails, a restrictive objective failing mid-game is an instant
   loss, not a missed goal — reachable on whatever specific move triggered
   it, corners still open, other objectives possibly nearly done. That's
   deliberate, not a side effect to guard against.

   `cornerOnlyLength` — land `count` words of exactly `length` in `corner`,
   and *never* a different length there. It is not `enduring`: once
   `count` is reached with no violation, it resolves `complete` and
   freezes the normal way (the goal-reached path every non-enduring
   objective already takes), so a wrong-length word in that corner *after*
   completion doesn't retroactively fail it — the obligation was already
   met. A wrong-length word *before* completion fails it on the spot. Its
   progress is `{ count, violated }` rather than a bare number, since
   `failed` and the goal check need to read independent facts off the same
   event.

   `cornerWordLimit` — score fewer than `limit` words in `corner`, total,
   any length; 0 is a pass. It *is* `enduring` (see below), so unlike
   `cornerOnlyLength` it never resolves early — surviving to game end
   without hitting `limit` is the whole condition, same as any other
   enduring objective. It does not hold the *game* open, though: the win
   check ignores enduring objectives entirely (see "How a game ends"), so
   a kept limit resolves complete the moment the last target does. Built on the `counting()` helper (progress is a
   plain running count) with `enduring`/`failed` added afterward, since
   `counting()` alone has no notion of either.

   **Difficulty is deliberately absent from this file.** Params resolve in
   two layers — `defaults` < the spec's own `params` — and nothing here
   knows tiers exist. How hard a given tuning is gets expressed as a
   `cost` on the pool row in `modes.js`, which is also where the balancing
   now lives. An earlier design had per-definition and per-spec
   `byDifficulty` tables rescaling every objective to the player's tier;
   the budget replaced all of it, and `defineObjective`'s tier-coverage
   validator went with it.
4. **`tracker.js` — live objectives.** Turns plain-data *specs* into
   instances with progress and status (`active`/`complete`/`failed`). A
   spec is `{ type, params }` with optional `id`/`description` overrides,
   and `params` may be partial — the definition's defaults fill the rest.
   A pool row is a spec plus a `cost`; no logic here reads it, but the
   instance carries it through to the snapshot so a recorded result can say
   what a completed or failed objective was priced at. Specs being plain
   JSON is what lets modes, the priced pool, and (later) server-delivered
   objectives all be the same thing.
5. **`modes.js` — what's in play and what ends the game.** A mode
   supplies `selectObjectives()` (called fresh at game start and on every
   reset, so a mode that varies its set re-rolls per game), `difficulty`
   (carried for labelling only, now that params don't depend on it),
   `limits` (`moves`, `seconds`),
   and the flags `endOnComplete`/`endOnFailure`. The standard evaluator
   handles win/lose; a mode can override `evaluate` outright if it needs
   different rules. Built-ins: `NO_OBJECTIVES` (the shipped default),
   `challenge({objectives, difficulty, limits})`, and `createMode(id,
   difficulty)`, which compiles a row of `GAME_MODES` into a live mode.

   `GAME_MODES` is the pure-data mode table — one row per playable mode,
   in the order the splash lists them: `endless` and `objective`. A row
   supplies its objectives one of two ways: a fixed `objectives` array
   (which may name a type outright, `'wordsOfLength'`, or give a spec with
   overrides), or a `pool` plus `budgets` for a priced draw. It also
   carries the splash copy (`label`, `blurb`) and `usesDifficulty`, which
   is what the splash reads to decide whether to ask for a tier at all —
   Endless skips that step. Adding a row is all it takes to put a new mode
   on the splash.

   This file also owns the draw: `POINT_BUDGETS`, the priced
   `OBJECTIVE_POOL` (with a `perCorner` helper so the four corner variants
   of a rung are one line rather than four), `exclusionKeys` (what a row
   claims exclusively — its type, and its corner if it has one; see "One
   objective per corner"), `selectWithinBudget`,
   `feasibleDealSizes`, and the module-load validator.

`runtime.js` glues them together and is the only thing `main.js` holds.

### Undo is a replay, not a reversal
This is the design decision everything else follows from. The game has a
single-level undo that fully reverses a move; making every objective
implement its own reversal would be tedious and fragile, and would get
worse with every objective type added. Instead the runtime keeps the
events since the last checkpoint and *replays* them from a captured
baseline. `main.js` calls `objectives.mark()` before a move's events and
stashes the marker on `lastMove` alongside the existing undo record; the
existing `handleUndo` hands it back to `rewindTo()`. **An objective
author therefore never writes an undo branch and cannot get one wrong.**

Two consequences worth knowing:
- There is no "undo" event, and there must never be one — the rewind
  *is* the undo. Adding one would double-count.
- `WORD_REJECTED` is listed in `events.js`'s `DURABLE_EVENTS`: an invalid
  submission really happened, and undoing the drop before it doesn't
  unhappen it, so it survives a rewind while everything else in the
  rewound span is discarded. Put a type there only if it records an
  *action* rather than a state change.

`objectives.commit()` (called where `handleSubmit` already clears
`lastMove` — the same checkpoint) drops the log and rebaselines, so it
stays a few events long rather than growing all game. A marker from
before a commit throws if reused, rather than silently replaying wrong.

### How a game ends
There is no build-time switch any more — the splash picks the mode, and
`startGame(mode)` in `main.js` is the single entry point. What follows:

- Progress tracks automatically, undo included.
- Completing **every** objective **ends the game as a win immediately**,
  corners still open — `endOnComplete` defaults to true. Change that on
  the `GAME_MODES` row if objectives should ever become side-goals that
  let play continue to the usual all-corners-closed ending.
- **"Every objective" means every *target*.** `enduring` objectives are
  limits, not targets: they never report COMPLETE mid-game (only
  `finalizeObjectives` resolves them), so counting them toward the win
  would mean a deal containing one could *never* be cleared early — the
  player would have to grind the board closed with the limit live the
  whole time, where playing on can only lose a game already won. So
  `standardEvaluate` wins when every non-enduring objective is complete
  and *nothing* has failed; a limit being kept at that moment is a limit
  kept, which is exactly what `finish()` resolves it as an instant later.
  One guard: a deal of nothing but limits doesn't win on move zero for
  doing nothing (it plays to the normal ending instead). Such a deal
  can't currently be dealt — one row per type, and the single enduring
  type's rungs cost less than any budget.
- All four corners closing first ends it as a **loss**: `finish()` marks
  the unfinished objectives failed and the verdict comes back `lost`.
- The mode can end the game early. `maybeEndGame()` in `main.js` ends it
  when `objectives.status` isn't `'active'`, and `endGame()` calls
  `setGameOver(state)` so input stops even though corners are still open.
- `endGame()` calls `objectives.finish()`, which resolves the verdict:
  enduring objectives that never failed become complete, unfinished
  targets become failed, and the result is `won`/`lost`. Both `emit` and
  `finish` are idempotent after the game ends.
- With no objectives in play, `finish()` leaves the status `'active'` —
  an endless game was never a contest, so there is no verdict. Read
  `snapshot().finished` to tell "no verdict" from "not over yet".

### Adding to it
- **A new objective type**: one entry in `definitions.js` — `defaults` plus
  the progress functions — and **priced rows in `OBJECTIVE_POOL`, including
  a 1-cost rung**, so the draw can reach it and any remainder stays
  fillable. Most definitions are one declarative call to the `counting()`
  helper ("count matching events up to a number"); for other progress
  shapes the pattern is a plain object with its own
  `initial`/`advance`/`measure` — a maximum, a set stored as an array so it
  survives the replay round trip, or an `enduring` limit that can't be
  completed early, only survived, and resolves at game end. Nothing else
  changes — not the tracker, not the runtime, not `main.js`, not the UI.
  Note a new type also *raises the ceiling on deal size*, since deals take
  at most one row per type. If it is corner-scoped, give it a `corner`
  param and it is automatically excluded from sharing a corner with any
  other corner objective — see "One objective per corner" above.
- **A tuning of an existing objective**: another `OBJECTIVE_POOL` row with
  the same `type` and its own `cost`. The draw treats same-type rows as
  alternatives and picks at most one, so tunings never crowd each other out
  of a deal. This is how a 3-letter and a 4-letter word hunt coexist at
  wildly different counts without either needing its own definition.
- **A new game mode**: one row in `GAME_MODES` — it appears on the splash
  with no further work. If it needs rules the standard evaluator can't
  express, build it with `defineMode`/`challenge` and pass your own
  `evaluate`.
- **A new difficulty tier**: add it to `Difficulty` and `DIFFICULTY_ORDER`,
  and give it a number in `POINT_BUDGETS`. The validator refuses a budget
  the pool can't spend exactly, and the splash picks the tier up on its
  own. Nothing per-objective needs touching — that is the main thing the
  budget bought over the old per-definition tier tables.
- **The HUD**: `objectives.onChange(listener)` fires a serializable
  snapshot (`{mode, status, reason, finished, counters, objectives}`) on
  every change; each objective carries `description`, `current`, `goal`,
  `enduring`, `status`, plus `type`/`params`/`cost` (there for the recorded
  result rather than the HUD — see "Recording objective results").
  `main.js`'s `renderObjectiveState(view)` is subscribed to
  it and reads nothing else — no game state — which is what keeps the
  layering intact now that there *is* a UI. It **renders the snapshot it is
  handed**, defaulting to `objectives.snapshot()` only for the two direct
  calls that have none (`startGame`); asking for a second snapshot inside a
  listener that was just given one is pure duplication. Same reasoning
  applies to `renderBests(view)`, and it is why `endGame` does *not* call
  `renderObjectiveState` itself — `objectives.finish()` notifies its
  listeners before returning, so the flag and panel already show `final` by
  the time `endGame` continues. Note `current` is reported raw
  (214 against a 150-point goal reads 214); the renderer clamps it for the
  meter and prints the raw number. For `enduring` objectives `goal` is a
  *limit*, not a target, so `renderObjectiveList` gives them no meter — a
  bar filling up would read as progress when it means trouble.
- **A time limit** (`limits.seconds`) additionally needs a ticker in the
  UI calling `objectives.tick()`; otherwise the limit is only noticed
  when the next event arrives.

### Recording objective results
Every finished game stores one `game_objectives` row per objective it was
dealt, so **the costs and budgets above can be tuned from data rather than
from reasoning** — that is the whole reason the table exists. The rollup:

```sql
SELECT type, params, cost,
       COUNT(*) AS dealt,
       SUM(completed) AS completed,
       ROUND(AVG(completed) * 100, 1) AS pct
FROM game_objectives
GROUP BY type, params
ORDER BY pct;
```

`npm run db:objectives` (staging) and `npm run db:objectives:production`
run exactly that. A tuning near 100% is priced too cheap for what it asks,
one near 0% too dear. The sharper read is **across rows sharing a `cost`**:
they're interchangeable to the selector, so where their rates diverge, that
rung is mixing easy and hard work and some deals at that tier are far worse
than others — the specific worry recorded under "Not yet built".

Three decisions in that table are load-bearing:

- **Grouping is by *tuning*, not by type.** "Score 8 three-letter words"
  and "score 18" of them are one definition at two prices, and only the
  price is being tuned — so `params` is stored as canonical JSON with its
  keys sorted, and `(type, params)` is the group. `cost` rides along for
  the cross-rung read.
- **`final_value` is stored raw, not clamped to the goal.** How far *past*
  its goal a completed objective ran is what separates "demanding" from
  "the player would have hit that anyway" — a `words` objective completed
  at 24/9 was never really an objective.
- **A lost game still records what was achieved.** `objectives_complete /
  objectives_total` on the `games` row gives partial credit, so "lost, but
  3 of 4" is distinguishable from "lost with nothing done" without a join.

**Score is not ranked for Objective games.** `readBests` filters to
`mode_id = 'endless'`, and `main.js`'s `renderBests` correspondingly shows
no best-score lines on an Objective game-over card. An Objective game ends
the moment its goals are met, so its score measures *when it stopped*, not
how well it went — ranking it would reward picking a tier you can't finish,
and would let one mode's scores drown the other's. The score is still
recorded for every game, because next to a `totalScore` objective's goal it
is useful tuning data; it just isn't a leaderboard entry.

Note the live mode's `id` is the table row's id unsuffixed (`objective`,
not `objective-hard`) — the tier is in `difficulty` beside it, so every
Objective game groups without a `LIKE`.

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

One `games` row per *completed* game — all four corners closed, or an
Objective mode declaring the game won or lost. Abandoned games are not
recorded — an accepted gap, since there's no reliable moment to post one.
Each row carries the mode, difficulty, and verdict, the deal's
complete/total counts, then score, duration, total words, the 3/4/5/6+
length breakdown, blanks earned, the anonymous player id, and
`GAME_VERSION`. An Objective game additionally writes one
`game_objectives` row per objective it was dealt, in the same request;
`db/schema.sql` is the authoritative list, and "Recording objective
results" under "Objectives" explains what those rows are for.

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
`npm run db:games:production` does the same for production.
`npm run db:objectives` (and `:production`) runs the per-objective
success-rate rollup. A database created before a migration needs
`npm run db:migrate:*` — see `db/migrations/`. For real
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
- **Playtesting the costs and budgets.** Every `cost` in `OBJECTIVE_POOL`
  and every number in `POINT_BUDGETS` is still a first-pass guess — see the
  warning under "Objectives". The data to settle it *is* now being
  collected (`npm run db:objectives`), so this is waiting on played games
  rather than on plumbing. The specific thing to watch is whether rows
  sharing a cost really are comparable work: the selector treats a 4-cost
  corner objective and a 4-cost points objective as interchangeable, so if
  one is much harder, some deals at a tier will be far worse than others.
  Nothing retunes the pool automatically, and nothing should — read the
  rates, then edit `cost`/`POINT_BUDGETS` by hand.
- **Saying anything about a tier beyond its name.** The difficulty buttons
  are bare labels. They briefly carried a deal-size range ("2–4 goals"),
  which was removed: the ranges overlap badly and widen with every
  objective type added (a deal takes at most one row per type), so they
  discriminated between tiers by almost nothing. Don't reintroduce that
  one. A difficulty meter, or exposing the budget under a name that
  doesn't collide with score, would be the things worth trying.
- **Remembering the player's choice.** The splash asks every game; nothing
  persists the last mode/difficulty (localStorage? the database, next to
  the player id?). Undecided.
- **More objectives and more game modes.** Seven objectives, two modes.
  The catalog was deliberately emptied once already; add entries as modes
  need them rather than pre-seeding content tables.
- **A losing game-over screen that explains itself.** The card says "Game
  Over" and lists which objectives went unmet, but nothing distinguishes
  "the board closed on you" from "you failed an objective outright"; the
  verdict's `reason` (`objectivesUnfinished` / `objectiveFailed` /
  `outOfMoves` / `outOfTime`) is available in the snapshot for whoever
  wants to word it.
- **An Objective-mode scoreboard.** Objective games are recorded in full
  but ranked by nothing — `readBests` is Endless-only, so an Objective
  game-over card shows no bests at all. What "best" should even mean there
  is the open question (fastest win at a tier? longest streak? highest
  tier cleared?), and it needs a second query shape rather than a filter on
  the existing one.
- Initials/nickname entry on the game-over screen, and a real top-10
  leaderboard. The schema's `player_name` column and the
  `readBests`-shaped API response are the two places that would change.
- Any analysis/dashboard view over the collected games; right now
  reading the data means querying D1 directly, or the two `db:objectives`
  scripts for the one rollup that has been worth wiring up.
- Difficulty scaling (letterSource.js is set up to accept it — see above)
- Any persistent high-score / stats tracking across games
