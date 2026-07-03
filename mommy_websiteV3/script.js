/**
 * Equilibrium Shift - Core Interactivity
 * Handles: Power Pivot Morph, Matrilineal Atlas, and Paths to Change Tracker
 */

document.addEventListener('DOMContentLoaded', () => {
  initPowerPivot();
  initAtlas();
  initPaths();
});

// ==========================================
// 01. POWER PIVOT (Morphing Shape)
// ==========================================
function initPowerPivot() {
  const slider = document.getElementById('pivotSlider');
  const shape = document.getElementById('morphShape');
  const label = document.getElementById('pivotLabel');
  const traitsControl = document.getElementById('traitsControl');
  const traitsConsensus = document.getElementById('traitsConsensus');

  // Points for Pyramid (Vertical Hierarchy)
  const pyramid = [
    { x: 150, y: 50 },  // Top
    { x: 50, y: 230 },  // Bottom Left
    { x: 250, y: 230 }  // Bottom Right
  ];

  // Points for Circle (Circular Consensus) 
  // We approximate a circle using 32 points for a smooth morph
  const circle = [];
  const centerX = 150, centerY = 140, radius = 80;
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    circle.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  }

  function updatePivot(val) {
    const ratio = val / 100;
    
    // 1. Morph Shape
    // To morph a 3-point polygon into a 32-point circle, we treat the pyramid as a 32-point shape 
    // where points are clustered at the corners.
    const currentPoints = [];
    for (let i = 0; i < 32; i++) {
      let pStart;
      if (i < 10) pStart = pyramid[0];
      else if (i < 21) pStart = pyramid[1];
      else pStart = pyramid[2];

      const pEnd = circle[i];
      const x = pStart.x + (pEnd.x - pStart.x) * ratio;
      const y = pStart.y + (pEnd.y - pStart.y) * ratio;
      currentPoints.push(`${x},${y}`);
    }
    shape.setAttribute('points', currentPoints.join(' '));

    // 2. Update Label & Center Dot
    const dot = document.getElementById('centerDot');
    dot.setAttribute('r', ratio * 6);
    
    if (ratio < 0.5) {
      label.textContent = "Patriarchy · Vertical Hierarchy";
      label.style.color = "var(--gold)";
    } else {
      label.textContent = "Matriarchy · Circular Consensus";
      label.style.color = "var(--violet)";
    }

    // 3. Crossfade Traits
    traitsControl.style.opacity = 1 - (ratio * 2);
    traitsControl.style.pointerEvents = ratio > 0.8 ? 'none' : 'auto';
    traitsConsensus.style.opacity = ratio * 2;
    traitsConsensus.style.pointerEvents = ratio < 0.2 ? 'none' : 'auto';
  }

  slider.addEventListener('input', (e) => updatePivot(e.target.value));
  updatePivot(0); // Initial state
}

// ==========================================
// 02. MATRILINEAL ATLAS (Interactive Map)
// ==========================================
function initAtlas() {
  const societies = [
    { name: "Minangkabau", region: "Southeast Asia", where: "West Sumatra, Indonesia", x: 78, y: 62, desc: "The world's largest matrilineal society. Land and houses are inherited from mother to daughter.", facts: ["Matrilineal land tenure", "Women as keepers of the home", "Consensus-based village councils"] },
    { name: "Mosuo", region: "East Asia", where: "Yunnan/Sichuan, China", x: 72, y: 42, desc: "Known for 'walking marriages' and a social structure where women hold primary authority in the household.", facts: ["Matrilineal kinship", "Women manage economic resources", "Strong female elders' authority"] },
    { name: "Khasi", region: "South Asia", where: "Meghalaya, India", x: 68, y: 48, desc: "The youngest daughter (Khatduh) inherits the ancestral property and cares for parents.", facts: ["Matrilineal descent", "Lineage traced through females", "High female literacy and agency"] },
    { name: "Hopi", region: "North America", where: "Arizona, USA", x: 22, y: 32, desc: "Traditional Hopi society is matrilineal, with clan membership and house ownership passing through women.", facts: ["Matrilineal clan system", "Women own the homes", "Central role in spiritual life"] },
    { name: "Haudenosaunee", region: "North America", where: "Northeast USA/Canada", x: 28, y: 28, desc: "The Iroquois Confederacy's Clan Mothers choose the chiefs and can remove them from power.", facts: ["Clan Mothers hold veto power", "Matrilineal descent", "Egalitarian governance"] },
    { name: "Akan/Ashanti", region: "West Africa", where: "Ghana", x: 42, y: 52, desc: "A powerful matrilineal system where the 'Queen Mother' holds significant political influence.", facts: ["Matrilineal succession", "Strong female political roles", "Wealth passed through mothers"] },
    { name: "Umoja", region: "East Africa", where: "Kenya", x: 58, y: 58, desc: "A modern intentional matriarchal village founded by women to escape violence and build a safe community.", facts: ["Women-led governance", "Community-based support", "Focus on peace and healing"] },
  ];

  const map = document.getElementById('atlasMap');
  const card = document.getElementById('atlasCard');
  const empty = document.getElementById('atlasEmpty');
  const content = document.getElementById('atlasContent');

  societies.forEach((soc, idx) => {
    const pin = document.createElement('button');
    pin.className = 'pin';
    pin.style.left = `${soc.x}%`;
    pin.style.top = `${soc.y}%`;
    pin.setAttribute('aria-label', `View details for ${soc.name}`);
    
    pin.addEventListener('click', () => {
      document.querySelectorAll('.pin').forEach(p => p.classList.remove('active'));
      pin.classList.add('active');
      
      empty.hidden = true;
      content.hidden = false;
      
      document.getElementById('cardRegion').textContent = soc.region;
      document.getElementById('cardName').textContent = soc.name;
      document.getElementById('cardWhere').textContent = soc.where;
      document.getElementById('cardDesc').textContent = soc.desc;
      
      const factsList = document.getElementById('cardFacts');
      factsList.innerHTML = '';
      soc.facts.forEach(f => {
        const li = document.createElement('li');
        li.textContent = f;
        factsList.appendChild(li);
      });
    });
    
    map.appendChild(pin);
  });
}

// ==========================================
// 03. PATHS TO CHANGE (Commitment Tracker)
// ==========================================
function initPaths() {
  const modules = [
    { 
      title: "Political", 
      icon: "⚖️", 
      steps: ["Support gender-parity in local councils", "Advocate for consensus-based voting", "Promote female leadership in policy"] 
    },
    { 
      title: "Economic", 
      icon: "🪙", 
      steps: ["Explore gift-economy cooperatives", "Support women's land ownership rights", "Prioritize circular wealth distribution"] 
    },
    { 
      title: "Social", 
      icon: "🤝", 
      steps: ["Practice active listening in conflicts", "Shift from hierarchy to networking", "Value care-work as a primary social asset"] 
    },
    { 
      title: "Spiritual", 
      icon: "🌿", 
      steps: ["Re-center nature in spiritual practice", "Honor maternal ancestral wisdom", "Deconstruct gender-binary deities"] 
    },
    { 
      title: "Governance", 
      icon: "🌀", 
      steps: ["Implement sociocratic decision-making", "Remove vertical reporting lines", "Adopt a 'circle' organizational model"] 
    }
  ];

  const grid = document.getElementById('pathsGrid');
  const ring = document.getElementById('progressRing');
  const countEl = document.getElementById('progressCount');
  const caption = document.getElementById('progressCaption');

  let totalSteps = 0;
  let checkedSteps = 0;

  modules.forEach(mod => {
    totalSteps += mod.steps.length;
    const div = document.createElement('div');
    div.className = 'path-module';
    
    div.innerHTML = `
      <button class="path-head">
        <span class="path-icon">${mod.icon}</span>
        <h3>${mod.title}</h3>
        <span class="path-chev">▾</span>
      </button>
      <div class="path-body">
        <div class="path-body-inner">
          ${mod.steps.map(step => `
            <label class="path-step">
              <input type="checkbox">
              <span>${step}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
    
    const btn = div.querySelector('.path-head');
    btn.addEventListener('click', () => {
      div.classList.toggle('open');
    });

    div.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', () => {
        checkedSteps = grid.querySelectorAll('input:checked').length;
        updateProgress();
      });
    });

    grid.appendChild(div);
  });

  function updateProgress() {
    const percent = checkedSteps / totalSteps;
    const offset = 326.7 - (percent * 326.7);
    ring.style.strokeDashoffset = offset;
    countEl.textContent = checkedSteps;
    
    if (checkedSteps === 0) caption.textContent = "No levers pulled yet. Every shift starts with one.";
    else if (percent < 0.3) caption.textContent = "The first ripples are forming.";
    else if (percent < 0.6) caption.textContent = "The equilibrium is starting to tilt.";
    else if (percent < 1) caption.textContent = "Significant structural shift in progress.";
    else caption.textContent = "A complete systemic re-centering achieved.";
  }
}
