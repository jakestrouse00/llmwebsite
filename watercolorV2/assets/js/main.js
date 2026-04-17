/* ============================================================
   AQUARELLE — Main JavaScript
   Shared utilities: navigation, search, mobile menu,
   IntersectionObserver, modal logic, page transitions
   ============================================================ */

(function () {
  'use strict';

  /* --- DOM Ready --- */
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setupNavigation();
    setupSearch();
    setupMobileMenu();
    setupScrollAnimations();
    setupModals();
    setupPageTransitions();
    setupBackToTop();
  }

  /* --- Navigation: Active State --- */
  function setupNavigation() {
    const currentPage = getCurrentPageName();
    const navLinks = document.querySelectorAll('.main-nav a, .mobile-nav-overlay a, .footer-nav a');

    navLinks.forEach(function (link) {
      const href = link.getAttribute('href');
      if (!href) return;
      const linkPage = href.replace('./', '').replace('.html', '').replace('index', '');
      if (
        (currentPage === '' && linkPage === '') ||
        (currentPage !== '' && linkPage === currentPage)
      ) {
        link.classList.add('active');
      }
    });
  }

  function getCurrentPageName() {
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/') + 1);
    return filename.replace('.html', '').replace('index', '');
  }

  /* --- Search Toggle --- */
  function setupSearch() {
    const toggle = document.querySelector('.search-toggle');
    const inline = document.querySelector('.search-inline');
    const input = document.querySelector('.search-inline input');

    if (!toggle || !inline) return;

    toggle.addEventListener('click', function () {
      inline.classList.toggle('open');
      if (inline.classList.contains('open') && input) {
        input.focus();
      }
    });

    // Close search on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && inline.classList.contains('open')) {
        inline.classList.remove('open');
        toggle.focus();
      }
    });

    // Simple search filter for archive page
    if (input) {
      input.addEventListener('input', function () {
        const query = input.value.toLowerCase().trim();
        const entries = document.querySelectorAll('.archive-entry');
        entries.forEach(function (entry) {
          const text = entry.textContent.toLowerCase();
          entry.style.display = text.includes(query) ? '' : 'none';
        });
      });
    }
  }

  /* --- Mobile Menu --- */
  function setupMobileMenu() {
    const openBtn = document.querySelector('.mobile-menu-toggle');
    const overlay = document.querySelector('.mobile-nav-overlay');
    const closeBtn = document.querySelector('.mobile-nav-overlay .close-menu');

    if (!openBtn || !overlay) return;

    openBtn.addEventListener('click', function () {
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      if (closeBtn) closeBtn.focus();
    });

    function closeMenu() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      openBtn.focus();
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', closeMenu);
    }

    // Close on Escape
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });

    // Close when clicking a nav link inside the overlay
    overlay.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });
  }

  /* --- Scroll-Triggered Animations (IntersectionObserver) --- */
  function setupScrollAnimations() {
    // Respect reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.wash-reveal, .ink-bleed-reveal, .wash-stagger').forEach(function (el) {
        el.classList.add('animate-wash');
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-wash');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });

    document.querySelectorAll('.wash-reveal, .ink-bleed-reveal, .wash-stagger').forEach(function (el) {
      observer.observe(el);
    });
  }

  /* --- Modal Logic --- */
  function setupModals() {
    // Open modal triggers
    document.querySelectorAll('[data-modal-open]').forEach(function (trigger) {
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        var modalId = trigger.getAttribute('data-modal-open');
        openModal(modalId);
      });
    });

    // Close modal triggers
    document.querySelectorAll('[data-modal-close]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var modalId = btn.getAttribute('data-modal-close');
        closeModal(modalId);
      });
    });

    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          closeModal(overlay.id);
        }
      });
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(function (overlay) {
          closeModal(overlay.id);
        });
      }
    });
  }

  function openModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    var closeBtn = modal.querySelector('[data-modal-close]');
    if (closeBtn) closeBtn.focus();
  }

  function closeModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
    var trigger = document.querySelector('[data-modal-open="' + modalId + '"]');
    if (trigger) trigger.focus();
  }

  /* --- Page Transitions --- */
  function setupPageTransitions() {
    var transition = document.querySelector('.page-transition');
    if (!transition) return;

    // Fade in on load
    document.body.style.opacity = '0';
    requestAnimationFrame(function () {
      document.body.style.transition = 'opacity 300ms ease';
      document.body.style.opacity = '1';
    });

    // Fade out on internal link click
    document.querySelectorAll('a[href]').forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto')) return;

      link.addEventListener('click', function (e) {
        e.preventDefault();
        transition.classList.add('active');
        setTimeout(function () {
          window.location.href = href;
        }, 300);
      });
    });
  }

  /* --- Back to Top --- */
  function setupBackToTop() {
    document.querySelectorAll('.back-to-top').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  /* --- Gallery Filter (if on gallery page) --- */
  window.Aquarelle = window.Aquarelle || {};
  window.Aquarelle.filterGallery = function (tag, btn) {
    var items = document.querySelectorAll('.gallery-item');
    var tags = document.querySelectorAll('.filter-tag');

    tags.forEach(function (t) { t.classList.remove('active'); });
    if (btn) btn.classList.add('active');

    items.forEach(function (item) {
      if (tag === 'all' || item.getAttribute('data-category') === tag) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  };

  /* --- Archive Filter (if on archive page) --- */
  window.Aquarelle.filterArchive = function (tag, btn) {
    var entries = document.querySelectorAll('.archive-entry');
    var tags = document.querySelectorAll('.archive-filters .filter-tag');

    tags.forEach(function (t) { t.classList.remove('active'); });
    if (btn) btn.classList.add('active');

    entries.forEach(function (entry) {
      if (tag === 'all' || entry.getAttribute('data-category') === tag) {
        entry.style.display = '';
      } else {
        entry.style.display = 'none';
      }
    });
  };

})();