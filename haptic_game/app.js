/* ===== Haptic-Rhythm Memory Game ===== */
const HOLD_MS    = 350;
const ZONE_FREQS = [261.63, 329.63, 392.00, 523.25]; // C E G C
const VIB_TAP    = [40];
const VIB_HOLD   = [60, 30, 120];
const VIB_WRONG  = [100, 50, 100, 50, 200];
const VIB_OK     = [30, 20, 30];
const MAX_ROUND  = 10;

const HAPTIC = 'vibrate' in navigator;

const state = {
  round: 1,
  sequence: [],
  inputIndex: 0,
  score: 0,
  currentStreak: 0,
  bestStreak: 0,
  phase: 'idle',
  acceptingInput: false,
};

let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function startTone(zone) {
  ensureAudio();
  if (!audioCtx) return { stop() {} };
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = ZONE_FREQS[zone];
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.28, now + 0.02);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  return {
    stop(fade = 0.08) {
      const t = audioCtx.currentTime;
      try {
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + fade);
        osc.stop(t + fade + 0.02);
      } catch (e) { }
    }
  };
}

function playTone(zone, durSec) {
  const t = startTone(zone);
  setTimeout(() => t.stop(0.06), durSec * 1000);
}

function vibrate(pattern) {
  if (HAPTIC) {
    try { navigator.vibrate(pattern); } catch (e) { }
  }
}

const $ = (id) => document.getElementById(id);
const zones   = Array.from(document.querySelectorAll('.zone'));
const banner  = $('banner');
const statusEl = $('status');
const board   = $('board');
const overlay = $('overlay');
const startBtn = $('startBtn');

function isHapticRound(round) { return round >= 4 && round % 2 === 0; }
function roundMode(round) {
  if (!isHapticRound(round)) return 'full';
  return HAPTIC ? 'haptic' : 'audio';
}

let bannerTimer = null;
function showBanner(text, persist) {
  banner.textContent = text;
  banner.classList.remove('hidden');
  clearTimeout(bannerTimer);
  if (!persist) bannerTimer = setTimeout(() => banner.classList.add('hidden'), 2400);
}
function setStatus(t) { statusEl.textContent = t; }
function setDim(on) { board.classList.toggle('dimmed', on); }
function updateHud() {
  $('round').textContent = state.round;
  $('score').textContent = state.score;
  $('streak').textContent = state.currentStreak;
  $('best').textContent = state.bestStreak;
}

function genSequence(round) {
  const len = round + 2;
  const seq = [];
  for (let i = 0; i < len; i++) {
    seq.push({
      zone: Math.floor(Math.random() * 4),
      gesture: Math.random() < 0.5 ? 'tap' : 'hold',
    });
  }
  return seq;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function playSequence() {
  state.phase = 'playing';
  state.acceptingInput = false;
  const mode = roundMode(state.round);
  const noVisual = (mode === 'haptic' || mode === 'audio');

  if (mode === 'haptic') {
    showBanner('HAPTIC MODE — eyes off the screen');
    setDim(true);
  } else if (mode === 'audio') {
    showBanner('AUDIO MODE — no visual cues');
    setDim(true);
  } else {
    setDim(false);
  }

  setStatus(noVisual ? 'Listen & feel the pattern…' : 'Watch, listen & feel…');
  await wait(750);

  for (const step of state.sequence) {
    const onMs = step.gesture === 'hold' ? 620 : 380;
    if (!noVisual) zones[step.zone].classList.add('active');
    playTone(step.zone, step.gesture === 'hold' ? 0.5 : 0.18);
    if (mode === 'haptic') vibrate(step.gesture === 'hold' ? VIB_HOLD : VIB_TAP);
    await wait(onMs);
    if (!noVisual) zones[step.zone].classList.remove('active');
    await wait(220);
  }

  setDim(false);
  state.phase = 'input';
  state.acceptingInput = true;
  state.inputIndex = 0;
  setStatus('Your turn — reproduce the pattern');
}

let activePress = null;

function onPointerDown(e) {
  if (!state.acceptingInput) return;
  e.preventDefault();
  const zone = Number(e.currentTarget.dataset.zone);
  ensureAudio();
  const tone = startTone(zone);
  zones[zone].classList.add('pressed');
  vibrate(VIB_TAP);
  const holdTimer = setTimeout(() => {
    if (activePress && activePress.zone === zone) {
      activePress.holdLocked = true;
      zones[zone].classList.add('hold-locked');
      vibrate(VIB_HOLD);
    }
  }, HOLD_MS);
  activePress = {
    zone, tone, startTime: performance.now(), holdTimer, holdLocked: false,
  };
}

function onPointerUp(e) {
  if (!activePress) return;
  e.preventDefault();
  const press = activePress;
  activePress = null;
  clearTimeout(press.holdTimer);
  const dur = performance.now() - press.startTime;
  const gesture = dur >= HOLD_MS ? 'hold' : 'tap';
  press.tone.stop(gesture === 'hold' ? 0.1 : 0.05);
  zones[press.zone].classList.remove('pressed', 'hold-locked');
  registerInput(press.zone, gesture);
}

function onPointerCancel() {
  if (!activePress) return;
  const press = activePress;
  activePress = null;
  clearTimeout(press.holdTimer);
  press.tone.stop(0.05);
  zones[press.zone].classList.remove('pressed', 'hold-locked');
}

function registerInput(zone, gesture) {
  const expected = state.sequence[state.inputIndex];
  if (expected && expected.zone === zone && expected.gesture === gesture) {
    state.inputIndex++;
    if (state.inputIndex >= state.sequence.length) roundComplete();
  } else {
    gameOver();
  }
}

function roundComplete() {
  state.acceptingInput = false;
  state.score += state.round * state.sequence.length;
  state.currentStreak++;
  if (state.currentStreak > state.bestStreak) state.bestStreak = state.currentStreak;
  updateHud();
  setStatus('Round cleared! Loading next…');
  setDim(false);
  vibrate(VIB_OK);
  setTimeout(() => {
    state.round++;
    if (state.round > MAX_ROUND) { showVictory(); return; }
    startRound();
  }, 1200);
}

function gameOver() {
  state.acceptingInput = false;
  state.phase = 'over';
  vibrate(VIB_WRONG);
  zones.forEach((z) => z.classList.add('active'));
  setTimeout(() => zones.forEach((z) => z.classList.remove('active')), 420);
  setDim(false);
  $('overTitle').textContent = 'Game Over';
  $('overMsg').textContent =
    `You reached round ${state.round}.  Score ${state.score}  ·  Best streak ${state.bestStreak}.`;
  overlay.classList.remove('hidden');
  startBtn.classList.remove('hidden');
}

function showVictory() {
  state.acceptingInput = false;
  state.phase = 'over';
  vibrate([40, 30, 40, 30, 80]);
  $('overTitle').textContent = 'You Mastered It!';
  $('overMsg').textContent =
    `All ${MAX_ROUND} rounds cleared!  Final score ${state.score}  ·  Best streak ${state.bestStreak}.`;
  overlay.classList.remove('hidden');
  startBtn.classList.remove('hidden');
}

function startRound() {
  updateHud();
  state.sequence = genSequence(state.round);
  state.inputIndex = 0;
  playSequence();
}

function startGame() {
  ensureAudio();
  state.round = 1;
  state.score = 0;
  state.currentStreak = 0;
  overlay.classList.add('hidden');
  startBtn.classList.add('hidden');
  updateHud();
  startRound();
}

zones.forEach((z) => {
  z.addEventListener('pointerdown', onPointerDown);
  z.addEventListener('pointerup', onPointerUp);
  z.addEventListener('pointerleave', onPointerCancel);
  z.addEventListener('pointercancel', onPointerCancel);
  z.addEventListener('contextmenu', (e) => e.preventDefault());
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

startBtn.addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);

updateHud();
if (!HAPTIC) {
  showBanner('Haptic unavailable — audio + visual mode', true);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}