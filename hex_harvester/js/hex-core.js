// hex-core.js — foundational coordinate system for HEX HARVEST
// Odd-q OFFSET coordinates (col q, row r) on a fixed 7x7 rectangle (49 cells).
//
// WHY OFFSET (not pure axial): a rectangular subset of axial coords is a
// parallelogram; to render a clean portrait rectangle we offset odd columns
// down by half a row. That offset makes the DIAGONAL neighbor depend on column
// parity. Round-1 used constant axial diagonals, which made NE/SW visually
// point at different angles from even vs odd columns (the "visual disconnect"
// risk). This module fixes it with a PARITY-AWARE neighbor table, so every
// direction has ONE consistent visual angle regardless of parity:
//   N = -90deg (straight up), S = +90deg (straight down),
//   NE = -30deg, SE = +30deg, SW = +150deg, NW = -150deg
// — six directions evenly spaced 60deg apart. Verified by simulation.
// N/S stay clean vertical swipes (the most natural mobile gesture).

export const GRID = 7; // fixed 7x7 (49 cells); never exceeds this.

// ─── Parity-aware direction vectors (odd-q offset) ──────────────────
// N/S are parity-independent (straight vertical). The four diagonals shift
// by one row depending on whether the source column is even or odd, which is
// exactly what keeps their visual angle constant across the board.
const DIR_EVEN = {
  N:  { dq:  0, dr: -1 },
  S:  { dq:  0, dr:  1 },
  NE: { dq:  1, dr: -1 },
  SE: { dq:  1, dr:  0 },
  NW: { dq: -1, dr: -1 },
  SW: { dq: -1, dr:  0 },
};
const DIR_ODD = {
  N:  { dq:  0, dr: -1 },
  S:  { dq:  0, dr:  1 },
  NE: { dq:  1, dr:  0 },
  SE: { dq:  1, dr:  1 },
  NW: { dq: -1, dr:  0 },
  SW: { dq: -1, dr:  1 },
};

export const DIRECTIONS = ['N', 'S', 'NE', 'SE', 'SW', 'NW'];

export const OPPOSITE = {
  N: 'S', S: 'N', NE: 'SW', SW: 'NE', SE: 'NW', NW: 'SE',
};

// Direction vector for a given source column parity.
export function dirVector(q, dirName) {
  return (q & 1) ? DIR_ODD[dirName] : DIR_EVEN[dirName];
}

// ─── Bounds & identity ──────────────────────────────────────────────
export function inBounds(q, r) {
  return q >= 0 && q < GRID && r >= 0 && r < GRID;
}

export function key(q, r) { return q + ',' + r; }

// Neighbor in a given direction, or null if off-board. Parity-aware.
export function neighbor(q, r, dirName) {
  const d = dirVector(q, dirName);
  if (!d) return null;
  const nq = q + d.dq, nr = r + d.dr;
  return inBounds(nq, nr) ? { q: nq, r: nr } : null;
}

// All 49 cells in render order (row-major by r, then q).
export function allCells() {
  const cells = [];
  for (let r = 0; r < GRID; r++)
    for (let q = 0; q < GRID; q++)
      cells.push({ q, r });
  return cells;
}

// ─── Pixel layout (flat-top hexes, odd-q offset) ────────────────────
// `size` = distance from hex center to a vertex.
// hex width = 2*size, height = sqrt(3)*size; column spacing = 1.5*size.
// Odd columns are shifted DOWN by half a row (the +0.5*(q&1) term).
export function hexToPixel(q, r, size) {
  const x = size * 1.5 * q;
  const y = size * Math.sqrt(3) * (r + 0.5 * (q & 1));
  return { x, y };
}

// Board pixel dimensions for a 7x7 grid at given hex size.
// width  = 2*size + 6*1.5*size = 11*size
// height = sqrt(3)*size*7 + sqrt(3)*size*0.5 = 7.5*sqrt(3)*size (~12.99*size)
export function boardSize(size) {
  const w = 2 * size + (GRID - 1) * 1.5 * size;            // 11*size
  const h = Math.sqrt(3) * size * (GRID + 0.5);            // ~12.99*size
  return { w, h };
}

// Largest hex `size` that fits a target box while preserving aspect (0.847).
export function fitSize(maxW, maxH) {
  return Math.min(maxW / 11, maxH / (Math.sqrt(3) * (GRID + 0.5)));
}

// ─── Slide order (rank-based, parity-agnostic, verified) ────────────
// rank(C, D) = number of one-cell steps from C in direction D before going
// off-board. Invariant (verified by simulation): rank(neighbor(C,D), D) ==
// rank(C, D) - 1. Therefore processing cells in ASCENDING rank order means the
// leading edge (rank 0) is handled first, and by the time we process C its
// target neighbor (rank-1) has already been vacated/merged. This guarantees a
// one-cell shift never clobbers a tile that still needs to move, for ALL six
// directions including the parity-dependent diagonals.
export function slideRank(q, r, dirName) {
  let k = 0, cq = q, cr = r;
  for (;;) {
    const n = neighbor(cq, cr, dirName);
    if (!n) return k;
    cq = n.q; cr = n.r; k++;
  }
}

export function slideOrder(dirName) {
  return allCells().sort((a, b) => slideRank(a.q, a.r, dirName) - slideRank(b.q, b.r, dirName));
}

// ─── Swipe angle → direction mapping ───────────────────────────────
// Six ideal visual angles in screen coordinates (y points DOWN, atan2(dy,dx)):
//   N=-90, NE=-30, SE=+30, S=+90, SW=+150, NW=-150 (== +210)
// Evenly spaced 60deg apart. The input module snaps a raw swipe angle to the
// nearest of these; this is the single source of truth for direction intent.
export const DIRECTION_ANGLES = {
  N:  -90,
  NE: -30,
  SE:  30,
  S:   90,
  SW: 150,
  NW: -150,
};

// Snap a raw screen-space angle (degrees, atan2(dy,dx)) to the nearest hex
// direction. Returns null if the vector is too short (caller enforces threshold).
export function angleToDirection(angleDeg) {
  let best = null, bestDelta = Infinity;
  for (const dirName of DIRECTIONS) {
    let d = Math.abs(angleDeg - DIRECTION_ANGLES[dirName]);
    if (d > 180) d = 360 - d;          // circular distance
    if (d < bestDelta) { bestDelta = d; best = dirName; }
  }
  return best;
}