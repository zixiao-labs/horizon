# Ark UI application depth

## Contents

- Two-axis model
- Selection rules
- Four depth levels
- Complex-level calibration
- Implementation contract
- Validation scorecard
- Escalation and reduction

## Two-axis model

Select product family and application depth independently:

`family × depth = visual contract`

Family controls palette, typography, shell grammar, geometry, and motion character. Depth controls how completely that grammar transforms the product: shell coverage, stage layering, component treatment, state instrumentation, motion coordination, and responsive re-art-direction.

Depth is not copy density, number of cards, color count, or permission to invent telemetry. Every level preserves semantic hierarchy, truthful data, keyboard access, readable contrast, reduced motion, and the user's product identity.

## Selection rules

1. Honor an explicit level or its Chinese/English alias.
2. Map “克制、轻量、几乎不改布局” to `minimal` or `moderate`; map “完整重构、游戏化、华丽但可用” to `complex`; map “展示级、沉浸式、每屏独立编排、极繁” to `maximal`.
3. When unspecified, use `moderate` for productivity/product UI and `complex` for game-adjacent, campaign, or showcase UI. State the assumption before editing.
4. Ask a short question only when depth materially changes schedule, asset production, performance, or architecture.
5. A screen may vary locally by one level when task density requires it. The shell and representative primary screen determine the product's declared level.

## Four depth levels

| Level | Stable key | Transformation target | Typical use |
|---|---|---|---|
| 1 极简 | `minimal` | Identity layer | Existing product UI, utilities, dense editors |
| 2 中等 | `moderate` | Shell and stage layer | Production dashboards, portals, landing pages |
| 3 复杂 | `complex` | System-wide reconstruction | Game-adjacent apps, launchers, operational consoles |
| 4 极繁 | `maximal` | Bespoke experiential system | Flagship showcases, title screens, event microsites |

### 1 / minimal / 极简

- Preserve the existing information architecture and most component structure.
- Apply family tokens, type hierarchy, radius/rule grammar, focus states, and one strong selection/action cue.
- Use zero or one persistent decorative system per screen, such as a quiet rule grid or one cropped identifier.
- Keep motion to direct interaction feedback; avoid ambient loops and full-section choreography.
- Restyle only high-value surfaces: shell, primary action, active navigation, input/composer, and one representative panel.
- The result should read as the product first and the family second.

### 2 / moderate / 中等

- Recompose the shell where useful: rail/topbar, action strip, stage/content split, or section title system.
- Use one or two coherent stage layers, such as grid + directional rule, image wash + metadata rail, or orbit + archive mask.
- Cover shared controls and major panels while leaving low-priority utility surfaces close to native conventions.
- Use one reveal family plus direct interaction feedback; allow at most one restrained attention loop.
- Recompose portrait navigation and primary actions without bespoke art direction for every section.
- The family is unmistakable, but content still owns most of the composition.

### 3 / complex / 复杂

- Transform the full shell into multiple operational zones with intentional asymmetry and edge instrumentation.
- Use two to four coordinated stage systems across a representative screen: engineering grid, directional sector, calibration device, oversized identifier, bounded texture, or image mask.
- Style the full shared component set: navigation, composer/input, dialogs, menus, code/data surfaces, status states, focus, selection, and scroll behavior.
- Coordinate two or more motion families, such as load/reveal and state/attention, with reduced-motion parity.
- Re-art-direct desktop and portrait layouts rather than only resizing them.
- Give every persistent instrument a real grouping, direction, state, or world-building role; neutral surfaces still dominate.
- The experience reads as a reconstructed system, not a themed skin.

### 4 / maximal / 极繁

- Build bespoke compositions for major sections or modes while retaining one global shell grammar.
- Use four to six coherent visual layers only where the stage supports them; distribute them by hierarchy rather than filling every gap.
- Make instrumentation state-driven: route, mode, progress, selection, media, or verified data changes the composition.
- Coordinate section transitions, masks, art layers, and control feedback as one motion system. Provide a static reduced-motion composition with equal clarity.
- Recompose illustration, typography, navigation, and action placement for desktop, portrait, short-wide, and reduced-motion states.
- Budget performance, loading, contrast, and distraction explicitly. Degrade toward `complex` on low-power or content-dense screens.
- The experience may be spectacular, but the primary action and current state remain faster to find than the decoration.

## Complex-level calibration

Use this anonymous system-wide reconstruction as the reference for `3 / complex`:

- It transforms the topbar, sidebar, main field, composer, dialogs, code/data surfaces, selection, focus, and state overlays.
- Its main stage combines engineering grids, a directional sector, calibration circle, edge scale, large identifiers, and controlled signal-yellow anchors.
- It uses separate shell, content, and overlay rules with responsive and reduced-motion handling.
- It remains below `maximal` because major screens do not each receive bespoke art direction, instrumentation is mostly structural rather than driven by live product state, and motion is restrained rather than orchestrated across sections.

Do not use “more decoration than the reference” as the sole test for level 4. `maximal` requires deeper state integration, bespoke composition, responsive choreography, and performance fallbacks.

## Implementation contract

Use stable keys in code:

```html
<html data-ark-theme="endfield" data-ark-depth="complex">
```

```jsx
<ArkShell theme="endfield" depth="complex" />
```

Keep family variables and depth variables separate. Family variables own ink, paper, signal, type, and geometry character. Depth variables own layer opacity/count, instrumentation coverage, motion availability, and optional decoration visibility.

Changing depth must not change semantic content or accessible names. Prefer CSS variables, root data attributes, and shared component variants over parallel duplicated page implementations.

## Validation scorecard

Review six axes at the representative viewport:

1. **Shell transformation** — native structure preserved, recomposed, system-wide, or bespoke by mode.
2. **Stage layering** — none/one, one/two, two/four, or four/six coherent systems.
3. **Component coverage** — critical controls only, shared majors, full shared set, or state-specific variants.
4. **State instrumentation** — selection cue, grouped status, system-wide real state, or composition-changing live state.
5. **Motion coordination** — direct only, reveal + direct, multiple coordinated families, or section-level choreography.
6. **Responsive recomposition** — safe stacking, shell adaptation, full re-art-direction, or mode-specific compositions.

The level is a holistic judgment. Do not average scores mechanically or add decorative elements merely to increase a score. A level fails if its extra depth reduces task clarity, truthful state visibility, accessibility, or performance beyond the product's budget.

## Escalation and reduction

To move up one level, add the next missing system with the highest information value: shell hierarchy, meaningful stage layer, shared component coverage, state integration, coordinated motion, or responsive recomposition. Validate before adding another.

To move down one level, remove the least informative persistent layer first. Preserve navigation, state, primary actions, focus, labels, and content. Never simulate minimalism by hiding necessary information or shrinking it below comfortable reading size.
