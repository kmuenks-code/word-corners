// Single source of truth for the build's version string. Recorded with
// every game result sent to the database (see api.js) so score/pacing data
// can be sliced by which iteration of the rules produced it.
//
// Bump this whenever a change would make results non-comparable with the
// previous version — new scoring formula, different letter distribution,
// changed word-length thresholds, new mechanics. Cosmetic/CSS-only changes
// don't need a bump.
export const GAME_VERSION = '0.13.0';
