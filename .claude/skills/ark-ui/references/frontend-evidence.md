# Frontend implementation evidence

## Contents

- Evidence boundaries
- Observed stacks
- Reusable implementation patterns
- Responsive architecture
- Production recommendations
- What not to copy

## Evidence boundaries

The official public sites expose production HTML, CSS, JavaScript bundles, media URLs, and framework fingerprints to every browser. They do not expose a licensed source repository. Treat bundle analysis as implementation evidence, not permission to redistribute the bundles.

The code in `assets/` is an original clean-room implementation based on high-level observations. It is not Hypergryph source code.

## Observed stacks

| Surface | Direct observation | Confidence |
|---|---|---|
| Hypergryph corporate site | React 18.2 production runtime, CSS bundle, Tiny Slider-style carousel code, hashed CDN assets | high |
| Arknights current CN site | Next.js app chunks, React, CSS modules/hashed classes, Swiper CSS/runtime patterns | high |
| Arknights 1st/3rd anniversary | standalone hashed JS/CSS bundles, media-heavy layered pages, responsive orientation rules | high |
| Endfield CN v4 | Next.js App Router chunk paths, CSS modules, Swiper, section-scrolling architecture | high |
| Ex Astris v2 | Next.js app chunks, CSS modules, horizontal/section switchers, sprite-step animation | high |
| POPUCOM v2 | Next.js App Router chunks, CSS modules, interactive mini-game/shop surfaces | high |
| Monster Siren Records | Umi production bundle, API-driven cover grid/music surface | high |

Do not infer the company's internal game UI stack from marketing websites. These observations only cover public web frontends.

## Reusable implementation patterns

### 1. Theme tokens

Use semantic custom properties and switch families at a root attribute:

```css
[data-ark-theme="endfield"] {
  --ark-ink: #191919;
  --ark-paper: #f2f2f0;
  --ark-signal: #fffa00;
  --ark-state: #00ffa2;
}
```

Keep component selectors independent from literal family colors.

Keep application depth on a separate root attribute. Depth changes coverage and orchestration, not the family palette:

```css
[data-ark-depth="minimal"] {
  --ark-stage-layer-opacity: .18;
  --ark-instrument-shadow: none;
}

[data-ark-depth="complex"] {
  --ark-stage-layer-opacity: .68;
  --ark-instrument-shadow: .4rem .4rem 0 color-mix(in srgb, var(--ark-ink), transparent 86%);
}
```

Use the stable keys and complete rubric in [depth-levels.md](depth-levels.md). Avoid duplicating whole pages for each depth; prefer variables, optional bounded decoration, shared component variants, and state-driven composition.

### 2. Edge-instrumented shell

Use CSS Grid rather than dozens of viewport-specific absolute values:

```css
.ark-shell {
  min-block-size: 100svh;
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  grid-template-rows: 4.5rem minmax(0, 1fr);
}
.ark-rail { grid-row: 1 / -1; }
.ark-topbar { grid-column: 2; }
.ark-stage { grid-column: 2; min-width: 0; }
```

Use absolute positioning only inside a bounded stage for art direction.

### 3. Masked reveal

Production sites repeatedly use masks and clip paths. Recreate the behavior with accessible content remaining in the DOM:

```css
.ark-reveal {
  clip-path: inset(0 100% 0 0);
  transform: translateX(-12px);
  transition: clip-path .65s cubic-bezier(.22,.8,.2,1), transform .65s;
}
.ark-reveal[data-visible="true"] {
  clip-path: inset(0);
  transform: none;
}
```

### 4. Section title and ruled metadata

Build large title, index, and rule as separate elements. Avoid image-baked typography:

```html
<header class="ark-section-title">
  <p class="ark-kicker">FIELD OPERATIONS / 01</p>
  <h2>Signal Archive</h2>
  <span class="ark-rule" aria-hidden="true"></span>
</header>
```

### 5. CSS/SVG textures

Generate original textures:

```css
.ark-grid {
  background-image:
    linear-gradient(rgb(255 255 255 / .08) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / .08) 1px, transparent 1px);
  background-size: 4rem 4rem;
}
```

For halftone or diagram art, use an inline SVG with `currentColor`, low opacity, and `pointer-events:none`.

### 6. Progressive motion

- Use IntersectionObserver for section reveals.
- Use CSS transitions for direct interaction.
- Use requestAnimationFrame only for motion that cannot be expressed in CSS.
- Pause offscreen media and loops.
- Use a reduced-motion media query to disable continuous movement.

### 7. Responsive orientation

The official sites include extensive portrait-specific rules rather than only width breakpoints. Use both:

```css
@media (max-width: 760px), (orientation: portrait) {
  .ark-shell { grid-template-columns: 1fr; grid-template-rows: auto 1fr auto; }
  .ark-rail { position: static; grid-row: 3; flex-direction: row; }
}
```

Avoid locking `html` overflow unless implementing a tested, keyboard-accessible section scroller.

## Production recommendations

- React/Next.js: keep visual family in CSS modules or a token layer; do not put every coordinate inline.
- Vue/Svelte: use the same semantic component boundaries; no framework-specific behavior is required.
- Static/event pages: prefer dependency-free HTML/CSS/JS when the page is mostly presentation.
- Use modern `svh`, `dvh`, `clamp()`, container queries, and logical properties where project support allows.
- Lazy-load large media; use `picture`, AVIF/WebP, explicit dimensions, and appropriate `object-position`.
- Keep text as text. Official marketing pages sometimes rely on image assets for title art; production apps should not repeat that accessibility tradeoff.
- Preload only the display font actually used above the fold. Prefer licensed open fonts or system fallbacks.
- Use a real routing and focus-management strategy for fullscreen sections.
- Add visual regression screenshots at desktop and portrait breakpoints.

## What not to copy

- Hashed production CSS/JS bundles from `web.hycdn.cn` or `web-ipv6.hycdn.cn`.
- Logos, key art, character PNGs, video, QR codes, age-rating marks, or proprietary icon sheets.
- Embedded fonts with unclear or proprietary licenses.
- Private API endpoints, auth logic, tokens, or telemetry.
- Minified class names and exact layout coordinates; these are implementation artifacts, not a design system.

The source ledger records URLs so a future agent can verify facts against the live public site without shipping those resources.
