// Handles dragging the center letter to a corner. Pointer Events cover
// mouse + touch in one path. Reports drops via onDrop(cornerName);
// knows nothing about game state or scoring.
//
// hitEl is the (larger) element that starts the drag on pointerdown,
// separate from dragEl (the letter itself, which is what visually
// moves) so the whole bubble around a letter is grabbable, not just
// the glyph. Defaults to dragEl when not given. A hitEl with the
// `.empty` class (the hold slot with nothing in it) or the `.blocked`
// class (a choice bubble frozen out while a blank letter is pending —
// see main.js) never starts a drag.
//
// Only one drag can be live at a time, across every initDrag() call:
// `activeDrag` is module-level, and each drag remembers the pointerId it
// started with. Without both, a second finger on the other choice bubble
// would put two closures in the dragging state at once — the first lift
// then fires the window `pointerup` for both, appending two letters to the
// same corner from one gesture, with only one of them undoable.

let activeDrag = null;

export function initDrag(dragEl, corners, onDrop, hitEl = dragEl) {
  let pointerId = null;
  let offsetX = 0;
  let offsetY = 0;

  // Puts the letter back in its slot and clears the drop highlight. Shared
  // by the drop path and the cancel path, so a cancelled gesture can't
  // leave the letter latched mid-flight.
  function endDrag() {
    pointerId = null;
    activeDrag = null;
    dragEl.classList.remove('dragging');
    corners.forEach((c) => c.classList.remove('drop-target'));
    resetDragPosition(dragEl);
  }

  hitEl.addEventListener('pointerdown', (e) => {
    if (hitEl.classList.contains('empty') || hitEl.classList.contains('blocked')) return;
    if (activeDrag) return;
    pointerId = e.pointerId;
    activeDrag = dragEl;
    hitEl.setPointerCapture(e.pointerId);
    dragEl.classList.add('dragging');
    const rect = dragEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    dragEl.style.position = 'fixed';
    dragEl.style.left = `${rect.left}px`;
    dragEl.style.top = `${rect.top}px`;
    dragEl.style.margin = '0';
  });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    dragEl.style.left = `${x}px`;
    dragEl.style.top = `${y}px`;

    const target = cornerUnderPoint(corners, e.clientX, e.clientY);
    corners.forEach((c) => c.classList.toggle('drop-target', c === target));
  });

  window.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pointerId) return;

    const target = cornerUnderPoint(corners, e.clientX, e.clientY);
    endDrag();

    if (target) {
      onDrop(target.dataset.corner);
    }
  });

  // The browser can take the gesture away — a system gesture, an
  // interrupting call, too many touch points. Same cleanup, no drop.
  window.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== pointerId) return;
    endDrag();
  });
}

function cornerUnderPoint(corners, x, y) {
  return corners.find((c) => {
    if (c.classList.contains('closed') || c.classList.contains('occupied')) return false;
    const r = c.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
}

function resetDragPosition(dragEl) {
  dragEl.style.position = '';
  dragEl.style.left = '';
  dragEl.style.top = '';
  dragEl.style.margin = '';
}
