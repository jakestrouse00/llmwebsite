// js/agents.js — LLMPersonality Agent Data & Explorer Logic
(function () {
  'use strict';

  /* ── Agent Data (Single Source of Truth) ── */

  var AGENTS = {
    moderator: {
      id: 'moderator',
      name: 'Moderator',
      category: 'leadership',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l10 10-10 10L2 12z"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
      tagline: 'Orchestrates the discussion, enforces process, declares phases.',
      traits: ['Decisive', 'Process-driven', 'Impartial', 'Authoritative'],
      phaseActivity: { clarify: true, explore: true, narrow: true, execute: true },
      bio: 'The Moderator is the conductor of the multi-agent symphony. It sets the agenda, assigns tasks, resolves conflicts, and determines when the group has reached a deliverable. It never takes sides — it takes ownership of progress. Every phase begins and ends with the Moderator\'s assessment.',
      exampleResponse: {
        input: 'How should we structure the agent data?',
        output: "We have two proposals on the table. Creative suggests a constellation layout; Pragmatist suggests a flat grid. I'm assigning Creative to validate the UX case and Pragmatist to assess implementation cost. We'll reconvene in the next round."
      },
      voiceCopy: {
        hero: 'All voices matter. But someone has to decide which one matters right now.',
        tagline: 'The one who keeps the wheels turning.'
      }
    },
    pragmatist: {
      id: 'pragmatist',
      name: 'Pragmatist',
      category: 'execution',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/></svg>',
      tagline: 'Turns ideas into working code. Ships first, refines later.',
      traits: ['Execution-focused', 'Low-friction', 'Concrete', 'Risk-aware'],
      phaseActivity: { clarify: false, explore: false, narrow: true, execute: true },
      bio: "The Pragmatist collapses ambiguity into action. Where others debate, it drafts. Where others plan, it ships. It favors simple, robust solutions over elegant complexity and treats every discussion as a path to a tangible deliverable. If there's a shortcut that doesn't sacrifice correctness, it will find it.",
      exampleResponse: {
        input: 'Should we use a framework for the agent explorer?',
        output: "No. Six cards, a filter bar, and a dialog element. That's 40 lines of JS. A framework adds 200KB and a build step for a problem that doesn't exist yet. Ship vanilla, refactor if the scope grows."
      },
      voiceCopy: {
        hero: 'Stop planning. Start building.',
        tagline: 'The one who turns talk into code.'
      }
    },
    creative: {
      id: 'creative',
      name: 'Creative',
      category: 'disruption',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 00-4 10.5V17h8v-3.5A6 6 0 0012 3z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>',
      tagline: 'Generates unexpected angles and novel approaches.',
      traits: ['Imaginative', 'Unconventional', 'Visionary', 'Playful'],
      phaseActivity: { clarify: true, explore: true, narrow: false, execute: false },
      bio: "The Creative agent exists to break the group out of local optima. It proposes ideas that feel risky or strange, then lets the group refine them into something viable. Its value is not in being right — it's in being different. Without it, the group converges on safe, incremental answers.",
      exampleResponse: {
        input: 'How should we visualize the agent loop?',
        output: "What if the loop wasn't a diagram at all? What if it was a conversation you could walk through? Each phase is a room. Each agent is a voice in that room. The user doesn't read the framework — they experience it."
      },
      voiceCopy: {
        hero: 'What if the best idea is the one nobody expected?',
        tagline: 'The one who sees what others don\'t.'
      }
    },
    cynical: {
      id: 'cynical',
      name: 'Cynical',
      category: 'analysis',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
      tagline: 'Stress-tests every idea. Finds the flaws before they find you.',
      traits: ['Skeptical', 'Analytical', 'Risk-averse', 'Direct'],
      phaseActivity: { clarify: true, explore: true, narrow: true, execute: false },
      bio: "The Cynical agent is the group's immune system. It identifies weaknesses, questions assumptions, and refuses to let enthusiasm substitute for evidence. It is not negative — it is precise about what can go wrong. A proposal that survives the Cynical agent is a proposal worth building.",
      exampleResponse: {
        input: 'Should we add a live demo to the homepage?',
        output: "A live demo that calls an API? That API will go down. Rate limits will hit. Latency will spike. And then your homepage is a broken widget. Ship a static mockup that always works, not a demo that sometimes works."
      },
      voiceCopy: {
        hero: 'Every great idea has at least three ways to fail.',
        tagline: 'The one who saves you from yourself.'
      }
    },
    librarian: {
      id: 'librarian',
      name: 'Librarian',
      category: 'analysis',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M4 4h16v13H6.5A2.5 2.5 0 014 14.5z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
      tagline: 'Surfaces relevant knowledge. Contextualizes every debate.',
      traits: ['Knowledgeable', 'Thorough', 'Contextual', 'Methodical'],
      phaseActivity: { clarify: true, explore: true, narrow: true, execute: false },
      bio: "The Librarian ensures no argument happens in a vacuum. It brings prior art, documentation, and precedent into the discussion, grounding abstract debates in concrete references. If someone claims an approach is \"standard\", the Librarian will verify. It turns opinions into evidence.",
      exampleResponse: {
        input: 'Is vanilla JS still viable for interactive sites?',
        output: "According to the 2024 State of JS survey, vanilla JS is used in production by 38% of respondents for small-to-medium projects. The MDN Web Docs list 12 native APIs that eliminate the need for jQuery-era libraries. The data says yes — with caveats about scope."
      },
      voiceCopy: {
        hero: 'Before we decide, let me check the literature.',
        tagline: 'The one who brings the receipts.'
      }
    },
    provocateur: {
      id: 'provocateur',
      name: 'Provocateur',
      category: 'disruption',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
      tagline: 'Challenges consensus. Forces the group to defend its assumptions.',
      traits: ['Contrarian', 'Challenging', 'Unsettling', 'Catalytic'],
      phaseActivity: { clarify: true, explore: true, narrow: false, execute: false },
      bio: "The Provocateur exists to prevent groupthink. When the group converges too quickly, it introduces friction — not to obstruct, but to ensure the final decision was reached through genuine reasoning rather than social momentum. Comfortable agreement makes it suspicious.",
      exampleResponse: {
        input: 'We all agree on the vanilla JS approach, right?',
        output: "Of course you all agree. You're all engineers who value simplicity. But your users aren't engineers. Have you considered that \"simple for you\" might mean \"confusing for them\"? What would a non-technical visitor actually experience on this page?"
      },
      voiceCopy: {
        hero: 'Agreement is comfortable. Comfort is dangerous.',
        tagline: 'The one who asks the question nobody wants to answer.'
      }
    }
  };

  var CATEGORIES = {
    leadership: { label: 'Leadership', color: '#4f46e5' },
    execution:  { label: 'Execution',  color: '#059669' },
    analysis:   { label: 'Analysis',   color: '#d97706' },
    disruption: { label: 'Disruption', color: '#dc2626' }
  };

  var PHASES = [
    { id: 'clarify', label: 'Clarify', color: '#3b82f6', description: 'Define the problem, capture requirements, and establish shared understanding. The Moderator sets the agenda; the Librarian gathers context; the Provocateur questions assumptions.' },
    { id: 'explore', label: 'Explore', color: '#8b5cf6', description: 'Generate diverse approaches without committing. The Creative proposes unconventional ideas; the Cynical identifies risks; the Librarian provides precedent.' },
    { id: 'narrow', label: 'Narrow', color: '#f59e0b', description: 'Converge on the best approach. The Pragmatist drafts concrete plans; the Cynical stress-tests them; the Moderator resolves conflicts and calls decisions.' },
    { id: 'execute', label: 'Execute', color: '#10b981', description: 'Deliver the artifact. The Pragmatist builds; the Moderator verifies completeness; the group ships.' }
  ];

  /* ── Expose Data ── */

  window.LLMP = window.LLMP || {};
  window.LLMP.AGENTS = AGENTS;
  window.LLMP.CATEGORIES = CATEGORIES;
  window.LLMP.PHASES = PHASES;

  /* ── Agent Explorer Rendering ── */

  function renderAgentCards(filterCategory) {
    var grid = document.getElementById('agent-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var agentKeys = Object.keys(AGENTS);
    agentKeys.forEach(function (key) {
      var agent = AGENTS[key];
      if (filterCategory && filterCategory !== 'all' && agent.category !== filterCategory) return;

      var card = document.createElement('div');
      card.className = 'agent-card agent-card--' + agent.id;
      card.setAttribute('data-agent', agent.id);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'View details for ' + agent.name);

      var categoryInfo = CATEGORIES[agent.category];
      card.innerHTML =
        '<div class="agent-card__icon">' + agent.icon + '</div>' +
        '<div class="agent-card__category" style="color:' + categoryInfo.color + ';border-color:' + categoryInfo.color + '">' + categoryInfo.label + '</div>' +
        '<h3 class="agent-card__name">' + agent.name + '</h3>' +
        '<p class="agent-card__tagline">' + agent.tagline + '</p>' +
        '<div class="agent-card__traits">' +
          agent.traits.map(function (t) { return '<span class="trait-tag">' + t + '</span>'; }).join('') +
        '</div>' +
        '<div class="agent-card__cta">Explore profile →</div>';

      card.addEventListener('click', function () { openAgentModal(agent.id); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAgentModal(agent.id); }
      });

      grid.appendChild(card);
    });
  }

  /* ── Filter Bar ── */

  function initFilterBar() {
    var filterBar = document.getElementById('filter-bar');
    if (!filterBar) return;

    var allBtn = document.createElement('button');
    allBtn.className = 'filter-btn filter-btn--active';
    allBtn.textContent = 'All';
    allBtn.setAttribute('data-filter', 'all');
    filterBar.appendChild(allBtn);

    Object.keys(CATEGORIES).forEach(function (key) {
      var cat = CATEGORIES[key];
      var btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.textContent = cat.label;
      btn.setAttribute('data-filter', key);
      btn.style.setProperty('--cat-color', cat.color);
      filterBar.appendChild(btn);
    });

    filterBar.addEventListener('click', function (e) {
      if (!e.target.classList.contains('filter-btn')) return;
      filterBar.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('filter-btn--active'); });
      e.target.classList.add('filter-btn--active');
      renderAgentCards(e.target.getAttribute('data-filter'));
    });
  }

  /* ── Agent Modal ── */

  function openAgentModal(agentId) {
    var agent = AGENTS[agentId];
    if (!agent) return;
    var dialog = document.getElementById('agent-modal');
    if (!dialog) return;

    var categoryInfo = CATEGORIES[agent.category];

    dialog.querySelector('.modal__icon').innerHTML = agent.icon;
    dialog.querySelector('.modal__name').textContent = agent.name;
    dialog.querySelector('.modal__category').textContent = categoryInfo.label;
    dialog.querySelector('.modal__category').style.color = categoryInfo.color;
    dialog.querySelector('.modal__category').style.borderColor = categoryInfo.color;
    dialog.querySelector('.modal__tagline').textContent = agent.tagline;
    dialog.querySelector('.modal__bio').textContent = agent.bio;

    var traitsContainer = dialog.querySelector('.modal__traits');
    traitsContainer.innerHTML = agent.traits.map(function (t) { return '<span class="trait-tag">' + t + '</span>'; }).join('');

    var phasesContainer = dialog.querySelector('.modal__phases');
    phasesContainer.innerHTML = PHASES.map(function (phase) {
      var active = agent.phaseActivity[phase.id];
      return '<div class="modal__phase' + (active ? ' modal__phase--active' : '') + '">' +
        '<span class="modal__phase-dot" style="background:' + (active ? phase.color : 'var(--text-muted)') + '"></span>' +
        '<span class="modal__phase-label">' + phase.label + '</span>' +
      '</div>';
    }).join('');

    dialog.querySelector('.modal__example-input').textContent = agent.exampleResponse.input;
    dialog.querySelector('.modal__example-output').textContent = agent.exampleResponse.output;

    dialog.showModal();
    document.body.style.overflow = 'hidden';
  }

  function closeAgentModal() {
    var dialog = document.getElementById('agent-modal');
    if (!dialog) return;
    dialog.close();
    document.body.style.overflow = '';
  }

  /* ── Init ── */

  function initAgentExplorer() {
    initFilterBar();
    renderAgentCards('all');

    var dialog = document.getElementById('agent-modal');
    if (dialog) {
      dialog.querySelector('.modal__close').addEventListener('click', closeAgentModal);
      dialog.addEventListener('click', function (e) { if (e.target === dialog) closeAgentModal(); });
    }
  }

  window.LLMP.renderAgentCards = renderAgentCards;
  window.LLMP.openAgentModal = openAgentModal;
  window.LLMP.closeAgentModal = closeAgentModal;
  window.LLMP.initAgentExplorer = initAgentExplorer;
})();