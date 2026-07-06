/* ============================================================
   Shared Power — main.js
   Vanilla JS, no dependencies. Graceful degradation: all content
   is present in HTML; this file only enhances it.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Citation data + tooltips ---------- */
  var SOURCES = {
    'IPU2025': { label: 'UN Women & IPU, Women in Politics 2025', year: 2025 },
    'WEF2024': { label: 'WEF Global Gender Gap Report 2024', year: 2024 },
    'WBL2024': { label: 'World Bank, Women, Business and the Law 2024', year: 2024 },
    'ILO2024': { label: 'International Labour Organization, 2024/2025', year: 2025 },
    'ANTHRO': { label: 'Anthropological literature (Minangkabau, Mosuo, Haudenosaunee, Khasi)', year: 2020 },
    'IPUPARLINE': { label: 'IPU Parline database', year: 2025 }
  };

  function buildTooltips() {
    var chips = document.querySelectorAll('.cite');
    chips.forEach(function (chip) {
      var key = chip.getAttribute('data-src');
      var src = SOURCES[key];
      if (!src) return;
      chip.setAttribute('title', src.label + ' (' + src.year + ')');
      chip.setAttribute('tabindex', '0');
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        toggleTooltip(chip, src);
      });
      chip.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTooltip(chip, src); }
      });
    });
  }

  function toggleTooltip(chip, src) {
    var existing = chip.querySelector('.cite-tip');
    if (existing) { existing.remove(); return; }
    var tip = document.createElement('span');
    tip.className = 'cite-tip';
    tip.textContent = src.label + ' (' + src.year + ')';
    chip.appendChild(tip);
  }

  /* ---------- Animated stat counters ---------- */
  function animateCounter(el) {
    var target = parseFloat(el.getAttribute('data-target'));
    var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    var dur = 1600;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = target * eased;
      el.textContent = prefix + val.toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = prefix + target.toFixed(decimals) + suffix;
    }
    requestAnimationFrame(step);
  }

  function initCounters() {
    var counters = document.querySelectorAll('.counter');
    if (!('IntersectionObserver' in window)) {
      counters.forEach(animateCounter);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    counters.forEach(function (c) { io.observe(c); });
  }

  /* ---------- Parity slider (years to parity) ---------- */
  function initParitySlider() {
    var slider = document.getElementById('paritySlider');
    var out = document.getElementById('parityValue');
    var bar = document.getElementById('parityBar');
    if (!slider || !out || !bar) return;
    function update() {
      var v = parseInt(slider.value, 10);
      out.textContent = v + ' year' + (v === 1 ? '' : 's');
      var pct = Math.min((v / 134) * 100, 100);
      bar.style.width = pct + '%';
    }
    slider.addEventListener('input', update);
    update();
  }

  /* ---------- Timeline slider ---------- */
  function initTimeline() {
    var track = document.getElementById('timelineTrack');
    var prev = document.getElementById('tlPrev');
    var next = document.getElementById('tlNext');
    if (!track) return;
    function scrollByCard(dir) {
      var card = track.querySelector('.tl-card');
      var step = card ? card.offsetWidth + 24 : 260;
      track.scrollBy({ left: dir * step, behavior: 'smooth' });
    }
    if (prev) prev.addEventListener('click', function () { scrollByCard(-1); });
    if (next) next.addEventListener('click', function () { scrollByCard(1); });

    var nodes = track.querySelectorAll('.tl-card');
    nodes.forEach(function (card) {
      var btn = card.querySelector('.tl-expand');
      var detail = card.querySelector('.tl-detail');
      if (!btn || !detail) return;
      btn.addEventListener('click', function () {
        var open = card.classList.toggle('is-open');
        detail.style.maxHeight = open ? detail.scrollHeight + 'px' : '0px';
        btn.textContent = open ? 'Show less' : 'Read more';
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  }

  /* ---------- Myth/Reality flip cards ---------- */
  function initMythCards() {
    var cards = document.querySelectorAll('.myth-card');
    cards.forEach(function (card) {
      card.addEventListener('click', function () { card.classList.toggle('flipped'); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.classList.toggle('flipped'); }
      });
    });
  }

  /* ---------- AQ Calculator (Shared-Power Index) ---------- */
  var AQ_ACTIONS = [
    { id: 'vote', label: 'Vote for equity-focused candidates', weight: 18 },
    { id: 'mentor', label: 'Mentor or sponsor someone with less access', weight: 14 },
    { id: 'pay', label: 'Advocate for pay transparency at work', weight: 16 },
    { id: 'care', label: 'Support care infrastructure (childcare, leave)', weight: 15 },
    { id: 'hire', label: 'Challenge bias in hiring & promotion', weight: 17 },
    { id: 'invest', label: 'Back women- and marginalized-led ventures', weight: 12 },
    { id: 'listen', label: 'Amplify marginalized voices in decisions', weight: 8 }
  ];

  function initCalculator() {
    var wrap = document.getElementById('aqOptions');
    var bar = document.getElementById('aqBar');
    var score = document.getElementById('aqScore');
    var msg = document.getElementById('aqMsg');
    var list = document.getElementById('aqChecklist');
    if (!wrap) return;

    AQ_ACTIONS.forEach(function (a) {
      var row = document.createElement('label');
      row.className = 'aq-row';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = a.id;
      cb.dataset.weight = a.weight;
      var txt = document.createElement('span');
      txt.textContent = a.label;
      var w = document.createElement('span');
      w.className = 'aq-weight';
      w.textContent = '+' + a.weight;
      row.appendChild(cb);
      row.appendChild(txt);
      row.appendChild(w);
      wrap.appendChild(row);
      cb.addEventListener('change', update);
    });

    function update() {
      var total = 0;
      var chosen = [];
      wrap.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        if (cb.checked) {
          total += parseInt(cb.dataset.weight, 10);
          chosen.push(AQ_ACTIONS.filter(function (a) { return a.id === cb.value; })[0].label);
        }
      });
      var pct = Math.min(total, 100);
      bar.style.width = pct + '%';
      score.textContent = pct;
      if (pct === 0) msg.textContent = 'Select the levers you can pull. Every action shifts how power is shared.';
      else if (pct < 40) msg.textContent = 'A solid start. Small structural levers compound over time.';
      else if (pct < 80) msg.textContent = 'Strong momentum — you are moving multiple levers at once.';
      else msg.textContent = 'Exceptional. This is what active shared-power practice looks like.';

      list.innerHTML = '';
      if (chosen.length === 0) {
        var li = document.createElement('li');
        li.className = 'aq-empty';
        li.textContent = 'Your personalized action checklist will appear here.';
        list.appendChild(li);
      } else {
        chosen.forEach(function (c) {
          var li = document.createElement('li');
          li.textContent = c;
          list.appendChild(li);
        });
      }
    }
    update();
  }

  /* ---------- Sticky nav highlight + scroll reveal ---------- */
  function initNavAndReveal() {
    var links = document.querySelectorAll('.nav-link');
    var sections = [];
    links.forEach(function (l) {
      var id = l.getAttribute('href');
      if (id && id.charAt(0) === '#') {
        var sec = document.querySelector(id);
        if (sec) sections.push({ link: l, sec: sec });
      }
    });

    if ('IntersectionObserver' in window && sections.length) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            links.forEach(function (l) { l.classList.remove('active'); });
            var match = sections.filter(function (s) { return s.sec === entry.target; })[0];
            if (match) match.link.classList.add('active');
          }
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      sections.forEach(function (s) { spy.observe(s.sec); });
    }

    var reveals = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      reveals.forEach(function (r) { r.classList.add('visible'); });
      return;
    }
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('visible'); ro.unobserve(entry.target); }
      });
    }, { threshold: 0.15 });
    reveals.forEach(function (r) { ro.observe(r); });
  }

  /* ---------- Mobile nav toggle ---------- */
  function initMobileNav() {
    var btn = document.getElementById('navToggle');
    var menu = document.getElementById('navMenu');
    if (!btn || !menu) return;
    btn.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { menu.classList.remove('open'); btn.setAttribute('aria-expanded','false'); });
    });
  }

  /* ---------- Init ---------- */
  function init() {
    buildTooltips();
    initCounters();
    initParitySlider();
    initTimeline();
    initMythCards();
    initCalculator();
    initNavAndReveal();
    initMobileNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();