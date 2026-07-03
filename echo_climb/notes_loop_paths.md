# ECHO CLIMB — Two Core-Loop Implementation Paths (Pragmatist, for Narrow debate)

Both paths share the locked spec: single index.html, Canvas 2D, mulberry32 PRNG,
fixed-timestep constraint, unified validateSwipe(dir, ts), localStorage ghost,
opt-in jsonbin leaderboard with seeded mock fallback.

The real question Narrow must settle: **where does time live?**
- Path A: time lives in the accumulator/sim (update owns all transitions).
- Path B: time lives in async phase functions (each phase awaits its own clock).

---

## PATH A — Strict State-Driven (imperative state machine + fixed timestep)

### Shape
One mutable `state` object. One `update(dt)` that is the single source of truth
for phase transitions. Input handlers never mutate phase directly — they push
into an input queue that `update` consumes. Render is a pure function of `state`.

```
state = {
  phase: 'BOOT'|'PLAYBACK'|'INPUT'|'ASCEND'|'FALL'|'SUMMIT'|'GAMEOVER',
  floor, seed, cadence, seq[], stepIdx,
  phaseStart,            // performance.now() captured when phase began
  expectedBeat,          // phaseStart + stepIdx*cadence (INPUT only)
  inputQueue: [],        // [{dir, ts}] pushed by handlers, drained in update
  playerFloorFloat,      // tweened marker Y for climb/fall anim
  ghost, runStart, ...
}
```

### Loop
```
accumulator += frameDelta
while (accumulator >= STEP) { update(STEP); accumulator -= STEP }
render(state)
```
`update` reads wall-clock via a `now()` only for *measuring* (it still advances
sim by fixed STEP). Phase timers compare `now() - phaseStart` against cadence.

### Input
Touch/keydown → `inputQueue.push({dir, ts: performance.now()})`.
`update` drains queue: for each entry call `validateSwipe(dir, ts)` which checks
dir==seq[stepIdx] AND `|ts - expectedBeat| <= 150`. Match → stepIdx++. All matched
→ phase=ASCEND. Miss → phase=FALL.

### Ghost replay
`update` computes `ghostFloor = count(ghost.floors, c => c.t <= now()-runStart)`
each step; render draws ghost marker at that floor. O(≤20).

### Pros
- Timing accuracy independent of frame rate (timestamps captured in handlers,
  validation against expectedBeat, not against update tick).
- Matches the mandated fixed-timestep + decoupled render constraint directly.
- Single state object = trivial save/restore, trivial to reason about, trivial
  to pause (just stop calling update).
- Deterministic: same seed + same input timestamps → same outcome.
- Frame budget provably bounded: update is O(steps in queue) + O(ghost≤20).

### Cons
- More boilerplate; phase logic is a switch statement that grows.
- Tween/animation values must be derived from `now()-phaseStart` inside update,
  slightly more math than "just animate over 300ms".

---

## PATH B — Event-Driven Reactive (async phase functions + rAF render)

### Shape
Each phase is an `async function` that owns its own clock via `await sleep(ms)`
or `await once(emitter, 'swipe', timeout)`. A top-level `runFloor()` chains phases.
Render runs on a separate rAF loop reading a shared `view` object the phases mutate.

```
async function playFloor(f) {
  await playback(f)            // await sleep(cadence) per step, light arrows
  const ok = await inputPhase(f) // await swipe events with per-step timeout
  if (!ok) return fall()
  await ascend(f)
  if (f < 20) return playFloor(f+1)
  else return summitLoop(f)
}
```

### Input
Touch/keydown → `emitter.emit('swipe', {dir, ts})`.
`inputPhase` does: `for each step: const s = await race(once('swipe'), timeout)`;
checks dir + `|s.ts - expectedBeat| <= 150`.

### Ghost replay
A separate rAF reads `now()-runStart` and positions ghost — same as A, but now
the ghost clock and the phase clock are *two separate time sources*, which is the
core risk.

### Pros
- Phase code reads top-to-bottom like the game's narrative — very legible.
- Less shared mutable state; each phase is locally scoped.
- Faster to prototype per-phase (e.g. playback is a 4-line for-loop with await).

### Cons
- **Conflicts with the fixed-timestep mandate.** `await sleep`/`setTimeout` are
  not tied to a fixed sim step and drift under tab-throttling; the ±150ms window
  becomes fragile when the browser clamps timers to 1000ms in background tabs.
- Two time sources (phase async clock + ghost rAF clock) can desync — ghost may
  appear to jump or lag relative to the player's actual beat.
- Pausing/resuming mid-phase is hard (cancellation tokens everywhere).
- Harder to guarantee the ≤16ms budget reasoning because work is scattered
  across async callbacks rather than one bounded update().
- `performance.now()` capture still works, but the *scheduling* of when
  validation happens is no longer frame-stable.

---

## My recommendation for Narrow
**Path A.** The constraints (fixed timestep, decoupled render, ±150ms window,
60 FPS budget, deterministic seed replay, single-file) were written for Path A.
Path B's legibility gain does not outweigh the timing-drift and dual-clock risk
on a game whose entire mechanic is beat-accurate memory reproduction.

If the team wants Path B's legibility, the cheap hybrid is: **Path A as the
spine, with each phase's logic factored into a named function** (`doPlayback`,
`doInput`) called from the `update` switch — readable like B, timed like A.