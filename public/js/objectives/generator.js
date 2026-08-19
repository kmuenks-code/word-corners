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
import { listPropertyTunings, propertyRarity, propertySubsumes } from './properties.js';

// Words a player scores in a whole game. The single number every global
// objective is measured against.
//
// This was 30 on first estimate and is wrong by a lot: a scripted player
// banking every valid word it could find averaged 6.6 words a game over 25
// games (best run 29, and several games closed the board with nothing
// banked). Corners dead-end far sooner than the guess assumed. 12 allows
// that a human plans openings, spends blanks well, and reads the board in
// ways the script does not — but the honest reading of the only evidence
// available is that this is still generous. Correct it from
// `npm run db:games`, which records words-per-game directly.
const GLOBAL_VOLUME = 12;

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
const TARGET_CORNER_VOLUME = 4;
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
const MAX_COST = 6;

// Loop guard only — no real ladder gets near it.
const MAX_COUNT = 500;

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
  return [params.property, params.length ?? '-', params.scope, params.constraint].join('|');
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

  for (let count = 1; count <= MAX_COUNT; count++) {
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
export function buildObjectivePool() {
  const rows = [];
  listPropertyTunings().forEach((property) => {
    CONSTRAINTS.forEach((constraint) => {
      // Limits are corner-only. "Score fewer than N words" with no corner
      // named would constrain the entire board rather than ask something of
      // a place on it, and it contradicts most targets outright.
      const scopes =
        constraint === Constraint.FEWER_THAN ? CORNERS : [GLOBAL_SCOPE, ...CORNERS];
      scopes.forEach((scope) => {
        ladder({ ...property, scope, constraint }).forEach(({ cost, ...params }) => {
          rows.push({ type: COMPOSED_TYPE, params, cost });
        });
      });
    });
  });
  return Object.freeze(rows);
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
    a.constraint === b.constraint &&
    a.count === b.count
  );
}

// Whether two pool rows can appear in the same deal. Order-independent.
export function rowsIncompatible(a, b) {
  return (
    sameDemandDifferentCorner(a.params, b.params) ||
    incompatibleOrdered(a.params, b.params) ||
    incompatibleOrdered(b.params, a.params)
  );
}
