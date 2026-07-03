// input.js — swipe detection for HEX HARVEST (resolves 6-direction ambiguity)
//
// PROBLEM (Cynical agent): on a small touch screen, distinguishing N from NE
// (only 60deg apart) is high-friction; a wrong axial direction feels clunky.
//
// SOLUTION: angle-based snap + drag-to-confirm ghost arrow.
//   1. DEAD ZONE: movements shorter than DEAD_ZONE px are ignored entirely
//      (prevents taps and jitter from registering a direction).
//   2. ANGLE SNAP: once the drag exceeds the dead zone, the raw swipe angle is
//      snapped to the nearest of the six ideal hex directions (see
//      hex-core DIRECTION_ANGLES). A ghost arrow is drawn from the swipe origin
//      in that snapped direction so the player SEES the intended move before
//      lifting their finger — they can drag back and re-aim if it snapped wrong.
//   3. COMMIT: on pointerup, if the drag length >= SWIPE_THRESHOLD the snapped
//      direction is committed; otherwise the move is cancelled (a short drag
//      that never crossed threshold = no-op, protecting against misfires).
//
// This is purely pointer-driven (works for touch AND mouse), non-blocking, and
// decoupled from the render loop via a callback. prefers-reduced-motion only
// affects animation duration (handled by the renderer), never the detection.

import { angleToDirection, DIRECTION_ANGLES } from './hex-core.js';

const DEAD_ZONE = 14;        // px: below this, no direction is chosen (jitter/tap guard)
const SWIPE_THRESHOLD = 24;  // px: a release shorter than this cancels the move

export function createSwipeInput(canvas, { onCommit, onPreview, onCancel } = {}) {
  let active = false;
  let origin = null;          // {x,y} in canvas CSS pixels
  let current = null;
  let snappedDir = null;      // current ghost-arrow direction or null

  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function delta() {
    return { dx: current.x - origin.x, dy: current.y - origin.y };
  }

  function length() {
    const { dx, dy } = delta();
    return Math.hypot(dx, dy);
  }

  function rawAngle() {
    const { dx, dy } = delta();
    return Math.atan2(dy, dx) * 180 / Math.PI; // screen coords, y down
  }

  function down(e) {
    active = true;
    origin = pos(e);
    current = origin;
    snappedDir = null;
    canvas.setPointerCapture?.(e.pointerId);
  }

  function move(e) {
    if (!active) return;
    current = pos(e);
    const len = length();
    if (len < DEAD_ZONE) {
      if (snappedDir !== null) { snappedDir = null; onPreview?.(null); }
      return;
    }
    const dir = angleToDirection(rawAngle());
    if (dir !== snappedDir) {
      snappedDir = dir;
      onPreview?.({ dir, origin, current, angle: DIRECTION_ANGLES[dir] });
    }
  }

  function up(e) {
    if (!active) return;
    active = false;
    current = pos(e);
    const len = length();
    const dir = snappedDir;
    snappedDir = null;
    onPreview?.(null);          // clear ghost arrow
    try { canvas.releasePointerCapture?.(e.pointerId); } catch (_) {}
    if (dir && len >= SWIPE_THRESHOLD) {
      onCommit?.(dir);          // execute the slide/merge for this direction
    } else {
      onCancel?.();
    }
  }

  function cancel() {
    active = false; snappedDir = null; onPreview?.(null); onCancel?.();
  }

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  // Prevent the page from scrolling while swiping on touch devices.
  canvas.style.touchAction = 'none';

  return { cancel };
}