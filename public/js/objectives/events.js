// The vocabulary the core game speaks to the objective system.
//
// This is the *only* coupling between the two: main.js emits these events
// as things happen, and objectives are pure reducers over the stream. No
// objective ever reads gameState, and nothing in gameState/ui/input knows
// objectives exist. Payloads are therefore denormalized — every field an
// objective could need has to be on the event itself.
//
// Payload shapes (all fields required unless noted):
//
//   GAME_STARTED   {}
//       Emitted from initRound(), i.e. once the first letters are actually
//       dealt. Also restarts the runtime's clock, so a mode's `seconds`
//       limit measures play time rather than word-list load time — the
//       same reason markGameStarted() exists in gameState.js.
//
//   LETTER_PLACED  { corner, letter, word, blank }
//       One letter appended to a corner. `word` is the corner's word
//       *after* the append; `blank` is true when it came from the blank
//       tile rather than a choice bubble. This is the game's unit of
//       "move" — the runtime counts these for mode move limits.
//
//   WORD_SCORED    { corner, word, length, points, usedBlank }
//       A submission that actually scored (valid, MIN_WORD_LENGTH+).
//       `usedBlank` mirrors main.js's hadBlank: the word contained a
//       blank-derived letter, so it earns no new blank.
//
//   WORD_REJECTED  { corner, word, length, reason }
//       A submission that shook instead of scoring. reason is
//       'tooShort' or 'notAWord'. Durable — see DURABLE_EVENTS below.
//
//   CORNER_CLOSED  { corner, word }
//       A corner dead-ended (no dictionary word starts with its letters).
//
//   BLANK_AWARDED  { corner, word }
//       A 5+ letter word earned a blank tile. `corner`/`word` are the
//       submission that earned it.
//
//   GAME_ENDED     { score }
//       Emitted once, from endGame(), before the final verdict is
//       resolved — so an objective can still react to the last moment.
//
// Undo is deliberately NOT an event. Because objectives are pure reducers
// over this log, reversing a move is expressed as rewinding the log and
// replaying it (see runtime.js). That means an objective author never has
// to write an "undo" branch, and can't get one wrong.

export const GameEvent = Object.freeze({
  GAME_STARTED: 'gameStarted',
  LETTER_PLACED: 'letterPlaced',
  WORD_SCORED: 'wordScored',
  WORD_REJECTED: 'wordRejected',
  CORNER_CLOSED: 'cornerClosed',
  BLANK_AWARDED: 'blankAwarded',
  GAME_ENDED: 'gameEnded',
});

// Events that record something undo can't take back. A rejected submission
// really happened — the shake, the wasted tap — and undoing the *drop* that
// preceded it doesn't unhappen it. These survive a rewind (see
// runtime.rewindTo) while everything else in the rewound span is discarded.
// Add a type here only if it describes an action rather than a state change.
const DURABLE_EVENTS = Object.freeze(new Set([GameEvent.WORD_REJECTED]));

export function isDurableEvent(type) {
  return DURABLE_EVENTS.has(type);
}
