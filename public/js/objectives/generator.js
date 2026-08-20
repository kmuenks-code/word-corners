// Generating the objective pool, and pricing what it generates.
//
// The pool used to be forty hand-written rows, each with a hand-guessed
// `cost`. It is now enumerated: every combination of property × scope ×
// constraint that survives the cost model becomes a row, and adding a
// property to properties.js adds its whole column of objectives — every
// scope, both constraints, a full ladder of counts — without touching this
// file or modes.js.
//
// Enumerated at module load rather than sampled per deal, deliberately:
//
//   - the selector's search stays exhaustive, so `null` still *proves* a
//     budget unspendable and the module-load validator still means something;
//   - the tuning space stays finite, so `npm run db:objectives` keeps enough
//     games per cell to read a success rate off. Sampling counts from a
//     continuous range would scatter the data across hundreds of near-
//     duplicate tunings and make the table unreadable.
//
// ---------------------------------------------------------------------
// THE COST MODEL
//
// A cost is meant to be *comparable across rows* — two 3-cost objectives
// should be about equally hard — because that is exactly what the budget
// treats them as. So cost cannot be a sum of per-axis constants: the axes
// interact.
//
//   - Corner scope doesn't add a fixed amount to a property, it *divides*
//     the words available to satisfy it. "3 words starting with a vowel" is
//     a moderate ask globally and a severe one in a single corner.
//   - How much one more word costs depends on the property: +5 three-letter
//     words is loose change, +5 six-letter words is most of a game.
//   - A limit inverts both. A rarer property makes a limit *easier* to keep,
//     and a bigger allowance makes it easier still — the opposite of how
//     both read on a target.
//
// So everything is priced off one derived quantity: `expected`, how many
// matching words a player would score in that scope without trying hard.
// That's `volume × rarity`, and it is where the multiplication lives.
//
// Every constant below is a first-pass estimate, reasoned rather than
// played — the same caveat the old hand-written costs carried, except that
// there are now nine numbers to retune instead of forty rows. The per-tuning
// success rates from `npm run db:objectives` are what should correct them:
// a tuning near 100% is priced too cheap, one near 0% too dear, and rows
// sharing a cost whose rates diverge mean the model is mixing easy and hard
// work at one price.
// ---------------------------------------------------------------------

import {
  CONSTRAINTS,
  CORNERS,
  Constraint,
  COMPOSED_TYPE,
  GLOBAL_SCOPE,
  scopeSubsumes,
} from './definitions.js';
import {
  listExclusions,
  listPropertyTunings,
  propertyRarity,
  propertySubsumes,
} from './properties.js';

// Words a player scores in a whole game. The single number every global
// objective is measured against, and the one it is most important to get from
// evidence rather than reasoning.
//
// **Measured, finally, from human Endless play**: three games at 0.14.0 banked
// 15, 22 and 89 words — mean 42, median 22. 30 sits between them.
//
// The history here is a warning about which games you measure. An early guess
// of 30 was cut to 12 on the strength of a scripted player averaging 6.6, and
// that correction was wrong in both its inputs:
//
//   - The script banked every valid word the instant it existed, so it never
//     scored enough per word to cross the 25-point blank threshold. It played
//     a game without blanks and reported the length of one.
//   - Every other game on record was an OBJECTIVE game, which ends the moment
//     its goals are met. `words_total` there measures when the deal stopped,
//     not what the board can produce. 32 such games averaged 5.9 and never
//     exceeded 15 — entirely because no deal ever asked for more.
//
// What both missed is that blanks compound. A blank escapes a dead corner, so
// corners stay open, so the game runs longer, so more score accrues, so more
// blanks are earned. The 89-word game earned 25 blanks and ran 66 minutes.
// **Read this number from Endless games only**, and re-read it after any
// change to BLANK_SCORE_INTERVAL or the scoring formula.
const GLOBAL_VOLUME = 30;

// Words scored in *one* corner. Two numbers, not one, and the asymmetry is
// the point:
//
//   - A target asks the player to steer toward a corner, and they can — so
//     a corner they are actively feeding takes well more than an even
//     quarter share.
//   - A limit asks them not to steer, so what matters is what lands there
//     when they aren't trying. That's the even share.
//
// Pricing both off the same number would make limits look harsher than they
// are and targets look easier.
// Held at a third of the whole game, above the even quarter: a corner the
// player is actively feeding takes more than its share, and blanks make that
// steering easier than it was when this was 4 against a volume of 12.
const TARGET_CORNER_VOLUME = GLOBAL_VOLUME / 3;
const LIMIT_CORNER_VOLUME = GLOBAL_VOLUME / CORNERS.length;

// A target asking for exactly the player's expected output costs this much.
// Everything else on the target ladder is linear in `count / expected`, so
// half your expected output is half this, and twice it is twice this.
const TARGET_COST_SCALE = 5;

// What it costs to write off one corner entirely — the most a limit can ask.
// A limit that only forbids *some* of a corner's output is priced down in
// proportion to the words it actually denies.
const ABANDON_CORNER_COST = 4;

// A row cheaper than this rounds to 1 but isn't worth a slot: it's an
// objective the player would clear without noticing, and at 1 cost it would
// crowd out real ones on a small budget. Dropping them is what stops the
// grid filling up with free squares.
const MIN_RAW_COST = 0.75;

// Nothing dearer than this is generated. Because the target ladder is
// linear in `count / expected`, this cap *is* a statement about how far past
// their expected output a player can be asked to go: at TARGET_COST_SCALE 5,
// cost 6 means 1.2×. Raising it to 8 would mean 1.6× — "score 50 words" in a
// game that yields about 30, which is not a hard objective but an impossible
// one. It also sets the floor on deal size: an Expert budget of 16 cannot be
// spent on fewer than three objectives.
//
// **Now 10 — 2× expected output.** 1.2× was chosen when GLOBAL_VOLUME was a
// guess and the spread between games was assumed small. The measured spread is
// enormous: 15, 22 and 89 words across three games of the same build, because
// how long a game runs is mostly decided by how well its blanks are spent.
// Against a median of 22 and a best of 89, asking 2× the typical game is
// demanding rather than impossible — and 1.2× could not reach the top of that
// range at all, which is why an Expert deal used to cap out at 15 words.
const MAX_COST = 10;

// Loop guard only — no real ladder gets near it.
const MAX_COUNT = 500;

// An exclusion below this count isn't a constraint, it's a reroll. "Score a
// word that doesn't start with a vowel" asks the player to avoid a ~12% case
// once, and a failed attempt costs them nothing — they simply score the next
// word instead. An exclusion only means anything held across several words.
const MIN_EXCLUSION_COUNT = 2;

function volumeFor(scope, constraint) {
  if (scope === GLOBAL_SCOPE) return GLOBAL_VOLUME;
  return constraint === Constraint.FEWER_THAN ? LIMIT_CORNER_VOLUME : TARGET_CORNER_VOLUME;
}

// The unrounded cost of one fully specified objective. Exported because it
// is the thing worth inspecting when a tier feels wrong — print it across a
// ladder and the shape of the model is immediately visible.
export function rawCost(params) {
  const expected = volumeFor(params.scope, params.constraint) * propertyRarity(params);
  if (!(expected > 0)) return Infinity;

  if (params.constraint === Constraint.FEWER_THAN) {
    // What the limit denies: the matching words that would have landed here
    // anyway, less the ones it still allows (`count - 1`, since failing is
    // reaching `count`). Scaled so that denying all of them — "score no such
    // words in this corner" at a property matching everything — is exactly
    // ABANDON_CORNER_COST.
    const forgone = Math.max(0, expected - (params.count - 1));
    return (ABANDON_CORNER_COST * forgone) / LIMIT_CORNER_VOLUME;
  }

  return (TARGET_COST_SCALE * params.count) / expected;
}

export function costOf(params) {
  return Math.max(1, Math.round(rawCost(params)));
}

// What makes two rows alternative tunings of one another rather than
// different objectives: everything except the count. The selector takes at
// most one row per family, which is what keeps deal sizes varied — see
// findCombination in modes.js.
export function familyKey(params) {
  return [
    params.property,
    params.length ?? '-',
    params.exclude || '-',
    params.scope,
    params.constraint,
  ].join('|');
}

// The ladder of counts for one family, as priced rows.
//
// Counts are walked from the strict end until the cost leaves range, and
// then **one row is kept per cost level: the most demanding tuning at that
// price**. Without that a common property yields six different counts all
// rounding to 1, and the selector would fill an Easy budget with four
// near-identical trivia. Which end is "most demanding" flips with the
// constraint — the biggest count for a target, the smallest for a limit —
// because that is the direction difficulty runs in each case.
function ladder(base) {
  const byCost = new Map();
  const target = base.constraint === Constraint.AT_LEAST;

  const minCount = base.exclude ? MIN_EXCLUSION_COUNT : 1;

  for (let count = minCount; count <= MAX_COUNT; count++) {
    const params = { ...base, count };
    const raw = rawCost(params);

    if (target) {
      // Rises with count: too cheap now may become right, too dear is final.
      if (raw > MAX_COST + 0.5) break;
      if (raw < MIN_RAW_COST) continue;
    } else {
      // Falls with count: once it's below the floor it stays there.
      if (raw < MIN_RAW_COST) break;
      if (raw > MAX_COST + 0.5) continue;
    }

    const cost = costOf(params);
    if (cost > MAX_COST) continue;
    // First write wins for a limit (smallest count), last wins for a target
    // (largest count) — in both cases the hardest tuning at that price.
    if (target || !byCost.has(cost)) byCost.set(cost, { ...params, cost });
  }

  return [...byCost.values()];
}

// Every objective the game can deal, priced. One row is
// `{ type, params, cost }` — the same plain-data spec shape a hand-written
// mode would use, so nothing downstream of here knows the pool was
// generated.
// Standalone limits are no longer generated: a `fewerThan` row was priced as
// if the player wanted to score in the corner it named, and in most deals
// nothing made them, so it took budget and asked nothing. Measured across
// 2,000 deals a tier, 60-79% of deals carried a limit on a corner with no
// target on it, and targets accounted for only 51% of an Easy budget.
//
// The restriction survives as an *exclusion* on a target instead — see the
// EXCLUSIONS note in properties.js. It can't fail to bind, because it narrows
// the very words the player has to produce.
//
// The FEWER_THAN machinery below and downstream (the constraint axis, the
// `enduring` limit semantics in definitions.js, the countdown in the HUD) is
// intact and is no longer dead: limits come back as *riders* attached to a
// corner target after selection, which is what fixes the pricing problem
// above. See TENSION RIDERS below. This line still governs only whether a
// limit can be dealt on its own, which it can't.
const GENERATED_CONSTRAINTS = CONSTRAINTS.filter((c) => c !== Constraint.FEWER_THAN);

export function buildObjectivePool() {
  const rows = [];
  listPropertyTunings().forEach((property) => {
    listExclusions(property).forEach((exclude) => {
      GENERATED_CONSTRAINTS.forEach((constraint) => {
        [GLOBAL_SCOPE, ...CORNERS].forEach((scope) => {
          ladder({ ...property, exclude, scope, constraint }).forEach(({ cost, ...params }) => {
            rows.push({ type: COMPOSED_TYPE, params, cost });
          });
        });
      });
    });
  });
  return Object.freeze(rows);
}

// ---------------------------------------------------------------------
// TENSION RIDERS
//
// A limit that is dealt *onto* a corner target rather than on its own, and
// the answer to the free-lunch problem that killed the standalone limit.
//
// The failure recorded above was not that limits are a bad mechanic. It was
// that `cost` is priced per row while a limit's difficulty is a property of
// the deal: a limit only asks something if something else makes the player
// want to score in the corner it names, and nothing in a deal did. No number
// written in this file can be right for a row like that.
//
// So a rider is not a row. It is not enumerated, not priced, and never enters
// OBJECTIVE_POOL — it is attached after selection to a target already dealt on
// that corner (see attachRiders in modes.js), and it is described by one
// deal-level number instead of a cost:
//
//     slack = allowance - target count
//
// the words the player may bank in that corner *without* them counting. Slack
// 0 would mean every word banked there has to match; slack 5 means the limit
// is not really there. That number is knowable at selection time, which is
// exactly what a per-row cost could never be.
//
// A rider spends no budget, deliberately. POINT_BUDGETS and MIN_DEMAND both
// measure *work* — how hard each goal is, and how much game the deal adds up
// to — and a rider adds neither. It adds risk. Charging budget for it would
// have it displace the very target that makes it bind.
// ---------------------------------------------------------------------

// Whether a target can carry a rider at all.
//
// The load-bearing clause is the rarity one. A cap only creates a decision if
// some of what the player could bank in that corner *doesn't* count toward the
// target — those are the words the allowance is spent on. Against `any` with no
// exclusion every banked word counts, so progress and the allowance advance in
// lockstep and the limit can only be breached after the target is already met:
// no decision, just a trap for playing on in a finished corner. `propertyRarity`
// is precisely the test for that, exclusion included.
export function canCarryRider(params) {
  return (
    params.scope !== GLOBAL_SCOPE &&
    params.constraint === Constraint.AT_LEAST &&
    propertyRarity(params) < 1
  );
}

// The limit riding on `row`: same corner, any word, an allowance of the
// target's count plus `slack` that don't count. Failing is `progress >= count`
// (see definitions.js), so the words actually bankable there are `count - 1` —
// hence the +1.
//
// `cost` is 0 rather than null. Null already means "a mode that listed this
// objective outright instead of pricing it"; 0 says the thing that is true
// here, which is that this row was dealt against no budget — and it makes
// riders a one-column filter in the `npm run db:costs` rollup.
export function buildRider(row, slack) {
  const { scope, count } = row.params;
  return {
    type: COMPOSED_TYPE,
    params: {
      property: 'any',
      exclude: '',
      scope,
      constraint: Constraint.FEWER_THAN,
      count: count + slack + 1,
    },
    cost: 0,
  };
}

// ---------------------------------------------------------------------
// The possibility check
//
// This replaces the old one-objective-per-corner rule. That rule banned
// same-corner pairings wholesale because it had no way to tell a
// contradiction from a coincidence; the check below can, so corners are now
// unrestricted and only genuinely broken pairs are refused.
//
// It rests on one relation: does every word row A counts also get counted by
// row B? That's `propertySubsumes` and `scopeSubsumes` together — vowel-
// initial words are words, six-letter words are 5+ letter words, a corner is
// inside global. Given that containment, three things follow, and all three
// are worth refusing:
//
//   1. CONTRADICTION. A demands m, B forbids reaching n, and m >= n. Meeting
//      A necessarily fails B. This is the unwinnable case — "score 3 or more
//      words starting with a vowel here" beside "score fewer than 3 words
//      here".
//   2. A FREE TARGET. Both demand, A's demand is the stricter, and clearing
//      it clears B automatically. B occupied a slot and asked for nothing.
//   3. A FREE LIMIT. Both forbid, B's is the tighter, and keeping it keeps A
//      automatically. Same waste, other direction.
//
// Sound but not complete, and deliberately so. It refuses no winnable deal,
// but it reasons only about pairs and only about containment, so it cannot
// see that three separate corner targets jointly want more words than a
// board produces, and it does not know that two overlapping-but-unrelated
// properties are hard to satisfy together. Those are questions for a real
// requirements algebra; this is the part that is decidable from counts.
// ---------------------------------------------------------------------

// Every word `a` counts is also counted by `b`.
function counted(a, b) {
  return propertySubsumes(a, b) && scopeSubsumes(a.scope, b.scope);
}

function incompatibleOrdered(a, b) {
  if (!counted(a, b)) return false;
  const { AT_LEAST, FEWER_THAN } = Constraint;
  // 1. a's target forces b's limit past its breaking point.
  if (a.constraint === AT_LEAST && b.constraint === FEWER_THAN) return a.count >= b.count;
  // 2. a's target is the stricter of two, so b comes free.
  if (a.constraint === AT_LEAST && b.constraint === AT_LEAST) return a.count >= b.count;
  // 3. b's limit is the tighter of two, so a comes free.
  if (a.constraint === FEWER_THAN && b.constraint === FEWER_THAN) return a.count >= b.count;
  // A limit on a subset says nothing about a target on its superset.
  return false;
}

// Two corner rows that differ *only* in which corner they name.
//
// Not a possibility problem — "score 2 or more 4+ letter words" in the NW
// corner and again in the NE is perfectly winnable, and the two are
// different families, so nothing above rejects them. It is a reading
// problem: a description never names its corner (the renderer draws the
// shape instead), so these two produce **identical text**, and the player
// gets a panel with the same sentence twice, told apart only by a small
// glyph in the gutter. Measured at 20-28% of deals before this rule.
//
// It also makes for a dull deal — the same demand twice is less interesting
// than two different ones — which is the one thing the old
// one-objective-per-corner rule was giving away for free.
//
// Deliberately narrow: it says nothing about how many objectives may share a
// corner, only that two corners may not be handed the same sentence. The
// global-vs-corner version of this pair needs no rule, since a corner target
// subsumes the identical global one and is already refused above.
function sameDemandDifferentCorner(a, b) {
  if (a.scope === GLOBAL_SCOPE || b.scope === GLOBAL_SCOPE || a.scope === b.scope) return false;
  return (
    a.property === b.property &&
    a.length === b.length &&
    a.exclude === b.exclude &&
    a.constraint === b.constraint &&
    a.count === b.count
  );
}

// At most one objective in a deal may carry an exclusion.
//
// Not a possibility problem either — several are perfectly winnable. It is
// the same reading problem `sameDemandDifferentCorner` guards against, one
// step out: an exclusion costs so little (avoiding a vowel start is a ~12%
// tax) that nearly every family has an excluded twin at the same price, and
// without this the selector cheerfully deals four of them. Measured before
// this rule, a Hard panel routinely carried "…, none starting with a vowel"
// on three separate lines, which is a wall of near-identical text rather than
// three distinguishable goals.
//
// One per deal makes the exclusion read as what it is: the twist on this
// particular hand.
function bothExcluded(a, b) {
  return Boolean(a.exclude) && Boolean(b.exclude);
}

// Whether two pool rows can appear in the same deal. Order-independent.
export function rowsIncompatible(a, b) {
  return (
    bothExcluded(a.params, b.params) ||
    sameDemandDifferentCorner(a.params, b.params) ||
    incompatibleOrdered(a.params, b.params) ||
    incompatibleOrdered(b.params, a.params)
  );
}
