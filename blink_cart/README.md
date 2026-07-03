# Blink Cart

A browser-native, portrait-first, single-thumb reflex game. A horizontal conveyor scrolls grocery items across the screen while a target item is shown in a fixed header. Tap the one conveyor item that matches the target before it scrolls off-screen. Each correct tap scores and accelerates the conveyor; three misses end the run, and every session is capped at 90 seconds.

## Run it
Open `index.html` in any modern browser. No build step, no server, no external assets, no network calls — fully client-side.

## Files
- `index.html` — markup; links `style.css` and loads `script.js`.
- `style.css` — portrait-first frame, canvas, and reduced-motion-friendly base styles.
- `script.js` — the entire game: fixed-timestep simulation, Canvas 2D rendering, audio, persistence.
- `README.md` — this file.

## How it plays
- The first round starts on load. A 5-second non-blocking hint reads "Tap the item that matches the target."
- The target is shown in the fixed header. Exactly one conveyor item always matches the current target.
- Tap the matching item: score +1, streak +1, conveyor speeds up, target rotates, and a new match spawns immediately.
- Tap a non-matching item: a miss. The matching item scrolling off-screen untapped is also a miss.
- Three misses OR 90 seconds ends the run. Tap to play again.

## Difficulty model
A single bounded variable drives everything:
- `W(n) = max(800, 3000 × 0.92^n)` ms — the visible traversal window after `n` correct taps.
- Conveyor speed = `(fieldWidth + itemSize) / W`, so traversal time always equals `W`.
- Spawn gap = `W / 4`, keeping ~4 items on screen at constant density.
- The window floors at 800 ms (hit at tap 16, a 3.75× speedup).

## Constraints satisfied
- Client-side only; no backend, no external API calls.
- Portrait-first, single-thumb playable.
- 2D rendering on HTML5 Canvas 2D.
- Baseline 3 s visible window; 800 ms hard floor; 90 s session cap; 3 misses end the run.
- Onboarding ≤ 5 s; first round begins on load.
- Item art is emoji only.
- Score and best run tracked in-memory; best run persists to `localStorage`.
- Fixed-timestep update loop (≈16.667 ms) decoupled from render rate.
- Items are distinguished by shape/emoji, not color alone; `prefers-reduced-motion` dampens visual effects.

## Emoji compatibility
All 18 grocery emojis are Emoji 3.0 or earlier, ensuring they render on iOS, Android, and Windows shipped since 2016.
