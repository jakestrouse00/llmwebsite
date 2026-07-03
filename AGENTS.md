# AGENTS.md

This repo is a **collection of independent static websites**, not a single application. Each top-level folder is its own self-contained site (HTML/CSS/JS). There is **no repo-wide build, lint, test, or CI** — don't waste time looking for them at the root.

## Layout
- Root `index.html` is a **directory page**, not an app shell. It calls the GitHub Contents API with hardcoded constants `githubOwner = "jakestrouse00"`, `githubRepository = "llmwebsite"`, `githubBranch = "main"` and lists every root folder containing an `index.html`. If you rename the repo, transfer it, or change the default branch, update those three constants.
- Adding a site = creating a top-level folder with an `index.html`. No registration anywhere else.
- Versioned folders (`art_website` + `art_websiteV2`, `mommy_website` + `V2` + `V3`, `personalityV1` + `V2`, `watercolorV1` + `V2`) are **intentional parallel versions**, not a migration path. Don't delete or "consolidate" older versions.
- Before editing a project, read its per-project design doc — it is the source of truth for that project's constants and architecture: `haptic_game/README.md`, `tempo_trek/SPEC.md`, `reef_simulation/reflexreef_constants.md`, `art_website/architecture.md`.

## Serving
Static sites need HTTP, not `file://` (service workers and `fetch()` break otherwise):

```
python3 -m http.server 8080   # run inside the project folder, then open /<folder>/
```

The root directory page also needs HTTP to reach the GitHub API.

## The only package: `personalityV1`
This is the **only** folder with a `package.json` (jsdom dev dep) and any kind of check. Nothing else in the repo has npm dependencies or scripts.

Inside `personalityV1/`:
```
npm install
npm run guardrails   # ci/run-guardrails.sh: file-existence + jsdom lint-guard (no hardcoded CSS colors) + a11y-audit
npm run serve        # npx serve .
```

The guardrail script hardcodes checks for specific files (`css/tokens.css`, `js/theme.js`, `js/lint-guard.js`, etc.) and specific attributes (`data-theme`, `theme_v1`, `contrast_v1`, `skip-link`). If you restructure `personalityV1`, update `ci/run-guardrails.sh` to match or it will fail.

Gotcha: `.gitignore` only excludes `.idea` — `node_modules/` is **not** ignored, so `npm install` in `personalityV1` produces a dir that `git add .` would stage. Don't commit it.

## Conventions
- Vanilla JS, no frameworks, no TypeScript, no bundler. Canvas / Web Audio / Vibration API / `localStorage` where needed.
- Code follows the per-project `.md` specs (tuning constants, file plans, architecture decisions).