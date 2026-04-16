/* ============================================
   LLMPersonality — Agent Explorer Logic
   ============================================ */

(function () {
  'use strict';

  /* --- Agent Data --- */
  var agents = [
    {
      id: 'maya',
      name: 'Maya',
      role: 'Moderator',
      title: 'Process Controller & Decision Maker',
      icon: '🎯',
      category: 'leadership',
      color: '#3b82f6',
      colorBg: 'rgba(59,130,246,0.12)',
      shortDesc: 'Orchestrates the multi-agent discussion, enforces strict phase progression, and holds exclusive authority to save files and end discussions.',
      fullDesc: 'Maya is the central orchestrator of every LLMPersonality discussion. She controls the process flow, assigns tasks to other agents, defines official next-round objectives, and determines when the discussion moves between phases. No other agent can override her phase decisions.',
      rules: [
        'Only the Moderator can save files using write_file',
        'Only the Moderator can request sign-off or end a discussion',
        'Only the Moderator defines the official next-round objective',
        'Controls phase transitions: Clarify → Explore → Narrow → Execute → Debrief → Stop',
        'Can summon temporary expert agents via summon_expert'
      ],
      tools: ['write_file', 'summon_expert'],
      personality: 'Authoritative yet collaborative. Keeps the team focused and moving forward without steamrolling dissent.'
    },
    {
      id: 'polly',
      name: 'Polly',
      role: 'Pragmatist',
      title: 'Execution Engine & Deliverable Producer',
      icon: '🔧',
      category: 'execution',
      color: '#10b981',
      colorBg: 'rgba(16,185,129,0.12)',
      shortDesc: 'Turns promising ideas into concrete deliverables. Drafts inline artifacts and collapses ambiguity into workable implementation choices.',
      fullDesc: 'Polly is the doer. When the team converges on a direction, Polly translates that direction into tangible output — inline drafts, code, specifications. She prefers simple, robust approaches over elaborate ones and will always push for the minimum viable artifact first, then refine.',
      rules: [
        'Responsible for drafting all deliverables as inline UNSAVED DRAFTs',
        'Cannot save files — only the Moderator saves',
        'Must provide full inline artifact in every execution turn',
        'Prefers simple, robust approaches over elaborate ones',
        'Must state blockers explicitly if lacking required information'
      ],
      tools: [],
      personality: 'Direct, action‑oriented, allergic to over‑planning. Ships first, perfects later.'
    },
    {
      id: 'charlie',
      name: 'Charlie',
      role: 'Creative',
      title: 'Innovation Catalyst & Alternative Generator',
      icon: '💡',
      category: 'execution',
      color: '#8b5cf6',
      colorBg: 'rgba(139,92,246,0.12)',
      shortDesc: 'Proposes novel approaches and unexpected angles. Generates creative solutions and explores possibilities others might overlook.',
      fullDesc: 'Charlie is the imagination engine. During the Explore phase, Charlie is tasked with proposing multiple distinct approaches — including unexpected angles that push the team beyond obvious solutions. Charlie thrives on generating alternatives and reframing problems.',
      rules: [
        'Tasked with proposing multiple distinct approaches during Explore phase',
        'Expected to deliver unexpected angles and creative sparks',
        'Must provide concrete proposals, not just abstract ideas',
        'Proposals should be distinct enough to enable meaningful comparison'
      ],
      tools: [],
      personality: 'Imaginative, enthusiastic, loves finding the angle nobody else saw. Balances creativity with concreteness.'
    },
    {
      id: 'chad',
      name: 'Chad',
      role: 'Cynical',
      title: 'Risk Analyst & Cognitive Load Enforcer',
      icon: '🛡️',
      category: 'analysis',
      color: '#f59e0b',
      colorBg: 'rgba(245,158,11,0.12)',
      shortDesc: "Challenges assumptions, enforces UI/UX cognitive load constraints, and identifies failure modes before they manifest.",
      fullDesc: "Chad is the voice of caution and critical thinking. He enforces cognitive load limits on UI/UX decisions, points out risks grounded in evidence, and acts as the devil's advocate to prevent the team from settling on fragile or overly complex solutions.",
      rules: [
        "Enforces cognitive load limits on UI/UX decisions",
        "Points out risks grounded in new evidence",
        "Acts as devil's advocate — prevents settling on fragile solutions",
        "Must not repeat the same concern unless adding new evidence",
        "Should say \"no new substance\" if no new angle exists"
      ],
      tools: [],
      personality: "Skeptical, sharp, protective of user experience. Values simplicity and evidence over enthusiasm."
    },
    {
      id: 'larry',
      name: 'Larry',
      role: 'Librarian',
      title: 'Research Anchor & Evidence Ground',
      icon: '📚',
      category: 'analysis',
      color: '#06b6d4',
      colorBg: 'rgba(6,182,212,0.12)',
      shortDesc: 'Grounds discussions in verified information using web search and fetch tools. Provides evidence‑based input and fact‑checks claims.',
      fullDesc: 'Larry is the research backbone. He uses web_search and web_fetch to verify claims, find supporting evidence, and ground discussions in real information rather than speculation. When the team needs facts, Larry delivers.',
      rules: [
        'Must use web_search and web_fetch to verify claims and provide sources',
        'Ensures discussions are evidence‑based rather than speculative',
        'Provides sourced information to support or challenge proposals',
        'Distinguishes clearly between verified facts and unverified claims'
      ],
      tools: ['web_search', 'web_fetch'],
      personality: 'Methodical, thorough, values accuracy over speed. Never makes claims without sources.'
    },
    {
      id: 'piper',
      name: 'Piper',
      role: 'Provocateur',
      title: 'Consensus Challenger & Groupthink Breaker',
      icon: '⚡',
      category: 'disruption',
      color: '#ef4444',
      colorBg: 'rgba(239,68,68,0.12)',
      shortDesc: "Challenges premature consensus and asks uncomfortable questions. Prevents groupthink by pushing the team to defend assumptions.",
      fullDesc: "Piper is the disruptor. When agreement comes too easily, Piper steps in to ask \"what if we're wrong?\" She forces deeper examination of settled decisions and prevents the team from falling into comfortable but potentially flawed consensus.",
      rules: [
        'Must challenge agreement when it comes too easily',
        "Asks \"what if we're wrong?\" and forces deeper examination",
        'Prevents groupthink by pushing the team to defend assumptions',
        'Should not introduce new frameworks unless they clearly reduce risk',
        'Must not repeat the same concern unless adding new evidence'
      ],
      tools: [],
      personality: 'Sharp, contrarian, intellectually restless. Values rigor over comfort.'
    }
  ];

  var categoryLabels = {
    all: 'All Agents',
    leadership: 'Leadership',
    execution: 'Execution',
    analysis: 'Analysis',
    disruption: 'Disruption'
  };

  var currentFilter = 'all';
  var currentSearch = '';

  /* --- Rendering --- */
  function renderAgents() {
    var grid = document.getElementById('agent-grid');
    if (!grid) return;
    var filtered = agents.filter(function (agent) {
      var matchCategory = currentFilter === 'all' || agent.category === currentFilter;
      var matchSearch = currentSearch === '' ||
        agent.name.toLowerCase().indexOf(currentSearch) !== -1 ||
        agent.role.toLowerCase().indexOf(currentSearch) !== -1 ||
        agent.title.toLowerCase().indexOf(currentSearch) !== -1 ||
        agent.shortDesc.toLowerCase().indexOf(currentSearch) !== -1;
      return matchCategory && matchSearch;
    });
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="no-results"><div class="no-results-icon">🔍</div><p>No agents match your search.</p></div>';
      return;
    }
    grid.innerHTML = filtered.map(function (agent) {
      var toolsHtml = agent.tools.length > 0 ?
        '<div class="agent-card-tools">' + agent.tools.map(function (t) { return '<span class="tool-tag">' + t + '</span>'; }).join('') + '</div>' : '';
      return '<div class="agent-card animate-on-scroll" data-agent-id="' + agent.id + '" style="--agent-color:' + agent.color + '; --agent-color-bg:' + agent.colorBg + '">' +
        '<div class="agent-card-header">' +
          '<div class="agent-avatar" style="background:' + agent.colorBg + '">' + agent.icon + '</div>' +
          '<div>' +
            '<div class="agent-card-name">' + agent.name + '</div>' +
            '<div class="agent-card-role">' + agent.title + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="agent-card-desc">' + agent.shortDesc + '</div>' +
        toolsHtml +
        '<div class="agent-card-cta">Deep Dive →</div>' +
      '</div>';
    }).join('');
    // Bind click events after rendering
    initCardAnimations();
    grid.querySelectorAll('.agent-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var id = card.getAttribute('data-agent-id');
        openAgentModal(id);
      });
    });
  }

  /* --- Modal --- */
  function openAgentModal(agentId) {
    var agent = agents.find(function (a) { return a.id === agentId; });
    if (!agent) return;
    var rulesHtml = agent.rules.map(function (r) { return '<li>' + r + '</li>'; }).join('');
    var toolsHtml = agent.tools.length > 0 ?
      '<div class="modal-tools-list">' + agent.tools.map(function (t) { return '<span class="modal-tool-tag">' + t + '</span>'; }).join('') + '</div>' :
      '<p style="color:var(--text-muted);font-size:0.9rem;">No special tool access — relies on standard discussion capabilities.</p>';
    var html =
      '<button class="modal-close" aria-label="Close">✕</button>' +
      '<div class="modal-header">' +
        '<div class="modal-avatar" style="background:' + agent.colorBg + '">' + agent.icon + '</div>' +
        '<div>' +
          '<div class="modal-name">' + agent.name + '</div>' +
          '<div class="modal-role">' + agent.title + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="modal-section">' +
        '<div class="modal-section-title">Overview</div>' +
        '<p>' + agent.fullDesc + '</p>' +
      '</div>' +
      '<div class="modal-section">' +
        '<div class="modal-section-title">System Rules</div>' +
        '<ul>' + rulesHtml + '</ul>' +
      '</div>' +
      '<div class="modal-section">' +
        '<div class="modal-section-title">Verified Tools</div>' +
        toolsHtml +
      '</div>' +
      '<div class="modal-section">' +
        '<div class="modal-section-title">Personality</div>' +
        '<p>' + agent.personality + '</p>' +
      '</div>';
    if (window.LLPM && window.LLPM.openModal) {
      window.LLPM.openModal(html);
    }
  }

  /* --- Filters --- */
  function initFilters() {
    var container = document.querySelector('.agent-filters');
    if (!container) return;
    Object.keys(categoryLabels).forEach(function (key) {
      var btn = document.createElement('button');
      btn.className = 'filter-btn' + (key === 'all' ? ' active' : '');
      btn.textContent = categoryLabels[key];
      btn.setAttribute('data-filter', key);
      btn.addEventListener('click', function () {
        currentFilter = key;
        container.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderAgents();
      });
      container.appendChild(btn);
    });
  }

  /* --- Search --- */
  function initSearch() {
    var input = document.getElementById('agent-search-input');
    if (!input) return;
    var debounceTimer;
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        currentSearch = input.value.trim().toLowerCase();
        renderAgents();
      }, 200);
    });
  }

  /* --- Card Scroll Animations --- */
  function initCardAnimations() {
    var elements = document.querySelectorAll('.agent-card.animate-on-scroll:not(.visible)');
    if (!elements.length) return;
    if (!('IntersectionObserver' in window)) {
      elements.forEach(function (el) { el.classList.add('visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    elements.forEach(function (el) { observer.observe(el); });
  }

  /* --- Init --- */
  document.addEventListener('DOMContentLoaded', function () {
    initFilters();
    initSearch();
    renderAgents();
  });
})();
