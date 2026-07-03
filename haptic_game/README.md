# Haptic-Rhythm Memory Game

A mobile-first, installable **PWA** Simon-Says variant that fuses **visual pulses**, **Web Audio tones**, and **device vibration** into a single progressive-difficulty memory loop. Each round plays a growing pattern; you reproduce it with **tap** and **long-press** gestures. From round 4 onward, alternating rounds go **haptic-only** (vibration + audio, no visual cues) to test pure tactile memory.

## Features
- **4 neon zones** (Electric Cyan, Acid Green, Vivid Magenta, Bright Amber) in a 2×2 grid.
- **Two distinguishable gestures per zone:**
  - **TAP** — release before 350ms.
  - **HOLD** — hold 350ms or longer (a "hold-locked" ring snaps on at the threshold).
- **8 distinct symbols per step** (4 zones × 2 gestures) — scales cleanly from 3 to 12 steps.
- **Web Audio API** tones only (no audio files); triangle-wave oscillators with envelopes.
- **Vibration API** with distinct patterns for tap / hold / wrong / success.
- **Difficulty ramp:** sequence length = `round + 2` (round 1 → 3 steps, round 10 → 12 steps).
  - Rounds 1–3: full cues (visual + audio + vibration).
  - Round 4+: alternating **haptic-only** rounds (4, 6, 8, 10) and full-cue rounds (5, 7, 9).
- **Graceful fallback:** if the Vibration API is unsupported, a persistent banner shows
  "Haptic unavailable — audio + visual mode" and haptic-only rounds become **audio-only**
  rounds (no visual, tone only) so the no-visual memory test is preserved as auditory memory.
- **Scoring (in-memory only):** `score += round × stepsCompleted`; current streak = consecutive
  rounds cleared; best streak tracked for the session. No backend, no leaderboard.
- **PWA:** installable, standalone display, offline-first via service worker.

## How to run
This is a zero-build static site. Serve the folder over HTTP (a service worker requires http/https, not `file://`):

```bash
# from the project root
python3 -m http.server 8080
# then open http://localhost:8080/
```

Or use any static server (e.g. `npx serve`). Open on a phone browser and **Add to Home Screen** to install as a PWA. After the first load it works fully offline.

## Files
| File | Purpose |
|------|---------|
| `index.html` | App shell, HUD, 2×2 pad, overlay |
| `styles.css` | Neon-Tactile theme, glow/pulse/hold-ring/dim styles |
| `app.js` | Game logic, Web Audio, Vibration, gesture detection, scoring |
| `manifest.json` | PWA web manifest (standalone, icons, theme) |
| `service-worker.js` | Offline-first app-shell cache |
| `icons/icon-192.svg`, `icons/icon-512.svg` | PWA icons |
| `README.md` | This file |

## Tuning
- `HOLD_MS` (default `350`) — long-press threshold.
- `ZONE_FREQS` — per-zone base tones.
- `MAX_ROUND` (default `10`) — final round / victory condition.
- Vibration patterns: `VIB_TAP`, `VIB_HOLD`, `VIB_WRONG`, `VIB_OK`.

## Notes
- Vibration requires a supporting device **and** an active user gesture; the AudioContext is
  resumed on first interaction.
- On desktop (no vibration), the game runs in audio + visual mode automatically.