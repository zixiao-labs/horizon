# Ark UI design language

## Contents

- Shared grammar
- Composition
- Typography
- Color
- Geometry and texture
- Motion
- Components
- Accessibility
- Quality bar

## Shared grammar

The recurring Hypergryph family resemblance is not a single palette. It is a way of composing information and illustration:

1. **Stage plus instrumentation.** Let a full-bleed image, abstract scene, or large typographic field act as the stage. Dock navigation, status, actions, and metadata to edges as if they instrument the scene.
2. **Editorial hierarchy.** Mix one oversized display statement with small labels, indices, timestamps, and bilingual captions. Large and tiny text coexist; middle-sized filler is limited.
3. **System fiction.** Navigation and metadata feel like an operating system belonging to the fictional world. The fiction must still map to real product tasks.
4. **Asymmetric balance.** Use strong left/right or top/bottom weight, compensated by rules, negative space, and secondary rails.
5. **Controlled accent.** Most surfaces stay neutral. One signal color carries selection, progress, or action.
6. **Layered flatness.** Depth comes from masks, cropped artwork, translucent black, fine rules, blend modes, and overlapping type—not glossy cards.

## Composition

### Desktop

- Reserve 56–96px for a top bar or 64–96px for a side rail.
- Keep the primary art/content field uninterrupted; attach utilities to its perimeter.
- Use a large 60/40 or 70/30 split for hero content and operational controls.
- Anchor a display title to a baseline near the lower third or edge; pair it with compact metadata.
- Use 1px grid lines sparingly to establish coordinates. Never make every module a bordered card.
- Allow deliberate cropping of display type and illustration at viewport edges.

### Portrait

- Replace side rails with a compact top bar, bottom action strip, or disclosure menu.
- Recompose character/art layers; do not use desktop absolute coordinates scaled down.
- Keep primary action and title visible without overlap.
- Use vertical labels only as secondary decoration, never for essential instructions.

## Typography

Observed production families include Source Han Sans, Source Han Serif, Bender, Oswald, Novecento Sans Wide, Gilroy, Space Grotesk, Trajan, Sumerhan, and product-specific faces. Several have proprietary or unclear redistribution terms.

Use safe substitutes unless the project already licenses the observed face:

| Role | Safe stack |
|---|---|
| CJK UI | `"Noto Sans SC", "Source Han Sans SC", "PingFang SC", sans-serif` |
| Condensed display | `"Arial Narrow", "Roboto Condensed", "DIN Condensed", sans-serif` |
| Technical Latin | `"Space Grotesk", "IBM Plex Sans", system-ui, sans-serif` |
| Archival serif | `"Noto Serif SC", "Source Han Serif SC", serif` |
| Monospace data | `"IBM Plex Mono", "SFMono-Regular", Consolas, monospace` |

Rules:

- Use uppercase Latin for micro-labels and section names.
- Make display titles tight: roughly `line-height: .82–.95`, `letter-spacing: -.02em` to `-.08em`.
- Make micro-labels open: `letter-spacing: .08em–.18em`.
- Keep CJK body copy at normal tracking and comfortable line height.
- Pair primary CJK and secondary English on separate lines or a clear baseline; do not scatter gratuitous English.
- Use tabular numerals for indices, timers, coordinates, and counts.

## Color

Use semantic roles rather than copying every sampled hex.

| Family | Ink | Paper | Signal | Optional state |
|---|---|---|---|---|
| Ark | `#080a0b` | `#f4f6f6` | `#18d1ff` | `#c8eb21` |
| Endfield | `#191919` | `#f2f2f0` | `#fffa00` | `#00ffa2` |
| Ex Astris | `#080914` | `#f3f2ef` | `#46f6e6` | `#925dff` |
| POPUCOM | `#141414` | `#fffdf4` | `#ffcc1a` | `#3994ff` |
| Corporate | `#050505` | `#f3f3f3` | `#f3ff00` | none |

- Keep neutral surfaces above 75% of the composition.
- Use signal color for active state, progress, selected navigation, and one primary action.
- Do not use signal color as long body text on a light background.
- Prefer translucent black overlays (`.45–.88`) over glassy white cards on image stages.
- Test WCAG contrast for real text even when the reference site uses image-baked text.

## Geometry and texture

- Default radius: `0`; allowed functional radius: `2–4px`. POPUCOM may use pills and large rounded controls.
- Default border: `1px solid currentColor` or neutral alpha.
- Use 45° cuts, narrow slashes, corner brackets, and clipped wedges as directional cues.
- Use `clip-path` for reveal and silhouette, not to make every container irregular.
- Use masks to fade scroll regions and media edges into the stage.
- Use halftone, dot grids, paper grain, or diagram lines at low opacity. Generate original CSS/SVG textures.
- Use blend modes only when text remains readable and a fallback exists.
- Prefer custom line icons or a consistent open-source icon set; keep strokes 1.5–2px.

## Motion

Observed patterns include masked reveals, horizontal background rolls, clipped wipes, breathing signal blocks, short directional shakes, floating character layers, and 1.6–2s scroll hints.

- Use 180–350ms for direct interaction.
- Use 500–900ms for section reveals.
- Use 1.6–2.4s for restrained attention loops.
- Use `steps()` only for sprite-like or data-ticker effects.
- Move 4–16px for UI feedback; reserve larger travel for full-section transitions.
- Pause or remove nonessential loops under `prefers-reduced-motion: reduce`.
- Never rely on opacity-only fading for every state change; add direction or clipping where useful.

## Components

### Rail navigation

- Fixed edge rail with icon, compact label, active signal strip, and optional index.
- Active state must work without color alone: fill, indicator, label, or weight.

### Section title

- Large condensed title plus `NN / NN`, small bilingual subtitle, and a rule extending into negative space.
- Keep title content semantic HTML; decoration belongs in pseudo-elements/SVG.

### Technical panel

- Flat surface or transparent region with one strong edge, a header code, body content, and status line.
- Avoid four-sided rounded card chrome unless the product family is POPUCOM.

### Action button

- Ark/Endfield: square button, strong label, left signal bar or wedge, 1px outline.
- Ex Astris: outlined capsule or ringed control with fine orbital decoration.
- POPUCOM: pill or inflated capsule, thick outline, shadow/offset, animated arrows.

### Media grid

- Let cover art dominate. Use consistent crop ratios, terse metadata, and quiet hover overlays.
- Monster Siren is evidence for identity through varied cover systems held by a restrained black shell.

### Status strip

- Place version, connection state, coordinate, or task progress along an edge.
- Use real information; never invent meaningless telemetry to fill space.

## Accessibility

- Use semantic landmarks, buttons, links, headings, and lists.
- Preserve visible focus with a 2px signal outline plus offset.
- Give icon-only controls an accessible name.
- Keep interaction targets at least 40×40px.
- Do not bake necessary labels into background images.
- Provide alt text for meaningful art and empty alt for decoration.
- Ensure the initial view works with scripts disabled when practical.
- Respect reduced motion and avoid autoplay audio.

## Quality bar

An Ark UI result should pass these questions:

1. Is the information architecture legible before the decoration is noticed?
2. Does one family clearly lead the design?
3. Does every line, code, label, and animation have a role?
4. Is the composition asymmetric yet balanced?
5. Are the signal color and display typography restrained enough to remain powerful?
6. Does portrait layout look recomposed rather than shrunk?
7. Is the output original and free of copied proprietary assets?
