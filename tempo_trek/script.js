"use strict";
/* ============================================================
   TEMPO TREK — client-side endless runner
   Tap to jump; tap cadence drives scroll speed (1x–4x);
   steady cadence builds a rhythm-mastery multiplier (up to x4).
   Daily seed (UTC date) or free-play seed -> deterministic course.
   ============================================================ */

/* ---------- Tuning constants ---------- */
const SIM_DT = 1000/60;            // fixed timestep (ms)
const BASE_SCROLL = 240;            // px/s at 1x
const MAX_INTERVAL = 700;          // ms -> 1x
const MIN_INTERVAL = 175;           // ms -> 4x
const WINDOW_TAPS = 8;              // rolling cadence window
const EMA_ALPHA = 0.35;             // cadence smoothing
const TOLERANCE = 0.18;             // on-beat band (18%)
const TIER_SIZE = 8;                // on-beat taps per multiplier tier
const MAX_MULT = 4;
const SPEED_RISE = 0.08;            // ease up toward target (slow -> anti-panic)
const SPEED_FALL = 0.22;            // ease down toward target (fast -> easy to back off)
const DEBOUNCE_MS = 90;             // ignore taps faster than this (bounce/spam guard)
const STALE_MS = 800;               // no tap -> ease speed to 1x
const JUMP_VY = -820;                // px/s (fixed arc)
const GRAVITY = 1900;                // px/s^2
const BASE_GAP = 360;               // reference gap at 1x (world px)
const GENERATE_AHEAD = 1400;        // world px ahead to generate
const DESPAWN_BEHIND = 260;         // world px behind runner to despawn
const SCORE_K = 0.01;                // score scale

/* ---------- Canvas / DPR ---------- */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let W=0,H=0,DPR=1,GROUND_Y=0,RUNNER_X=0;
function resize(){
  const r = cv.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio||1, 2);
  W = Math.round(r.width); H = Math.round(r.height);
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  GROUND_Y = Math.round(H*0.82);
  RUNNER_X = Math.round(W*0.26);
}
window.addEventListener('resize', resize);

/* ---------- Deterministic PRNG ---------- */
function fnv1a(str){
  let h=0x811c9dc5;
  for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,0x01000193); }
  return h>>>0;
}
function mulberry32(a){
  return function(){
    a|=0; a=(a+0x6D2B79F5)|0;
    let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

/* ---------- Persistence (localStorage w/ in-memory fallback) ---------- */
const memStore = new Map();
let storageOK = true;
try { localStorage.setItem('__tt_probe','1'); localStorage.removeItem('__tt_probe'); }
catch(e){ storageOK=false; }
function storeGet(k){ if(storageOK){ try{ return localStorage.getItem(k); }catch(e){} } return memStore.has(k)?memStore.get(k):null; }
function storeSet(k,v){ if(storageOK){ try{ localStorage.setItem(k,v); return; }catch(e){} } memStore.set(k,v); }

/* ---------- Seed helpers ---------- */
function utcDateStr(){
  const d=new Date();
  const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), dd=String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function randomSeed(){
  const ch="abcdefghijklmnopqrstuvwxyz0123456789";
  let s=""; for(let i=0;i<6;i++) s+=ch[Math.floor(Math.random()*ch.length)];
  return s;
}

/* ---------- Game state ---------- */
let state='menu';            // menu | playing | paused | gameover
let mode='daily';            // daily | free
let seedStr='';
let rng=null;
let genCursor=0;
let obstacles=[];           // {x,w,h,type}
let runnerY=0, runnerVy=0, grounded=true;
let worldOffset=0;          // world-x the runner has travelled
let prevWorldOffset=0, prevRunnerY=0;  // for interpolation
let speed=1, targetSpeed=1, meanEMA=null, lastTap=-1e9, staleTap=true;
let taps=[];                // rolling window of timestamps
let streak=0, mult=1;
let score=0;
let runStartT=0;
let beatPulse=0;             // visual pulse on tap
let shake=0;

/* ---------- DOM refs ---------- */
const $=id=>document.getElementById(id);
const scoreVal=$('scoreVal'), multVal=$('multVal'), hsVal=$('hsVal');
const speedTxt=$('speedTxt'), barFill=$('barFill'), beat=$('beat');
const pips=[...document.querySelectorAll('#multPips .pip')];
const seedLab=$('seedLab'), seedValEl=$('seedVal');
const startOverlay=$('startOverlay'), pauseOverlay=$('pauseOverlay'), overOverlay=$('overOverlay');
const modeDaily=$('modeDaily'), modeFree=$('modeFree'), freeRow=$('freeRow'), seedInput=$('seedInput');
const finalScore=$('finalScore'), overHs=$('overHs'), newHs=$('newHs');

/* ---------- Mode UI ---------- */
function setMode(m){
  mode=m;
  modeDaily.classList.toggle('active', m==='daily');
  modeFree.classList.toggle('active', m==='free');
  freeRow.classList.toggle('hidden', m!=='free');
}
modeDaily.addEventListener('click',()=>setMode('daily'));
modeFree.addEventListener('click',()=>setMode('free'));
$('randSeed').addEventListener('click',()=>{ seedInput.value=randomSeed(); });

/* ---------- High score per seed ---------- */
function hsKey(){ return mode==='daily' ? `tempotrek:hs:daily:${seedStr}` : `tempotrek:hs:free:${seedStr}`; }
function getHS(){ const v=storeGet(hsKey()); return v?parseInt(v,10):0; }
function setHS(v){ storeSet(hsKey(), String(v)); }
function refreshHS(){ hsVal.textContent = getHS().toLocaleString(); }

/* ---------- Start / reset a run ---------- */
function beginRun(){
  seedStr = mode==='daily' ? utcDateStr() : (seedInput.value.trim() || randomSeed());
  seedInput.value = seedStr;
  seedLab.textContent = mode==='daily' ? 'Daily Seed' : 'Free Seed';
  seedValEl.textContent = seedStr;
  rng = mulberry32(fnv1a('tempotrek:'+seedStr));
  genCursor = 0; obstacles = [];
  runnerY = 0; runnerVy = 0; grounded = true;
  worldOffset = 0; prevWorldOffset = 0; prevRunnerY = 0;
  speed = 1; targetSpeed = 1; meanEMA = null; lastTap = -1e9; staleTap = true;
  taps = []; streak = 0; mult = 1; score = 0;
  beatPulse = 0; shake = 0;
  runStartT = performance.now();
  // pre-generate first chunk
  generateAhead();
  refreshHS();
  state='playing';
  startOverlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  overOverlay.classList.add('hidden');
  $('pauseBtn').textContent='Pause';
}

/* ---------- Procedural generation (deterministic world-space) ----------
   The seed emits a fixed stream of (gap, type, size) tuples in WORLD space.
   This makes the course identical for every player on the same seed.
   Speed-scaled density is delivered TEMPORALLY: obstacles-per-second =
   speed / gap, so faster play encounters more obstacles per second (tighter
   reaction windows) while slower play widens the time between them.
   Deterministic cluster pairs add tight sequences whose difficulty is
   revealed (not created) by high speed. */
const TYPES = ['low','tall','wide','pair'];
function pickType(r){
  // weighted: low 34, tall 24, wide 22, pair 20
  const x=r();
  if(x<0.34) return 'low';
  if(x<0.58) return 'tall';
  if(x<0.80) return 'wide';
  return 'pair';
}
function makeObstacle(x, type, r){
  let w,h;
  if(type==='low'){ w=34+r()*16; h=26+r()*16; }
  else if(type==='tall'){ w=30+r()*12; h=64+r()*26; }
  else if(type==='wide'){ w=70+r()*40; h=30+r()*14; }
  else { w=30+r()*10; h=40+r()*16; }   // pair member
  return {x, w:Math.round(w), h:Math.round(h), type};
}
function generateAhead(){
  const limit = worldOffset + GENERATE_AHEAD + W;
  while(genCursor < limit){
    const gap = BASE_GAP * (0.62 + rng()*0.95);
    genCursor += gap;
    const type = pickType(rng);
    if(type==='pair'){
      // two obstacles close together; tightness is seed-fixed, difficulty
      // revealed by speed (at high speed both must be cleared in one arc).
      const sep = 70 + rng()*70;
      obstacles.push(makeObstacle(genCursor, 'pair', rng));
      obstacles.push(makeObstacle(genCursor+sep, 'pair', rng));
      genCursor += sep;
    } else {
      obstacles.push(makeObstacle(genCursor, type, rng));
    }
  }
  // despawn behind
  const behind = worldOffset - DESPAWN_BEHIND;
  while(obstacles.length && obstacles[0].x + obstacles[0].w < behind) obstacles.shift();
}

/* ---------- Tap handling ---------- */
function clamp(x,a,b){ return x<a?a:(x>b?b:x); }
function onTap(now){
  if(state!=='playing') return;
  // debounce: ignore taps too close together (bounce / inhuman spam)
  if(now - lastTap < DEBOUNCE_MS) return;
  const interval = lastTap > -1e8 ? (now - lastTap) : null;
  lastTap = now; staleTap = false; beatPulse = 1.0;

  // cadence window + EMA + mistap guard
  if(interval !== null){
    let iv = interval;
    if(meanEMA !== null) iv = clamp(iv, 0.4*meanEMA, 2.5*meanEMA); // mistap guard
    meanEMA = meanEMA===null ? iv : meanEMA*(1-EMA_ALPHA) + iv*EMA_ALPHA;
    taps.push(now);
    if(taps.length > WINDOW_TAPS) taps.shift();
    // rhythm mastery on-beat test
    const dev = Math.abs(iv - meanEMA) / Math.max(meanEMA,1);
    if(dev <= TOLERANCE){
      streak++;
      mult = Math.min(MAX_MULT, 1 + Math.floor(streak/TIER_SIZE));
    } else {
      streak = 0;
      mult = Math.max(1, mult-1);   // decay one tier, forgiving
    }
  }
  // jump only when grounded (fixed arc, no double jump, no air control)
  if(grounded){
    runnerVy = JUMP_VY;
    grounded = false;
  }
}

/* ---------- Simulation step ---------- */
function step(now){
  // recompute target speed from cadence
  if(meanEMA===null || (now-lastTap) > STALE_MS){
    targetSpeed = 1;            // ease to safe baseline when stale / no cadence yet
  } else {
    const t = clamp((MAX_INTERVAL - meanEMA)/(MAX_INTERVAL-MIN_INTERVAL), 0, 1);
    targetSpeed = 1 + 3*t;
  }
  // asymmetric easing: rise slow, fall fast (anti-panic)
  if(targetSpeed > speed) speed += (targetSpeed-speed)*SPEED_RISE;
  else speed += (targetSpeed-speed)*SPEED_FALL;

  // advance world
  prevWorldOffset = worldOffset;
  prevRunnerY = runnerY;
  const dx = speed * BASE_SCROLL * SIM_DT / 1000;
  worldOffset += dx;

  // integrate runner arc
  if(!grounded){
    runnerVy += GRAVITY * SIM_DT/1000;
    runnerY += runnerVy * SIM_DT/1000;
    if(runnerY >= 0){ runnerY=0; runnerVy=0; grounded=true; }
  }

  // generate / despawn
  generateAhead();

  // collision (AABB) — runner box at RUNNER_X, feet at GROUND_Y+runnerY
  const rw=34, rh=50;
  const rx = RUNNER_X - rw/2;
  const ry = GROUND_Y + runnerY - rh;   // runnerY<=0 in air
  for(let i=0;i<obstacles.length;i++){
    const o=obstacles[i];
    const ox = (o.x - worldOffset) + RUNNER_X;  // screen x of obstacle left
    if(ox + o.w < rx-4) continue;       // behind runner
    if(ox > rx + rw + 4) break;          // ahead (sorted) -> done
    const oy = GROUND_Y - o.h;
    // AABB overlap
    if(rx < ox+o.w && rx+rw > ox && ry < oy+o.h && ry+rh > oy){
      die(); return;
    }
  }

  // score
  score += speed * BASE_SCROLL * (SIM_DT/1000) * SCORE_K * mult;

  // decay visual pulse
  beatPulse *= 0.86;
  if(shake>0) shake = Math.max(0, shake - SIM_DT/1000*60);
}

function die(){
  state='gameover';
  shake = 14;
  const s = Math.floor(score);
  finalScore.textContent = s.toLocaleString();
  const prev = getHS();
  if(s > prev){ setHS(s); newHs.classList.remove('hidden'); }
  else { newHs.classList.add('hidden'); }
  overHs.textContent = getHS().toLocaleString();
  refreshHS();
  overOverlay.classList.remove('hidden');
}

/* ---------- Render ---------- */
let bgScroll=0;
function render(alpha){
  // interpolated positions
  const wo = prevWorldOffset + (worldOffset-prevWorldOffset)*alpha;
  const ry  = prevRunnerY + (runnerY-prevRunnerY)*alpha;
  const sx = shake>0 ? (Math.random()-0.5)*shake : 0;
  const sy = shake>0 ? (Math.random()-0.5)*shake : 0;

  ctx.save();
  ctx.translate(sx,sy);

  // sky gradient
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#0a0f24'); g.addColorStop(0.55,'#0a0c1c'); g.addColorStop(1,'#070612');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  // parallax neon grid (far)
  bgScroll = wo*0.25;
  drawGrid(bgScroll, 0.5, 'rgba(80,120,220,0.10)', 80, GROUND_Y*0.55);
  drawGrid(wo*0.5, 0.7, 'rgba(120,80,220,0.10)', 120, GROUND_Y*0.78);

  // distant skyline silhouette
  drawSkyline(wo*0.35);

  // ground
  const gg = ctx.createLinearGradient(0,GROUND_Y,0,H);
  gg.addColorStop(0,'#0c1430'); gg.addColorStop(1,'#06080f');
  ctx.fillStyle=gg; ctx.fillRect(0,GROUND_Y,W,H-GROUND_Y);
  // glowing ground line
  ctx.strokeStyle='rgba(34,233,255,0.55)'; ctx.lineWidth=2;
  ctx.shadowColor='rgba(34,233,255,0.7)'; ctx.shadowBlur=10;
  ctx.beginPath(); ctx.moveTo(0,GROUND_Y); ctx.lineTo(W,GROUND_Y); ctx.stroke();
  ctx.shadowBlur=0;
  // ground tick marks scrolling
  ctx.strokeStyle='rgba(120,140,220,0.22)'; ctx.lineWidth=1;
  const tick=60; const off=(wo%tick);
  for(let x=-off;x<W;x+=tick){ ctx.beginPath(); ctx.moveTo(x,GROUND_Y); ctx.lineTo(x,GROUND_Y+8); ctx.stroke(); }

  // obstacles
  for(let i=0;i<obstacles.length;i++){
    const o=obstacles[i];
    const ox = (o.x - wo) + RUNNER_X;
    if(ox > W+40 || ox+o.w < -40) continue;
    drawObstacle(ox, GROUND_Y-o.h, o.w, o.h, o.type);
  }

  // runner
  drawRunner(RUNNER_X, GROUND_Y+ry, beatPulse);

  ctx.restore();
}

function drawGrid(scroll, alpha, color, spacing, baseY){
  ctx.save();
  ctx.globalAlpha=alpha;
  ctx.strokeStyle=color; ctx.lineWidth=1;
  const off = scroll % spacing;
  for(let x=-off;x<W;x+=spacing){ ctx.beginPath(); ctx.moveTo(x,baseY); ctx.lineTo(x,GROUND_Y); ctx.stroke(); }
  for(let y=baseY;y<GROUND_Y;y+=spacing*0.6){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.restore();
}

function drawSkyline(scroll){
  ctx.save();
  ctx.fillStyle='rgba(20,28,60,0.55)';
  const bw=70; const off=scroll%bw;
  let seed=Math.floor(scroll/bw);
  for(let x=-off;x<W+bw;x+=bw){
    const s=mulberry32(fnv1a('sky'+Math.floor((x+scroll)/bw)));
    const h=40+s()*90;
    ctx.fillRect(x, GROUND_Y-h, bw-10, h);
    // window lights
    ctx.fillStyle='rgba(34,233,255,0.10)';
    for(let wy=GROUND_Y-h+8; wy<GROUND_Y-8; wy+=12){
      if(s()>0.55) ctx.fillRect(x+8,wy,4,5);
    }
    ctx.fillStyle='rgba(20,28,60,0.55)';
  }
  ctx.restore();
}

function drawObstacle(x,y,w,h,type){
  ctx.save();
  const col = type==='pair' ? '#ff3df0' : (type==='tall' ? '#ff7a3d' : '#3dffa6');
  // glow body
  ctx.shadowColor=col; ctx.shadowBlur=16;
  ctx.fillStyle='rgba(8,10,20,0.85)';
  roundRect(x,y,w,h,6); ctx.fill();
  ctx.shadowBlur=0;
  // neon outline
  ctx.strokeStyle=col; ctx.lineWidth=2.5;
  roundRect(x,y,w,h,6); ctx.stroke();
  // inner accent line
  ctx.strokeStyle='rgba(255,255,255,0.18)'; ctx.lineWidth=1;
  roundRect(x+3,y+3,w-6,h-6,4); ctx.stroke();
  ctx.restore();
}

function drawRunner(x, baseY, pulse){
  const w=34, h=50;
  const topY = baseY - h;
  ctx.save();
  // shadow on ground
  ctx.fillStyle='rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, baseY+2, w*0.6, 5, 0, 0, Math.PI*2); ctx.fill();
  // body glow
  const glow = 14 + pulse*22;
  ctx.shadowColor='#22e9ff'; ctx.shadowBlur=glow;
  ctx.fillStyle='#0a1422';
  roundRect(x-w/2, topY, w, h, 8); ctx.fill();
  ctx.shadowBlur=0;
  ctx.strokeStyle='#22e9ff'; ctx.lineWidth=2.5;
  roundRect(x-w/2, topY, w, h, 8); ctx.stroke();
  // visor
  ctx.fillStyle='#22e9ff';
  roundRect(x-w/2+6, topY+8, w-12, 12, 4); ctx.fill();
  // chest core pulses with beat
  ctx.fillStyle = pulse>0.1 ? '#ffd23d' : '#0e2a3a';
  ctx.beginPath(); ctx.arc(x, topY+h*0.6, 4+pulse*4, 0, Math.PI*2); ctx.fill();
  // legs (simple)
  ctx.strokeStyle='#22e9ff'; ctx.lineWidth=3;
  ctx.beginPath();
  if(grounded){
    const ph = (performance.now()/120)%1;
    ctx.moveTo(x-6, baseY); ctx.lineTo(x-6, baseY+ (ph<0.5?2:-2));
    ctx.moveTo(x+6, baseY); ctx.lineTo(x+6, baseY+ (ph<0.5?-2:2));
  } else {
    ctx.moveTo(x-6, baseY); ctx.lineTo(x-10, baseY-6);
    ctx.moveTo(x+6, baseY); ctx.lineTo(x+10, baseY-6);
  }
  ctx.stroke();
  ctx.restore();
}

function roundRect(x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

/* ---------- HUD update ---------- */
function updateHUD(){
  scoreVal.textContent = Math.floor(score).toLocaleString();
  multVal.textContent = 'x'+mult;
  speedTxt.textContent = speed.toFixed(1)+'x';
  const pct = clamp((speed-1)/3, 0, 1)*100;
  barFill.style.width = pct+'%';
  beat.style.opacity = (0.25 + beatPulse*0.75).toFixed(2);
  beat.style.transform = `scale(${(0.6+beatPulse*0.9).toFixed(2)})`;
  for(let i=0;i<pips.length;i++) pips[i].classList.toggle('on', i < mult-1);
}

/* ---------- Main loop: fixed timestep + interpolation ---------- */
let acc=0, lastFrame=0, lastNow=0;
function frame(now){
  if(!lastFrame) lastFrame=now;
  let dt = now - lastFrame;
  lastFrame = now;
  if(dt>100) dt=100;            // clamp after tab-switch stalls
  if(state==='playing'){
    acc += dt;
    let steps=0;
    while(acc >= SIM_DT && steps<5){      // max 5 steps to avoid spiral
      step(now);
      acc -= SIM_DT; steps++;
      if(state!=='playing') break;
    }
  } else {
    acc = 0;
  }
  const alpha = state==='playing' ? clamp(acc/SIM_DT,0,1) : 1;
  render(alpha);
  updateHUD();
  requestAnimationFrame(frame);
}

/* ---------- Input: single tap (pointer) ---------- */
function tapInput(e){
  // ignore taps on buttons / inputs / overlays that are showing
  const t = e.target;
  if(t && (t.tagName==='BUTTON' || t.tagName==='INPUT' || t.closest && t.closest('.overlay:not(.hidden)'))) return;
  if(state==='playing'){ e.preventDefault(); onTap(performance.now()); }
}
cv.addEventListener('pointerdown', tapInput);
document.getElementById('stage').addEventListener('pointerdown', tapInput);

/* ---------- Buttons ---------- */
$('startBtn').addEventListener('click', ()=>{ beginRun(); });
$('pauseBtn').addEventListener('click', ()=>{
  if(state==='playing'){ state='paused'; pauseOverlay.classList.remove('hidden'); $('pauseBtn').textContent='Resume'; }
  else if(state==='paused'){ state='playing'; pauseOverlay.classList.add('hidden'); $('pauseBtn').textContent='Pause'; }
});
$('resumeBtn').addEventListener('click', ()=>{ state='playing'; pauseOverlay.classList.add('hidden'); $('pauseBtn').textContent='Pause'; });
$('quitBtn').addEventListener('click', ()=>{ state='menu'; pauseOverlay.classList.add('hidden'); startOverlay.classList.remove('hidden'); });
$('restartBtn').addEventListener('click', ()=>{ if(state!=='menu') beginRun(); });
$('againBtn').addEventListener('click', ()=>{ beginRun(); });
$('menuBtn').addEventListener('click', ()=>{ state='menu'; overOverlay.classList.add('hidden'); startOverlay.classList.remove('hidden'); });

/* ---------- Boot ---------- */
resize();
seedInput.value = randomSeed();
refreshHS();
requestAnimationFrame(frame);
