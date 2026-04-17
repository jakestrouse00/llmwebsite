/* ============================================================
   AQUARELLE — Animations Module
   Scroll-triggered wash effects, ink-bleed color assignment,
   parallax wash blobs, and dynamic stagger delays.
   Complements main.js IntersectionObserver setup.
   ============================================================ */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    assignInkBleedColors();
    setupParallaxBlobs();
    extendStaggerDelays();
  }

  /* --- Ink-Bleed Color Assignment ---
     .ink-bleed-reveal::after needs a background color.
     CSS can't cycle colors per element, so JS assigns them
     via CSS custom properties on each element.
  */
  var washColors = [
    'var(--color-wash-blue-faint)',
    'var(--color-wash-sienna-faint)',
    'var(--color-wash-sage-faint)'
  ];

  function assignInkBleedColors() {
    var elements = document.querySelectorAll('.ink-bleed-reveal');
    elements.forEach(function (el, i) {
      var color = washColors[i % washColors.length];
      el.style.setProperty('--bleed-color', color);
    });

    // Inject a small style rule to use the custom property
    if (elements.length > 0 && !document.getElementById('ink-bleed-dynamic')) {
      var style = document.createElement('style');
      style.id = 'ink-bleed-dynamic';
      style.textContent =
        '.ink-bleed-reveal::after { background-color: var(--bleed-color, var(--color-wash-blue-faint)); }';
      document.head.appendChild(style);
    }
  }

  /* --- Parallax Wash Blobs ---
     Decorative blobs shift slightly on scroll for depth.
     Uses requestAnimationFrame for throttling.
     Only active on non-touch devices to avoid mobile jank.
  */
  function setupParallaxBlobs() {
    var blobs = document.querySelectorAll('.wash-blob');
    if (blobs.length === 0) return;

    // Skip on touch-primary devices
    if ('ontouchstart' in window) return;

    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var ticking = false;

    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          var scrollY = window.scrollY;
          blobs.forEach(function (blob) {
            var speed = parseFloat(blob.getAttribute('data-parallax-speed')) || 0.05;
            var yOffset = scrollY * speed;
            blob.style.transform = 'translateY(' + yOffset + 'px)';
          });
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* --- Dynamic Stagger Delays ---
     CSS handles up to 6 children with hardcoded delays.
     This extends delays for lists with more than 6 items.
  */
  function extendStaggerDelays() {
    var staggerGroups = document.querySelectorAll('.wash-stagger');
    staggerGroups.forEach(function (group) {
      var children = group.children;
      if (children.length <= 6) return; // CSS handles it

      for (var i = 6; i < children.length; i++) {
        var delay = (i * 80) + 'ms';
        children[i].style.transitionDelay = delay;
      }
    });
  }

  /* --- Gallery Item Wash Color Assignment ---
     Assigns a wash color to gallery items for the decorative
     bleed shadow on hover, cycling through the three washes.
  */
  function assignGalleryWashColors() {
    var items = document.querySelectorAll('.gallery-item');
    var shadowVars = [
      'var(--shadow-wash-blue)',
      'var(--shadow-wash-sienna)',
      'var(--shadow-wash-sage)'
    ];
    items.forEach(function (item, i) {
      item.style.setProperty('--item-shadow', shadowVars[i % 3]);
    });
  }

  // Run gallery color assignment if on gallery page
  if (document.querySelector('.gallery-grid')) {
    assignGalleryWashColors();
  }

})();