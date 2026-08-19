// Live objectives: turning specs into instances, folding events into their
// progress, and resolving each one's status. Pure data manipulation — the
// event log, the mode, and the win/lose verdict all live in runtime.js.
//
// A *spec* is the plain-data form an objective is authored in, so a game
// mode's objective list — and the priced pool it may be drawn from — is
// just JSON:
//   { type: 'composed',
//     params: { property: 'lengthExactly', length: 3,
//               scope: 'global', constraint: 'atLeast', count: 8 } }
// `params` may be partial — the definition's defaults fill the rest (see
// resolveParams in definitions.js). `id` and `description` are optional
// overrides. A pool row additionally carries `cost`, which matters to the
// selector in modes.js; here it is only carried through onto the instance
// and into the snapshot, so a recorded game can say what a completed or
// failed objective was priced at (see "Recording objective results" in
// CLAUDE.md). Nothing in this file reads it.
//
// An *instance* adds the resolved params plus mutable progress/status.

import { getDefinition, resolveParams, scopeCorner } from './definitions.js';

export const ObjectiveStatus = Object.freeze({
  ACTIVE: 'active',
  COMPLETE: 'complete',
  FAILED: 'failed',
});

// Progress values are required to be JSON-serializable (numbers, arrays,
// plain objects) so they can be snapshotted for replay and, later, stored.
function clone(value) {
  return value === null || typeof value !== 'object' ? value : JSON.parse(JSON.stringify(value));
}

export function instantiateObjectives(specs = []) {
  return specs.map((spec, index) => {
    const definition = getDefinition(spec.type);
    const params = resolveParams(spec.type, spec.params);
    return {
      id: spec.id ?? `${spec.type}-${index + 1}`,
      type: spec.type,
      params,
      // Null for a mode that lists its objectives outright rather than
      // drawing them from a priced pool.
      cost: spec.cost ?? null,
      definition,
      description: spec.description ?? definition.describe(params),
      goal: definition.goal(params),
      // Whether an objective is a limit or a target is now the constraint
      // axis rather than a fact about its type, so `enduring` is a function
      // of params (see definitions.js).
      enduring: definition.enduring?.(params) === true,
      progress: definition.initial(params),
      status: ObjectiveStatus.ACTIVE,
    };
  });
}

export function currentValue(objective) {
  return objective.definition.measure(objective.progress, objective.params);
}

function resolveStatus(objective) {
  const { definition, params, progress } = objective;
  if (definition.failed?.(progress, params)) {
    objective.status = ObjectiveStatus.FAILED;
    return;
  }
  // Enduring objectives are limits, not targets — they only resolve at
  // game end (see finalizeObjectives).
  if (!objective.enduring && currentValue(objective) >= objective.goal) {
    objective.status = ObjectiveStatus.COMPLETE;
  }
}

// Resolved objectives freeze: a completed objective can't be un-completed
// by later events, and a failed one stays failed. Rewinding is what takes
// a resolution back, and it does so by replaying from a clean baseline.
export function applyEventToObjective(objective, event) {
  if (objective.status !== ObjectiveStatus.ACTIVE) return;
  objective.progress = objective.definition.advance(objective.progress, event, objective.params);
  resolveStatus(objective);
}

export function resetObjectives(objectives) {
  objectives.forEach((objective) => {
    objective.progress = objective.definition.initial(objective.params);
    objective.status = ObjectiveStatus.ACTIVE;
  });
}

export function captureProgress(objectives) {
  return objectives.map((objective) => ({
    progress: clone(objective.progress),
    status: objective.status,
  }));
}

export function restoreProgress(objectives, captured) {
  objectives.forEach((objective, index) => {
    const saved = captured[index];
    objective.progress = clone(saved.progress);
    objective.status = saved.status;
  });
}

// Called once when the game ends. An enduring objective that never failed
// has been satisfied by surviving; a normal one still short of its goal is
// now out of time.
export function finalizeObjectives(objectives) {
  objectives.forEach((objective) => {
    if (objective.status !== ObjectiveStatus.ACTIVE) return;
    objective.status = objective.enduring ? ObjectiveStatus.COMPLETE : ObjectiveStatus.FAILED;
  });
}

// The shape a UI (or a stored record) sees. Deliberately excludes the
// definition object itself so the result stays serializable. `current` is
// reported raw — a 214-point game against a 150-point goal reads 214, and
// it's the renderer's job to clamp a progress bar if it wants to.
//
// `params` and `cost` are here for the recorded result rather than for the
// HUD: a success rate is only meaningful per *tuning*, so "8 three-letter
// words" has to be distinguishable from "18" of them in the stored row.
// params values are primitives, so a shallow copy is a full one.
//
// `corner` is derived once here rather than in each renderer. It used to be
// read straight off `params.corner` by both the objective list and the
// corner flags; with scope now an axis in its own right, resolving it in one
// place keeps the UI from having to know how a scope is spelled.
export function snapshotObjectives(objectives) {
  return objectives.map((objective) => ({
    id: objective.id,
    type: objective.type,
    params: { ...objective.params },
    corner: scopeCorner(objective.params.scope),
    cost: objective.cost,
    description: objective.description,
    current: currentValue(objective),
    goal: objective.goal,
    enduring: objective.enduring,
    status: objective.status,
  }));
}
