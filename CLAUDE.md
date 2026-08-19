# Word Corners

Mobile-friendly word game. Four corners of the screen are word-building
zones; two interchangeable letters sit in the center with a smaller "next"
preview beside them, joined by a third wildcard bubble whenever the player
is holding an unspent blank. Drag either choice into a corner to append it to that
corner's word; that slot refills from the preview, and a fresh letter is
drawn into the preview — both slots pull from the one shared queue. Tap a
corner to submit it. A corner closes for good once no dictionary word
starts with its letters.

**This file is the "why".** It records decisions that aren't recoverable
from reading the code — things a future change needs to know and would
otherwise rediscover by breaking them. What each function, class or DOM id
*does* is deliberately not here: the code says that already, says it
accurately, and says it next to the thing being described. Whenever a fact
lives in two places one of them goes stale, and this document is the copy
that rots. If you need an inventory, read the file.

## Stack
Vanilla HTML/CSS/JS, ES modules, no build step, no runtime dependencies —
open `public/index.html` directly or serve `public/` statically and it
works, offline included.

Deployed as a **Cloudflare Worker with static assets**: one Worker serves
`public/` and handles `/api`, backed by a D1 (SQLite) database recording
one row per completed game. The API is strictly additive — nothing in
`public/js/` except `api.js` knows it exists, and the game stays fully
playable when it's unreachable.

Not Cloudflare **Pages**. An earlier version was, and the mismatch cost an
evening — see "Why a Worker, not Pages" before changing anything about the
deploy.

```
public/     everything served to the browser (the game)
  js/objectives/   the objective system
src/        the Worker: index.js routes, api/ handles /api/*
db/         D1 schema + ordered migrations
```
Only `public/` is uploaded as browser-reachable assets — that split is why
`CLAUDE.md`, `.claude/`, `db/` and `src/` aren't publicly served.

Where things live in `public/js/` (roles only — read the file for its API):
`main.js` wires everything and owns the turn loop; `gameState.js` mutable
data, no DOM; `ui.js` pure render functions, no game rules; `input.js`
pointer drag; `wordValidator.js` the dictionary; `scoring.js` the formula,
one function; `letterSource.js` the draw; `cornerSymbols.js` the four
shapes; `env.js` production-vs-not; `api.js` the only module that talks to
the server; `version.js` one constant. `objectives/` is its own layered
system — see "Objectives", and note `index.js` is the facade `main.js`
imports from.

## Environments
**Default to staging. Production is only ever deployed on purpose, by the
user's explicit say-so.** If a change hasn't been played on staging, it
doesn't go to production — and pushing it there is the user's call, not
something to fold into "finishing" a change.

|            | Worker                 | URL                                                   | D1 database            | Deploys via |
|------------|------------------------|-------------------------------------------------------|------------------------|-------------|
| production | `word-corners`         | https://word-corners.muenks-kevin.workers.dev         | `word-corners`         | Workers Builds, on every push to `master` |
| staging    | `word-corners-staging` | https://word-corners-staging.muenks-kevin.workers.dev | `word-corners-staging` | `npm run deploy:staging` (or a push to `dev`, if wired up) |

Same code and assets in both. The only differences are the Worker name and
which database `env.DB` points at, so a staging game can never land in
production's leaderboard.

Git mirrors this: **`dev` is the working branch**, `master` is production.
Merging `dev` into `master` is the deliberate act that ships. Never commit
straight to `master` — a push there is a production deploy. GitHub's
default branch is `dev`, but that's only a GitHub setting: Workers Builds
keeps its own production branch per Worker, and `word-corners` still
watches `master`. Changing one does not change the other.

| Command | What it does |
|---|---|
| `npm run dev` | wrangler dev on :8787, staging config, **local** D1 file. Touches nothing remote. |
| `npm run deploy` | Alias for `deploy:staging` — so the habitual command can't hit production. |
| `npm run deploy:staging` | Deploys staging. |
| `npm run deploy:production` | Deploys production by hand. Normally unnecessary and normally not yours to run — ask first. |
| `npm run db:init*` | Apply `db/schema.sql`. |
| `npm run db:migrate*` | Apply `db/migrations/` to an existing database. |
| `npm run db:games*`, `db:objectives*` | Recent games / the per-objective success-rate rollup. |

The `*` scripts default to staging; `:production` variants exist for each.

Anything that isn't the production hostname shows a gold **TEST** badge in
the top bar. That check (`js/env.js`) is a hostname *whitelist*, chosen so
the failure mode is a badge on production — loud and harmless — rather than
a missing badge on staging, which is the exact confusion the badge exists
to prevent. If the production URL changes, `PRODUCTION_HOSTNAME` changes
with it. Asking the server instead was rejected: the badge has to render
with no network, same as the rest of the game.

**Deploys ship the working tree, not HEAD.** `wrangler deploy` doesn't care
what's committed, so uncommitted edits go live on staging.

## Architecture rule
Keep layers separate: state / input / rendering / validation / scoring are
independent modules that talk only through plain function calls from
`main.js`. Don't let `input.js` touch `gameState` directly, or `ui.js`
contain game rules.

Objectives take that one step further: they observe the game through an
event stream `main.js` emits and **never read game state at all**, so game
rules and objective rules can each change without disturbing the other. An
objective that reaches into `state` is the thing this design exists to
prevent.

## Word list decision
NASPA's official NWL2023 (via github.com/scrabblewords/scrabblewords) has
no LICENSE and bundles copyrighted Collins/NASPA definitions — not safe to
ship. We use **ENABLE1** instead (public domain, words-only, a close
approximation of Scrabble-legal). If official NWL accuracy matters later,
license that source directly rather than scraping the unlicensed repo.

`wordValidator.js` holds the list as a **sorted array, not a `Set`**,
because the hot question is "could this prefix still become a word",
re-asked after every letter placed. From a `Set` that means scanning until
a match — the whole 172,823-word list when the answer is no, ~1.6 ms a
call. Both lookups are a binary search instead (~1600× faster on the prefix
check). Two things to preserve: the sort must use the same ordering as the
`<` comparisons in the search (plain `sort()` and `<` are both UTF-16
code-unit order — a locale-aware comparator would silently break it), and
the load sorts rather than trusting the file, which removes a silent
dependency on how `wordlist.txt` happens to be written.

## How the game plays
The splash (`#splash`, covering the board from first paint) offers two
modes. Mode buttons render only *after* the word list resolves, so a first
tap can't start a game whose word checks would throw.

- **Endless** — no objectives, no verdict; ends when all four corners close.
- **Objective** — asks for a difficulty, then deals a random set of goals
  costing exactly that tier's budget. Completing them all wins on the spot,
  corners still open; the board closing first loses.

Everything else is identical in both modes. Submitting a valid word of
`MIN_WORD_LENGTH` (3) or more scores it (`n*(n-1)/2`, superlinear by
design) and clears the corner; anything else — an invalid word, *or a valid
one shorter than 3* — shakes and leaves the letters alone, so the player
can keep building past it.

A corner closes as soon as no dictionary word starts with its letters,
rechecked after **every** letter from the first onward, since a prefix that
could still become legal can lose that potential on the very next letter.

The letter draw (`letterSource.js`) rolls vowel-vs-consonant first, then a
letter within that category, and never allows a third same-category letter
across the two choices + preview. The two choices *are* free to match each
other: the rule only binds the preview, because the preview is the only
draw made with both other letters already known. `CATEGORY_WEIGHTS`,
`LETTER_FREQUENCIES` and `MAX_SAME_CATEGORY_AMONG_CHOICES` are the tuning
knobs — the first rebalances vowels vs. consonants independently of
individual letter rarity.

### Input
Dragging is Pointer Events, one path for mouse and touch. Two guards there
are load-bearing on a phone and easy to remove by accident: only one drag
may be live across all `initDrag` calls, and each drag records its
`pointerId` and ignores every event that doesn't match. Without them a
second thumb on the other choice bubble puts two drags in flight, and one
lift appends two letters to the same corner with only one undoable.
`pointercancel` runs the same cleanup as `pointerup` minus the drop — if
the browser takes the gesture away and nothing resets, the letter stays
`position: fixed` mid-flight and the next unrelated `pointerup` anywhere on
screen drops it wherever the pointer happens to be.

### Undo
Single-level, not a history: one button reversing the most recent drop.
Another move or a valid submission clears it. Reopens a corner if that drop
had closed one. Hidden on the game-over screen along with the rest of the
center row, which sidesteps undoing a game-ending move.

Undo **banks the discarded preview letter**. Without that, drop-then-undo
is a free peek: undo restores every other piece of state exactly, so a
player could cycle it to shop for a preview letter they like. The letter
drawn during the undone move comes back on the next advance, so undoing
yields a second-guess but never new information.

Undoing a blank placement puts the blank back on the pile instead of
restoring a choice slot; nothing else differs, and the player is under no
obligation to re-place it.

### Blank letter
Crossing a `BLANK_SCORE_INTERVAL` (25) multiple of total score — 25, 50,
75... — awards a wildcard blank. It's a threshold on the running total, not
a per-word rule, so `awardBlanksForScore` compares `state.stats.blanksEarned`
(how many thresholds have been paid out so far) against
`floor(score / BLANK_SCORE_INTERVAL)` and can award more than one blank off
a single word if its points cross more than one mark at once. A blank
is **a third optional letter, not an interruption**: it sits in the center
row beside the two choices for as long as it goes unused, and everything
else about the turn — both normal choices, corner submission, undo —
carries on untouched beside it. `state.blanksHeld` is the whole of its
state.

That one rule is what the rest follows from:

- **Blanks stack.** Earning one while already holding one is a second
  blank, not a wasted award, since nothing forces the first to be spent.
  One bubble stands for the pile (they're interchangeable) with a `×N`
  badge from the second onward.
- **The picker dismisses** — backdrop or Cancel — returning the blank
  unspent. It used to have no way out only because the blank had to resolve
  before play could continue; that reason is gone, and dismissing is now
  the only way back from a blank dropped on the wrong corner that doesn't
  cost a move.
- **Undo returns the blank to the pile** rather than re-arming anything.
  It's an ordinary undo of an ordinary letter now.
- It **looks like a choice bubble** because it is one: same size, same
  teal, dragged the same way (the glyph flies, the bubble stays). Its
  underscore is drawn rather than typed — a text `_` sits low in its line
  box, and no vertical nudge survives `input.js` repositioning the element
  for a drag.
- The slot carries **no `.row-label`**, unlike the undo and preview
  columns. A label would make it the tallest column in the row and push the
  whole row into the per-corner objective flags on a 320×568 screen. The
  two choice bubbles have no label either, which is the point.

The blank is fully separate from the letter supply: not drawn from
`getRandomLetter`, and it neither consumes nor advances the preview.

Blank-derived positions stay marked for as long as they sit in an
unsubmitted word, which is what renders them in the bubbles' bright teal.
Since blanks are earned off total score rather than any one word, a word
that used a blank counts toward the next threshold exactly like any other —
there's no chain-blanks-off-each-other loophole to close here, because
reusing a blank doesn't score points for free.

The score badge in the top bar fills with a light teal tint tracking
progress toward the next threshold (`score % BLANK_SCORE_INTERVAL`), reset
to empty the instant a threshold is crossed — `renderScore` in `ui.js`
drives both the number and the fill from the same call.

### How to Play overlay
Five illustrated rules behind the bottom bar. The simplest feature in the
codebase and it should stay that way: **static markup, three listeners, no
state.** `ui.js` only toggles `hidden`; nothing renders into it.

**It covers only mechanics identical in every mode** — that's the
constraint when editing the copy, since one overlay serves both. Left out
on purpose: the scoring formula, strategy advice, and anything
mode-specific. A rule that has to say "in Objective mode…" belongs on the
splash blurb or the objective panel instead. It's also why the last rule
says only that all four corners closing ends the game: true in both modes,
where "and completing your goals wins early" is true in one.

## CSS gotchas
Two traps in `public/css/style.css` that cost an hour if rediscovered the
hard way:

- **`[hidden]` needs re-asserting.** Several elements carry an
  unconditional `display`, and an author declaration beats the UA
  stylesheet's `[hidden] { display: none }` at equal or lower specificity —
  so the element stays visible with the attribute set. Each such rule has a
  matching `#thing[hidden] { display: none; }`. Losing one is a silent "why
  is the splash showing both steps at once". (Worth collapsing to a single
  `[hidden] { display: none !important; }` near the top of the file;
  nothing currently wants to override it.)
- **`#center-stack` must stay transform-free.** A transformed ancestor
  becomes the containing block for the `position: fixed` letter `input.js`
  drags, throwing off its viewport coordinates.

Vertical space is carved into bands by `:root` custom properties
(`--top-band`, `--bottom-band`, `--center-band`), with `--corner-height`
being *whatever is left over, halved* — so tiles always fit the viewport
instead of colliding with the center row. `--small-bubble`,
`--choice-bubble` and `--center-row-gap` are the single knobs for the
center row's scale; everything in the row sizes off one of them so it
shrinks as a unit rather than one piece overflowing. Their minimums are
tuned to fit a 320px-wide screen — two small columns plus **three**
`--choice-bubble` ones (the blank sits in the third) and four gaps come to
~299px there.

The blank's column is declared whether or not a blank is in hand, and grid
tracks keep their width when empty, so a `:has(#blank-slot[hidden])` rule
drops the track while the slot is hidden. Without it the row sits visibly
left of center for most of a game. The cost is the reverse: earning or
spending a blank shifts the two choice bubbles sideways by half a column.
That trade was made deliberately — one shift at a moment the player caused
beats a permanently lopsided row.

One shape lesson worth keeping: a small bubble borrowing `.choice-bubble`
styling must override the **shadow** too. Inherited unchanged, a shadow
scaled for the large bubble blurs past a small one's edge and bleeds into
its neighbor — a real bug once, on the blank bubble back when it was
small. Nothing borrows that way today; the blank bubble is now a
`.choice-bubble` at full size and wants the shadow exactly as written.

## Objectives
Goals the game sets the player, drawn against a points budget set by the
chosen difficulty. Endless is the same runtime with an empty objective
list, which the runtime detects and skips its bookkeeping for.

**The catalog is deliberately small** — seven definitions, two modes. An
early draft shipped eleven definitions, a random pool and a three-level
campaign table on spec; all of it was removed before any was used, and the
catalog was rebuilt one objective at a time as modes actually needed them.
Keep doing that: add an objective when something asks for it, not in
anticipation.

### Corner symbols
Corners are identified to the player by **shape**, not direction: NW
square, NE circle, SW triangle, SE diamond. A corner-scoped objective leads
with its shape instead of naming a direction — "◆ Clear 5 words" rather
than "Clear 5 words in the SE corner". Directions were cognitive load with
no payoff: the player has to map "SE" to a place on screen every time,
where a shape is just recognized.

Two consequences:

- **The data model is untouched.** State, events, params, DOM ids and
  recorded rows all still say `nw`/`ne`/`sw`/`se`; the shape is a lookup at
  draw time (`js/cornerSymbols.js`, the single art source for both the tile
  badge and the list row, which is what stops those two drifting). A rename
  would have split every corner tuning's history in two for a purely visual
  change.
- **A corner objective's `describe` no longer names its corner**, because
  the renderer supplies it. So the four per-corner variants of a pool rung
  produce *identical* description text — anything identifying a row by its
  description has to add the corner back. `modes.js`'s pool validator does;
  a future objective editor would need to as well.

### `cost`, not `points`
Each pool row carries a **`cost`**: how hard that exact tuning is, in
budget points. Deliberately not `points`, because the game already means
*score* by that word — `event.points`, and `totalScore`'s own
`params.points`, which sits on the same row:

```js
{ type: 'totalScore', params: { points: 80 }, cost: 5 }
```

Same reasoning keeps the budget off the difficulty buttons: a tier labelled
"8 points" next to a score badge reads as a target, not a difficulty.

### The extension points
This is the shape the whole system is arranged around. Each is edited
independently of the others:

| To add… | Edit | Cost |
|---|---|---|
| an objective type | one entry in `definitions.js` + priced rows in `OBJECTIVE_POOL` | nothing else changes |
| a tuning of an existing objective | one priced row in `OBJECTIVE_POOL` | nothing else changes |
| a game mode | one row in `GAME_MODES` | appears on the splash automatically |
| a difficulty tier | one entry in `difficulty.js` + one number in `POINT_BUDGETS` | validator rejects a budget the pool can't spend |
| how demanding a tier is | one number in `POINT_BUDGETS` | nothing else changes |

A mode names *which* objectives are available and what each is worth; the
tier supplies only *how much* may be spent. That separation is why "swap in
objectives by mode and difficulty" is `createMode(id, difficulty)` and
nothing more.

### The Objective mode
Deals a random set costing **exactly** the tier's budget (Easy 4, Medium 8,
Hard 12, Expert 16 — in `POINT_BUDGETS`, meant to be edited). Four things
worth knowing:

- **A tier fixes total cost, not the number of objectives.** Easy is one
  4-cost goal, or two 2s, or a 3 and a 1, or four 1s. That's the point of
  the design.
- **Deal size is picked first**, uniformly among the sizes that can be
  spent exactly, and only then is a combination found. Without that the
  search biases hard toward using every type — the "take a row" branches
  vastly outnumber the single "skip" at each step — and Easy would be four
  1-cost objectives almost every time.
- **At most one row per exclusion key.** A row claims its `type`, so
  same-type rows are alternative *tunings* and nobody is dealt "score 8
  three-letter words" beside "score 18" of them. A corner-scoped row also
  claims its corner — see below.
- **Difficulty never touches an objective's params.** A harder tier buys
  bigger objectives because it can afford dearer rows, not because anything
  rescales. An earlier design had per-definition `byDifficulty` tables
  rescaling everything; the budget replaced all of it.

Keep **some 1-cost rungs in the pool** so any remainder is fillable. A type
may skip its own to stay out of reach at small budgets —
`wordsStartingWithVowel` (cheapest 2) and `cornerOnlyLength` (cheapest 4)
both do. The module-load validator is what actually proves each tier
spendable; the rung habit is what keeps that true. A pool that can't pay a
budget is a startup error naming the tier, not a player picking Hard and
getting nothing.

The draw happens inside `selectObjectives()`, which the runtime calls at
game start and on every reset, so each game re-rolls.

### One objective per corner
The corner-scoped types make demands of a single corner that don't survive
being combined. "Clear 5 words here" beside "score fewer than 2 words here"
is unwinnable outright; "land one 6-letter word here and nothing else"
beside "clear 5 words here" is winnable *only* if the 6-letter word lands
first, since reaching `count` freezes `cornerOnlyLength` complete before a
wrong-length word can violate it — a rule the player is never shown, so in
practice a trap. Nothing in the selector saw any of this: they're distinct
types, and one-row-per-type let all three land on one corner.

The fix generalizes the rule already there rather than adding a second.
`exclusionKeys(row)` returns what a row claims exclusively — its type, plus
its corner when it has one — and the search refuses a row whose key is
taken. **No type declares itself corner-scoped; carrying a `corner` param
*is* the signal**, the same convention the renderer uses to decide whether
to draw a shape, so a future corner type is covered with no further work.

Two things this deliberately does *not* do:

- It bans benign same-corner pairings too. Accepted: the alternative is a
  pairwise conflict table that grows with the catalog and that someone must
  remember to extend. It also spreads goals across the board, which is a
  better game.
- It says nothing about non-corner conflicts. If two types ever contradict
  each other *globally* this won't catch it — that wants a real
  requirements algebra, judged over-engineered for a seven-entry catalog.

It can't bite: all four corner variants of every rung exist at the same
cost, and 4 corners outnumber the 3 corner-scoped types, so any deal that
would repeat a corner can be remapped instead of dropped. (Measured: 16,000
deals across the four tiers, all spending exactly, none repeating a corner
or a type.)

**These numbers have not been playtested.** Every `cost` and budget was
chosen by reasoning about the scoring curve and how long a board survives,
not by playing games. Two independent dials, both in `modes.js`: a row's
`cost` (mispriced relative to its peers) and `POINT_BUDGETS` (the whole
tier is too heavy or light). Repricing a row shifts every tier that can
afford it at once — which is the point, but also means a mispriced row is
felt across the board.

### The layers
Five, each ignorant of the one above it:

1. **`events.js` — the vocabulary.** The only coupling to the game.
   `main.js` emits at seven moments. Payloads are **denormalized on
   purpose**: every field an objective could want is on the event, so no
   objective ever reads `gameState` and the architecture rule holds.
2. **`difficulty.js` — the tiers.** A tier is *only a name here*; what it's
   worth lives in `POINT_BUDGETS`, so the splash, the budget table and any
   future tier-dependent feature key off this independently. `null` is a
   legal value meaning "no tier, plain defaults". Unknown tiers throw, so a
   typo surfaces immediately rather than silently handing out the wrong
   tuning.
3. **`definitions.js` — the catalog.** One entry per *type*, parameterized,
   so "8 three-letter words" and "18" of them are one definition at two
   tunings. Definitions are pure functions over `(progress, event, params)`
   — no DOM, no state, no randomness, which is what makes replay safe.
   Params resolve in two layers, defaults < the spec's own; **difficulty is
   deliberately absent from this file.**
4. **`tracker.js` — live objectives.** Turns plain-data specs into
   instances with progress and status. Specs being plain JSON is what lets
   modes, the priced pool and (later) server-delivered objectives all be
   the same thing.
5. **`modes.js` — what's in play and what ends the game.** Also owns the
   whole balancing surface: `POINT_BUDGETS`, `OBJECTIVE_POOL`,
   `exclusionKeys`, the selection search, and the module-load validator.

`runtime.js` glues them together and is the only thing `main.js` holds;
`index.js` is the facade it imports from.

Two definitions are **restrictive** — they can fail *before* the game would
otherwise end, via an optional `failed()` hook checked ahead of the goal
check. Since Objective mode ends the run the instant any objective fails, a
restrictive objective failing mid-game is an instant loss with corners
still open and other goals possibly nearly done. That's deliberate.

`cornerOnlyLength` is **not** enduring: once its count is reached with no
violation it completes and freezes the normal way, so a wrong-length word
*after* completion doesn't retroactively fail it — the obligation was
already met. `cornerWordLimit` **is** enduring: surviving to game end
without hitting the limit is the whole condition.

`wordsStartingWithVowel` counts A/E/I/O/U — not Y — and a blank-derived
opening letter counts like any other, since the event carries only the
finished word. Its vowel set is a small local constant rather than
`isVowel` from `letterSource.js`: that one exists to balance the *draw*,
and importing it would make a definition depend on a game module. They
agree today and are free to diverge.

**Description markup:** a `describe()` string may wrap one word in
`__like this__` to call it out, which `ui.js` renders as an underline. A
cross-file contract between `definitions.js` and the renderer — worth
knowing before writing a description containing literal underscores.

### Undo is a replay, not a reversal
The decision everything else follows from. Making every objective implement
its own reversal would be tedious, fragile, and worse with every type
added. Instead the runtime keeps the events since the last checkpoint and
*replays* them from a captured baseline: `main.js` marks before a move and
hands the marker back on undo. **An objective author therefore never writes
an undo branch and cannot get one wrong.**

Two consequences:
- There is no "undo" event and there must never be one — the rewind *is*
  the undo. Adding one would double-count.
- `WORD_REJECTED` is in `DURABLE_EVENTS`: an invalid submission really
  happened, and undoing the drop before it doesn't unhappen it. Put a type
  there only if it records an *action* rather than a state change.

`commit()` (at the same checkpoint where `main.js` clears its undo record)
drops the log and rebaselines, so it stays a few events long rather than
growing all game. A marker from before a commit throws if reused rather
than silently replaying wrong.

### How a game ends
- Completing **every** objective ends the game as a win immediately,
  corners still open (`endOnComplete`, default true).
- **"Every objective" means every *target*.** Enduring objectives are
  limits, not targets: they never report complete mid-game, so counting
  them toward the win would mean a deal containing one could never be
  cleared early — the player would grind the board closed with the limit
  live throughout, where playing on can only lose a game already won. So
  the evaluator wins when every non-enduring objective is complete and
  nothing has failed; a limit being kept at that moment is a limit kept.
  One guard: a deal of nothing but limits doesn't win on move zero for
  doing nothing.
- All four corners closing first loses: unfinished objectives are marked
  failed and the verdict is `lost`.
- With no objectives, `finish()` leaves the status `active` — an endless
  game was never a contest, so there is no verdict. Read
  `snapshot().finished` to tell "no verdict" from "not over yet".
- Both `emit` and `finish` are idempotent after the game ends.

### The HUD
`objectives.onChange(listener)` fires a serializable snapshot on every
change. `main.js`'s renderer **renders the snapshot it is handed** and
reads no game state — which is what keeps the layering intact now that
there *is* a UI. Asking for a second snapshot inside a listener that was
just given one is pure duplication; `endGame` likewise doesn't re-render,
since `finish()` notifies before returning.

`current` is reported raw in the snapshot. The renderer clamps it — both
the meter *and* the printed number — for normal objectives, and prints raw
only for `enduring` ones, which also get **no meter at all**: for a limit,
a bar filling up would read as progress when it means trouble.

A time limit (`limits.seconds`) would additionally need a UI ticker calling
`objectives.tick()`; otherwise the limit is only noticed when the next
event arrives.

### The corner flags
A corner-scoped objective gets a **second home**: a small flag with a live
counter, sitting in the center band just inside the tile it belongs to —
below the north tiles, above the south ones — which taps open to a popover
showing that one objective. The right-edge flag still owns the whole deal;
this puts a corner's goal *at* the corner, where the decision about that
corner is being made.

- **`params.corner` is the only signal, again.** The same convention the
  objective list's shape column uses, so a future corner-scoped type is
  covered with no work here. The one-objective-per-corner rule is what
  makes the flag-to-objective mapping 1:1 by construction — if that rule
  ever goes, this UI needs an answer for two flags on one corner.
- **They hug the outer screen edges.** The center row can be ~299px wide on
  a 320px screen, so the edges are the only horizontal space reliably free;
  the flags also clear the row vertically, in a strip that is ~38px tall on
  that same phone. That is what caps `--corner-flag-height`, and why
  `--north-band-top` / `--south-band-bottom` are shared variables — the
  flags and `#center-stack` must be measured from the same line.
- **Outside `.corner`, not inside it.** A tile sets `z-index: 1` and so is
  its own stacking context: a child flag could never rise above
  `#center-stack`, and a click inside a tile submits its word.
- The popover **reuses `renderObjectiveList` with a single-item array**, so
  a goal reads identically wherever the player meets it, and its backdrop
  is doing two jobs — the dismiss affordance, and keeping that tap off the
  board. It re-renders from every snapshot while open, so progress shows
  without closing it.
- A resolved objective's flag **stays**, going teal ✓ or rose ✗ while still
  printing its counter: "1/3" beside a ✗ says how far it got.

### Recording objective results
Every finished game stores one `game_objectives` row per objective dealt,
so **the costs and budgets above can be tuned from data rather than
reasoning** — that is the whole reason the table exists. `npm run
db:objectives` runs the rollup. A tuning near 100% is priced too cheap for
what it asks, one near 0% too dear. The sharper read is **across rows
sharing a `cost`**: they're interchangeable to the selector, so where their
rates diverge, that rung is mixing easy and hard work and some deals at
that tier are far worse than others.

Three load-bearing decisions there:

- **Grouping is by *tuning*, not type.** Only the price is being tuned, so
  `params` is stored as canonical JSON with **keys sorted** (two clients
  serializing the same tuning must land in the same group) and
  `(type, params)` is the group.
- **`final_value` is raw, not clamped to the goal.** How far *past* its
  goal a completed objective ran is what separates "demanding" from "the
  player would have hit that anyway" — completed at 24/9 was never really
  an objective.
- **A lost game still records what was achieved**, so "lost, but 3 of 4" is
  distinguishable from "lost with nothing done" without a join.

**Score is not ranked for Objective games.** `readBests` filters to
`mode_id = 'endless'` and the game-over card shows no best lines there. An
Objective game ends the moment its goals are met, so its score measures
*when it stopped*, not how well it went — ranking it would reward picking a
tier you can't finish, and would let one mode's scores drown the other's.
The score is still recorded, because next to a `totalScore` goal it's
useful tuning data; it just isn't a leaderboard entry.

Note the live mode's `id` is the table row's id unsuffixed (`objective`,
not `objective-hard`) — the tier is in `difficulty` beside it, so every
Objective game groups without a `LIKE`.

## Backend
One Worker serves both `public/` and the API on the same origin — so no
CORS anywhere, and it's also what makes the two environments free: the
staging build fetches `/api/...` off its own hostname and therefore hits
the staging database, with no environment switch in `public/js/` to get
wrong. `env.DB` resolving differently per environment is the *only* place
the split exists.

Two routes, both returning `{ globalBest, personalBest }` (either may be
`null`): `GET /api/scores` at startup, `POST /api/games` at game over,
which stores the game and returns the refreshed bests — so a new high shows
up on the same screen that set it.

One row per *completed* game. Abandoned games aren't recorded — an accepted
gap, since there's no reliable moment to post one.

The whole feature is **designed to fail open**: `api.js` swallows every
error behind a timeout, the overlay renders before the network call
resolves, and no game rule reads anything from the server. The game behaves
identically offline, minus two score lines.

Server-side validation rejects impossible numbers and cross-field
contradictions (a game with no objectives can't carry a verdict; a `won`
game must have every objective complete). Those checks exist to keep typos
and stray scripts out of the dataset, not to stop a determined cheater —
nothing client-side can. **Widen the caps rather than working around them**
if real play ever exceeds them. A malformed objective fails the whole
request rather than storing a partial deal, which would skew the very rates
the table exists to measure.

Player identity is an anonymous UUID in `localStorage` — enough to make
"your best" meaningful, but per-browser, not per-person. The `player_name`
column exists and is unused, reserved for initials entry.

**Database gotchas:**
- `db/schema.sql` is all `IF NOT EXISTS`, which makes re-running it safe
  but also means it will **not** add columns to a table that already
  exists. Changes to a deployed database go in `db/migrations/` *as well
  as* in the schema, so a fresh database still skips to the end state. A
  test worth repeating after any schema change: build one database from the
  schema and another from the old schema plus the migration, then diff
  `PRAGMA table_info` and the index list. They must match.
- Migrations are deliberately **not** idempotent: SQLite has no `ADD COLUMN
  IF NOT EXISTS`, so a second run fails with "duplicate column name" —
  which is the intended signal that it already landed.
- Local D1 files are keyed by `database_id`, so changing that value in
  `wrangler.toml` silently orphans the old local database. The symptom is
  `no such table: games` from a dev server that worked five minutes ago;
  the fix is re-running `db:init`. Pointing `dev` at a different
  environment does the same thing for the same reason.

**`wrangler.toml` gotcha:** the top-level block *is* production;
`[env.staging]` overrides the name and database. **Bindings are never
inherited by a named environment**, so `[env.staging.assets]` and
`[[env.staging.d1_databases]]` are repeated in full — delete either and the
staging Worker quietly loses its assets or its database rather than failing
loudly. Also: Workers Builds runs `npx wrangler deploy` **directly, not
through npm**, so it's unaffected by the `deploy` → `deploy:staging` alias.
If that build command were ever changed to `npm run deploy`, master pushes
would start deploying *staging*.

## Why a Worker, not Pages
This started as a Cloudflare **Pages** project (`functions/`,
`pages_build_output_dir`, `wrangler pages deploy`) and was converted. If
you find yourself reintroducing any of that, read this first.

The dashboard's "Workers & Pages → Create" flow provisions a **Worker with
Workers Builds**, not a Pages project, and its default deploy command is
`npx wrangler deploy`. Pointing a Pages-shaped repo at it produces a chain
of errors that each look like an unrelated auth/config problem: `Missing
entry-point to Worker script` (because `wrangler deploy` wants `main`,
which a Pages config lacks), then `Authentication error [code: 10000]` once
the command is overridden to `wrangler pages deploy` (that tries to create
a *separate* Pages project from inside a Worker's pipeline), then
build-token errors. The tell that settles it: `wrangler pages project list`
returns empty while `wrangler deployments list` finds the Worker.

The current setup matches what that flow actually creates, so the default
deploy command is correct and no override is needed.

## Versioning
`js/version.js` exports `GAME_VERSION`, recorded with every game row so
results can be sliced by which iteration of the rules produced them. Bump
it whenever a change makes results **non-comparable** with the previous
version — scoring formula, letter distribution, length thresholds, new
mechanics, or a repricing that changes which deals are possible. Cosmetic
and internal changes don't need one. Keep it in step with `version` in
`package.json`.

## Not yet built (ask before assuming scope)
- **Playtesting the costs and budgets.** Every number is still a first-pass
  guess. The data *is* now being collected, so this waits on played games
  rather than plumbing. Watch whether rows sharing a cost really are
  comparable work. Nothing retunes the pool automatically, and nothing
  should — read the rates, then edit by hand.
- **Saying anything about a tier beyond its name.** The buttons are bare
  labels. They briefly carried a deal-size range, which was removed: the
  ranges overlap badly and widen with every type added, so they
  discriminated by almost nothing. Don't reintroduce that one. A difficulty
  meter, or the budget under a name that doesn't collide with score, are
  the things worth trying.
- **Remembering the player's choice.** The splash asks every game; nothing
  persists the last mode/difficulty. Undecided.
- **More objectives and modes.** The catalog was deliberately emptied once;
  add entries as modes need them rather than pre-seeding content tables.
- **A losing game-over screen that explains itself.** Nothing distinguishes
  "the board closed on you" from "you failed an objective outright"; the
  verdict's `reason` is in the snapshot for whoever wants to word it.
- **An Objective-mode scoreboard.** Those games are recorded in full but
  ranked by nothing. What "best" should even mean there is the open
  question (fastest win at a tier? highest tier cleared?), and it needs a
  second query shape rather than a filter on the existing one.
- Initials/nickname entry and a real top-10 leaderboard. The `player_name`
  column and the `readBests`-shaped response are what would change.
- Any analysis/dashboard view over the collected games.
- Difficulty scaling of the letter draw (`letterSource.js` is set up for it).
- **Unused-but-designed extension points**, left in place with a documented
  contract rather than deleted: `limits.moves` / `limits.seconds`,
  `challenge()`'s id/label overrides, and `defineMode`'s `evaluate`
  override. Several `objectives/index.js` re-exports have no consumer and
  could be trimmed — the facade is what tells the next reader which of the
  surface is real.
