# Provenance and reuse policy

## Categories

### A. Official public production evidence

HTML, CSS, JavaScript, images, fonts, and media loaded by official Hypergryph sites are public to a browser but are not automatically open source. Use them to verify framework choice and derive high-level design facts. Do not bundle or redistribute them without a license or user-provided rights.

### B. Official open-source code

No verified official Hypergryph GitHub organization or licensed frontend repository was found during the July 2026 research pass. The GitHub user `HyperGryph` is an unrelated University of Guelph Hyperloop team. Do not attribute its repository to the game company.

### C. Community open source

Community repositories may be useful for general integration or inspiration only after checking the repository owner, current license, included assets, and attribution requirements. A repository license does not grant rights to third-party game art embedded in it.

### D. Clean-room bundled code

All code under this skill's `assets/` and `scripts/` is newly written from high-level observations. It intentionally excludes official logos, character art, media, production bundles, and fonts.

## Required behavior

- Say “Hypergryph-inspired” or “evidence-based family resemblance,” not “official Hypergryph UI,” unless the user is working on authorized official material.
- Preserve third-party license notices when copying licensed community code.
- Prefer original CSS/SVG textures and user-owned imagery.
- Use open fonts or system fallbacks; verify licenses before bundling any font file.
- Do not fetch or expose auth tokens, cookies, private APIs, source maps, or non-public endpoints.
- Record direct observation separately from inference.
- If the user supplies official assets, confirm they have the right to use them when redistribution is involved.

## Practical source decision

1. Is it user-owned or explicitly licensed for reuse? If yes, use within license.
2. Is it an official production asset without a reuse license? Cite and analyze; do not bundle.
3. Is it a community repo with a compatible license? Inspect every copied file and its embedded assets.
4. Is licensing unclear? Reimplement the pattern from scratch.
