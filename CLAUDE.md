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
imports from. Objectives there are **generated from three axes** rather than
listed: `properties.js` is the word-property axis, `definitions.js` holds
the scope and constraint axes plus the one definition they instantiate, and
`generator.js` enumerates and prices every combination.

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

**The catalog is generated, not written.** There is exactly one objective
definition, and every goal the game can set is that one sentence with four
blanks filled in:

```
Score {constraint} {count} {property} {in scope}{, none excluded}
```

| axis | lives in | values today |
|---|---|---|
| property | `properties.js` | any word; exactly N letters; N+ letters; starts with a vowel; ends in a vowel |
| exclude | `properties.js` | nothing, or a property whose words then don't count |
| scope | `definitions.js` | global, or one of the four corners |
| constraint | `definitions.js` | at least N (**fewer than N is no longer generated** — see "Why limits became exclusions") |

`generator.js` enumerates every combination, prices each, and drops the ones
its cost model puts out of range. Adding a property therefore adds its whole
column of objectives — every scope, every exclusion, a full ladder of
counts — and nothing else in the system changes.

This replaced a hand-written catalog of seven bespoke types and forty priced
rows. Two of those types did not survive the move and were deleted rather
than special-cased: `cornerOnlyLength` ("land one 6-letter word here and
nothing else") is a *conjunction*, unsayable in one sentence — it is now two
objectives on one corner, which the rules below permit; and `totalScore`
measured points rather than words, so it had no place on the count axis.

**Why generated rather than listed.** The old catalog had the combinatorics
in it already — five of its seven types were the same "count words matching
a predicate" shape at different scopes — but written out longhand, so each
new property meant a new definition plus eight hand-priced rows, and each
row's cost was an independent guess. The axes make the space explicit, and
collapse forty guesses into nine constants.

### There is no `exactly N`
It was considered and rejected. "Exactly 5" can't complete when it reaches 5
— a sixth word would break it — so it would have to stay live to game end
like a limit while also being a target. That is a third status shape the
tracker doesn't have, and any deal containing one could only ever be won by
playing the board all the way closed, never early. At-least and fewer-than
cover the ground between them.

### Why limits became exclusions
The standalone limit — `fewerThan` at a corner scope, "score fewer than 3
words here" — **is no longer generated.** It was the system's one free lunch,
and the reason is worth keeping because it is a general trap in any priced
catalog.

A limit's cost came out of `ABANDON_CORNER_COST × forgone`, which prices the
words the player *gives up* by respecting it. That is only a real price if
something makes them want to score in that corner. Nothing in a deal did. So
a limit on a corner carrying no target cost budget and asked nothing: the
player simply never played there. Measured over 2,000 deals a tier:

| | deals with a limit on a target-free corner | share of budget spent on targets | won by scoring ≤1 word |
|---|---|---|---|
| easy | 70% | 51% | 54% (22% needed **zero** words) |
| medium | 79% | 64% | 19% |
| hard | 62% | 81% | 3% |
| expert | 60% | 85% | 3% |

The general shape: **`cost` is priced per row, but a limit's difficulty is a
property of the deal.** No number written in `generator.js` can be right for a
row whose worth depends on what it was dealt beside.

So the restriction moved *inside* the target as an `exclude` param — "score 3
words here, none starting with a vowel" is one objective, not two. It cannot
fail to bind, because it narrows the very words the player is required to
produce. After the change: Easy's ≤1-word deals went 54% → 1%, and median
words per deal runs 5 / 7 / 8 / 9 across the four tiers.

Two rules keep exclusions from taking over, both about reading rather than
possibility, and both in `generator.js`:

- **At most one exclusion per deal.** Avoiding a vowel start is only a ~12%
  tax, so almost every family has an excluded twin at the same price and the
  selector will happily deal four. Before this rule a Hard panel routinely
  carried "…, none starting with a vowel" on three separate lines. One per
  deal makes it read as the twist on this hand.
- **`MIN_EXCLUSION_COUNT` is 2.** At count 1 an exclusion isn't a constraint,
  it's a reroll — a failed attempt costs the player nothing, they just score
  the next word instead.

Length properties deliberately carry no `modifier` phrase and so can't be
excluded: every length exclusion is a length property written the long way
("no 3-letter words" *is* `lengthAtLeast 4`), and generating them would double
the pool with synonyms.

Rejected on the way here: a rule requiring each limit to sit on a corner that
also carries a target. It fixes the same numbers, but the limit is then only
live for as long as its target runs — and once the target completes the game
is won and the limit is moot. It converges on the exclusion with more
machinery.

**The `fewerThan` machinery is still in the tree, unreachable from the pool**
— one line in `generator.js` (`GENERATED_CONSTRAINTS`) reverses that. The
constraint axis, `enduring`, `failed()`, the HUD countdown and the possibility
check's limit branches are all intact and dead. Left rather than deleted while
the change is being played; delete them together, or not at all, once it is
settled. Note what deleting costs: blowing a limit was the only instant loss
in the game, and an exclusion has no such teeth — an excluded word simply
doesn't count.

### The constraint axis decides the tracker semantics
`atLeast` is a target: it completes on reaching its count, which is what lets
a deal be won with corners still open. `fewerThan` is a limit: it fails on
reaching its count and can never complete early, because surviving to game end
*is* the condition. That is why `enduring` is a function of params rather than
a per-type flag. With limits no longer generated every live objective is a
target, so the `enduring` path never fires in a real game.

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
  the renderer supplies it. So the four per-corner variants of one tuning
  produce *identical* description text — anything identifying a row by its
  description has to add the scope back. `modes.js`'s pool validator does;
  a future objective editor would need to as well.

Note that a scope is `'global'` or a corner id, and it is always present.
Which corner an objective belongs to is resolved **once**, in
`snapshotObjectives`, and handed to the UI as `corner` — so no renderer digs
through params, and the old "carrying a `corner` param is the signal"
convention is gone.

### `cost`, not `points`
Each pool row carries a **`cost`**: how hard that exact combination is, in
budget points. Deliberately not `points`, because the game already means
*score* by that word (`event.points`).

Same reasoning keeps the budget off the difficulty buttons: a tier labelled
"8 points" next to a score badge reads as a target, not a difficulty.

### The cost model
The one part of this that is genuinely hard, and the reason cost is computed
rather than tabulated.

**A cost must be comparable across rows** — two 3-cost objectives should be
about equally hard — because that is exactly what the budget treats them as.
So cost cannot be a sum of per-axis constants, however tempting that is. The
axes interact:

- Corner scope doesn't *add* to a property, it **divides** the words
  available to satisfy it. "3 words starting with a vowel" is a moderate ask
  globally and a severe one in one corner.
- What one more word costs depends on the property: +5 three-letter words is
  loose change, +5 six-letter words is most of a game.
- An exclusion **narrows the property** rather than adding to it, so it
  multiplies there too: `rarity(base) × (1 - avoidedRarity(excluded))`. The
  two factors assume independence, which is not quite true (longer words end
  in a vowel slightly less often) but is the honest default when every input
  is already an estimate.
- A limit **inverts both**. A rarer property makes a limit easier to keep,
  and a bigger allowance makes it easier still — the exact opposite of how
  both read on a target. (Retained but no longer generated — see "Why limits
  became exclusions".)

So everything is priced off one derived quantity: `expected`, the matching
words a player would score in that scope without trying hard. That's
`volume × rarity`, and it is where the multiplication lives. A target is
priced on `count / expected`; a limit on how many of those expected words it
forbids. Nine constants in `generator.js` and `properties.js`, all commented
in place.

**STEERING cuts both ways, and that is two functions not one.** A property a
player can chase (the two vowel ones) is scored *more* often than its
dictionary rate when chased and *less* often when avoided, by the same
faculty. So each steerable property declares `rarity` and `avoided`, sitting
either side of its dictionary rate, and an exclusion prices off `avoided`.
Using the chased rate on both sides would price every exclusion as harder
than it is — the one place in the model where a single sign error inverts the
answer.

### Measure Endless games, and only Endless games
The most expensive lesson in this file. `GLOBAL_VOLUME` went 30 → 12 → 30, and
both wrong values came from measuring the wrong games.

**What the numbers actually are** (three human Endless games at 0.14.0):

| words | score | blanks earned | minutes |
|---|---|---|---|
| 15 | 78 | 3 | 6.7 |
| 22 | 108 | 4 | 7.2 |
| **89** | **638** | **25** | 66 |

Median 22, mean 42. Length split 46% / 27% / 17% / 10% across 3 / 4 / 5 / 6+
letters — `LENGTH_SHARE` is now those measured shares.

**Why 12 was wrong, twice over.** Two sources agreed on ~6 words a game and
both were measuring something else:

- **A scripted player averaged 6.6.** It banked every valid word the instant
  it existed, so it scored ~3 points a word, so it never crossed the 25-point
  blank threshold. *It played a game without blanks and reported the length of
  one.* A simulator rebuilt later made exactly the same mistake and produced
  5.8 — agreement between two bots with the same blind spot is not
  corroboration.
- **32 recorded games averaged 5.9, never exceeding 15.** Every one was an
  *Objective* game, which ends the moment its goals are met. `words_total`
  there measures when the deal stopped, not what the board can produce; the
  ceiling of 15 was just the largest thing any deal had asked for.

**What both missed is that blanks compound.** A blank escapes a dead corner,
so corners stay open, so the game runs longer, so more score accrues, so more
blanks are earned. It is a feedback loop, and a player who never enters it
sees a completely different game — which is exactly the 15-vs-89 spread in the
table above, on identical code.

So: **read volume from `mode_id = 'endless'` only**, re-read it after any
change to `BLANK_SCORE_INTERVAL`, the scoring formula, or `MIN_WORD_LENGTH`,
and distrust any bot that isn't earning blanks at a human rate.

The per-tuning success rates from `npm run db:objectives` remain the corrective
for the *rarity* constants, which no amount of Endless play reveals — see
"Recording objective results".

### The extension points
Each is edited independently of the others:

| To add… | Edit | Cost |
|---|---|---|
| a word property | one entry in `properties.js` (predicate, noun phrase, rarity, and where it sits in the lattice) | every scope × exclusion × count appears automatically |
| an excludable property | a `modifier` phrase on that entry, plus an `avoided` rate if it's steerable | it becomes available as the exclusion on every other property |
| a scope or constraint | one entry in `definitions.js` + its handling in the cost model | nothing else changes |
| how a whole class is priced | one constant in `generator.js` | the affected ladders re-derive |
| a game mode | one row in `GAME_MODES` | appears on the splash automatically |
| a difficulty tier | one entry in `difficulty.js` + one number each in `POINT_BUDGETS` and `MIN_DEMAND` | validator rejects a budget the pool can't spend, or can't spend against the floor |
| how *hard* a tier's goals are | one number in `POINT_BUDGETS` | nothing else changes |
| how *long* a tier plays | one number in `MIN_DEMAND` | nothing else changes |

A mode names *which* pool is available; the tier supplies only *how much*
may be spent. That separation is why "swap in objectives by mode and
difficulty" is `createMode(id, difficulty)` and nothing more.

### The Objective mode
Deals a random set costing **exactly** the tier's budget *and* demanding at
least the tier's word floor. Two tables, not one:

| | budget (`POINT_BUDGETS`) | word floor (`MIN_DEMAND`) | mean demand | vs. a median 22-word game |
|---|---|---|---|---|
| easy | 10 | 6 | 10.4 | half a game |
| medium | 18 | 14 | 19.1 | about a game |
| hard | 26 | 20 | 27.1 | beyond one |
| expert | 30 | 24 | 32.8 | ~1.5× |

Both are meant to be edited. Five things worth knowing:

- **A tier fixes total cost, not the number of objectives.** Easy is one
  6-cost goal, or two 3s, or a 4 and two 1s. That's the point of the design.
- **Cost and demand are different questions, and cost cannot answer both.**
  See "Why a word floor" below — this is the newer half of the design and the
  one that decides whether a tier actually *plays* hard.
- **Deal size is picked first**, uniformly among the sizes that can be
  spent exactly, and only then is a combination found. Without that the
  search biases hard toward using every family — the "take a row" branches
  vastly outnumber the single "skip" at each step — and Easy would be four
  1-cost objectives almost every time. `MAX_DEAL_SIZE` (6) caps it, since a
  budget of 20 would otherwise admit twenty 1-cost goals; the old pool
  capped this accidentally, at the seven types it happened to contain.
- **At most one row per *family*.** A family is a combination with the count
  left off, so rows sharing one are alternative tunings and nobody is dealt
  "score 5 or more words here" beside "score 12 or more" of them.
- **Difficulty never touches an objective's params.** A harder tier buys
  bigger objectives because it can afford dearer rows, not because anything
  rescales.

`MAX_COST` (6) does double duty: because the target ladder is linear in
`count / expected`, the cap *is* a statement about how far past their
expected output a player can be asked to go — at cost 6, 1.2×. It also sets
the floor on deal size, since Expert's 20 can't be spent on fewer than four.

### Why a word floor, when there is already a budget
Because **cost cannot see how long a deal takes to play**, and that turned
out to be the thing "difficulty" mostly means here.

`cost` is `TARGET_COST_SCALE × count / expected`. A row can therefore be dear
because its property is *rare* rather than because it asks for volume: "score
a 5-letter word" costs 4 and is one lucky word. Spend a whole Expert budget on
rows like that and you get six 0/1 lines that a normal game clears in four
words, having never once been pressed. Measured on the shipped 0.13.0 pool,
median demand ran **3 / 3 / 4 / 5** across the four tiers — Easy and Medium
were not distinguishable at all, and the budget had quadrupled between them.

So a deal is now measured on two axes. Cost asks *how hard is each goal*;
demand asks *how much of a game do these goals add up to*. Raising budgets
alone does not fix it — that buys dearer rows, and dearer still means rarer.

**`dealDemand` is not a sum of counts**, and that is the whole subtlety:

- a global row is fed by words scored *anywhere*, so several global rows fill
  in parallel and only the largest binds;
- corners are disjoint, so their demands genuinely add;
- a global row and the corner rows under it also fill in parallel — hence the
  max of the two, never their sum.

Sum-of-counts overstates a deal badly. The screenshot that prompted this
scored 9 by that measure and 4 by this one, and 4 was the truth: one 4-letter
word in the ▲ corner fed three of its six rows at once.

It is a **lower bound**, deliberately. It assumes one word can satisfy every
row it is eligible for, which needs those rows to be compatible — one word is
not both 3 letters and 5. Erring pessimistic is what makes a floor built on it
a floor the player really has to clear.

Three things to know before touching the numbers:

- **The floor is checked at the search leaf, not as a prune.** Demand rises
  monotonically as rows are added, so a partial deal below the floor may still
  reach it and nothing can be rejected early. This is the one constraint in
  the selector that *cannot* be a pruning predicate, unlike the possibility
  check. Exhaustiveness is unaffected, so `null` still proves infeasible.
- **The ceiling moves with `MAX_COST`.** At `MAX_COST` 10 against
  `GLOBAL_VOLUME` 30, a global row reaches 60 words and a corner 20. It was 6
  and 1.2x expected output, which capped an Expert deal at 15 words total —
  the single constant most responsible for Expert playing as a four-word game.
- **A floor too near a budget's reach starves variety.** Easy at budget 4 with
  a floor of 4 once had only ~113 possible deals and repeated visibly. If a
  tier starts feeling samey, that is the first thing to check — and the failing validator message distinguishes
  "can't spend" from "can't spend *and* reach the floor" for exactly this
  reason.

The module-load validator proves every tier spendable, and still means
something: the search is exhaustive over families *and* over the possibility
check, so an empty result is proof rather than an unlucky roll. A pool that
can't pay a budget is a startup error naming the tier, not a player picking
Hard and getting nothing.

The draw happens inside `selectObjectives()`, which the runtime calls at
game start and on every reset, so each game re-rolls.

### The possibility check
**Any number of objectives may share a corner.** The rule that used to
forbid it — one objective per corner — was a blunt instrument standing in
for a check the system couldn't make: it banned same-corner pairs wholesale
because it had no way to tell a contradiction from a coincidence. It also
threw away good deals; "score 8 words here, none starting with a vowel, at
least one ending in one" is a genuinely interesting corner and was
unreachable.

The check that replaced it rests on one relation: **does every word row A
counts also get counted by row B?** That's `propertySubsumes` (the
implication lattice in `properties.js` — vowel-initial words are words,
6-letter words are 5+ letter words) and `scopeSubsumes` (a corner is inside
global) together. Given that containment, three things follow and all three
are refused:

1. **Contradiction.** A demands `m`, B forbids reaching `n`, and `m >= n`.
   Meeting A necessarily fails B. This is the unwinnable case, and the
   motivating example: "score 3 or more words starting with a vowel here"
   beside "score fewer than 3 words here". *Unreachable now that limits
   aren't generated — kept with the rest of the limit machinery.*
2. **A free target.** Both demand, A's demand is stricter, clearing it
   clears B automatically. B took a slot and asked for nothing. **This is the
   only one of the three that fires today**, and it is what the exclusion
   handling in `propertySubsumes` exists for.
3. **A free limit.** Both forbid, B's is tighter, keeping it keeps A. Same
   waste, other direction. *Also unreachable.*

An exclusion narrows a predicate, so it can only help `a ⊆ b` — but the
lattice refuses the general case rather than reasoning about it: containment
holds only when `b` carries no exclusion, or carries the same one. "Words that
aren't vowel-initial ⊆ words that don't end in a vowel" is false, and deciding
that properly means intersecting predicates instead of comparing ids. Being
conservative here costs a redundant pair slipping into a deal; being wrong
here costs a deal that can't be won.

Two decisions worth keeping:

- **It runs inside the search, not after it.** Generate-then-check-then-
  reshuffle was the obvious shape and is worse: it gives up the
  exhaustiveness the validator depends on, and it can spin forever on a
  budget whose every exact-spend combination happens to conflict. As a
  pruning predicate against the rows already chosen, an impossible deal is
  never built in the first place and `null` still means infeasible.
- **Sound but not complete, deliberately.** It refuses no winnable deal. It
  reasons only about *pairs* and only about *containment*, so it cannot see
  that three separate corner targets jointly want more words than a board
  produces, and it says nothing about two overlapping-but-unrelated
  properties being awkward together. Those want a real requirements algebra;
  this is the part decidable from counts. Properties that merely overlap are
  deliberately left unrelated in the lattice — only containments true by
  definition are declared, which is what keeps it a small fixed table rather
  than a conflict matrix that grows with the catalog.

Measured over 16,000 deals across the four tiers: all spend exactly, none
repeat a family, none contain an incompatible pair. Corners stack up to five
deep at Expert.

### The layers
Six, each ignorant of the one above it:

1. **`events.js` — the vocabulary.** The only coupling to the game.
   `main.js` emits at seven moments. Payloads are **denormalized on
   purpose**: every field an objective could want is on the event, so no
   objective ever reads `gameState` and the architecture rule holds.
2. **`properties.js` — the property and exclusion axes.** Predicates over a
   scored word, plus the three things only the generator needs: a `rarity`
   estimate (and its `avoided` twin for steerable properties), which
   properties may be excluded, and the implication lattice the possibility
   check runs on.
3. **`difficulty.js` — the tiers.** A tier is *only a name here*; what it's
   worth lives in `POINT_BUDGETS`, so the splash, the budget table and any
   future tier-dependent feature key off this independently. `null` is a
   legal value meaning "no tier, plain defaults". Unknown tiers throw, so a
   typo surfaces immediately rather than silently handing out the wrong
   tuning.
4. **`definitions.js` — the sentence.** The scope and constraint axes, and
   the single composed definition all three axes instantiate. Pure functions
   over `(progress, event, params)` — no DOM, no state, no randomness, which
   is what makes replay safe. Params resolve in two layers, defaults < the
   spec's own; **difficulty is deliberately absent from this file.**
5. **`generator.js` — the pool and its price.** Enumerates the grid, prices
   it, and owns `rowsIncompatible`. The whole balancing surface bar the
   budgets.
6. **`tracker.js` — live objectives.** Turns plain-data specs into
   instances with progress and status. Specs being plain JSON is what lets
   modes, the priced pool and (later) server-delivered objectives all be
   the same thing.
7. **`modes.js` — what's in play and what ends the game.** `POINT_BUDGETS`,
   `MAX_DEAL_SIZE`, the selection search, and the module-load validator.

`runtime.js` glues them together and is the only thing `main.js` holds;
`index.js` is the facade it imports from.

A limit can fail *before* the game would otherwise end, via the `failed()`
hook checked ahead of the goal check. Since Objective mode ends the run the
instant any objective fails, a limit failing mid-game is an instant loss with
corners still open and other goals possibly nearly done. That's deliberate.

`startsWithVowel` / `endsWithVowel` count A/E/I/O/U — not Y — and a
blank-derived letter counts like any other, since the event carries only the
finished word. The vowel set is a small local constant rather than `isVowel`
from `letterSource.js`: that one exists to balance the *draw*, and importing
it would make a property depend on a game module. They agree today and are
free to diverge.

**Description markup:** a `describe()` string may wrap one word in
`__like this__` to call it out, which `ui.js` renders as an underline. **It
currently has no consumer.** It was spent on the limit's "fewer"/"no", and
briefly on the exclusion clause's "none" — both dropped, the second on
purpose:

> An exclusion clause reads "…, **not** starting with a vowel", unemphasized.
> "none" reads as a *prohibition*, as though scoring one would end the run.
> That was true of the limit this replaced and is false here — an excluded
> word simply doesn't count. The underline carried the same false weight, so
> it went too. **Copy that implies a penalty the game won't apply is worse
> than no copy at all**, and this is the shape of mistake to watch for
> anywhere the old limit's vocabulary gets reused.

The marker stays in `ui.js` for the next clause that genuinely inverts. It is
a cross-file contract between `definitions.js` and the renderer — worth
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
- **"Every objective" means every *target*.** Moot while no limits are
  generated — every live objective is a target — but the reasoning is what
  the retained limit path depends on. Limits are not targets: they
  never report complete mid-game, so counting them toward the win would mean
  a deal containing one could never be cleared early — the player would
  grind the board closed with the limit live throughout, where playing on can
  only lose a game already won. So the evaluator wins when every non-enduring
  objective is complete and nothing has failed; a limit being kept at that
  moment is a limit kept. One guard: a deal of nothing but limits doesn't win
  on move zero for doing nothing.
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
the meter *and* the printed number — for normal objectives, which print as
`n/goal`.

An `enduring` objective is displayed as **a red countdown instead**, and
gets **no meter at all**. *No pool row is enduring today, so this path is
dead alongside the rest of the limit machinery — it is described as it would
behave if limits came back.* Both halves of that are the same point: a limit
isn't something to build toward, and a rising `0/3` beside a filling bar
says the opposite. So it prints a bare `goal - 1 - current` — words still
spendable there, since failing is `current >= goal` and "fewer than 3"
leaves room for 2 — floored at 0, with no denominator, because the
denominator was the part that read as a target. Red throughout, until the
objective resolves and the ✓-green / ✗-red take over.

The panel prints "2 left" rather than a bare "2", since a lone number
carries no scale. That caption is its own element
(`.objective-progress-unit`) and is deliberately **smaller than the
number** — at the number's size it widens the column past the ~1px of slack
a 320px panel row has, and the description wraps to two lines.

A time limit (`limits.seconds`) would additionally need a UI ticker calling
`objectives.tick()`; otherwise the limit is only noticed when the next
event arrives.

### The corner flags
A corner with any objectives on it gets a small flag in the center band just
inside its tile — below the north tiles, above the south ones — which taps
open to a popover listing **every** objective on that corner. The right-edge
flag still owns the whole deal; this puts a corner's goals *at* the corner,
where the decision about that corner is being made.

- **The flag is only an icon.** It used to carry a live counter, which
  worked exactly as long as the selector guaranteed one objective per
  corner. With a corner able to hold five, there is no single number to
  print and nowhere to print several — the strip is ~38px tall on a 320px
  screen. So the flag says "there are goals here", and every number lives in
  the popover. The one thing it still signals is whether the corner is
  finished with: teal when all its objectives resolved complete, rose if any
  failed, neutral while any is live. Failed beats complete — one blown
  objective is the headline however many others were met.
- **They hug the outer screen edges.** The center row can be ~299px wide on
  a 320px screen, so the edges are the only horizontal space reliably free;
  the flags also clear the row vertically, in a strip that is ~38px tall on
  that same phone. That is what caps `--corner-flag-height`, and why
  `--north-band-top` / `--south-band-bottom` are shared variables — the
  flags and `#center-stack` must be measured from the same line. With the
  counter gone the flag is a circle, sized off that height alone.
- **Outside `.corner`, not inside it.** A tile sets `z-index: 1` and so is
  its own stacking context: a child flag could never rise above
  `#center-stack`, and a click inside a tile submits its word.
- The popover **reuses `renderObjectiveList`**, so a goal reads identically
  wherever the player meets it, and its backdrop is doing two jobs — the
  dismiss affordance, and keeping that tap off the board. It re-renders from
  every snapshot while open, so progress shows without closing it. It is
  capped at `46vh` and scrolls: anchored at either flag strip that clears the
  opposite edge on a 320×568 screen, and a corner can now draw enough
  objectives to need it.
- A resolved objective's row **stays** in the popover, going teal ✓ or rose
  ✗ while still printing its counter: "1/3" beside a ✗ says how far it got.
  (A resolved *limit* keeps its countdown, so it says only "0 left" — how far
  it got is the one thing that reading loses.)

### Recording objective results
Every finished game stores one `game_objectives` row per objective dealt,
so **the cost model above can be tuned from data rather than reasoning** —
that is the whole reason the table exists, and it matters more now that nine
constants price hundreds of combinations instead of forty rows pricing
themselves. `npm run db:objectives` runs the per-tuning rollup; `npm run
db:costs` runs the one that matters most for pricing.

A tuning near 100% is priced too cheap for what it asks, one near 0% too
dear. The sharper read is **across rows sharing a `cost`**: they're
interchangeable to the selector, so where their rates diverge, that rung is
mixing easy and hard work and some deals at that tier are far worse than
others. Because the axes are now stored as separate fields, a whole
*property* or a whole *constraint* can be read down a column — if every
`endsWithVowel` row underperforms, its `rarity` is wrong, and one number
fixes every objective built on it.

Three load-bearing decisions there:

- **Grouping is by *tuning*, not type.** `type` is a constant now that every
  objective comes from the same composed definition, so the rollup groups on
  `params` — stored as canonical JSON with **keys sorted**, since two clients
  serializing the same tuning must land in the same group.
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
The score is still recorded, because it is useful tuning data; it just isn't
a leaderboard entry.

Note the live mode's `id` is the table row's id unsuffixed (`objective`,
not `objective-hard`) — the tier is in `difficulty` beside it, so every
Objective game groups without a `LIKE`.

**There are now three cohorts, and `game_version` is the only thing that
separates them.** Slice by it before reading any rate:

- **before 0.12.0** — the old bespoke types (`wordsOfLength`, `totalScore`,
  `cornerWordLimit` …), not comparable with generated rows at all.
- **0.12.0** — generated rows including standalone limits. Every `fewerThan`
  row here is measuring a mechanic that no longer exists, and its ~100%
  completion rate is the bug that ended it, not evidence about pricing.
- **0.13.0** — targets with exclusions, but budgets 4/8/12/16 and no word
  floor: median demand 3 / 3 / 4 / 5, so most deals played far shorter than
  their tier suggests.
- **0.14.0** — budgets 6/10/16/20 against MIN_DEMAND, but still priced at
  GLOBAL_VOLUME 12. Demand capped at 15, so these deals asked for roughly a
  third of what the board produces.
- **0.15.0 onward** — repriced against measured Endless capacity: GLOBAL_VOLUME
  30, MAX_COST 10, measured LENGTH_SHARE, budgets 10/18/26/30. Not comparable
  with anything earlier; `params.exclude` reads `""` on an unmodified row.

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
- **Deciding whether exclusions replaced limits or should sit beside them.**
  The switch (0.13.0, see "Why limits became exclusions") is measured on deal
  *shape* — the free-lunch deals are gone and the word counts ramp — but not
  yet on how it plays. The open question is whether losing the instant-loss
  limit costs the mode its only moment of jeopardy. Reversing is one line;
  reintroducing limits *gated to a corner that also carries a target* is the
  middle option that was considered and set aside. Decide from played games,
  and delete the dead limit machinery only once decided.
- **Playtesting the cost model.** `GLOBAL_VOLUME` and `LENGTH_SHARE` are now
  measured (three Endless games, n=3 — worth re-reading once there are more,
  since the median of 22 and the mean of 42 disagree sharply and one 89-word
  run drives the gap). What remains unmeasured is everything about *rarity*:
  the `STEERING` factor on the two vowel properties, the independence
  assumption behind compound rarity, and whether rows sharing a cost are
  really comparable work. None of those show up in Endless play — they need
  `npm run db:objectives`, which prints `exclude` as its own column precisely
  so an excluded row can be compared against its unmodified twin at the same
  cost.
- **Whether Expert should be winnable in a 22-word game.** It currently is
  not: mean demand 32.8 against a measured median of 22 means the tier is
  aimed at the upper half of a player's own range, and losing is the expected
  outcome of a mediocre game. That is a deliberate reading of "Expert" and it
  has never been played. If it lands wrong, `MIN_DEMAND.expert` moves before
  anything else does.
  This waits on played games rather than plumbing. Watch whether rows
  sharing a cost really are comparable work. Nothing retunes the pool
  automatically, and nothing should — read the rates, then edit by hand.
- **Saying anything about a tier beyond its name.** The buttons are bare
  labels. They briefly carried a deal-size range, which was removed: the
  ranges overlap badly and widen with every type added, so they
  discriminated by almost nothing. Don't reintroduce that one. A difficulty
  meter, or the budget under a name that doesn't collide with score, are
  the things worth trying.
- **Remembering the player's choice.** The splash asks every game; nothing
  persists the last mode/difficulty. Undecided.
- **More properties and modes.** Adding a property is now the cheap,
  high-leverage move — one entry in `properties.js` yields its whole column
  of objectives. Candidates the axes already support: contains a given
  letter, double letter, no repeated letter. Each needs a `rarity` estimate
  and a decision about where (if anywhere) it sits in the implication
  lattice; a property that implies nothing and is implied by nothing but
  `any` is the easy case and needs no lattice work at all.
- **A soft cap on objectives per corner.** Deliberately absent for now: the
  possibility check keeps a stack coherent, and unlimited stacking is worth
  playing before deciding it's too much. Deals put 3+ on one corner about
  12% of the time and 4+ about 1%. If it reads as crowded, a cap belongs in
  the selector's pruning predicate, not in the generator.
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
