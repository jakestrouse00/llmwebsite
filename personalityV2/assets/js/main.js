/* ============================================
   LLMPersonality — Shared Global Logic
   ============================================ */

(function () {
  'use strict';

  /* --- Theme Toggle --- */
  const THEME_KEY = 'llmpersonality-theme';

  function getPreferredTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) return stored;
    // Default to dark on first visit ("Execution Mode")
    return 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const label = document.querySelector('.theme-toggle-label');
    const icon = document.querySelector('.theme-toggle-icon');
    if (label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';
    if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
  }

  function initTheme() {
    applyTheme(getPreferredTheme());
    const toggleBtn = document.querySelector('.theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem(THEME_KEY, next);
        applyTheme(next);
      });
    }
  }

  /* --- Mobile Menu --- */
  function initMobileMenu() {
    const btn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('.nav-links');
    if (btn && nav) {
      btn.addEventListener('click', function () {
        nav.classList.toggle('open');
        btn.textContent = nav.classList.contains('open') ? '✕' : '☰';
      });
      // Close on link click
      nav.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () {
          nav.classList.remove('open');
          btn.textContent = '☰';
        });
      });
    }
  }

  /* --- Active Nav Link --- */
  function initActiveNav() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(function (link) {
      const href = link.getAttribute('href');
      if (href === path || (path === '' && href === 'index.html')) {
        link.classList.add('active');
      }
    });
  }

  /* --- Scroll Animations --- */
  function initScrollAnimations() {
    const elements = document.querySelectorAll('.animate-on-scroll');
    if (!elements.length) return;
    if (!('IntersectionObserver' in window)) {
      elements.forEach(el => el.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    elements.forEach(el => observer.observe(el));
  }

  /* --- Modal System --- */
  function initModal() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    // Close on overlay click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
    });
    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
  }

  function openModal(htmlContent) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    if (!overlay || !content) return;
    content.innerHTML = htmlContent;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    // Ensure close button works (in case content overwrote it)
    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
  }

  function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Expose globally for agents.js
  window.LLPM = window.LLPM || {};
  window.LLPM.openModal = openModal;
  window.LLPM.closeModal = closeModal;

  /* --- Init --- */
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initMobileMenu();
    initActiveNav();
    initScrollAnimations();
    initModal();
  });
})();
