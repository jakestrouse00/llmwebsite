(function(){
'use strict';

// ============================ CONFIG ============================
const CONFIG = {
  BASELINE_WINDOW_MS: 3000,   // visible traversal time at start
  FLOOR_WINDOW_MS: 800,       // hard minimum visible window
  DECAY: 0.92,                 // per-correct-tap multiplier on window
  ITEMS_ON_SCREEN: 4,         // constant density; only speed changes
  MAX_MISSES: 3,
  SESSION_CAP_MS: 90000,
  STEP_MS: 1000/60,            // fixed simulation timestep ~16.667ms
  BEST_KEY: 'blinkcart.best',
  HINT_MS: 5000,               // onboarding hint lifetime (<=5s, non-blocking)
  POP_MS: 320,
  WRONG_FLASH_MS: 260,
};

// 18 shape-distinct grocery emojis — ALL Emoji 3.0 or earlier (Librarian-verified safe set).
// No tofu risk: every glyph renders on iOS, Android, and Windows shipped since 2016.
const EMOJIS = ['🍉','🍎','🍊','🍅','🥖','🥕','🌽','🍌','🍇','🥜','🍄','🍬','🥒','🍍','🍞','🧀','🍗','🥚'];

// ============================ DOM / CANVAS ============================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let reducedMotion = false;
try { reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}

// layout (CSS px)
let cssW=0, cssH=0, dpr=1;
let headerH=0, hudH=0, conveyorY=0, conveyorH=0, conveyorCenterY=0;
let itemSize=0, itemSpacing=0;

// ============================ STATE ============================
let state='idle';            // 'playing' | 'gameover'
let items=[];                // {emoji,isMatch,x,tappedCorrect,tappedWrong,wrongFlash}
let effects=[];              // transient pop bursts
let target=EMOJIS[0];
let correctTaps=0, score=0, streak=0, misses=0, bestRun=0;
let sessionTime=0;
let spawnTimer=0;
let lastTime=0, accumulator=0;
let hintTimer=0;
let missFlash=0;
let shake=0;
let glowPhase=0;

// ============================ AUDIO (lazy, gesture-unlocked) ============================
let audioCtx=null;
function ensureAudio(){
  if(audioCtx){ if(audioCtx.state==='suspended') audioCtx.resume(); return; }
  try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ audioCtx=null; }
}
function beep(freq,dur,type,gain){
  if(!audioCtx) return;
  const t=audioCtx.currentTime;
  const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.type=type||'sine'; o.frequency.value=freq;
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(gain||0.15, t+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t); o.stop(t+dur+0.02);
}
function playCorrect(){ beep(640+Math.min(streak,12)*42, 0.12, 'triangle', 0.18); }
function playMiss(){ beep(150, 0.24, 'sawtooth', 0.16); }

// ============================ PERSISTENCE ============================
function loadBest(){
  try{ const v=localStorage.getItem(CONFIG.BEST_KEY); if(v!=null) bestRun=parseInt(v,10)||0; }catch(e){ bestRun=0; }
}
function saveBest(){
  try{ localStorage.setItem(CONFIG.BEST_KEY, String(bestRun)); }catch(e){}
}

// ============================ MATH MODEL ============================
function windowForTap(n){
  return Math.max(CONFIG.FLOOR_WINDOW_MS, CONFIG.BASELINE_WINDOW_MS*Math.pow(CONFIG.DECAY, n));
}

// ============================ LAYOUT ============================
function resize(){
  const rect=canvas.getBoundingClientRect();
  cssW=rect.width; cssH=rect.height;
  dpr=Math.min(window.devicePixelRatio||1, 2);
  canvas.width=Math.round(cssW*dpr);
  canvas.height=Math.round(cssH*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  headerH=cssH*0.24;
  hudH=Math.max(42, cssH*0.075);
  conveyorY=headerH+hudH;
  conveyorH=cssH-conveyorY;
  conveyorCenterY=conveyorY+conveyorH/2;
  itemSize=Math.min(conveyorH*0.6, cssW*0.26);
  itemSpacing=(cssW+itemSize)/CONFIG.ITEMS_ON_SCREEN;
}

// ============================ HELPERS ============================
function randomNonTarget(){
  let e; do{ e=EMOJIS[Math.floor(Math.random()*EMOJIS.length)]; }while(e===target); return e;
}
function rotateTarget(){
  let e; do{ e=EMOJIS[Math.floor(Math.random()*EMOJIS.length)]; }while(e===target); target=e;
}
function matchCount(){ let c=0; for(const it of items) if(it.isMatch && !it.tappedCorrect) c++; return c; }

function spawnItem(){
  const isMatch = matchCount()===0;
  const emoji = isMatch ? target : randomNonTarget();
  let x=-itemSize/2;
  let leftmost=Infinity;
  for(const it of items) if(it.x<leftmost) leftmost=it.x;
  if(leftmost!==Infinity) x=Math.min(x, leftmost-itemSpacing);
  items.push({emoji,isMatch,x,tappedCorrect:false,tappedWrong:false,wrongFlash:0});
}

function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

// ============================ RUN LIFECYCLE ============================
function startRun(){
  items=[]; effects=[];
  correctTaps=0; score=0; streak=0; misses=0;
  sessionTime=0; spawnTimer=0;
  hintTimer=CONFIG.HINT_MS;
  missFlash=0; shake=0;
  rotateTarget();
  spawnItem();
  state='playing';
}
function endRun(){
  state='gameover';
  if(score>bestRun){ bestRun=score; saveBest(); }
}

// ============================ HIT RESOLUTION ============================
function onCorrectTap(it){
  const idx=items.indexOf(it); if(idx>=0) items.splice(idx,1);
  correctTaps++; score++; streak++;
  if(score>bestRun) bestRun=score;
  playCorrect();
  effects.push({x:it.x, y:conveyorCenterY, emoji:it.emoji, t:CONFIG.POP_MS, kind:'pop'});
  rotateTarget();
  spawnItem();
}

function onWrongTap(it){
  it.tappedWrong=true; it.wrongFlash=CONFIG.WRONG_FLASH_MS;
  misses++; streak=0; missFlash=1; if(!reducedMotion) shake=8;
  playMiss();
  if(misses>=CONFIG.MAX_MISSES) endRun();
}

function onScrollMiss(){
  misses++; streak=0; missFlash=1; if(!reducedMotion) shake=10;
  playMiss();
  rotateTarget();
  spawnItem();
  if(misses>=CONFIG.MAX_MISSES) endRun();
}

function hitTest(it,px,py){
  return Math.abs(px-it.x)<=itemSize/2 && Math.abs(py-conveyorCenterY)<=itemSize/2;
}

function handleTap(px,py){
  ensureAudio();
  if(state==='gameover'){ startRun(); return; }
  if(state!=='playing') return;
  for(let i=items.length-1;i>=0;i--){
    const it=items[i];
    if(it.tappedCorrect||it.tappedWrong) continue;
    if(hitTest(it,px,py)){ if(it.isMatch) onCorrectTap(it); else onWrongTap(it); return; }
  }
}

// ============================ SIMULATION (fixed timestep) ============================
function simulate(dt){
  sessionTime+=dt;
  if(sessionTime>=CONFIG.SESSION_CAP_MS){ endRun(); return; }

  const W=windowForTap(correctTaps);
  const speed=(cssW+itemSize)/W;

  for(let i=items.length-1;i>=0;i--){
    const it=items[i];
    it.x+=speed*dt;
    if(it.wrongFlash>0) it.wrongFlash-=dt;
    if(it.x>cssW+itemSize/2){
      const wasMatch=it.isMatch && !it.tappedCorrect;
      items.splice(i,1);
      if(wasMatch) onScrollMiss();
    }
  }
  if(state!=='playing') return;

  spawnTimer+=dt;
  const spawnGap=W/CONFIG.ITEMS_ON_SCREEN;
  let guard=0;
  while(spawnTimer>=spawnGap && guard++<8){ spawnTimer-=spawnGap; spawnItem(); }

  for(let i=effects.length-1;i>=0;i--){ effects[i].t-=dt; if(effects[i].t<=0) effects.splice(i,1); }
  if(missFlash>0) missFlash=Math.max(0,missFlash-dt/180);
  if(shake>0) shake=Math.max(0,shake-dt*0.05);
  if(hintTimer>0) hintTimer-=dt;
  glowPhase+=dt;
}

// ============================ RENDER ============================
function render(){
  ctx.clearRect(0,0,cssW,cssH);
  const bg=ctx.createLinearGradient(0,0,0,cssH);
  bg.addColorStop(0,'#0f1226'); bg.addColorStop(1,'#1a1030');
  ctx.fillStyle=bg; ctx.fillRect(0,0,cssW,cssH);

  ctx.save();
  if(shake>0 && !reducedMotion) ctx.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);
  drawHeader();
  drawHUD();
  drawConveyor();
  drawItems();
  drawEffects();
  ctx.restore();

  if(missFlash>0){ ctx.fillStyle='rgba(255,40,60,'+(missFlash*0.28)+')'; ctx.fillRect(0,0,cssW,cssH); }

  if(hintTimer>0 && state==='playing'){
    const a=Math.min(1,hintTimer/800);
    ctx.globalAlpha=a*0.85; ctx.fillStyle='#cdd2ff';
    ctx.font='600 '+Math.max(13,cssW*0.038)+'px system-ui,sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('Tap the item that matches the target', cssW/2, conveyorY+conveyorH*0.16);
    ctx.globalAlpha=1;
  }

  if(state==='gameover') drawGameOver();
}

function drawHeader(){
  const hg=ctx.createLinearGradient(0,0,0,headerH);
  hg.addColorStop(0,'#23275a'); hg.addColorStop(1,'#15183a');
  ctx.fillStyle=hg; ctx.fillRect(0,0,cssW,headerH);

  ctx.fillStyle='#9aa0e0';
  ctx.font='700 '+Math.max(11,cssW*0.028)+'px system-ui,sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('TARGET', cssW/2, headerH*0.16);

  const pulse = reducedMotion?0.5:(0.5+0.5*Math.sin(glowPhase*0.005));
  const cx=cssW/2, cy=headerH*0.58;
  ctx.save();
  ctx.shadowColor='rgba(120,200,255,'+(0.5+0.4*pulse)+')';
  ctx.shadowBlur=20+18*pulse;
  ctx.font=Math.round(headerH*0.5)+'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(target, cx, cy);
  ctx.restore();

  ctx.strokeStyle='rgba(120,200,255,'+(0.25+0.25*pulse)+')';
  ctx.lineWidth=3;
  ctx.beginPath(); ctx.arc(cx, cy, headerH*0.34, 0, Math.PI*2); ctx.stroke();
}

function drawHUD(){
  const y=headerH+hudH/2;
  const pad=cssW*0.045;
  ctx.textBaseline='middle';

  ctx.textAlign='left'; ctx.fillStyle='#e8eaff';
  ctx.font='700 '+Math.max(12,cssW*0.032)+'px system-ui,sans-serif';
  ctx.fillText('SCORE '+score, pad, y-hudH*0.12);

  ctx.textAlign='center'; ctx.fillStyle='#ffd166';
  ctx.fillText('🔥'+streak, cssW/2, y-hudH*0.12);

  ctx.textAlign='right'; ctx.fillStyle='#9aa0e0';
  ctx.fillText('BEST '+bestRun, cssW-pad, y-hudH*0.12);

  const dotR=Math.max(4,cssW*0.012);
  for(let i=0;i<CONFIG.MAX_MISSES;i++){
    ctx.beginPath();
    ctx.arc(pad+dotR+i*dotR*2.6, y+hudH*0.22, dotR, 0, Math.PI*2);
    ctx.fillStyle = i<misses ? '#ff5a6e' : 'rgba(255,255,255,0.22)';
    ctx.fill();
  }

  const remain=Math.max(0,CONFIG.SESSION_CAP_MS-sessionTime);
  const frac=remain/CONFIG.SESSION_CAP_MS;
  const barY=headerH+hudH-3;
  ctx.fillStyle='rgba(255,255,255,0.12)'; ctx.fillRect(0,barY,cssW,3);
  ctx.fillStyle = frac>0.25 ? '#5ad1ff' : '#ff5a6e';
  ctx.fillRect(0,barY,cssW*frac,3);
}

function drawConveyor(){
  const cg=ctx.createLinearGradient(0,conveyorY,0,conveyorY+conveyorH);
  cg.addColorStop(0,'#0a0c1e'); cg.addColorStop(0.5,'#12152e'); cg.addColorStop(1,'#0a0c1e');
  ctx.fillStyle=cg; ctx.fillRect(0,conveyorY,cssW,conveyorH);

  if(!reducedMotion){
    const W=windowForTap(correctTaps);
    const speed=(cssW+itemSize)/W;
    const off=(performance.now()*speed*0.5)%44;
    ctx.strokeStyle='rgba(120,140,220,0.06)'; ctx.lineWidth=2;
    for(let x=-44+off; x<cssW; x+=44){
      ctx.beginPath(); ctx.moveTo(x,conveyorY+10); ctx.lineTo(x,conveyorY+conveyorH-10); ctx.stroke();
    }
  }
  ctx.fillStyle='rgba(120,140,220,0.18)';
  ctx.fillRect(0,conveyorY,cssW,2);
  ctx.fillRect(0,conveyorY+conveyorH-2,cssW,2);
}

function drawItems(){
  ctx.font=Math.round(itemSize*0.82)+'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for(const it of items){
    if(it.tappedCorrect) continue;
    ctx.fillStyle='rgba(255,255,255,0.06)';
    roundRect(it.x-itemSize*0.42, conveyorCenterY-itemSize*0.42, itemSize*0.84, itemSize*0.84, itemSize*0.18);
    ctx.fill();
    if(it.wrongFlash>0){
      ctx.save();
      ctx.globalAlpha=0.4+0.6*(it.wrongFlash/CONFIG.WRONG_FLASH_MS);
      ctx.fillText(it.emoji, it.x, conveyorCenterY);
      ctx.restore();
    } else {
      ctx.fillText(it.emoji, it.x, conveyorCenterY);
    }
  }
}

function drawEffects(){
  for(const e of effects){
    const p=1-e.t/CONFIG.POP_MS;
    ctx.save();
    ctx.globalAlpha=Math.max(0,1-p);
    ctx.strokeStyle='rgba(120,255,180,'+(1-p)+')';
    ctx.lineWidth=3*(1-p)+1;
    ctx.beginPath(); ctx.arc(e.x,e.y, itemSize*0.4+p*itemSize*0.5, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha=Math.max(0,1-p*1.5);
    ctx.font=Math.round(itemSize*0.82*(1+p*0.4))+'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(e.emoji, e.x, e.y-p*itemSize*0.3);
    ctx.restore();
  }
}

function drawGameOver(){
  ctx.fillStyle='rgba(8,10,24,0.78)'; ctx.fillRect(0,0,cssW,cssH);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#fff';
  ctx.font='800 '+Math.max(22,cssW*0.08)+'px system-ui,sans-serif';
  ctx.fillText('RUN OVER', cssW/2, cssH*0.34);
  ctx.font='600 '+Math.max(15,cssW*0.05)+'px system-ui,sans-serif';
  ctx.fillStyle='#9aa0e0';
  ctx.fillText('Score  '+score, cssW/2, cssH*0.46);
  ctx.fillText('Best   '+bestRun, cssW/2, cssH*0.54);
  ctx.fillStyle='#5ad1ff';
  ctx.font='700 '+Math.max(14,cssW*0.045)+'px system-ui,sans-serif';
  ctx.fillText('Tap to play again', cssW/2, cssH*0.66);
}

function loop(now){
  if(!lastTime) lastTime=now;
  let dt=now-lastTime; lastTime=now;
  if(dt>100) dt=100;
  if(state==='playing'){
    accumulator+=dt;
    let guard=0;
    while(accumulator>=CONFIG.STEP_MS && guard++<10){
      simulate(CONFIG.STEP_MS);
      accumulator-=CONFIG.STEP_MS;
      if(state!=='playing') break;
    }
  }
  render();
  requestAnimationFrame(loop);
}

canvas.addEventListener('pointerdown', function(e){
  e.preventDefault();
  const rect=canvas.getBoundingClientRect();
  handleTap(e.clientX-rect.left, e.clientY-rect.top);
}, {passive:false});

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function(){ setTimeout(resize, 100); });

resize();
loadBest();
startRun();
requestAnimationFrame(loop);

})();