(function(){
'use strict';
/* ===== TRAFFIC RUSH — single-file build (locked spec) ===== */
var STEP=1000/60, LANES=5;
var DIFF={
 easy:{base:180,cap:560,K:0.055,density:0.45,boostMult:1.7,canInterval:8.0,openLanes:2,label:'easy'},
 medium:{base:210,cap:660,K:0.065,density:0.62,boostMult:1.8,canInterval:7.0,openLanes:1,label:'medium'},
 hard:{base:250,cap:760,K:0.075,density:0.80,boostMult:1.9,canInterval:6.0,openLanes:1,label:'hard'}
};
var NITRO_FILL=35,NITRO_DRAIN=28,BURST_MS=1200;
var SLIDE_MS=110,SWIPE_MIN=24,SWIPE_COOLDOWN=250,TAP_MAX=200,DOUBLETAP_MS=280,HOLD_MS=180,INSET=0.15;

var canvas=document.getElementById('cv');
var ctx=canvas.getContext('2d');
var menuEl=document.getElementById('menu'),overEl=document.getElementById('over'),
    rotateEl=document.getElementById('rotate'),notouchEl=document.getElementById('notouch'),hudEl=document.getElementById('hud');
var distVal=document.getElementById('distVal'),highVal=document.getElementById('highVal'),
    nitroFill=document.getElementById('nitroFill'),menuHigh=document.getElementById('menuHigh'),
    overDist=document.getElementById('overDist'),overHigh=document.getElementById('overHigh'),recordEl=document.getElementById('record');

var state='menu',cfg=DIFF.medium;
var W=0,H=0,DPR=1,roadW=0,roadLeft=0,laneW=0,carW=0,carH=0,canW=0,canH=0,pinY=0,rowGap=0;
var cars=[],cans=[];
var player={lane:2,x:0,prevX:0,slideFrom:0,slideTo:0,slideT:0};
var scrollY=0,spawnAcc=0,canTimer=0,nextCan=0,simT=0,distance=0;
var nitro={meter:0,active:false,holdActive:false,burstEnd:0};
var acc=0,last=0,alpha=0;
var highScore=0,storageOK=true;

/* ---- persistence ---- */
try{var s=localStorage.getItem('trafficRush.high');if(s)highScore=parseInt(s,10)||0;}catch(e){storageOK=false;}
function saveHigh(){if(!storageOK)return;try{localStorage.setItem('trafficRush.high',String(highScore));}catch(e){}}
function vibrate(p){try{if(navigator.vibrate)navigator.vibrate(p);}catch(e){}}
function easeOut(p){return 1-Math.pow(1-p,3);}
function clamp(v,a,b){return v<a?a:v>b?b:v;}
function laneX(i){return roadLeft+laneW*(i+0.5);}

/* ---- sizing (DPR-aware) ---- */
function resize(){
 W=window.innerWidth;H=window.innerHeight;DPR=Math.min(window.devicePixelRatio||1,3);
 canvas.width=Math.floor(W*DPR);canvas.height=Math.floor(H*DPR);
 ctx.setTransform(DPR,0,0,DPR,0,0);
 roadW=W;roadLeft=0;laneW=roadW/LANES;
 carW=laneW*0.62;carH=laneW*1.4;canW=laneW*0.42;canH=laneW*0.42;
 pinY=H*0.78;rowGap=carH*1.7;
}
window.addEventListener('resize',function(){resize();checkOrient();});

/* ---- speed ramp (monotonic, asymptotic to cap; pauses during boost) ---- */
function rampSpeed(t){return cfg.cap-(cfg.cap-cfg.base)*Math.exp(-cfg.K*t);}
function curSpeed(){var s=rampSpeed(simT);return nitro.active?s*cfg.boostMult:s;}

/* ---- spawner ---- */
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}}
function trafficHue(){var h=['#ff2d95','#aaff00','#ffaa00','#ff5e3a','#b06bff'];return h[Math.floor(Math.random()*h.length)];}
function spawnRow(){
 if(cars.length>=22)return;
 var n=Math.round(cfg.density*LANES);
 n=clamp(n,0,LANES-cfg.openLanes);
 var lanes=[0,1,2,3,4];shuffle(lanes);
 var fill=[];for(var i=0;i<n;i++)fill.push(lanes[i]);
 var openCount=LANES-fill.length;
 while(openCount<cfg.openLanes&&fill.length>0){fill.pop();openCount++;} /* guaranteed passable lanes */
 for(var k=0;k<fill.length;k++){ /* min vertical gap carH*1.6 in same lane */
  var ln=fill[k],ok=true;
  for(var c=0;c<cars.length;c++){if(cars[c].lane===ln&&cars[c].y<carH*1.6){ok=false;break;}}
  if(!ok){fill.splice(k,1);k--;}
 }
 for(var f=0;f<fill.length;f++){cars.push({lane:fill[f],y:-carH,prevY:-carH,bias:Math.random()*60-30,hue:trafficHue()});}
}
function spawnCan(){var ln=Math.floor(Math.random()*LANES);cans.push({lane:ln,y:-canH,prevY:-canH,t:0,collected:false});}

/* ---- collision (committed-lane AABB, 15% inset) ---- */
function overlap(x1,y1,w1,h1,x2,y2,w2,h2){
 var iw1=w1*(1-INSET),ih1=h1*(1-INSET),iw2=w2*(1-INSET),ih2=h2*(1-INSET);
 return Math.abs(x1-x2)<=(iw1+iw2)/2 && Math.abs(y1-y2)<=(ih1+ih2)/2;
}

/* ---- nitro state ---- */
function updateNitroActive(){
 var want=nitro.holdActive || (nitro.burstEnd>0 && performance.now()<nitro.burstEnd);
 if(want && nitro.meter>0) nitro.active=true;
 else{nitro.active=false; if(!nitro.holdActive) nitro.burstEnd=0;}
}
function activateNitro(){if(nitro.meter<=0)return;nitro.holdActive=true;updateNitroActive();if(nitro.active)vibrate([60,40,60]);}
function burstNitro(){if(nitro.meter<=0)return;nitro.burstEnd=performance.now()+BURST_MS;updateNitroActive();if(nitro.active)vibrate([60,40,60]);}

/* ---- fixed-timestep update (only state mutator) ---- */
function update(dt){
 if(state!=='playing')return;
 updateNitroActive();
 var s=curSpeed(),ddt=dt/1000;
 if(!nitro.active) simT+=ddt;            /* ramp pauses during boost */
 scrollY+=s*ddt; distance=Math.floor(scrollY/10);
 if(player.slideT>0){                    /* cosmetic slide (110ms) */
  player.slideT-=dt;
  if(player.slideT<=0){player.slideT=0;player.x=player.slideTo;}
  else{var p=1-player.slideT/SLIDE_MS;p=easeOut(p);player.x=player.slideFrom+(player.slideTo-player.slideFrom)*p;}
 }
 if(nitro.active){nitro.meter-=NITRO_DRAIN*ddt;if(nitro.meter<=0){nitro.meter=0;nitro.active=false;nitro.holdActive=false;nitro.burstEnd=0;}}
 spawnAcc+=s*ddt; if(spawnAcc>=rowGap){spawnAcc-=rowGap;spawnRow();}
 canTimer+=ddt; if(canTimer>=nextCan){canTimer=0;nextCan=cfg.canInterval*(0.6+Math.random()*0.8);spawnCan();}
 for(var i=0;i<cars.length;i++){cars[i].y+=(s+cars[i].bias)*ddt;}
 for(var j=0;j<cans.length;j++){cans[j].y+=s*ddt;cans[j].t+=dt;}
 cars=cars.filter(function(c){return c.y<H+carH*2;});
 cans=cans.filter(function(c){return c.y<H+carH*2 && !c.collected;});
 var px=laneX(player.lane);
 for(var k=0;k<cars.length;k++){if(overlap(px,pinY,carW,carH,laneX(cars[k].lane),cars[k].y,carW,carH)){crash();break;}}
 for(var m=0;m<cans.length;m++){if(!cans[m].collected&&overlap(px,pinY,carW,carH,laneX(cans[m].lane),cans[m].y,canW,canH)){cans[m].collected=true;nitro.meter=Math.min(100,nitro.meter+NITRO_FILL);vibrate(30);}}
}

function crash(){
 state='gameover';
 vibrate([40,60,40,60,120]);
 var beaten=distance>highScore;
 if(beaten){highScore=distance;saveHigh();}
 overDist.textContent=distance+' m';
 overHigh.textContent=highScore+' m';
 recordEl.style.display=beaten?'block':'none';
 overEl.style.display='flex';
}
function moveLane(dir){
 var nl=clamp(player.lane+dir,0,LANES-1);
 if(nl!==player.lane){player.slideFrom=player.x;player.slideTo=laneX(nl);player.slideT=SLIDE_MS;player.lane=nl;vibrate(12);}
}

/* ---- touch input (single-thumb, swipe/hold/double-tap) ---- */
var touch={x:0,y:0,t:0,id:-1,holdTimer:null,moved:false,lastTap:0,lastSwipe:0,holding:false};
function findTouch(list,id){for(var i=0;i<list.length;i++)if(list[i].identifier===id)return list[i];return null;}
canvas.addEventListener('touchstart',function(e){
 e.preventDefault();
 if(state!=='playing')return;
 var t=e.changedTouches[0];
 touch.x=t.clientX;touch.y=t.clientY;touch.t=performance.now();touch.id=t.identifier;touch.moved=false;touch.holding=false;
 touch.holdTimer=setTimeout(function(){if(!touch.moved&&touch.id!==-1){touch.holding=true;activateNitro();}},HOLD_MS);
},{passive:false});
canvas.addEventListener('touchmove',function(e){
 e.preventDefault();
 if(state!=='playing'||touch.id===-1)return;
 var t=findTouch(e.touches,touch.id);if(!t)return;
 var dx=t.clientX-touch.x,dy=t.clientY-touch.y;
 if(Math.abs(dx)>10||Math.abs(dy)>10){touch.moved=true;if(touch.holdTimer){clearTimeout(touch.holdTimer);touch.holdTimer=null;}}
},{passive:false});
canvas.addEventListener('touchend',function(e){
 e.preventDefault();
 if(touch.id===-1)return;
 if(touch.holdTimer){clearTimeout(touch.holdTimer);touch.holdTimer=null;}
 if(state!=='playing'){touch.id=-1;return;}
 var t=findTouch(e.changedTouches,touch.id);
 var ex=t?t.clientX:touch.x,ey=t?t.clientY:touch.y;
 var now=performance.now(),dx=ex-touch.x,dy=ey-touch.y,dt=now-touch.t;
 if(touch.holding){touch.holding=false;nitro.holdActive=false;updateNitroActive();}
 else if(Math.abs(dx)>SWIPE_MIN&&Math.abs(dx)>Math.abs(dy)*1.5){
  if(now-touch.lastSwipe>SWIPE_COOLDOWN){touch.lastSwipe=now;if(dx<0)moveLane(-1);else moveLane(1);}
 }else if(!touch.moved&&dt<TAP_MAX){
  if(now-touch.lastTap<DOUBLETAP_MS){touch.lastTap=0;burstNitro();}else touch.lastTap=now;
 }
 touch.id=-1;
},{passive:false});
canvas.addEventListener('touchcancel',function(){if(touch.holdTimer)clearTimeout(touch.holdTimer);touch.id=-1;touch.holding=false;nitro.holdActive=false;updateNitroActive();},{passive:false});

/* ---- rendering (procedural neon-synthwave, NO shadowBlur) ---- */
function roundRect(x,y,w,h,r){
 ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
 ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}
function shade(hex){
 var n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
 return 'rgb('+Math.floor(r*0.55)+','+Math.floor(g*0.55)+','+Math.floor(b*0.55)+')';
}
function drawCar(x,y,w,h,hue,boost,front){
 if(boost){var g=ctx.createRadialGradient(x,y,0,x,y,w*1.3);g.addColorStop(0,'rgba(34,211,238,0.45)');g.addColorStop(1,'rgba(34,211,238,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,w*1.3,0,Math.PI*2);ctx.fill();}
 var grd=ctx.createLinearGradient(x,y-h/2,x,y+h/2);grd.addColorStop(0,hue);grd.addColorStop(1,shade(hue));
 ctx.fillStyle=grd;roundRect(x-w/2,y-h/2,w,h,w*0.2);ctx.fill();
 ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=1.5;ctx.stroke();
 ctx.fillStyle='rgba(8,10,20,0.75)';roundRect(x-w*0.3,front<0?y-h*0.05:y-h*0.22,w*0.6,h*0.2,w*0.08);ctx.fill();
 ctx.fillStyle='rgba(8,10,20,0.5)';roundRect(x-w*0.3,front<0?y-h*0.22:y-h*0.05,w*0.6,h*0.16,w*0.08);ctx.fill();
 ctx.fillStyle='#fff7cc';var hlY=front<0?y-h*0.42:y+h*0.36;
 ctx.fillRect(x-w*0.3,hlY,w*0.13,h*0.07);ctx.fillRect(x+w*0.17,hlY,w*0.13,h*0.07);
}
function drawRoad(){
 ctx.fillStyle='#0e0f1a';ctx.fillRect(0,0,W,H);
 var seg=carH*0.9,off=((scrollY%seg)+seg)%seg;
 ctx.strokeStyle='rgba(34,211,238,0.45)';ctx.lineWidth=Math.max(2,laneW*0.035);ctx.setLineDash([seg*0.5,seg*0.5]);ctx.lineDashOffset=-off;
 for(var i=1;i<LANES;i++){var x=roadLeft+laneW*i;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
 ctx.setLineDash([]);
 ctx.strokeStyle='#22d3ee';ctx.lineWidth=Math.max(3,laneW*0.06);
 ctx.beginPath();ctx.moveTo(roadLeft+1,0);ctx.lineTo(roadLeft+1,H);ctx.moveTo(roadLeft+roadW-1,0);ctx.lineTo(roadLeft+roadW-1,H);ctx.stroke();
}
function drawCars(){for(var i=0;i<cars.length;i++){var c=cars[i];drawCar(laneX(c.lane),c.prevY+(c.y-c.prevY)*alpha,carW,carH,c.hue,false,1);}}
function drawCans(){
 for(var i=0;i<cans.length;i++){var ca=cans[i],ry=ca.prevY+(ca.y-ca.prevY)*alpha,x=laneX(ca.lane),pulse=0.5+0.5*Math.sin(ca.t/120);
  var g=ctx.createRadialGradient(x,ry,0,x,ry,canW*1.6);g.addColorStop(0,'rgba(255,180,40,'+(0.35+0.25*pulse)+')');g.addColorStop(1,'rgba(255,180,40,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,ry,canW*1.6,0,Math.PI*2);ctx.fill();
  var grd=ctx.createLinearGradient(x,ry-canH/2,x,ry+canH/2);grd.addColorStop(0,'#ffd24a');grd.addColorStop(1,'#ff9a1f');
  ctx.fillStyle=grd;roundRect(x-canW/2,ry-canH/2,canW,canH,canW*0.22);ctx.fill();
  ctx.fillStyle='#1a1206';ctx.font='bold '+Math.floor(canH*0.6)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('N',x,ry+1);
 }
}
function drawPlayer(){
 var rx=player.prevX+(player.x-player.prevX)*alpha,boost=nitro.active;
 if(boost){
  for(var i=0;i<4;i++){ctx.strokeStyle='rgba(255,255,255,'+(0.5-i*0.11)+')';ctx.lineWidth=carW*0.12;
   ctx.beginPath();ctx.moveTo(rx-carW*0.2+(i%2)*carW*0.4,pinY+carH*0.5);ctx.lineTo(rx-carW*0.2+(i%2)*carW*0.4,pinY+carH*0.5+carH*(0.4+i*0.25));ctx.stroke();}
  drawCar(rx,pinY,carW,carH*1.25,'#22d3ee',true,-1);
 }else{drawCar(rx,pinY,carW,carH,'#22d3ee',false,-1);}
}
function updateHUD(){
 distVal.textContent=distance+' m';highVal.textContent=highScore+' m';
 nitroFill.style.width=nitro.meter+'%';
 nitroFill.style.background=nitro.active?'linear-gradient(90deg,#22d3ee,#aaff00)':'linear-gradient(90deg,#ff9a1f,#ffd24a)';
}
function render(){ctx.clearRect(0,0,W,H);drawRoad();drawCans();drawCars();drawPlayer();updateHUD();}

/* ---- main loop (accumulator + alpha interpolation, max 4 steps) ---- */
function loop(now){
 if(!last)last=now;
 var dt=now-last;last=now;if(dt>100)dt=100;
 for(var i=0;i<cars.length;i++)cars[i].prevY=cars[i].y;
 for(var j=0;j<cans.length;j++)cans[j].prevY=cans[j].y;
 player.prevX=player.x;
 acc+=dt;var steps=0;
 while(acc>=STEP&&steps<4){update(STEP);acc-=STEP;steps++;}
 if(steps===4&&acc>STEP)acc=0; /* drop backlog after stall */
 alpha=acc/STEP;
 render();
 requestAnimationFrame(loop);
}

/* ---- flow control ---- */
function reset(){
 cars=[];cans=[];scrollY=0;spawnAcc=0;canTimer=0;nextCan=cfg.canInterval;simT=0;distance=0;
 nitro={meter:0,active:false,holdActive:false,burstEnd:0};
 player.lane=2;player.x=laneX(2);player.prevX=player.x;player.slideT=0;
}
function startGame(key){
 cfg=DIFF[key];reset();state='playing';menuEl.style.display='none';overEl.style.display='none';hudEl.style.display='flex';
}
document.getElementById('bEasy').addEventListener('touchstart',function(e){e.preventDefault();startGame('easy');},{passive:false});
document.getElementById('bMedium').addEventListener('touchstart',function(e){e.preventDefault();startGame('medium');},{passive:false});
document.getElementById('bHard').addEventListener('touchstart',function(e){e.preventDefault();startGame('hard');},{passive:false});
function curKey(){return cfg===DIFF.easy?'easy':cfg===DIFF.medium?'medium':'hard';}
function retry(){if(state==='gameover')startGame(curKey());}
overEl.addEventListener('touchstart',function(e){e.preventDefault();retry();},{passive:false});

/* ---- orientation (portrait-only, pause on landscape) ---- */
function checkOrient(){
 var land=window.innerWidth>window.innerHeight;
 if(land){rotateEl.style.display='flex';if(state==='playing')state='paused';}
 else{rotateEl.style.display='none';if(state==='paused')state='playing';}
}
window.addEventListener('orientationchange',checkOrient);

/* ---- non-touch gate ---- */
var isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
resize();checkOrient();
menuHigh.textContent=highScore+' m';
if(!isTouch){notouchEl.style.display='flex';menuEl.style.display='none';}
else{menuEl.style.display='flex';}

/* ---- PWA: data-URL manifest + canvas icons ---- */
function makeIcon(size){
 var c=document.createElement('canvas');c.width=size;c.height=size;var x=c.getContext('2d');
 x.fillStyle='#0e0f1a';x.fillRect(0,0,size,size);
 x.fillStyle='#15162a';x.fillRect(size*0.22,0,size*0.56,size);
 x.strokeStyle='#22d3ee';x.lineWidth=size*0.025;x.setLineDash([size*0.08,size*0.08]);
 x.beginPath();x.moveTo(size*0.5,0);x.lineTo(size*0.5,size);x.stroke();x.setLineDash([]);
 x.fillStyle='#22d3ee';x.beginPath();x.moveTo(size*0.36,size*0.34);x.lineTo(size*0.64,size*0.34);x.lineTo(size*0.6,size*0.66);x.lineTo(size*0.4,size*0.66);x.closePath();x.fill();
 return c.toDataURL('image/png');
}
try{
 var manifest={name:'Traffic Rush',short_name:'TrafficRush',start_url:'.',display:'standalone',orientation:'portrait',background_color:'#0e0f1a',theme_color:'#0e0f1a',
  icons:[{src:makeIcon(192),sizes:'192x192',type:'image/png',purpose:'any'},{src:makeIcon(512),sizes:'512x512',type:'image/png',purpose:'any'}]};
 var url='data:application/manifest+json;base64,'+btoa(unescape(encodeURIComponent(JSON.stringify(manifest))));
 var link=document.createElement('link');link.rel='manifest';link.href=url;document.head.appendChild(link);
}catch(e){}

/* Single-file PWA limitation: a real service worker cannot be registered from a
   blob: URL — the W3C spec rejects the blob: scheme for SW scope. We attempt it
   harmlessly below; true offline here relies on ZERO external dependencies +
   HTTP cache + the installed standalone shell. A guaranteed SW cache would
   require a second file, which the single-file constraint forbids. */
try{
 var swCode="self.addEventListener('install',function(e){self.skipWaiting();});self.addEventListener('activate',function(e){});self.addEventListener('fetch',function(e){e.respondWith(fetch(e.request).catch(function(){return caches.match(e.request);}));});";
 var blob=new Blob([swCode],{type:'text/javascript'});
 var swUrl=URL.createObjectURL(blob);
 if('serviceWorker' in navigator){navigator.serviceWorker.register(swUrl).catch(function(){});}
}catch(e){}

requestAnimationFrame(loop);
})();