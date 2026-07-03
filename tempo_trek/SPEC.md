# TEMPO TREK — Technical Specification (Pragmatist draft)

Status: PROPOSED — awaiting Moderator/peer review. All constants are configurable tuning knobs; values below are first-pass defaults chosen for tight feel.

---

## 1. Core loop architecture

- Fixed-timestep simulation at 60 Hz (`SIM_DT = 1000/60 ms`). Render runs on `requestAnimationFrame` and interpolates between the two most recent sim states. This decouples sim from render rate and keeps the frame budget measurable.
- One tap = one jump. Tap cadence (intervals between taps) drives global scroll speed. No keyboard, no multi-touch, no on-screen buttons except Start / Pause / Restart.
- Run ends on collision with an obstacle. Score = distance traveled × rhythm multiplier accumulated over time.

### Update order per sim step
1. Read buffered tap events (collected since last step), append tap timestamps to the cadence window.
2. Recompute smoothed cadence → target speed.
3. Advance world by `speed * BASE_SCROLL * SIM_DT`.
4. Spawn/despawn obstacles around the generation cursor.
5. Integrate runner parabolic arc (gravity + fixed jump impulse).
6. Collision check (AABB vs active obstacles).
7. Update rhythm mastery streak + multiplier.
8. Accumulate score.

---

## 2. Tap cadence → speed mapping

### Inputs
- `tapTimes[]`: rolling buffer of the last **8** tap timestamps (ms, performance.now).
- Intervals `d[i] = tapTimes[i] - tapTimes[i-1]`.

### Cadence estimate
- `rawMean = mean(d)` over the window (requires ≥2 taps; before that, speed = 1x baseline).
- Smooth with an exponential moving average so a single mistap cannot spike or crash speed:
  `meanEMA = meanEMA * (1-α) + rawMean * α`, with `α = 0.35`.
- Also clamp any single interval to `[0.5×meanEMA_prev, 2×meanEMA_prev]` before averaging (mistap guard).

### Interval → speed (bounded 1x–4x)
- `MAX_INTERVAL = 700 ms` (slow, ~1.43 taps/s) → speed **1.0x**
- `MIN_INTERVAL = 175 ms` (fast, ~5.7 taps/s) → speed **4.0x**
- Linear map, clamped:
  ```
  t = clamp((MAX_INTERVAL - meanEMA) / (MAX_INTERVAL - MIN_INTERVAL), 0, 1)
  targetSpeed = 1.0 + 3.0 * t
  ```
- Smooth the speed itself toward target to avoid jitter:
  `speed += (targetSpeed - speed) * 0.15` per sim step.
- `BASE_SCROLL = 240 px/s` at 1x. World advance per step = `speed * BASE_SCROLL * SIM_DT`.

### Edge cases
- Fewer than 2 taps: speed eases toward 1x (safe default), multiplier held at 1x.
- No tap for > 1200 ms: cadence window considered stale; speed decays toward 1x (player easing off).

---

## 3. Rhythm mastery multiplier

### On-beat test
For each new tap, compare its interval to the previous smoothed cadence:
```
deviation = abs(interval - meanEMA_prev) / meanEMA_prev
onBeat = deviation <= TOLERANCE        // TOLERANCE = 0.18 (18%)
```

### Streak & multiplier
- `streak`: count of consecutive on-beat taps. Resets to 0 on an off-beat tap.
- Multiplier rises in tiers, `N = 8` consecutive on-beat taps per tier, cap `4x`:
  - `streak >= 8`  → 2x
  - `streak >= 16` → 3x
  - `streak >= 24` → 4x (cap)
- Off-beat tap: `streak = 0`, multiplier **decays one tier** (`mult = max(1, mult - 1)`). A single mistap does not fully reset the multiplier, only drops one tier — this keeps the risk dial forgiving but real.
- Multiplier only applies while the runner is alive and at least 2 taps exist.

### Score
- `score += speed * BASE_SCROLL * SIM_DT * 0.01 * mult` per sim step (distance-scaled, tempo-scaled, rhythm-scaled). Display integer score; persist per-seed high score.

---

## 4. Seed-based procedural generation

### Seed derivation
- Daily seed: `YYYY-MM-DD` (UTC) → hashed to a 32-bit int via FNV-1a.
- Free-play seed: user-entered string (or random 6-char base36) → same FNV-1a hash.
- PRNG: **mulberry32** (deterministic, fast, good distribution). Seeded once per run; never reseeded mid-run.

### ⚠️ Design tension (needs Moderator sign-off)
Two constraints conflict:
- (A) "spawn density and gap spacing scale with scroll speed" (player-controlled, runtime-varying).
- (B) "each seed reproduces an identical run / same course to every player."

If gap spacing depends on *runtime* speed, two players tapping differently get different layouts → violates (B).
If layout is fully fixed in world-space → violates the literal (A) spatial scaling.

**Proposed resolution (primary):** Generate the obstacle course **deterministically in world-space** from the seed. The seed produces a fixed stream of `(gapDistance, type, sizeVariant)` tuples. This guarantees (B) — identical, reproducible course per seed. Speed-scaled density (A) is then delivered **temporally**: faster traversal compresses reaction windows and makes the fixed layout *feel* denser/tighter, while slower play widens the time between obstacles. World-space layout stays seed-identical.

**Alternative (secondary, if spatial scaling is mandatory):** The seed emits a deterministic stream of *normalized* gap multipliers and types; at spawn time `gap = BASE_GAP * normGap / speedFactor`. This honors literal (A) but makes "identical run" mean "identical pattern sequence, not identical absolute positions." Two players at the same speed see the same course; different speeds see scaled spacing.

**Recommendation:** Primary resolution. It satisfies the stronger reproducibility requirement (daily identical course) and still gives the speed→difficulty feel via traversal pace. Flagging for explicit Moderator decision.

### Generation procedure (primary)
- `genCursor`: world-x up to which obstacles are committed.
- While `genCursor < runnerX + GENERATE_AHEAD` (e.g. 1.5× canvas width):
  - `gap = BASE_GAP * (0.7 + rng() * 0.9)`  // BASE_GAP = 360 px at 1x reference
  - `genCursor += gap`
  - `type = pickWeighted(rng, [lowBlock, highBlock, gapWall])`
  - `size = sizeTable[type] * (0.85 + rng() * 0.3)`
  - push obstacle `{x: genCursor, type, size}`
- Obstacles behind `runnerX - DESPAWN_BEHIND` are removed from the active list.
- Because generation is purely a function of `rng()` advanced in fixed order, the entire course is reproducible from the seed alone — independent of when/how the player taps.

### Jump geometry (fixed arc)
- `JUMP_VY = -820 px/s`, `GRAVITY = 1900 px/s²`, fixed hang time ≈ 0.86 s, fixed peak height ≈ 177 px.
- One arc only; no double-jump, no air control, no variable height. Tap during air = ignored (no effect on jump) but still counts as a cadence tap (so mistimed taps hurt your rhythm streak, not your jump).

---

## 5. Persistence

- `localStorage` key scheme:
  - `tempotrek:hs:daily:<YYYY-MM-DD>` → high score for today's seed.
  - `tempotrek:hs:free:<seedString>` → high score for that free-play seed.
- On load, attempt `localStorage.setItem` probe; if it throws (private mode / unavailable), fall back to an in-memory `Map` that lives for the page session.
- No global leaderboard, no network calls.

---

## 6. Performance budget (≤16 ms/frame)

- Sim step is O(active obstacles) — capped by keeping only on-screen + small margin obstacles (typically < 20). Collision = AABB, no spatial hash needed at this count.
- Render: clear + parallax background (2 layers) + ground + obstacles + runner + HUD. No shadows/filters in the hot path; pre-render static sprites to offscreen canvases.
- Measure `simMs + renderMs` each frame; if > 16 ms for > 5 consecutive frames, log a warning (dev only). Fixed timestep with accumulator prevents spiral-of-death.

---

## 7. File plan (for Execute phase)

- `index.html` — canvas, HUD overlay, Start/Pause/Restart buttons, seed display, mode toggle.
- `style.css` — sleek modern dark UI, neon accents, responsive canvas, button states.
- `script.js` — all logic: loop, cadence→speed, rhythm multiplier, mulberry32 + FNV-1a, procedural gen, collision, localStorage, input handling.

All three are fully client-side, no build step, no external assets (procedural visuals only).