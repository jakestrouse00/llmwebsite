(function(){
  "use strict";
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- NAV active link ---------- */
  var navLinks = document.querySelectorAll('nav a');
  var sections = [];
  navLinks.forEach(function(a){ var id=a.getAttribute('href').slice(1); var s=document.getElementById(id); if(s) sections.push(s); });
  if('IntersectionObserver' in window){
    var navObs = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){
          navLinks.forEach(function(l){ l.classList.remove('active'); });
          var active = document.querySelector('nav a[href="#'+e.target.id+'"]');
          if(active) active.classList.add('active');
        }
      });
    },{rootMargin:'-45% 0px -50% 0px'});
    sections.forEach(function(s){ navObs.observe(s); });
  }

  /* ---------- HERO power bar: skewed -> balanced ---------- */
  function setHero(mPct){
    document.getElementById('heroM').style.width = mPct+'%';
    document.getElementById('heroF').style.width = (100-mPct)+'%';
  }
  setTimeout(function(){ setHero(50); }, 500);

  /* ---------- SCROLL REVEAL ---------- */
  var revealEls = document.querySelectorAll('.reveal, .t-item');
  if('IntersectionObserver' in window && !reduceMotion){
    var revObs = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); revObs.unobserve(e.target); } });
    },{threshold:0.18});
    revealEls.forEach(function(el){ revObs.observe(el); });
  } else {
    revealEls.forEach(function(el){ el.classList.add('in'); });
  }

  /* ---------- THE PRESENT: region bars ---------- */
  var regionData = {
    politics:{unit:'%',label:"Women in parliament",note:"Americas 35.6% & Europe 33.4% are exact (IPU 2026); others illustrative. Global avg 27.5%.",regions:{
      'Americas':35.6,'Europe':33.4,'Sub-Saharan Africa':26,'Asia':22,'Middle East / N. Africa':18,'Pacific':16}},
    economics:{unit:'%',label:"Gender pay gap",note:"Illustrative regional gaps around the ~20% global average (ILO/UN Women). OECD/Europe ~11%.",regions:{
      'Middle East / N. Africa':35,'Sub-Saharan Africa':28,'Asia':20,'Americas':18,'Europe':11,'Pacific':15}},
    care:{unit:'%',label:"Women's share of unpaid care",note:"Around the 76.2% global average (UNDP 2024). Women spend 2.4 more hrs/day than men (World Bank).",regions:{
      'Asia':80,'Middle East / N. Africa':79,'Sub-Saharan Africa':77,'Pacific':76,'Americas':74,'Europe':72}},
    legal:{unit:'%',label:"Women facing legal discrimination",note:"Illustrative share of women in countries with >=1 legal discrimination (UN Women: 2.5B globally).",regions:{
      'Middle East / N. Africa':80,'Asia':55,'Sub-Saharan Africa':45,'Pacific':40,'Americas':25,'Europe':15}}
  };
  var regionChart = document.getElementById('regionChart');
  var presentNote = document.getElementById('presentNote');
  function renderRegion(layer){
    var d = regionData[layer];
    regionChart.innerHTML = '';
    Object.keys(d.regions).forEach(function(name){
      var v = d.regions[name];
      var row = document.createElement('div');
      row.className = 'region-row';
      row.innerHTML = '<div class="rname">'+name+'</div>'+
        '<div class="rbar"><span></span></div>'+
        '<div class="rval">'+v+d.unit+'</div>';
      regionChart.appendChild(row);
      var span = row.querySelector('span');
      var w = Math.min(v,100);
      requestAnimationFrame(function(){ span.style.width = w+'%'; });
    });
    presentNote.textContent = d.note;
  }
  renderRegion('politics');
  document.querySelectorAll('.layer-tabs button').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.layer-tabs button').forEach(function(b){ b.classList.remove('on'); b.setAttribute('aria-selected','false'); });
      btn.classList.add('on'); btn.setAttribute('aria-selected','true');
      renderRegion(btn.getAttribute('data-layer'));
    });
  });

  /* ---------- REFORM SIMULATOR ---------- */
  var levers = [
    {key:'quotas',label:'Gender quotas',sub:'Reserved/legislated candidate seats'},
    {key:'childcare',label:'Universal childcare',sub:'Affordable care for all families'},
    {key:'fatherleave',label:'Father-paid leave',sub:'"Use-it-or-lose-it" dad quotas'},
    {key:'transparency',label:'Pay transparency',sub:'Report & justify gender pay gaps'},
    {key:'education',label:"Girls' education",sub:'Keep girls in school longer'},
    {key:'legal',label:'Legal reform',sub:'Repeal discriminatory laws'}
  ];
  var state = {quotas:false,childcare:false,fatherleave:false,transparency:false,education:false,legal:false};
  var switchesEl = document.getElementById('switches');
  levers.forEach(function(l){
    var div = document.createElement('div');
    div.className = 'switch';
    div.setAttribute('role','switch'); div.setAttribute('aria-checked','false'); div.tabIndex=0;
    div.innerHTML = '<div><span class="slabel">'+l.label+'</span><span class="ssub">'+l.sub+'</span></div>'+
      '<div class="toggle"></div>';
    function toggle(){
      state[l.key] = !state[l.key];
      div.classList.toggle('on', state[l.key]);
      div.setAttribute('aria-checked', state[l.key]?'true':'false');
      updateSim();
    }
    div.addEventListener('click', toggle);
    div.addEventListener('keydown', function(e){ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); toggle(); } });
    switchesEl.appendChild(div);
  });

  var gauges = [
    {key:'parl',label:'Women in parliament',unit:'%',max:100,baseline:27.5},
    {key:'gap',label:'Gender pay gap',unit:'%',max:30,baseline:20},
    {key:'care',label:"Women's unpaid care",unit:'%',max:100,baseline:76.2},
    {key:'lift',label:'Labor-force lift',unit:'pts',max:10,baseline:0}
  ];
  var CIRC = 2*Math.PI*52;
  var gaugesEl = document.getElementById('gauges');
  gauges.forEach(function(g){
    var card = document.createElement('div');
    card.className = 'gauge-card';
    card.innerHTML = '<svg class="gauge" viewBox="0 0 120 120" role="img" aria-label="'+g.label+'">'+
      '<circle class="gauge-bg" cx="60" cy="60" r="52"></circle>'+
      '<circle class="gauge-fg" cx="60" cy="60" r="52" stroke-dasharray="'+CIRC.toFixed(2)+'" stroke-dashoffset="'+CIRC.toFixed(2)+'" id="fg_'+g.key+'"></circle>'+
      '<text class="gauge-val" x="60" y="62" text-anchor="middle" id="val_'+g.key+'">'+g.baseline+g.unit+'</text>'+
      '<text class="gauge-label" x="60" y="82" text-anchor="middle">'+g.label+'</text>'+
      '</svg>';
    gaugesEl.appendChild(card);
  });

  function compute(){
    var parl = 27.5 + (state.quotas?30:0) + (state.education?3:0) + (state.legal?2:0);
    parl = Math.min(parl,61);
    var gap = 20 - (state.transparency?11:0) - (state.childcare?4:0) - (state.fatherleave?2:0) - (state.education?2:0) - (state.legal?1:0);
    gap = Math.max(gap,5);
    var care = 76.2 - (state.childcare?8:0) - (state.fatherleave?13.2:0);
    care = Math.max(care,55);
    var lift = 0 + (state.childcare?6.6:0) + (state.education?2:0) + (state.legal?1:0);
    lift = Math.min(lift,8);
    return {parl:parl,gap:gap,care:care,lift:lift};
  }

  var tweenIds = {};
  function animateGauge(key,val,unit,max){
    var fg = document.getElementById('fg_'+key);
    var valEl = document.getElementById('val_'+key);
    var targetOffset = CIRC*(1 - Math.min(val,max)/max);
    if(reduceMotion){
      fg.style.strokeDashoffset = targetOffset;
      valEl.textContent = (Math.round(val*10)/10)+unit;
      return;
    }
    if(tweenIds[key]) cancelAnimationFrame(tweenIds[key]);
    var startOff = parseFloat(fg.style.strokeDashoffset)||CIRC;
    var startVal = parseFloat(valEl.textContent)||0;
    var t0 = null, dur = 700;
    function step(ts){
      if(!t0) t0 = ts;
      var p = Math.min((ts-t0)/dur,1);
      var e = 1-Math.pow(1-p,3);
      fg.style.strokeDashoffset = (startOff+(targetOffset-startOff)*e).toFixed(2);
      var cur = startVal+(val-startVal)*e;
      valEl.textContent = (Math.round(cur*10)/10)+unit;
      if(p<1) tweenIds[key] = requestAnimationFrame(step);
    }
    tweenIds[key] = requestAnimationFrame(step);
  }

  function updateSim(){
    var r = compute();
    animateGauge('parl',r.parl,'%',100);
    animateGauge('gap',r.gap,'%',30);
    animateGauge('care',r.care,'%',100);
    animateGauge('lift',r.lift,'pts',10);
    var active = levers.filter(function(l){ return state[l.key]; }).map(function(l){ return l.label; });
    var out = document.getElementById('output');
    if(active.length===0){
      out.innerHTML = 'No reforms active -- the power balance stays where it is: women hold <b>27.5%</b> of parliamentary seats, the pay gap sits at <b>~20%</b>, and women do <b>76.2%</b> of unpaid care.';
    } else {
      out.innerHTML = 'With <b>'+active.join(' + ')+'</b>, women would hold <b>~'+Math.round(r.parl)+'%</b> of parliamentary seats, the pay gap would narrow to <b>~'+(Math.round(r.gap*10)/10)+'%</b>, women\'s share of unpaid care would fall to <b>~'+Math.round(r.care)+'%</b>, and female labor-force participation would rise by <b>~'+(Math.round(r.lift*10)/10)+' points</b>.';
    }
  }
  document.getElementById('resetBtn').addEventListener('click', function(){
    Object.keys(state).forEach(function(k){ state[k]=false; });
    document.querySelectorAll('.switch').forEach(function(s){ s.classList.remove('on'); s.setAttribute('aria-checked','false'); });
    updateSim();
  });
  updateSim();

  /* ---------- DEFAULT BIAS ---------- */
  var roles = [
    {name:'Leader',power:'high',def:'M',why:'Leadership is culturally coded masculine; men are presumed authoritative.'},
    {name:'Decider',power:'high',def:'M',why:'Final-say roles default to men in most inheritance & family law traditions.'},
    {name:'Owner',power:'high',def:'M',why:'Property and land ownership has historically been vested in men.'},
    {name:'Earner',power:'high',def:'M',why:'The "provider" wage is culturally assigned to men; women\'s work is seen as secondary.'},
    {name:'Provider',power:'mid',def:'N',why:'Provision is shared in theory, but prestige still skews to male earners.'},
    {name:'Voice',power:'mid',def:'N',why:'Public speech is notionally open, yet men dominate panels, media & debate.'},
    {name:'Caregiver',power:'low',def:'F',why:'Care is treated as "natural" women\'s work -- unpaid and invisible.'},
    {name:'Support',power:'low',def:'F',why:'Supportive, behind-the-scenes labor defaults to women.'}
  ];
  var avatarsG = ['M','M','M','M','F','F','F','F'];
  var order = [0,1,2,3,4,5,6,7]; // role index held by avatar position
  var showDefaults = false;
  var avatarsEl = document.getElementById('avatars');
  var whylist = document.getElementById('whylist');

  function shuffle(arr){ var a=arr.slice(); for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; } return a; }

  function powerSplit(){
    var m=0,f=0;
    order.forEach(function(roleIdx,pos){
      if(roles[roleIdx].power==='high'){ if(avatarsG[pos]==='M') m++; else f++; }
    });
    var tot=m+f; if(tot===0) return {m:50,f:50};
    return {m:Math.round(m/tot*100), f:Math.round(f/tot*100)};
  }

  function renderBias(){
    avatarsEl.innerHTML = '';
    order.forEach(function(roleIdx,pos){
      var g = avatarsG[pos];
      var role = roles[roleIdx];
      var div = document.createElement('div');
      div.className = 'avatar '+g.toLowerCase();
      var tag = '';
      if(showDefaults){
        var conform = (role.def===g);
        if(role.def!=='N'){
          div.classList.add(conform?'conform':'violate');
          tag = conform ? 'matches default' : 'breaks default';
        } else { tag = 'no strong default'; }
      }
      div.innerHTML = '<div class="face">'+g+'</div>'+
        '<div class="role">'+role.name+'</div>'+
        '<div class="tag">'+tag+'</div>';
      avatarsEl.appendChild(div);
    });
    var sp = powerSplit();
    document.getElementById('biasM').style.width = sp.m+'%';
    document.getElementById('biasF').style.width = sp.f+'%';
    var ro = document.getElementById('biasReadout');
    if(showDefaults){
      ro.innerHTML = 'Men hold <b>'+sp.m+'%</b> of high-authority roles. Even under random assignment, cultural defaults push power roles toward men and care roles toward women.';
    } else {
      ro.innerHTML = 'Roles assigned at random. Men hold <b>'+sp.m+'%</b> of high-authority roles. Toggle "Show cultural defaults" to see the hidden skew.';
    }
    if(showDefaults){
      whylist.style.display='block';
      whylist.innerHTML = roles.filter(function(r){return r.def!=='N';}).map(function(r){
        return '<li><b>'+r.name+'</b> -> default '+r.def+': '+r.why+'</li>';
      }).join('');
    } else {
      whylist.style.display='none';
    }
  }

  document.getElementById('shuffleBtn').addEventListener('click', function(){
    order = shuffle([0,1,2,3,4,5,6,7]);
    renderBias();
  });
  document.getElementById('defaultsBtn').addEventListener('click', function(){
    showDefaults = !showDefaults;
    this.textContent = showDefaults ? 'Hide cultural defaults' : 'Show cultural defaults';
    renderBias();
  });
  document.getElementById('flipBtn').addEventListener('click', function(){
    // Rebalance: 2 high-power roles to women, 2 to men => 50/50
    order = [2,3,4,5,0,1,6,7]; // M:Owner,Earner,Provider,Voice | F:Leader,Decider,Caregiver,Support
    renderBias();
  });
  renderBias();

  /* ---------- THE FIX: expandable levers ---------- */
  var fixLevers = [
    {t:'Electoral gender quotas',b:'The single most effective tool for rapidly increasing women\'s representation. <b>Rwanda</b> reached 61% women in parliament -- the highest in the world -- via constitutional quota. <b>Mexico</b> achieved 50%+ through parity reform.',s:'IPU Atlas of Electoral Gender Quotas; IDEA'},
    {t:'Universal childcare',b:'The biggest single lever for women\'s labor-force participation. <b>Norway</b> evidence shows a feedback loop: more women in local government -> more childcare -> more women in government.',s:'World Bank 2024; OECD; ScienceDirect (Norway)'},
    {t:'Paid parental leave (father quotas)',b:'"Use-it-or-lose-it" father quotas in <b>Iceland, Sweden & Quebec</b> increase men\'s caregiving and reduce the motherhood penalty.',s:'OECD; Factly.co'},
    {t:'Pay transparency & enforcement',b:'The <b>EU Pay Transparency Directive (2023)</b> requires firms to report gaps and justify any gap &gt;5%. <b>Iceland</b> made it illegal to pay men more for equal work via Equal Pay Certification.',s:'European Commission; OECD'},
    {t:"Girls' education",b:'The highest-ROI development investment. Each extra year of schooling raises a woman\'s earnings by <b>10-20%</b>, delays marriage, lowers fertility and raises political participation.',s:'World Bank; UN Women'},
    {t:'Legal reform',b:'Repealing discriminatory property, inheritance, marriage, travel and employment laws. <b>75 countries</b> have reformed such laws since 2015 -- but gaps remain.',s:'UN Women "Equality in Law"; World Bank WBL'},
    {t:'Electoral system reform',b:'Proportional representation (PR) systems consistently elect more women than first-past-the-post. <b>PR + quotas</b> is the fastest documented path to parity.',s:'Electoral Reform Society (UK); IPU'},
    {t:'Social movements & cultural change',b:'<b>#MeToo</b> and <b>Ni Una Menos</b> shifted norms and policy. Grassroots organizing sustains legal and political gains that laws alone cannot hold.',s:'Multiple sources'}
  ];
  var leversEl = document.getElementById('levers');
  fixLevers.forEach(function(l){
    var d = document.createElement('details');
    d.className = 'lever reveal';
    d.innerHTML = '<summary>'+l.t+'</summary><div class="body"><p>'+l.b+'</p><span class="src">'+l.s+'</span></div>';
    leversEl.appendChild(d);
  });
  // observe newly added reveals
  if('IntersectionObserver' in window && !reduceMotion){
    var fixObs = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); fixObs.unobserve(e.target); } });
    },{threshold:0.12});
    document.querySelectorAll('.lever.reveal').forEach(function(el){ fixObs.observe(el); });
  } else {
    document.querySelectorAll('.lever.reveal').forEach(function(el){ el.classList.add('in'); });
  }

})();