// js/loop-viz.js — Interactive Loop Visualization for Homepage
(function () {
  'use strict';

  function initLoopViz() {
    var container = document.getElementById('loop-viz');
    if (!container) return;

    var AGENTS = window.LLMP.AGENTS;
    var PHASES = window.LLMP.PHASES;
    var CATEGORIES = window.LLMP.CATEGORIES;

    var activePhase = 'clarify';

    // Build stepper
    var stepper = document.createElement('div');
    stepper.className = 'loop-stepper';
    stepper.setAttribute('role', 'tablist');

    PHASES.forEach(function (phase, idx) {
      var step = document.createElement('button');
      step.className = 'loop-step' + (phase.id === activePhase ? ' loop-step--active' : '');
      step.setAttribute('data-phase', phase.id);
      step.setAttribute('role', 'tab');
      step.setAttribute('aria-selected', phase.id === activePhase ? 'true' : 'false');
      step.style.setProperty('--phase-color', phase.color);
      step.innerHTML =
        '<span class="loop-step__number">' + (idx + 1) + '</span>' +
        '<span class="loop-step__label">' + phase.label + '</span>';

      if (idx < PHASES.length - 1) {
        var arrow = document.createElement('span');
        arrow.className = 'loop-step__arrow';
        arrow.innerHTML = '→';
        stepper.appendChild(step);
        stepper.appendChild(arrow);
      } else {
        stepper.appendChild(step);
      }
    });

    container.innerHTML = '';
    container.appendChild(stepper);

    // Detail panel
    var detail = document.createElement('div');
    detail.className = 'loop-detail';
    detail.setAttribute('role', 'tabpanel');
    container.appendChild(detail);

    function showPhase(phaseId) {
      activePhase = phaseId;
      var phase = PHASES.find(function (p) { return p.id === phaseId; });
      if (!phase) return;

      // Update stepper active states
      stepper.querySelectorAll('.loop-step').forEach(function (s) {
        var isActive = s.getAttribute('data-phase') === phaseId;
        s.classList.toggle('loop-step--active', isActive);
        s.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      // Find active agents for this phase
      var activeAgents = [];
      Object.keys(AGENTS).forEach(function (key) {
        if (AGENTS[key].phaseActivity[phaseId]) activeAgents.push(AGENTS[key]);
      });

      // Render detail content
      detail.innerHTML =
        '<div class="loop-detail__header">' +
          '<h3 class="loop-detail__title" style="color:' + phase.color + '">' + phase.label + '</h3>' +
          '<p class="loop-detail__desc">' + phase.description + '</p>' +
        '</div>' +
        '<div class="loop-detail__agents">' +
          '<span class="loop-detail__agents-label">Active agents:</span>' +
          activeAgents.map(function (a) {
            var cat = CATEGORIES[a.category];
            return '<span class="loop-detail__agent" style="border-color:' + cat.color + '">' +
              '<span class="loop-detail__agent-icon">' + a.icon + '</span>' + a.name +
            '</span>';
          }).join('') +
        '</div>';

      detail.classList.remove('loop-detail--visible');
      requestAnimationFrame(function () { detail.classList.add('loop-detail--visible'); });
    }

    // Event delegation for step clicks
    stepper.addEventListener('click', function (e) {
      var step = e.target.closest('.loop-step');
      if (!step) return;
      showPhase(step.getAttribute('data-phase'));
    });

    // Show initial phase
    showPhase('clarify');
  }

  window.LLMP = window.LLMP || {};
  window.LLMP.initLoopViz = initLoopViz;
})();