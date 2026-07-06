# Power Balance Lab — Buildable Concept Spec

**Topic:** Why the world isn't a matriarchy & what can be done to fix that
**Constraint check:** Single self-contained `index.html` (inline CSS + JS). No build step, no external APIs, no map-tile servers, no npm. Runs by double-clicking. All data hardcoded from `research_brief.md`.

## Core argument the site makes
Patriarchy is a **historical construction** (not biology) → it can be **dismantled** with specific, evidence-backed levers → "fix" means **shared power**, not a mirror-image matriarchy. The Minangkabau model (complementary, not dominating) is the north star.

## Page structure (single page, scroll sections + sticky nav)
1. **Hero** — bold headline + animated "power balance" bar that loads skewed male and gently rebalances on scroll. CTA: "Run the lab".
2. **The Construction** — patriarchy as history (Lerner 3100–600 BC; agriculture/property; warfare; plow vs hoe). Scroll-reveal timeline of 4 mechanisms.
3. **The Exceptions** — Minangkabau / Mosuo / Khasi / Bribri cards proving alternatives thrived for centuries.
4. **The Present** — interactive region bars (NOT a geographic map): toggle Politics / Economics / Care / Legal layers across 6 regions. Numbers from research brief.
5. **INTERACTIVE 1 — Reform Simulator** (primary).
6. **INTERACTIVE 2 — Default Bias demo** (secondary).
7. **The Fix** — 8 evidence-based levers as expandable cards with proven-case stats.
8. **Footer** — sources + reframe statement.

## INTERACTIVE 1 — Reform Simulator (primary, ≥2 sub-interactions)
**Metaphor:** A lab bench. You flip policy switches and watch the "Power Balance" rebalance in real time.
- **6 toggle levers** (each = one evidence-based fix): Gender quotas · Universal childcare · Father-paid parental leave · Pay transparency · Girls' education · Legal reform.
- **4 live gauges** that animate as levers flip:
  - Women in parliament (%) — baseline 27.5%; quotas → up to ~50–61% (Rwanda/Mexico modeled).
  - Gender pay gap (%) — baseline ~20%; pay transparency + childcare → narrows toward ~5%.
  - Women's share of unpaid care (%) — baseline 76.2%; childcare + father leave → toward ~55%.
  - Female labor-force participation lift (points) — baseline 0; childcare → +6.6 pts.
- **Modeled relationships** (transparent, simple, documented in a tooltip "How we model this"): each lever contributes a bounded delta drawn from the research brief's cited effects. Shown as additive, capped at realistic ceilings. A small "assumptions" disclosure keeps it honest (Cynical's factual-landmine guard).
- **Output panel:** a sentence that rewrites live, e.g. "With quotas + childcare + pay transparency, women would hold ~48% of parliamentary seats and the pay gap would narrow to ~7%." Plus a "Reset" button.
- **Why it serves the argument:** turns abstract policy into *visible* rebalancing → "constructed → dismantlable" made visceral. Frames reforms as experiments, not preachy prescriptions.

## INTERACTIVE 2 — Default Bias demo (secondary)
**Metaphor:** "Neutrality isn't neutral." Provocateur's angle, made concrete and safe.
- A panel of 8 anonymous avatars. User clicks "Shuffle roles" → roles (Leader, Decider, Provider, Caregiver, Earner, Owner, Voice, Support) are assigned *randomly*.
- Reveal: the system shows that even under "neutral" random assignment, the *default cultural expectation* (a second layer toggled by a "Show cultural defaults" switch) skews Leader/Decider/Owner/Earner toward men and Caregiver/Support toward women — with a short explanatory line per role.
- A "Flip the defaults" button lets users reassign and watch the power bar rebalance — tying back to Interactive 1's thesis that defaults are changeable.
- **Cynical safeguards:** clear color contrast (default-skew = muted red, user-chosen = green), an explicit "why?" prompt per role, and copy that frames it as observation not accusation. No fabricated country data.

## Visual / tech approach
- **Aesthetic:** sleek dark theme, bold sans-serif, accent gradient (deep plum → teal), generous whitespace, glassmorphic cards. Modern, eye-catching, not corporate.
- **Animations:** CSS transitions + IntersectionObserver scroll-reveals + requestAnimationFrame gauge fills. No animation library.
- **Charts:** hand-rolled SVG/CSS bars and radial gauges (no Chart.js needed) — keeps it dependency-free and lightweight.
- **Responsive:** CSS grid + fl/ clamp() typography; works on mobile.
- **Accessibility:** semantic HTML, ARIA on toggles, keyboard-operable controls, `prefers-reduced-motion` respected.

## What is deliberately NOT built (and why)
- **No geographic map** — needs inlined geo data; replaced by region bars (equally visceral, far cheaper, fewer bugs).
- **No country-level "default role" heatmap** — data doesn't exist reliably; would be fabricated (factual landmine).
- **No external data fetches** — all numbers hardcoded from the research brief with inline source labels.

## Feasibility verdict
**Most buildable strong concept = Power Balance Lab.** Two fully self-contained interactives (Reform Simulator + Default Bias demo), zero external dependencies, all data sourced from the saved research brief, one execution round. Ready to draft full `index.html` on Execute.