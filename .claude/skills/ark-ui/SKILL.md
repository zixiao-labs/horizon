---
name: ark-ui
description: "Design, implement, audit, or refactor web and game-adjacent interfaces using an evidence-based Hypergryph visual language with two independent choices: product family and application depth (1 minimal, 2 moderate, 3 complex, 4 maximal). Use for Hypergryph-, Arknights-, Endfield-, Rhodes Island-, industrial sci-fi-, editorial game-UI-, or bilingual technical-interface requests; for landing pages, dashboards, menus, HUD-like panels, design systems, HTML/CSS/JS/React components, and visual QA where the result should carry this family resemblance without copying protected logos or artwork."
---

# Ark UI

Build original interfaces from documented visual and implementation evidence, not from vague “cyberpunk” prompting. Preserve usability, accessibility, project conventions, and the user's product identity.

## Start here

1. Inspect the target project, framework, viewport, existing tokens, and user content.
2. Choose one family; do not average every product into one style:
   - `ark`: black/white/cyan industrial information system.
   - `endfield`: white/charcoal/signal-yellow technical field system.
   - `exa`: midnight/white/aqua cosmic-archival system with serif contrast.
   - `popucom`: blue/yellow/orange playful platform system.
   - `corporate`: black/white/acid-lime restrained studio identity.
3. Choose one application depth independently from the family:
   - `1 / minimal / 极简`: family identity through tokens, type, geometry, and one strong state cue.
   - `2 / moderate / 中等`: family shell plus one controlled texture/instrument layer and restrained reveal motion.
   - `3 / complex / 复杂`: multi-zone shell, layered stage, broad component coverage, and coordinated instrumentation. Use the anonymized system-wide reference in `references/depth-levels.md` as the calibration baseline.
   - `4 / maximal / 极繁`: bespoke section compositions, state-driven instrumentation, and coordinated motion across a fully re-art-directed responsive system.
4. If the user specifies a depth, preserve it. Otherwise default to `moderate` for productivity/product UI and `complex` for game-adjacent or showcase UI; state the assumption. Ask only when the depth would materially change scope or rework.
5. Read [references/design-language.md](references/design-language.md), [references/depth-levels.md](references/depth-levels.md), and only the chosen family in [references/recipes.md](references/recipes.md). For multi-family comparisons or family-specific depth behavior, also read [references/family-depth-matrix.md](references/family-depth-matrix.md).
6. For implementation or code review, also read [references/frontend-evidence.md](references/frontend-evidence.md).
7. For source attribution, provenance, or asset decisions, read [references/source-ledger.md](references/source-ledger.md) and [references/legal.md](references/legal.md).

## Lock the design contract

Before changing code, state a compact contract: `family`, `depth`, evidence pattern, and what the primary screen must let the user do. Treat family and depth as orthogonal axes: `endfield + minimal` and `endfield + maximal` share identity but not visual saturation.

When the user asks to choose, present the four numbered levels with one recommended level based on product type. Keep family selection and depth selection as separate decisions instead of showing a large cross-product matrix.

Depth measures implementation coverage and orchestration, not content density. Increasing depth may add meaningful layers, responsive recomposition, and state-aware motion; it never permits fake telemetry, duplicate copy, extra colors, smaller essential text, or weaker accessibility. Read the full rubric in [references/depth-levels.md](references/depth-levels.md) before implementation.

## Implement

- Start from semantic content and task hierarchy. Use the visual grammar to expose state, navigation, and priority.
- Reuse project components and tokens when present. Otherwise copy `assets/starter-vanilla/` or use `assets/react/ArkUI.jsx` with `assets/react/ark-ui.css`.
- When renaming starter classes, IDs, data attributes, or ARIA targets, update every JavaScript selector and reference in the same pass. A styled page with broken DOM wiring is not complete.
- Use `assets/tokens/ark-ui.tokens.json` as a reference, then rename tokens to match the target project.
- Represent the contract with root attributes when practical: `data-ark-theme="endfield"` and `data-ark-depth="complex"`. Keep component selectors semantic so either axis can change independently.
- Prefer CSS/SVG geometry, gradients, rules, masks, and original abstractions over copied game art.
- Keep one dominant accent. Treat secondary accents as state or product-family signals.
- Pair Chinese or primary labels with short uppercase English micro-labels only when it clarifies hierarchy.
- Use square or very small-radius geometry, 1px rules, cropped edges, strong negative space, and intentional asymmetry.
- Use motion to reveal hierarchy: masked slide, clipped wipe, restrained pulse, or directional drift. Honor `prefers-reduced-motion`.
- Build responsive layouts deliberately. Convert side rails to compact top/bottom navigation on portrait screens; do not merely scale the desktop composition.
- Preserve keyboard access, visible focus, readable contrast, semantic controls, and meaningful alt text.

## Iterate with an evidence lock

Use this loop when the user asks for repeated refinement or says the interface
is ugly, too dark, or too text-heavy:

1. Name the primary family, application depth, and exact public pattern from the source ledger
   before changing code. If a second family is useful, borrow one constrained
   trait only; do not merge its full palette or decoration system.
2. Inventory persistent copy as `decision`, `changing state`, or `explanation`.
   Keep decision data visible, compress repeated state, and move optional
   explanation behind an explicit, accessible details affordance.
   Assign every persistent datum one visual owner: comparable values belong to
   candidate cards, while a focus dossier owns only additional context. Do not
   repeat the same metric in both places.
   A dedicated rules, archive, or reference view is already the explicit detail
   layer: optimize it for scanning and grouping, but do not delete necessary
   rules merely to match the density of a persistent HUD. Remove a summary that
   only enumerates the visible sections beneath it; it is duplicate navigation,
   not rule content. For an unambiguous procedural gesture, prefer a compact
   symbolic mapping such as `hand → rear → front`, but keep every exact value,
   prerequisite, stop condition, and exception in visible text.
   Copy reduction must not collapse decision UI into unlabeled icons. Keep
   comparable numbers and explicit action verbs. In a 36–42 px status chip,
   prefer one readable `label + value` line over two undersized text tiers.
   Put immediate-resolution copy in one owner (usually the decision header or
   commit action), not the header, explainer, and footer at the same time.
   A transient phase, toast, or transition banner owns only its subject/state
   and one immediate action or outcome. Persistent HUD values remain with the
   HUD. Do not manufacture protocol names, system codes, channel labels, load
   meters, or decorative telemetry merely to make the banner feel technical.
   On transition and result screens, let the status dossier own current values
   and let the report own narrative outcome plus the next unlock. Never mirror
   the dossier's telemetry in the report merely to fill the available space.
   On route or topology screens, let the graph own choices, the top HUD own
   comparable run values, and the bottom rail own only the selected summary and
   explicit actions. Put full mechanics in a pre-commit detail layer instead of
   repeating them persistently. Stretch the graph between header and footer on
   short, wide viewports; do not solve collisions by shrinking essential text.
   A pre-commit detail layer must still partition ownership: one run-state
   dossier, then distinct target, mechanic, risk, and outcome facets. Do not add
   a general “run check” card that repeats the dossier. Keep facet labels visible
   so copy reduction does not turn the screen into unexplained icons.
3. Change one shared token family, one depth behavior, and one representative screen per pass.
   When pure black feels flat, first lift neutral tokens or stage lighting within
   the chosen evidence family; do not invent gradients, glow, or a new accent.
   For a modal shade, try the next existing neutral surface token at restrained
   opacity before altering the panel or adding a color. The shade should separate
   layers without turning the full viewport into a flat black field.
   If an illustrated backdrop is too saturated, restrain it with the same
   evidence-locked neutral wash rather than replacing it with flat black or a
   large accent-colored field.
4. Preserve the recovered space. Give it to primary content or negative space
   instead of filling it with decorative telemetry.
5. Capture before and after at the same viewport. Revert or revise if the result
   is not visibly closer to the cited evidence, reduces legibility, introduces
   collisions, or makes a truthful mechanic harder to find.
6. Repeat only after compile, interaction, contrast, and screenshot checks pass.
   For choices that commit immediately, preserve that consequence in one short
   state line or action label even when longer instructional prose is removed.
   If a representative state is difficult to reach, add a deterministic,
   non-persistent QA entry before judging screenshots. Non-persistent means the
   harness explicitly suppresses save writes and save deletion, not only that it
   creates an in-memory object. If coordinate automation is unreliable, expose
   the exact modal or confirmation state through that QA entry rather than
   waiving interaction evidence. For an auto-hiding transition, the QA entry
   may restart the normal animation with auto-hide disabled; it must not change
   production timing. Capture and validate while the transient UI is visible.
   Never optimize from a guessed or stale state.

## Avoid

- Do not copy Hypergryph, Arknights, Endfield, Rhodes Island, Monster Siren, or other protected logos, character art, key art, UI screenshots, or CDN assets into deliverables unless the user has rights and explicitly supplies them.
- Do not redistribute production bundles or the proprietary/unclear-license fonts observed on official sites.
- Do not claim reconstructed code is Hypergryph source code.
- Do not add random hexagons, terminal noise, scanlines, glitch, neon gradients, or dense HUD decoration without an information role.
- Do not combine cyan, signal yellow, aqua, magenta, orange, and lime in one interface merely because they occur across different products.
- Do not hide primary content behind splash screens, autoplay audio, or inaccessible hover-only controls.
- Do not interpret `maximal` as permission for random HUD noise, fake system codes, perpetual motion, or decoration on every component.
- Do not achieve `minimal` by deleting labels, states, focus cues, prerequisites, or necessary explanations.

## Validate

1. Run the target project's tests, lint, and build.
2. Run the bundled heuristic audit:

   ```bash
   node "$CODEX_HOME/skills/ark-ui/scripts/audit-ark-ui.mjs" <html-or-css-path>
   ```

3. Render at desktop and portrait widths. Inspect clipping, text collisions, focus order, active state, and reduced-motion behavior.
4. Exercise the primary controls in a browser and check for runtime errors; do not infer behavior from static markup alone.
5. Confirm every decorative element either supports grouping, direction, state, or world-building.
6. Confirm provenance: official production evidence is cited, third-party code is license-checked, and output code is original or properly attributed.
7. For text-density passes, confirm that removed copy is redundant or remains
   available through a visible, keyboard-accessible details control.
8. Confirm every icon-only control is a familiar secondary action or has an
   accessible name. Purchase, commit, destructive, and state-comparison actions
   retain visible verbs and values even in compact layouts.
9. Compare the representative screen against the selected depth in [references/depth-levels.md](references/depth-levels.md). Judge shell transformation, stage layers, component coverage, state instrumentation, motion, and responsive recomposition—not raw element count.
10. Confirm the densest screen does not exceed the selected depth by more than one local level, and the primary screen is not below it. Document intentional local exceptions.

## Research new official pages

When the task requires freshness or a product not covered in the ledger, inspect the public page and its loaded CSS/JS. Use the analyzer on a URL or downloaded CSS:

```bash
python3 "$CODEX_HOME/skills/ark-ui/scripts/analyze-css-evidence.py" <css-url-or-file>
```

Record the page URL, asset URL, retrieval date, observed framework, colors, fonts, and reusable pattern in `references/source-ledger.md`. Separate direct observations from inference.

## Bundled code

- `assets/starter-vanilla/`: dependency-free responsive demo and starting point.
- `assets/react/`: portable React shell, panels, theme switcher, and CSS.
- `assets/tokens/ark-ui.tokens.json`: five evidence-derived theme families using safe fallback font stacks.
- `assets/showcases/`: five original, inspectable complex-level UI samples with four-level depth controls.
- `assets/promo/`: editable promotional compositions and eight generated landscape/portrait PNGs.
- `references/depth-levels.md`: four-level application-depth rubric, selection rules, complex-level calibration, and validation scorecard.
- `references/family-depth-matrix.md`: family-specific shell, content, instrumentation, and depth adaptation rules.
- Starter and React assets expose `data-ark-depth` / `depth` alongside the existing family selector.
- `scripts/scaffold-ark-ui.py`: copy a starter into a new or empty destination.
- `scripts/audit-ark-ui.mjs`: flag missing accessibility/responsiveness and common imitation clichés.
- `scripts/analyze-css-evidence.py`: extract color, font, motion, and geometry evidence from public CSS.
- `scripts/capture-showcases.mjs`: render the five samples at exact desktop and optional mobile CDP viewports, then fail on horizontal overflow.
- `scripts/capture-promos.mjs`: regenerate the social promotion set from the original showcase screenshots.
