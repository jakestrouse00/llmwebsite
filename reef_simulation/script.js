(() => {
'use strict';

// ---------- Species & food-web config ----------
const SPECIES = [
  { key:'algae',   name:'Algae',       emoji:'🌿', color:'#5fd06a', role:'Producer',      pos:[0.16,0.80], band:[35,120] },
  { key:'zoo',     name:'Zooplankton', emoji:'🦐', color:'#5fd0e0', role:'Herbivore',     pos:[0.35,0.63], band:[10,55]  },
  { key:'damsel',  name:'Damselfish',  emoji:'🐟', color:'#ff9d3c', role:'Small predator',pos:[0.53,0.46], band:[8,40]   },
  { key:'grouper', name:'Grouper',     emoji:'🐠', color:'#b06bff', role:'Mid predator',   pos:[0.71,0.31], band:[5,30]   },
  { key:'shark',   name:'Shark',       emoji:'🦈', color:'#9fb4c8', role:'Apex predator',  pos:[0.87,0.17], band:[2.5,25] },
];
// predation edges: prey index -> predator index (linear cascade)
const EDGES = [[0,1],[1,2],[2,3],[3,4]];

// ---------- ODE constants (validated) ----------
const P = {
  r0:0.9, K0:140,
  a01:0.012, e1:0.45, m1:0.06,
  a12:0.018, e2:0.45, m2:0.05,
  a23:0.014, e3:0.45, m3:0.04,
  a34:0.011, e4:0.45, m4:0.03,
};
const INIT = [80, 30, 18, 10, 5];
const H = 0.05;            // fixed integration substep
const EXTINCT = 0.5;       // collapse: too low
const OVERPOP = 150;       // collapse: too high
const SESSION = 180;       // 3 minutes
const IMPULSE = 9;         // tap magnitude
const TAP_CD = 0.09;       // per-node cooldown (s)

function deriv(N){
  const [A,Z,D,G,S] = N;
  const dA = P.r0*A*(1 - A/P.K0) - P.a01*A*Z;
  const dZ = P.e1*P.a01*A*Z - P.a12*Z*D - P.m1*Z;
  const dD = P.e2*P.a12*Z*D - P.a23*D*G - P.m2*D;
  const dG = P.e3*P.a23*D*G - P.a34*G*S - P.m3*G;
  const dS = P.e4*P.a34*G*S - P.m4*S;
  return [dA,dZ,dD,dG,dS];
}
function addv(a,b,s){return [a[0]+s*b[0],a[1]+s*b[1],a[2]+s*b[2],a[3]+s*b[3],a[4]+s*b[4]];}
function rk4(N,dt){
  const k1=deriv(N), k2=deriv(addv(N,k1,0.5*dt)), k3=deriv(addv(N,k2,0.5*dt)), k4=deriv(addv(N,k3,dt));
  return [N[0]+dt*(k1[0]+2*k2[0]+2*k3[0]+k4[0])/6,
          N[1]+dt*(k1[1]+2*k2[1]+2*k3[1]+k4[1])/6,
          N[2]+dt*(k1[2]+2*k2[2]+2*k3[2]+k4[2])/6,
          N[3]+dt*(k1[3]+2*k2[3]+2*k3[3]+k4[3])/6,
          N[4]+dt*(k1[4]+2*k2[4]+2*k3[4]+k4[4])/6];
}

// ---------- Canvas / DOM ----------
const canvas = document.getElementById('reef');
const ctx = canvas.getContext('2d');
let W=0, HGT=0, DPR=1;
const speciesListEl = document.getElementById('speciesList');
const timerFill = document.getElementById('timerFill');
const timerText = document.getElementById('timerText');
const speedText = document.getElementById('speedText');
const modeBtn = document.getElementById('modeBtn');
const modeText = document.getElementById('modeText');
const startScreen = document.getElementById('startScreen');
const overScreen = document.getElementById('overScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const overTitle = document.getElementById('overTitle');
const overReason = document.getElementById('overReason');
const overTime = document.getElementById('overTime');
const overBest = document.getElementById('overBest');
const bestStart = document.getElementById('bestStart');

// ---------- State ----------
let state = 'idle';        // idle | playing | over
let N = INIT.slice();
let elapsed = 0;
let speed = 1;
let mode = 'boost';        // boost | cull
let shiftHeld = false;
let lastTs = 0;
let acc = 0;
let nodeCd = [0,0,0,0,0];  // per-node cooldown remaining
let ripples = [];
let bubbles = [];
let best = parseFloat(localStorage.getItem('reflexreef_best') || '0') || 0;

// node screen positions (recomputed on resize)
let nodes = SPECIES.map(s=>({x:0,y:0,r:0}));

function resize(){
  DPR = Math.min(window.devicePixelRatio||1, 2);
  W = window.innerWidth; HGT = window.innerHeight;
  canvas.width = W*DPR; canvas.height = HGT*DPR;
  canvas.style.width = W+'px'; canvas.style.height = HGT+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
  layoutNodes();
}
function layoutNodes(){
  // keep panel area clear on wide screens: compress x into usable region
  const panelW = (W>760)? 264 : 0;
  const leftPad = 24, rightPad = panelW+24, topPad = 70, botPad = 24;
  const ux0 = leftPad, ux1 = Math.max(ux0+200, W-rightPad);
  const uy0 = topPad, uy1 = Math.max(uy0+200, HGT-botPad);
  nodes = SPECIES.map((s,i)=>{
    const x = ux0 + s.pos[0]*(ux1-ux0);
    const y = uy0 + s.pos[1]*(uy1-uy0);
    return {x,y,r:0};
  });
}
window.addEventListener('resize', resize);

// ---------- Species panel build ----------
function buildPanel(){
  speciesListEl.innerHTML = '';
  SPECIES.forEach((s,i)=>{
    const row = document.createElement('div');
    row.className = 'sp-row';
    row.dataset.i = i;
    row.innerHTML =
      `<div class="sp-head">
         <span class="sp-name"><span class="sp-emoji">${s.emoji}</span>${s.name}</span>
         <span class="sp-val" id="val${i}">0</span>
       </div>
       <div class="sp-bar"><div class="sp-fill" id="fill${i}" style="background:${s.color}"></div></div>`;
    speciesListEl.appendChild(row);
  });
}

// ---------- Bubbles (ambient) ----------
function initBubbles(){
  bubbles = [];
  const n = Math.round(W*HGT/26000);
  for(let i=0;i<n;i++) bubbles.push(newBubble(true));
}
function newBubble(any){
  return {
    x: Math.random()*W,
    y: any? Math.random()*HGT : HGT+10,
    r: 1.5+Math.random()*4,
    vy: 8+Math.random()*22,
    drift: (Math.random()-0.5)*10,
    a: 0.10+Math.random()*0.25,
  };
}

// ---------- Game flow ----------
function startGame(){
  N = INIT.slice();
  elapsed = 0; speed = 1; acc = 0;
  nodeCd = [0,0,0,0,0];
  ripples = [];
  state = 'playing';
  startScreen.classList.add('hidden');
  overScreen.classList.add('hidden');
  setMode('boost');
  lastTs = performance.now();
}
function endGame(reason, win){
  state = 'over';
  const t = elapsed;
  if(t > best){ best = t; localStorage.setItem('reflexreef_best', String(best)); }
  overTitle.textContent = win ? 'STABLE ECOSYSTEM' : 'ECOSYSTEM COLLAPSED';
  overTitle.style.color = win ? 'var(--accent)' : 'var(--danger)';
  overReason.textContent = reason;
  overTime.textContent = t.toFixed(1)+'s';
  overBest.textContent = best.toFixed(1)+'s';
  overScreen.classList.remove('hidden');
}

function setMode(m){
  mode = m;
  modeBtn.classList.toggle('boost', m==='boost');
  modeBtn.classList.toggle('cull', m==='cull');
  modeText.textContent = m==='boost' ? 'BOOST' : 'CULL';
}
modeBtn.addEventListener('click', ()=> setMode(mode==='boost'?'cull':'boost'));
window.addEventListener('keydown', e=>{
  if(e.key==='Shift') shiftHeld = true;
  if(e.key==='c'||e.key==='C') setMode('cull');
});
window.addEventListener('keyup', e=>{
  if(e.key==='Shift'){ shiftHeld=false; }
});
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// ---------- Input: tap species ----------
function effectiveMode(){ return shiftHeld ? 'cull' : mode; }

function pointerSpecies(cx, cy){
  for(let i=0;i<nodes.length;i++){
    const nd = nodes[i];
    const dx = cx-nd.x, dy = cy-nd.y;
    if(dx*dx+dy*dy <= (nd.r+10)*(nd.r+10)) return i;
  }
  return -1;
}
function applyTap(i, m){
  if(state!=='playing') return;
  if(nodeCd[i]>0) return;
  if(m==='boost') N[i] = Math.min(OVERPOP-1, N[i]+IMPULSE);
  else            N[i] = Math.max(0, N[i]-IMPULSE);
  nodeCd[i] = TAP_CD;
  ripples.push({x:nodes[i].x, y:nodes[i].y, t:0, color: m==='boost'?'#36e07a':'#ff5d6c'});
}
canvas.addEventListener('pointerdown', e=>{
  if(state!=='playing') return;
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX-rect.left, cy = e.clientY-rect.top;
  const i = pointerSpecies(cx,cy);
  if(i>=0) applyTap(i, effectiveMode());
});
canvas.addEventListener('contextmenu', e=>{
  e.preventDefault();
  if(state!=='playing') return;
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX-rect.left, cy = e.clientY-rect.top;
  const i = pointerSpecies(cx,cy);
  if(i>=0) applyTap(i,'cull');
});

// ---------- Update ----------
function step(simDt){
  // integrate in fixed substeps for stability
  let remain = simDt;
  while(remain > 1e-6){
    const dt = Math.min(H, remain);
    N = rk4(N, dt);
    for(let i=0;i<5;i++) if(N[i]<0) N[i]=0;
    remain -= dt;
  }
  // cooldowns
  for(let i=0;i<5;i++) if(nodeCd[i]>0) nodeCd[i] = Math.max(0, nodeCd[i]-simDt);
  // collapse check
  for(let i=0;i<5;i++){
    if(N[i] <= EXTINCT){ endGame(`${SPECIES[i].name} went extinct — the web unraveled.`, false); return; }
    if(N[i] >= OVERPOP){ endGame(`${SPECIES[i].name} overran the reef — collapse cascaded.`, false); return; }
  }
}

function update(realDt){
  if(state!=='playing') return;
  elapsed += realDt;
  speed = 1 + (elapsed/SESSION)*2;     // 1x -> 3x
  if(elapsed >= SESSION){ endGame('You held the balance for the full 3 minutes.', true); return; }
  step(realDt*speed);
}

// ---------- Render ----------
function nodeRadius(pop){
  // map population to a visible radius; clamp
  const min=20, max=58;
  const t = Math.min(1, Math.max(0, pop/120));
  return min + t*(max-min);
}

function drawBackground(){
  // vertical gradient
  const g = ctx.createLinearGradient(0,0,0,HGT);
  g.addColorStop(0,'#072a3a'); g.addColorStop(0.55,'#0b3b4a'); g.addColorStop(1,'#04141f');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,HGT);
  // light rays
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(let i=0;i<4;i++){
    const x = W*(0.15+i*0.24) + Math.sin(elapsed*0.25+i)*20;
    const rg = ctx.createLinearGradient(x,0,x+60,HGT);
    rg.addColorStop(0,'rgba(120,220,235,0.05)'); rg.addColorStop(1,'rgba(120,220,235,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(x-30,0); ctx.lineTo(x+30,0); ctx.lineTo(x+90,HGT); ctx.lineTo(x-90,HGT); ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // bubbles
  ctx.save();
  for(const b of bubbles){
    ctx.beginPath();
    ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
    ctx.fillStyle = `rgba(180,235,245,${b.a})`;
    ctx.fill();
  }
  ctx.restore();
}
function updateBubbles(dt){
  for(const b of bubbles){
    b.y -= b.vy*dt;
    b.x += Math.sin(b.y*0.02)*b.drift*dt;
    if(b.y < -10){ Object.assign(b, newBubble(false)); }
  }
}

function drawWeb(){
  ctx.save();
  ctx.lineWidth = 2;
  for(const [a,b] of EDGES){
    const na=nodes[a], nb=nodes[b];
    const g = ctx.createLinearGradient(na.x,na.y,nb.x,nb.y);
    g.addColorStop(0, SPECIES[a].color+'66');
    g.addColorStop(1, SPECIES[b].color+'66');
    ctx.strokeStyle = g;
    ctx.beginPath(); ctx.moveTo(na.x,na.y); ctx.lineTo(nb.x,nb.y); ctx.stroke();
    // arrowhead toward predator (b)
    const ang = Math.atan2(nb.y-na.y, nb.x-na.x);
    const ax = na.x + (nb.x-na.x)*0.52, ay = na.y + (nb.y-na.y)*0.52;
    ctx.fillStyle = SPECIES[b].color+'aa';
    ctx.beginPath();
    ctx.moveTo(ax,ay);
    ctx.lineTo(ax-9*Math.cos(ang-0.4), ay-9*Math.sin(ang-0.4));
    ctx.lineTo(ax-9*Math.cos(ang+0.4), ay-9*Math.sin(ang+0.4));
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawNodes(){
  for(let i=0;i<5;i++){
    const s = SPECIES[i];
    const nd = nodes[i];
    const pop = N[i];
    nd.r = nodeRadius(pop);
    const inBand = pop>=s.band[0] && pop<=s.band[1];
    const danger = pop<=EXTINCT*4 || pop>=OVERPOP*0.9;
    const warn = !inBand && !danger;
    // glow
    ctx.save();
    const glow = ctx.createRadialGradient(nd.x,nd.y,nd.r*0.3, nd.x,nd.y,nd.r*2.2);
    let gc = s.color;
    if(danger) gc = '#ff4d6d'; else if(warn) gc = '#ffd23f';
    glow.addColorStop(0, gc+'55'); glow.addColorStop(1, gc+'00');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(nd.x,nd.y,nd.r*2.2,0,Math.PI*2); ctx.fill();
    ctx.restore();
    // body
    ctx.save();
    const bg = ctx.createRadialGradient(nd.x-nd.r*0.3, nd.y-nd.r*0.3, nd.r*0.2, nd.x,nd.y,nd.r);
    bg.addColorStop(0,'rgba(255,255,255,0.22)');
    bg.addColorStop(1,'rgba(8,30,42,0.85)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(nd.x,nd.y,nd.r,0,Math.PI*2); ctx.fill();
    // ring
    ctx.lineWidth = 3;
    ctx.strokeStyle = danger ? '#ff4d6d' : (warn ? '#ffd23f' : s.color);
    ctx.beginPath(); ctx.arc(nd.x,nd.y,nd.r,0,Math.PI*2); ctx.stroke();
    // emoji
    ctx.font = `${Math.round(nd.r*0.95)}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(s.emoji, nd.x, nd.y+1);
    // label
    ctx.font = `600 12px 'Space Grotesk',sans-serif`;
    ctx.fillStyle = '#cfe9ef';
    ctx.fillText(s.name.toUpperCase(), nd.x, nd.y+nd.r+14);
    ctx.restore();
  }
}

function drawRipples(dt){
  for(let i=ripples.length-1;i>=0;i--){
    const r = ripples[i];
    r.t += dt;
    const p = r.t/0.5;
    if(p>=1){ ripples.splice(i,1); continue; }
    ctx.save();
    ctx.globalAlpha = (1-p)*0.6;
    ctx.lineWidth = 3*(1-p);
    ctx.strokeStyle = r.color;
    ctx.beginPath(); ctx.arc(r.x,r.y, 20+p*60, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }
}

function render(dt){
  drawBackground();
  drawWeb();
  drawRipples(dt);
  drawNodes();
  updateBubbles(dt);
  updatePanel();
  // HUD
  const frac = Math.min(1, elapsed/SESSION);
  timerFill.style.width = (frac*100)+'%';
  timerText.textContent = elapsed.toFixed(1)+'s';
  speedText.textContent = speed.toFixed(1)+'×';
}

function updatePanel(){
  for(let i=0;i<5;i++){
    const s = SPECIES[i];
    const v = N[i];
    const valEl = document.getElementById('val'+i);
    const fillEl = document.getElementById('fill'+i);
    const rowEl = speciesListEl.querySelector(`.sp-row[data-i="${i}"]`);
    if(!valEl) continue;
    valEl.textContent = v.toFixed(1);
    fillEl.style.width = Math.min(100, (v/OVERPOP)*100)+'%';
    const danger = v<=EXTINCT*4 || v>=OVERPOP*0.9;
    const warn = !danger && (v<s.band[0] || v>s.band[1]);
    rowEl.classList.toggle('danger', danger);
    rowEl.classList.toggle('warn', warn);
  }
}

// ---------- Main loop ----------
function loop(ts){
  if(!lastTs) lastTs = ts;
  let dt = (ts-lastTs)/1000;
  lastTs = ts;
  if(dt>0.1) dt=0.1; // clamp big gaps
  update(dt);
  render(dt);
  requestAnimationFrame(loop);
}

// ---------- Boot ----------
function boot(){
  resize();
  buildPanel();
  initBubbles();
  bestStart.textContent = best>0 ? best.toFixed(1)+'s' : '—';
  setMode('boost');
  requestAnimationFrame(loop);
}
boot();
})();