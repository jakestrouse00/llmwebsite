// js/main.js — Shared Logic: Theme, Nav, Scroll Animations, Personality Filter, Page Init
(function () {
  'use strict';

  /* ── Theme Toggle ── */

  function initTheme() {
    var saved = localStorage.getItem('llmp-theme');
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);

    var toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    updateToggleIcon(toggle, theme);
    toggle.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('llmp-theme', next);
      updateToggleIcon(toggle, next);
    });
  }

  function updateToggleIcon(toggle, theme) {
    toggle.innerHTML = theme === 'dark'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
    toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }

  /* ── Mobile Nav ── */

  function initMobileNav() {
    var toggle = document.getElementById('nav-toggle');
    var links = document.getElementById('nav-links');
    if (!toggle || !links) return;

    toggle.addEventListener('click', function () {
      links.classList.toggle('nav-links--open');
      var expanded = links.classList.contains('nav-links--open');
      toggle.setAttribute('aria-expanded', expanded);
    });

    // Close on link click (mobile)
    links.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        links.classList.remove('nav-links--open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ── Active Nav Link Highlight ── */

  function initActiveNav() {
    var path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link').forEach(function (link) {
      var href = link.getAttribute('href');
      if (href === path || (path === '' && href === 'index.html')) {
        link.classList.add('nav-link--active');
      }
    });
  }

  /* ── Scroll Animations ── */

  function initScrollAnimations() {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal-on-scroll').forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ── Personality Filter (Homepage Only) ── */

  function initPersonalityFilter() {
    var heroHeadline = document.getElementById('hero-headline');
    var heroTagline = document.getElementById('hero-tagline');
    var voiceLabel = document.getElementById('voice-label');
    if (!heroHeadline || !heroTagline) return;

    var AGENTS = window.LLMP.AGENTS;
    var savedVoice = localStorage.getItem('llmp-voice') || 'moderator';
    applyVoice(savedVoice);

    document.querySelectorAll('[data-voice]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var voice = btn.getAttribute('data-voice');
        localStorage.setItem('llmp-voice', voice);
        applyVoice(voice);
      });
    });

    function applyVoice(voiceId) {
      var agent = AGENTS[voiceId];
      if (!agent || !agent.voiceCopy) return;

      heroHeadline.classList.add('fading');
      heroTagline.classList.add('fading');

      setTimeout(function () {
        heroHeadline.textContent = agent.voiceCopy.hero;
        heroTagline.textContent = agent.voiceCopy.tagline;
        if (voiceLabel) voiceLabel.textContent = '— ' + agent.name;
        heroHeadline.classList.remove('fading');
        heroTagline.classList.remove('fading');
      }, 250);

      document.querySelectorAll('[data-voice]').forEach(function (b) {
        b.classList.toggle('voice-btn--active', b.getAttribute('data-voice') === voiceId);
      });
    }
  }

  /* ── Page‑Specific Init ── */

  function init() {
    initTheme();
    initMobileNav();
    initActiveNav();
    initScrollAnimations();
    initPersonalityFilter();

    // Page‑specific modules
    if (document.getElementById('loop-viz')) {
      window.LLMP.initLoopViz();
    }
    if (document.getElementById('agent-grid')) {
      window.LLMP.initAgentExplorer();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();