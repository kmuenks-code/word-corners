// The one object main.js holds. Owns the event log, the live objectives,
// the running counters, and the mode's verdict.
//
// Undo is the reason this is event-sourced. The game has a single-level
// undo that fully reverses a move, and making every objective implement
// its own reversal would be both tedious and fragile. Instead the runtime
// keeps the events since the last checkpoint, and rewinding replays them
// from a captured baseline — so any objective anyone writes, however
// exotic its progress, undoes correctly for free.
//
// The main.js contract, in order of a turn:
//   mark()            before a move's events — stash the marker on lastMove
//   emit(type, data)  as things happen
//   rewindTo(marker)  on undo
//   commit()          wherever main.js clears lastMove (undo checkpoint);
//                     drops the log and rebaselines, bounding memory
//   status            checked after a move; anything but 'active' ends the game
//   finish()          once, from endGame(), for the final verdict
//   reset(mode?)      new game; pass a mode to switch (e.g. a different
//                     game mode, or the same one at another difficulty)

import { GameEvent, isDurableEvent } from './events.js';
import { ModeOutcome, NO_OBJECTIVES } from './modes.js';
import {
  ObjectiveStatus,
  applyEventToObjective,
  captureProgress,
  finalizeObjectives,
  instantiateObjectives,
  restoreProgress,
  snapshotObjectives,
} from './tracker.js';

function freshCounters() {
  return { moves: 0, words: 0, score: 0 };
}

export function createObjectiveRuntime(initialMode = NO_OBJECTIVES, { now = Date.now } = {}) {
  let mode = initialMode;
  let objectives = [];
  let counters = freshCounters();
  // Events since the last commit(), plus how many were dropped before them.
  // Markers are `base + log.length`, so they stay meaningful across commits
  // and a stale one is detectable rather than silently wrong.
  let log = [];
  let base = 0;
  let baseline = null;
  let startedAt = now();
  let outcome = { status: ModeOutcome.ACTIVE, reason: null };
  let finished = false;
  const listeners = new Set();

  // An endless game with no objectives and no limits has nothing to track,
  // so emit() returns immediately and the log never grows.
  function engaged() {
    return objectives.length > 0 || mode.limits.moves !== null || mode.limits.seconds !== null;
  }

  function elapsedSeconds() {
    return (now() - startedAt) / 1000;
  }

  function captureBaseline() {
    return {
      objectives: captureProgress(objectives),
      counters: { ...counters },
      outcome: { ...outcome },
    };
  }

  function load() {
    objectives = instantiateObjectives(mode.selectObjectives());
    counters = freshCounters();
    log = [];
    base = 0;
    startedAt = now();
    outcome = { status: ModeOutcome.ACTIVE, reason: null };
    finished = false;
    baseline = captureBaseline();
  }

  function fold(event) {
    if (event.type === GameEvent.LETTER_PLACED) counters.moves += 1;
    if (event.type === GameEvent.WORD_SCORED) {
      counters.words += 1;
      counters.score += event.points ?? 0;
    }
    objectives.forEach((objective) => applyEventToObjective(objective, event));
  }

  // Sticky: once a mode has declared a winner or a loser, later events in
  // the same move can't overturn it. Replay reproduces this exactly, since
  // it evaluates after each event in the same order.
  function evaluateOutcome() {
    if (outcome.status !== ModeOutcome.ACTIVE) return;
    outcome = mode.evaluate(mode, {
      objectives,
      counters: { ...counters, elapsedSeconds: elapsedSeconds() },
    });
  }

  function replay() {
    restoreProgress(objectives, baseline.objectives);
    counters = { ...baseline.counters };
    outcome = { ...baseline.outcome };
    log.forEach((event) => {
      fold(event);
      evaluateOutcome();
    });
  }

  function snapshot() {
    return {
      mode: {
        id: mode.id,
        label: mode.label,
        difficulty: mode.difficulty,
        limits: mode.limits,
      },
      status: outcome.status,
      reason: outcome.reason,
      finished,
      counters: { ...counters, elapsedSeconds: elapsedSeconds() },
      objectives: snapshotObjectives(objectives),
    };
  }

  function notify() {
    if (listeners.size === 0) return;
    const view = snapshot();
    listeners.forEach((listener) => listener(view));
  }

  load();

  return {
    get mode() {
      return mode;
    },
    // 'active' | 'won' | 'lost'. main.js ends the game on anything but
    // 'active'; see maybeEndGame there.
    get status() {
      return outcome.status;
    },
    get finished() {
      return finished;
    },

    emit(type, payload = {}) {
      if (finished || !engaged()) return;
      const event = { type, ...payload };
      // The clock tracks play time, not load time — same reason
      // markGameStarted() exists. Deliberately outside fold(), so a replay
      // never moves it.
      if (type === GameEvent.GAME_STARTED) startedAt = now();
      log.push(event);
      fold(event);
      evaluateOutcome();
      notify();
    },

    // Opaque position in the event stream. Stash it on the move record;
    // hand it back to rewindTo() to undo everything since.
    mark() {
      return base + log.length;
    },

    rewindTo(marker) {
      if (finished) return;
      if (marker < base) {
        throw new Error(
          `objectives: cannot rewind to ${marker}; events up to ${base} were committed`
        );
      }
      const cut = marker - base;
      if (cut > log.length) {
        throw new Error(`objectives: cannot rewind to ${marker}; only ${base + log.length} events`);
      }
      // Durable events (an invalid submission, say) describe something undo
      // doesn't take back, so they survive the rewind. See events.js.
      const kept = log.slice(cut).filter((event) => isDurableEvent(event.type));
      log = log.slice(0, cut).concat(kept);
      replay();
      notify();
    },

    // Nothing before this point can be undone any more, so the log can be
    // dropped and the current progress becomes the new replay baseline.
    commit() {
      if (finished) return;
      base += log.length;
      log = [];
      baseline = captureBaseline();
    },

    // For a mode with a `seconds` limit: a UI timer calls this so the
    // limit can expire between moves rather than waiting for the next one.
    tick() {
      if (finished || !engaged()) return;
      evaluateOutcome();
      notify();
    },

    // Final verdict. Idempotent — calling it twice keeps the first result.
    finish() {
      if (finished) return snapshot();
      finished = true;
      finalizeObjectives(objectives);
      if (outcome.status === ModeOutcome.ACTIVE && objectives.length > 0) {
        const allComplete = objectives.every((o) => o.status === ObjectiveStatus.COMPLETE);
        outcome = allComplete
          ? { status: ModeOutcome.WON, reason: 'objectivesComplete' }
          : { status: ModeOutcome.LOST, reason: 'objectivesUnfinished' };
      }
      notify();
      return snapshot();
    },

    // New game. Pass a mode to switch at the same time — changing game
    // mode or difficulty is reset(createMode(id, tier)) and nothing else.
    reset(nextMode = mode) {
      mode = nextMode;
      load();
      notify();
    },

    snapshot,

    // For a future HUD: subscribe once, re-render on every change, and the
    // renderer still never learns anything about game state. Returns an
    // unsubscribe function.
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
