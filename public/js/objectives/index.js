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
  defineMode,
  challenge,
  createMode,
  getGameMode,
  listGameModes,
  dealSizeRangeFor,
  budgetFor,
  selectWithinBudget,
  feasibleDealSizes,
} from './modes.js';
export { ObjectiveStatus } from './tracker.js';
export {
  Difficulty,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_ORDER,
  DIFFICULTY_LABELS,
  isDifficulty,
  listDifficulties,
} from './difficulty.js';
export { listDefinitions, describeSpec } from './definitions.js';
