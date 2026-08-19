// The objective system's public surface. main.js imports from here and
// nothing else in js/objectives/ — so the internals (how progress is
// stored, how undo replays, how a mode reaches its verdict) can change
// without touching the game.

export { GameEvent } from './events.js';
export { createObjectiveRuntime } from './runtime.js';
export {
  ModeOutcome,
  NO_OBJECTIVES,
  GAME_MODES,
  OBJECTIVE_POOL,
  POINT_BUDGETS,
  MIN_DEMAND,
  dealDemand,
  defineMode,
  challenge,
  createMode,
  getGameMode,
  listGameModes,
  selectWithinBudget,
  feasibleDealSizes,
} from './modes.js';
export { ObjectiveStatus } from './tracker.js';
// The generative layer, for tooling that wants to inspect or re-price the
// objective space rather than play it: what the axes are, and what any one
// combination costs.
export { buildObjectivePool, costOf, rawCost, rowsIncompatible } from './generator.js';
export { listPropertyTunings } from './properties.js';
export {
  Difficulty,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_ORDER,
  DIFFICULTY_LABELS,
  isDifficulty,
  listDifficulties,
} from './difficulty.js';
export { listDefinitions, describeSpec, CORNERS, SCOPES, Constraint } from './definitions.js';
