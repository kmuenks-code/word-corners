// Handles dragging the center letter to a corner. Pointer Events cover
// mouse + touch in one path. Reports drops via onDrop(cornerName);
// knows nothing about game state or scoring.

export function initDrag(dragEl, corners, onDrop) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;

  dragEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragEl.setPointerCapture(e.pointerId);
    dragEl.classList.add('dragging');
    const rect = dragEl.getBoundingClientRect();
    startX = rect.left;
    startY = rect.top;
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    dragEl.style.position = 'fixed';
    dragEl.style.left = `${startX}px`;
    dragEl.style.top = `${startY}px`;
    dragEl.style.margin = '0';
  });

  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    dragEl.style.left = `${x}px`;
    dragEl.style.top = `${y}px`;

    const target = cornerUnderPoint(corners, e.clientX, e.clientY);
    corners.forEach((c) => c.classList.toggle('drop-target', c === target));
  });

  window.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    dragEl.classList.remove('dragging');

    const target = cornerUnderPoint(corners, e.clientX, e.clientY);
    corners.forEach((c) => c.classList.remove('drop-target'));

    resetDragPosition(dragEl);

    if (target) {
      onDrop(target.dataset.corner);
    }
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
