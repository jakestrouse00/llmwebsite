'use strict';
/* ============================================================
   Ecosystem Sandbox Simulator
   Deterministic predator-prey on Canvas 2D. Zero dependencies.
   - mulberry32 seeded PRNG drives world-gen + every stochastic event
   - producers are per-cell (stationary); herbivores & predators are
     SoA typed-array entities with a cell-indexed linked list for O(n) search
   - keyframe every K=32 steps; scrub re-simulates <=31 steps
   - per-frame metadata stream drives the timeline heatmap
   - ghost overlay = one drawImage during scrubbing
   - brush edits stored as compact deltas, interleaved before each re-sim step
   ============================================================ */

const K = 32;                 // keyframe interval
const MAX_FRAMES = 20000;     // metadata cap
const MAX_KEYFRAMES = 420;    // keyframe ring cap
const MAX_DELTAS = 500000;    // brush-delta cap

const $ = id => document.getElementById(id);
const canvas = $('world');
const ctx = canvas.getContext('2d', { alpha: false });
const heatCanvas = $('heatmap');
const heatCtx = heatCanvas.getContext('2d');

/* ---------- PRNG (mulberry32) ---------- */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  };
}
let rng = mulberry32(1337);
const rand = () => rng() / 4294967296;   // float in [0,1)

/* ---------- State ---------- */
let W = 120, H = 120, N = W * H;
let cap = Math.max(20000, N);            // entity capacity
let terrain, fertility, prodCell, prodEnergy;
let entId, entX, entY, entType, entEnergy, entAge, entAlive;
let freeList, freeTop, nextId, aliveCount;
let herbHead, herbNext;                  // cell-indexed linked list for herbivores

let liveStep = 0;
let playing = true;
let stepsPerSecond = 20;
let acc = 0, lastTime = 0;

// parameters (live-mutable)
let P = { birthRate:0.5, metabolism:0.6, aggression:0.4, regrowth:0.5 };

// brush
let brush = { tool:'terrain', val:2, size:3 };
let painting = false, lastPaintCell = -1;

// keyframes: array of {step, buf}
let keyframes = [];
// metadata
let metaCounts = new Uint16Array(MAX_FRAMES * 3);
let metaDominant = new Uint8Array(MAX_FRAMES);
let metaLen = 0;
// brush deltas (parallel arrays)
let dStep = new Uint32Array(MAX_DELTAS);
let dCell = new Uint32Array(MAX_DELTAS);
let dKind = new Uint8Array(MAX_DELTAS);
let dVal  = new Uint8Array(MAX_DELTAS);
let dLen = 0;

// scrub
let scrubbing = false, scrubStep = -1;
let backup = null;                       // live-state backup while scrubbing

// render buffers
let baseCanvas, baseCtx, baseImg;        // WxH offscreen + ImageData
let ghostCanvas, ghostCtx;               // present-state offscreen
let displayScale = 1;

/* ---------- Terrain colors ---------- */
const TERR = [
  [18, 48, 86],   // 0 water
  [206, 188, 128],// 1 sand
  [58, 128, 52],  // 2 grass
  [30, 78, 42],   // 3 forest
  [108, 110, 116] // 4 rock
];
const C_PROD = [120, 226, 96];
const C_HERB = [244, 222, 96];
const C_CARN = [232, 74, 74];

/* ============================================================
   INIT / WORLD GENERATION
   ============================================================ */
function allocBuffers(){
  N = W * H;
  cap = Math.max(20000, N);
  terrain   = new Uint8Array(N);
  fertility = new Float32Array(N);
  prodCell  = new Uint8Array(N);
  prodEnergy= new Float32Array(N);
  entId     = new Uint32Array(cap);
  entX      = new Uint16Array(cap);
  entY      = new Uint16Array(cap);
  entType   = new Uint8Array(cap);
  entEnergy = new Float32Array(cap);
  entAge    = new Uint16Array(cap);
  entAlive  = new Uint8Array(cap);
  freeList  = new Int32Array(cap);
  herbHead  = new Int32Array(N);
  herbNext  = new Int32Array(cap);
  freeTop = 0;
  for (let i = cap - 1; i >= 0; i--) freeList[freeTop++] = i;
  nextId = 1; aliveCount = 0;

  baseCanvas = document.createElement('canvas');
  baseCanvas.width = W; baseCanvas.height = H;
  baseCtx = baseCanvas.getContext('2d');
  baseImg = baseCtx.createImageData(W, H);
  ghostCanvas = document.createElement('canvas');
  ghostCanvas.width = W; ghostCanvas.height = H;
  ghostCtx = ghostCanvas.getContext('2d');
}

function generateWorld(seed){
  rng = mulberry32(seed >>> 0);
  // value-noise terrain: low-res random lattice + bilinear interpolation, 2 octaves
  const noise = (scale) => {
    const gw = Math.max(2, Math.ceil(W / scale) + 2);
    const gh = Math.max(2, Math.ceil(H / scale) + 2);
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    const out = new Float32Array(N);
    for (let y = 0; y < H; y++){
      for (let x = 0; x < W; x++){
        const gx = x / scale, gy = y / scale;
        const x0 = Math.floor(gx), y0 = Math.floor(gy);
        const fx = gx - x0, fy = gy - y0;
        const sx = fx*fx*(3-2*fx), sy = fy*fy*(3-2*fy);
        const i00 = g[y0*gw+x0], i10 = g[y0*gw+x0+1];
        const i01 = g[(y0+1)*gw+x0], i11 = g[(y0+1)*gw+x0+1];
        const top = i00 + (i10-i00)*sx, bot = i01 + (i11-i01)*sx;
        out[y*W+x] = top + (bot-top)*sy;
      }
    }
    return out;
  };
  const base = noise(16);
  const detail = noise(6);
  for (let i = 0; i < N; i++){
    const e = base[i]*0.7 + detail[i]*0.3;
    let t;
    if (e < 0.30) t = 0;        // water
    else if (e < 0.38) t = 1;   // sand
    else if (e < 0.62) t = 2;   // grass
    else if (e < 0.82) t = 3;   // forest
    else t = 4;                 // rock
    terrain[i] = t;
    // fertility from terrain
    if (t === 2) fertility[i] = 0.55 + 0.35*rand();
    else if (t === 3) fertility[i] = 0.35 + 0.30*rand();
    else if (t === 1) fertility[i] = 0.10 + 0.10*rand();
    else fertility[i] = 0;
    prodCell[i] = 0; prodEnergy[i] = 0;
  }
  // seed initial producers on grass/forest
  for (let i = 0; i < N; i++){
    if ((terrain[i] === 2 || terrain[i] === 3) && rand() < 0.25){
      prodCell[i] = 1; prodEnergy[i] = 0.5 + 0.5*rand();
    }
  }
  // seed herbivores
  const nH = Math.floor(N * 0.012);
  for (let i = 0; i < nH; i++){
    let tries = 0, cx, cy, idx;
    do { cx = (rand()*W)|0; cy = (rand()*H)|0; idx = cy*W+cx; tries++; }
    while ((terrain[idx]===0||terrain[idx]===4) && tries < 40);
    spawnEntity(1, cx, cy, 8 + 6*rand());
  }
  // seed predators
  const nC = Math.floor(N * 0.003);
  for (let i = 0; i < nC; i++){
    let tries = 0, cx, cy, idx;
    do { cx = (rand()*W)|0; cy = (rand()*H)|0; idx = cy*W+cx; tries++; }
    while (terrain[idx]===0 && tries < 40);
    spawnEntity(2, cx, cy, 14 + 8*rand());
  }
}

/* ---------- Entity spawn / free ---------- */
function spawnEntity(type, x, y, energy){
  if (freeTop <= 0) return -1;
  const s = freeList[--freeTop];
  entId[s] = nextId++; entX[s] = x; entY[s] = y; entType[s] = type;
  entEnergy[s] = energy; entAge[s] = 0; entAlive[s] = 1; aliveCount++;
  return s;
}
function killEntity(s){ entAlive[s] = 0; aliveCount--; freeList[freeTop++] = s; }

/* ============================================================
   SIMULATION STEP
   Order: terrain regrowth + producers -> herbivores -> predators -> cleanup
   Entities processed in slot order (fixed & deterministic).
   Births/deaths are queued and applied after each phase so newborns
   never act in the step they are born.
   ============================================================ */
const birthQueue = [];   // {type,x,y,energy}

function simulateStep(){
  // --- 1. Terrain regrowth + producer growth/spawn ---
  const reg = 0.05 + P.regrowth * 0.20;
  for (let i = 0; i < N; i++){
    const t = terrain[i];
    if (t === 2 || t === 3){
      prodEnergy[i] += fertility[i] * reg;
      if (prodEnergy[i] >= 1.0 && prodCell[i] === 0){
        if (rand() < P.birthRate){ prodCell[i] = 1; prodEnergy[i] = 0; }
      }
    }
  }

  // --- 2. Herbivores ---
  birthQueue.length = 0;
  const metab = P.metabolism;
  for (let s = 0; s < cap; s++){
    if (entAlive[s] !== 1 || entType[s] !== 1) continue;
    entAge[s]++;
    entEnergy[s] -= metab;
    if (entEnergy[s] <= 0){ killEntity(s); continue; }

    const cx = entX[s], cy = entY[s];
    // find nearest producer within radius
    const R = 6;
    let bx = -1, by = -1, bd = 1e9;
    for (let dy = -R; dy <= R; dy++){
      const ny = cy + dy; if (ny < 0 || ny >= H) continue;
      for (let dx = -R; dx <= R; dx++){
        const nx = cx + dx; if (nx < 0 || nx >= W) continue;
        const d = dx*dx + dy*dy;
        if (d < bd && prodCell[ny*W+nx] === 1){ bd = d; bx = nx; by = ny; }
      }
    }
    // eat if standing on a producer
    const here = cy*W+cx;
    if (prodCell[here] === 1){
      prodCell[here] = 0; prodEnergy[here] = 0;
      entEnergy[s] += 6;
    } else if (bx >= 0){
      // step toward nearest producer
      const mx = Math.sign(bx - cx), my = Math.sign(by - cy);
      const nx = cx + mx, ny = cy + my;
      const ni = ny*W+nx;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && terrain[ni] !== 0 && terrain[ni] !== 4){
        entX[s] = nx; entY[s] = ny;
        entEnergy[s] -= 0.15;
      }
    } else {
      // wander deterministically
      const dir = (rng() & 3);
      const mx = [0,1,0,-1][dir], my = [-1,0,1,0][dir];
      const nx = cx + mx, ny = cy + my;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && terrain[ny*W+nx] !== 0 && terrain[ny*W+nx] !== 4){
        entX[s] = nx; entY[s] = ny;
      }
    }
    // reproduce
    if (entEnergy[s] > 16){
      const r = rand();
      if (r < P.birthRate * 0.35){
        entEnergy[s] -= 8;
        birthQueue.push({type:1, x:entX[s], y:entY[s], energy:5});
      }
    }
  }
  // apply herbivore births
  for (let i = 0; i < birthQueue.length; i++){
    const b = birthQueue[i];
    const ox = clamp(b.x + ((rng()&3)-1), 0, W-1);
    const oy = clamp(b.y + ((rng()&3)-1), 0, H-1);
    if (terrain[oy*W+ox] !== 0 && terrain[oy*W+ox] !== 4)
      spawnEntity(b.type, ox, oy, b.energy);
  }

  // --- 3. Build herbivore cell-indexed linked list ---
  herbHead.fill(-1);
  for (let s = 0; s < cap; s++){
    if (entAlive[s] === 1 && entType[s] === 1){
      const idx = entY[s]*W + entX[s];
      herbNext[s] = herbHead[idx];
      herbHead[idx] = s;
    }
  }

  // --- 4. Predators ---
  birthQueue.length = 0;
  const aggr = P.aggression;
  const Rp = 4 + Math.round(aggr * 12);
  const carnMetab = P.metabolism * (0.6 + aggr * 1.4);
  for (let s = 0; s < cap; s++){
    if (entAlive[s] !== 1 || entType[s] !== 2) continue;
    entAge[s]++;
    entEnergy[s] -= carnMetab;
    if (entEnergy[s] <= 0){ killEntity(s); continue; }

    const cx = entX[s], cy = entY[s];
    // find nearest herbivore within radius using linked list
    let target = -1, bd = 1e9;
    for (let dy = -Rp; dy <= Rp; dy++){
      const ny = cy + dy; if (ny < 0 || ny >= H) continue;
      for (let dx = -Rp; dx <= Rp; dx++){
        const nx = cx + dx; if (nx < 0 || nx >= W) continue;
        const d = dx*dx + dy*dy;
        if (d >= bd) continue;
        let hh = herbHead[ny*W+nx];
        while (hh !== -1){
          if (entAlive[hh] === 1){ bd = d; target = hh; break; }
          hh = herbNext[hh];
        }
      }
    }
    // eat if on same cell as a herbivore
    const here = cy*W+cx;
    let ate = false;
    let hh = herbHead[here];
    while (hh !== -1){
      if (entAlive[hh] === 1){
        entEnergy[s] += 11;
        killEntity(hh);
        ate = true; break;
      }
      hh = herbNext[hh];
    }
    if (!ate && target >= 0){
      const mx = Math.sign(entX[target] - cx), my = Math.sign(entY[target] - cy);
      const nx = cx + mx, ny = cy + my;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && terrain[ny*W+nx] !== 0){
        entX[s] = nx; entY[s] = ny;
        entEnergy[s] -= 0.2;
      }
    } else if (!ate){
      const dir = (rng() & 3);
      const mx = [0,1,0,-1][dir], my = [-1,0,1,0][dir];
      const nx = cx + mx, ny = cy + my;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && terrain[ny*W+nx] !== 0){
        entX[s] = nx; entY[s] = ny;
      }
    }
    // reproduce
    if (entEnergy[s] > 26){
      const r = rand();
      if (r < P.birthRate * 0.22){
        entEnergy[s] -= 13;
        birthQueue.push({type:2, x:entX[s], y:entY[s], energy:9});
      }
    }
  }
  for (let i = 0; i < birthQueue.length; i++){
    const b = birthQueue[i];
    const ox = clamp(b.x + ((rng()&3)-1), 0, W-1);
    const oy = clamp(b.y + ((rng()&3)-1), 0, H-1);
    if (terrain[oy*W+ox] !== 0)
      spawnEntity(b.type, ox, oy, b.energy);
  }

  liveStep++;
  // metadata
  recordMetadata();
  // keyframe
  if (liveStep % K === 0) captureKeyframe();
}

function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }

/* ============================================================
   METADATA STREAM (drives heatmap)
   ============================================================ */
function recordMetadata(){
  if (metaLen >= MAX_FRAMES) coalesceMetadata();
  let p = 0, h = 0, c = 0;
  for (let i = 0; i < N; i++) if (prodCell[i]) p++;
  for (let s = 0; s < cap; s++){
    if (entAlive[s] !== 1) continue;
    if (entType[s] === 1) h++; else if (entType[s] === 2) c++;
  }
  const o = metaLen * 3;
  metaCounts[o] = p; metaCounts[o+1] = h; metaCounts[o+2] = c;
  let dom = 0, best = p;
  if (h > best){ best = h; dom = 1; }
  if (c > best){ best = c; dom = 2; }
  if (best === 0) dom = 3;
  metaDominant[metaLen] = dom;
  metaLen++;
}
function coalesceMetadata(){
  const half = MAX_FRAMES >> 1;
  for (let i = 0; i < half; i++){
    metaCounts[i*3]   = metaCounts[i*6];
    metaCounts[i*3+1] = metaCounts[i*6+1];
    metaCounts[i*3+2] = metaCounts[i*6+2];
    metaDominant[i] = metaDominant[i*2];
  }
  metaLen = half;
}

/* ============================================================
   KEYFRAMES
   ============================================================ */
function captureKeyframe(){
  let n = 0;
  for (let s = 0; s < cap; s++) if (entAlive[s] === 1) n++;
  const buf = new ArrayBuffer(
    N + N + N + N +                       
    n * (4+2+2+1+4+2) +                   
    4 + 4 + 4                             
  );
  const dv = new DataView(buf);
  let o = 0;
  for (let i = 0; i < N; i++) dv.setUint8(o++, terrain[i]);
  for (let i = 0; i < N; i++) dv.setUint8(o++, Math.round(fertility[i]*255));
  for (let i = 0; i < N; i++) dv.setUint8(o++, prodCell[i]);
  for (let i = 0; i < N; i++) dv.setUint8(o++, Math.round(prodEnergy[i]*255));
  for (let s = 0; s < cap; s++){
    if (entAlive[s] !== 1) continue;
    dv.setUint32(o, entId[s]); o += 4;
    dv.setUint16(o, entX[s]); o += 2;
    dv.setUint16(o, entY[s]); o += 2;
    dv.setUint8(o, entType[s]); o += 1;
    dv.setUint32(o, Math.round(entEnergy[s]*100)); o += 4;
    dv.setUint16(o, entAge[s]); o += 2;
  }
  dv.setUint32(o, nextId); o += 4;
  dv.setUint32(o, getRngState()); o += 4; 
  dv.setUint32(o, liveStep); o += 4;
  keyframes.push({ step: liveStep, buf });
  if (keyframes.length > MAX_KEYFRAMES) coalesceKeyframes();
}

function patchRngState(){
  let a = (rng._a !== undefined ? rng._a : 0);
  const fn = function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = Math.imul(t ^ (t >>> 7), t | 61);
    a = (t ^ (t >>> 14)) >>> 0;
    fn._a = a;
    return a;
  };
  fn._a = a;
  rng = fn;
}
function getRngState(){ return rng._a !== undefined ? rng._a : 0; }
function setRngState(v){ rng._a = v >>> 0; }

function coalesceKeyframes(){
  const kept = [];
  for (let i = 0; i < keyframes.length; i += 2) kept.push(keyframes[i]);
  keyframes = kept;
}

function loadKeyframe(kf){
  const dv = new DataView(kf.buf);
  let o = 0;
  for (let i = 0; i < N; i++) terrain[i] = dv.getUint8(o++);
  for (let i = 0; i < N; i++) fertility[i] = dv.getUint8(o++) / 255;
  for (let i = 0; i < N; i++) prodCell[i] = dv.getUint8(o++);
  for (let i = 0; i < N; i++) prodEnergy[i] = dv.getUint8(o++) / 255;
  for (let s = 0; s < cap; s++) entAlive[s] = 0;
  freeTop = 0;
  for (let i = cap - 1; i >= 0; i--) freeList[freeTop++] = i;
  aliveCount = 0;
  const entSize = 4+2+2+1+4+2;
  const trailer = 12;
  const entBytes = kf.buf.byteLength - o - trailer;
  const n = entBytes / entSize;
  for (let k = 0; k < n; k++){
    const id = dv.getUint32(o); o += 4;
    const x = dv.getUint16(o); o += 2;
    const y = dv.getUint16(o); o += 2;
    const ty = dv.getUint8(o); o += 1;
    const en = dv.getUint32(o) / 100; o += 4;
    const ag = dv.getUint16(o); o += 2;
    const s = freeList[--freeTop];
    entId[s] = id; entX[s] = x; entY[s] = y; entType[s] = ty;
    entEnergy[s] = en; entAge[s] = ag; entAlive[s] = 1; aliveCount++;
  }
  nextId = dv.getUint32(o); o += 4;
  setRngState(dv.getUint32(o)); o += 4;
  liveStep = dv.getUint32(o); o += 4;
}

function findKeyframeAtOrBefore(step){
  let best = null;
  for (let i = 0; i < keyframes.length; i++){
    if (keyframes[i].step <= step && (!best || keyframes[i].step > best.step)) best = keyframes[i];
  }
  return best;
}

/* ============================================================
   BRUSH DELTAS
   ============================================================ */
function pushDelta(cell, kind, val){
  if (dLen >= MAX_DELTAS){ coalesceDeltas(); }
  dStep[dLen] = liveStep; dCell[dLen] = cell; dKind[dLen] = kind; dVal[dLen] = val;
  dLen++;
}
function coalesceDeltas(){
  const map = new Map();
  const order = [];
  for (let i = 0; i < dLen; i++){
    const key = dStep[i] * 4294967296 + dCell[i];
    if (!map.has(key)) order.push(key);
    map.set(key, i);
  }
  let w = 0;
  for (const key of order){
    const i = map.get(key);
    dStep[w] = dStep[i]; dCell[w] = dCell[i]; dKind[w] = dKind[i]; dVal[w] = dVal[i];
    w++;
  }
  dLen = w;
}
function applyDeltasForStep(step){
  for (let i = 0; i < dLen; i++){
    if (dStep[i] === step){
      const cell = dCell[i], kind = dKind[i], val = dVal[i];
      if (kind === 0){ terrain[cell] = val; fertility[cell] = (val===2?0.7:val===3?0.5:val===1?0.15:0); prodCell[cell]=0; prodEnergy[cell]=0; }
      else if (kind === 1){ prodCell[cell] = 1; prodEnergy[cell] = 0.6; }
      else if (kind === 2){ spawnEntity(1, cell % W, (cell / W)|0, 9); }
      else if (kind === 3){ spawnEntity(2, cell % W, (cell / W)|0, 16); }
      else if (kind === 4){ prodCell[cell] = 0; prodEnergy[cell] = 0; }
    }
  }
}

/* ============================================================
   PAINTING
   ============================================================ */
function paintAtClient(cx, cy){
  const rect = canvas.getBoundingClientRect();
  const px = Math.floor((cx - rect.left) / rect.width * W);
  const py = Math.floor((cy - rect.top) / rect.height * H);
  const r = brush.size;
  for (let dy = -r; dy <= r; dy++){
    for (let dx = -r; dx <= r; dx++){
      if (dx*dx + dy*dy > r*r) continue;
      const x = px + dx, y = py + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const idx = y*W + x;
      if (brush.tool === 'terrain'){
        terrain[idx] = brush.val;
        fertility[idx] = (brush.val===2?0.7:brush.val===3?0.5:brush.val===1?0.15:0);
        prodCell[idx] = 0; prodEnergy[idx] = 0;
        pushDelta(idx, 0, brush.val);
      } else if (brush.tool === 'organism'){
        if (brush.val === 1){ prodCell[idx] = 1; prodEnergy[idx] = 0.6; pushDelta(idx, 1, 0); }
        else if (brush.val === 2){ spawnEntity(1, x, y, 9); pushDelta(idx, 2, 0); }
        else if (brush.val === 3){ spawnEntity(2, x, y, 16); pushDelta(idx, 3, 0); }
      } else if (brush.tool === 'erase'){
        prodCell[idx] = 0; prodEnergy[idx] = 0;
        for (let s = 0; s < cap; s++){
          if (entAlive[s] === 1 && entX[s] === x && entY[s] === y) killEntity(s);
        }
        pushDelta(idx, 4, 0);
      }
    }
  }
  render();
}

/* ============================================================
   RENDERING
   ============================================================ */
function fillImageData(){
  const data = baseImg.data;
  let i = 0;
  for (let c = 0; c < N; c++){
    let r, g, b;
    const t = terrain[c];
    const tc = TERR[t];
    if (prodCell[c]){ r=C_PROD[0]; g=C_PROD[1]; b=C_PROD[2]; }
    else { r=tc[0]; g=tc[1]; b=tc[2]; }
    data[i++] = r; data[i++] = g; data[i++] = b; data[i++] = 255;
  }
  for (let s = 0; s < cap; s++){
    if (entAlive[s] !== 1) continue;
    const idx = entY[s]*W + entX[s];
    const o = idx*4;
    const col = entType[s] === 1 ? C_HERB : C_CARN;
    data[o] = col[0]; data[o+1] = col[1]; data[o+2] = col[2];
  }
  baseCtx.putImageData(baseImg, 0, 0);
}

function render(){
  fillImageData();
  if (scrubbing){
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(baseCanvas, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.20;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(ghostCanvas, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(baseCanvas, 0, 0, canvas.width, canvas.height);
    ghostCtx.clearRect(0,0,W,H);
    ghostCtx.drawImage(baseCanvas, 0, 0);
  }
  updateStats();
}

function updateStats(){
  let p = 0, h = 0, c = 0;
  for (let i = 0; i < N; i++) if (prodCell[i]) p++;
  for (let s = 0; s < cap; s++){
    if (entAlive[s] !== 1) continue;
    if (entType[s] === 1) h++; else if (entType[s] === 2) c++;
  }
  $('stP').textContent = p; $('stH').textContent = h; $('stC').textContent = c;
  $('stStep').textContent = scrubbing ? scrubStep : liveStep;
}

/* ============================================================
   TIMELINE HEATMAP
   ============================================================ */
function renderHeatmap(){
  const w = heatCanvas.width, hgt = heatCanvas.height;
  const img = heatCtx.createImageData(w, 1);
  const colors = [[95,211,95],[242,193,78],[239,90,90],[70,70,80]];
  for (let x = 0; x < w; x++){
    const f = Math.floor(x / w * metaLen);
    const dom = metaDominant[Math.min(f, metaLen-1)] || 3;
    const col = colors[dom];
    img.data[x*4] = col[0]; img.data[x*4+1] = col[1]; img.data[x*4+2] = col[2]; img.data[x*4+3] = 255;
  }
  heatCtx.clearRect(0,0,w,hgt);
  heatCtx.putImageData(img, 0, 0);
  heatCtx.drawImage(heatCanvas, 0, 0, w, 1, 0, 0, w, hgt);
  const maxStep = Math.max(liveStep, 1);
  const pct = (scrubbing ? scrubStep : liveStep) / maxStep;
  $('scrubCursor').style.left = (pct * 100) + '%';
}

/* ============================================================
   SCRUBBING
   ============================================================ */
function backupLive(){
  backup = {
    terrain: terrain.slice(),
    fertility: fertility.slice(),
    prodCell: prodCell.slice(),
    prodEnergy: prodEnergy.slice(),
    entId: entId.slice(), entX: entX.slice(), entY: entY.slice(),
    entType: entType.slice(), entEnergy: entEnergy.slice(),
    entAge: entAge.slice(), entAlive: entAlive.slice(),
    freeList: freeList.slice(), freeTop, nextId, aliveCount,
    rngState: getRngState(), liveStep
  };
}
function restoreLive(){
  if (!backup) return;
  terrain = backup.terrain; fertility = backup.fertility;
  prodCell = backup.prodCell; prodEnergy = backup.prodEnergy;
  entId = backup.entId; entX = backup.entX; entY = backup.entY;
  entType = backup.entType; entEnergy = backup.entEnergy;
  entAge = backup.entAge; entAlive = backup.entAlive;
  freeList = backup.freeList; freeTop = backup.freeTop;
  nextId = backup.nextId; aliveCount = backup.aliveCount;
  setRngState(backup.rngState); liveStep = backup.liveStep;
  backup = null;
}

function scrubTo(target){
  if (target < 0) target = 0;
  if (target > liveStep) target = liveStep;
  if (!scrubbing){ backupLive(); scrubbing = true; }
  const kf = findKeyframeAtOrBefore(target);
  if (!kf){ scrubStep = 0; render(); return; }
  loadKeyframe(kf);
  while (liveStep < target){
    applyDeltasForStep(liveStep);
    simulateStep();
  }
  scrubStep = liveStep;
  $('scrubBadge').classList.remove('hidden');
  $('scrubStepLabel').textContent = scrubStep;
  $('btnResume').classList.remove('hidden');
  render();
}

function endScrub(returnToPresent){
  if (!scrubbing) return;
  if (returnToPresent){
    restoreLive();
  } else {
    truncateTimeline(scrubStep);
  }
  scrubbing = false;
  scrubStep = -1;
  $('scrubBadge').classList.add('hidden');
  $('btnResume').classList.add('hidden');
  render();
}

function truncateTimeline(step){
  keyframes = keyframes.filter(k => k.step <= step);
  let w = 0;
  for (let i = 0; i < dLen; i++) if (dStep[i] < step){ dStep[w]=dStep[i]; dCell[w]=dCell[i]; dKind[w]=dKind[i]; dVal[w]=dVal[i]; w++; }
  dLen = w;
  if (step < metaLen) metaLen = step;
  liveStep = step;
  $('scrub').max = liveStep;
}

/* ============================================================
   MAIN LOOP
   ============================================================ */
function loop(t){
  if (!lastTime) lastTime = t;
  const dt = (t - lastTime) / 1000;
  lastTime = t;
  if (playing && !scrubbing){
    acc += dt * stepsPerSecond;
    let steps = 0;
    while (acc >= 1 && steps < 8){ simulateStep(); acc--; steps++; }
    if (acc > 4) acc = 0; 
    render();
    renderHeatmap();
    $('scrub').max = liveStep;
    if (!scrubbing) $('scrub').value = liveStep;
  } else {
    if (!scrubbing) render();
  }
  requestAnimationFrame(loop);
}

/* ============================================================
   RESET / RESEED
   ============================================================ */
function resetWorld(){
  playing = false; setPlayLabel();
  scrubbing = false; backup = null;
  keyframes = []; metaLen = 0; dLen = 0;
  liveStep = 0; acc = 0;
  const seed = (parseInt($('seed').value) || 0) >>> 0;
  W = H = parseInt($('gridSize').value);
  allocBuffers();
  generateWorld(seed);
  patchRngState();
  setRngState(seed); 
  generateWorld(seed);
  captureKeyframe(); 
  $('scrub').max = 0; $('scrub').value = 0;
  $('scrubBadge').classList.add('hidden');
  $('btnResume').classList.add('hidden');
  playing = true; setPlayLabel();
  render(); renderHeatmap();
}

function setPlayLabel(){
  $('btnPlay').textContent = playing ? '⏸ Pause' : '▶ Play';
}

function bindSlider(id, valId, fn, fmt){
  const el = $(id), v = $(valId);
  const update = () => { const val = parseFloat(el.value); fn(val); v.textContent = fmt ? fmt(val) : val; };
  el.addEventListener('input', update);
  update();
}

function initUI(){
  setPlayLabel();

  $('btnPlay').addEventListener('click', () => {
    if (scrubbing) endScrub(false); 
    playing = !playing; setPlayLabel();
  });
  $('btnStep').addEventListener('click', () => {
    if (scrubbing) endScrub(true);
    playing = false; setPlayLabel();
    simulateStep(); render(); renderHeatmap();
    $('scrub').max = liveStep; $('scrub').value = liveStep;
  });
  $('btnReset').addEventListener('click', resetWorld);
  $('btnReseed').addEventListener('click', resetWorld);

  bindSlider('simSpeed','simSpeedVal', v => stepsPerSecond = v);
  bindSlider('gridSize','gridSizeVal', v => {}, v => v);
  $('gridSize').addEventListener('change', resetWorld);
  bindSlider('birthRate','birthRateVal', v => P.birthRate = v/100, v => (v/100).toFixed(2));
  bindSlider('metabolism','metabolismVal', v => P.metabolism = v/100, v => (v/100).toFixed(2));
  bindSlider('aggression','aggressionVal', v => P.aggression = v/100, v => (v/100).toFixed(2));
  bindSlider('regrowth','regrowthVal', v => P.regrowth = v/100, v => (v/100).toFixed(2));
  bindSlider('brushSize','brushSizeVal', v => brush.size = v);

  $('seed').addEventListener('change', resetWorld);

  $('palette').addEventListener('click', e => {
    const b = e.target.closest('.tool'); if (!b) return;
    $('palette').querySelectorAll('.tool').forEach(t => t.classList.remove('active'));
    b.classList.add('active');
    brush.tool = b.dataset.tool; brush.val = parseInt(b.dataset.val);
  });

  canvas.addEventListener('pointerdown', e => {
    if (scrubbing) endScrub(true);
    painting = true; paintAtClient(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', e => {
    if (!painting) return;
    paintAtClient(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', () => { painting = false; });

  const scrub = $('scrub');
  scrub.addEventListener('input', () => {
    const target = parseInt(scrub.value);
    if (!scrubbing && target < liveStep){ scrubTo(target); renderHeatmap(); }
    else if (scrubbing){ scrubTo(target); renderHeatmap(); }
  });
  scrub.addEventListener('pointerup', () => {
    if (scrubbing) endScrub(true);
  });
  $('btnResume').addEventListener('click', () => endScrub(false));
}

function boot(){
  initUI();
  resetWorld();
  requestAnimationFrame(loop);
}
boot();