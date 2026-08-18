// The four corners' visual identities: a square, circle, triangle, and
// diamond, in place of the cardinal directions the player used to have to
// hold in their head.
//
// This is *presentation only*. Game state, events, objective params, DOM
// ids and the recorded database rows all still say `nw`/`ne`/`sw`/`se` —
// the shape is a lookup applied at the moment something is drawn, so
// nothing about the data model or the collected results changes. Keep it
// that way: a rename would break GROUP BY comparability with every
// objective row already recorded.
//
// One art source for both places a shape appears (the badge on the corner
// tile, and the leading symbol on an objective row), so the two can't
// drift apart.

export const CORNER_SHAPES = Object.freeze({
  nw: 'square',
  ne: 'circle',
  sw: 'triangle',
  se: 'diamond',
});

const SHAPE_LABELS = Object.freeze({
  square: 'Square',
  circle: 'Circle',
  triangle: 'Triangle',
  diamond: 'Diamond',
});

// Drawn in a 24×24 box, filled with `currentColor` so the caller's CSS
// decides the ink. Sized to look optically even against each other rather
// than to identical bounding boxes — a triangle at the square's width
// reads noticeably smaller.
const SHAPE_GEOMETRY = Object.freeze({
  square: { tag: 'rect', attrs: { x: 5, y: 5, width: 14, height: 14, rx: 2.5 } },
  circle: { tag: 'circle', attrs: { cx: 12, cy: 12, r: 7.6 } },
  triangle: { tag: 'polygon', attrs: { points: '12,4 20.2,19 3.8,19' } },
  diamond: { tag: 'polygon', attrs: { points: '12,3.2 20.8,12 12,20.8 3.2,12' } },
});

const SVG_NS = 'http://www.w3.org/2000/svg';

export function cornerShape(corner) {
  return CORNER_SHAPES[corner] ?? null;
}

// "Square", "Circle", … — the text name, for accessible labels and for
// anywhere a shape has to be named in prose rather than drawn.
export function cornerShapeLabel(corner) {
  const shape = cornerShape(corner);
  return shape ? SHAPE_LABELS[shape] : null;
}

// Returns a fresh <svg> element for `corner`, or null if it isn't one of
// the four. Callers own placement and color; this only supplies the art.
export function createCornerSymbol(corner, { className = '', title = null } = {}) {
  const shape = cornerShape(corner);
  if (!shape) return null;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);

  // Either a real accessible name, or hidden outright — never an unlabelled
  // graphic a screen reader has to announce as "image".
  if (title) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', title);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  const { tag, attrs } = SHAPE_GEOMETRY[shape];
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
  node.setAttribute('fill', 'currentColor');
  svg.appendChild(node);
  return svg;
}
