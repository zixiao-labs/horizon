# Source ledger

Research pass: 2026-07-20 (Asia/Shanghai). Re-check live sources before making time-sensitive claims.

## Contents

- Scope and confidence
- Official visual surfaces
- Production asset manifest
- Official commentary and recruiting
- GitHub search findings
- Derived observations

## Scope and confidence

- **Direct**: observed in the rendered official page or its publicly loaded production CSS/JS.
- **Supported**: stated by an official/verified company channel or official recruiting site.
- **Inference**: interpretation derived from repeated direct observations; not a company statement.

No source map, private endpoint, credential, or non-public repository was accessed.

## Official visual surfaces

| Surface | URL | What was directly observed |
|---|---|---|
| Hypergryph corporate | https://www.hypergryph.com/ | Monochrome full-screen art, translucent charcoal header, black information panels, acid-lime hover/rules, React 18.2 runtime, hashed CSS/JS |
| Arknights CN | https://ak.hypergryph.com/ | Black top navigation, cyan active state, full-bleed blueprint/character stage, right download dock, oversized lower title, Next.js/React/Swiper patterns |
| Arknights news | https://ak.hypergryph.com/news | Editorial list, dates and category filters, bilingual section labels, section indices |
| Arknights 1st anniversary | https://ak.hypergryph.com/special/anniversary/index.html | Cyan/white hero, layered character cutouts, oversized cropped display type, black halftone footer, lime baseline |
| Arknights 3rd anniversary | https://ak.hypergryph.com/special/3rd-anniversary/index.html | Warm ivory/gold/orange editorial framing, cinematic character stage, fine horizontal banding, serif/sans contrast |
| Arknights recruitment special | https://ak.hypergryph.com/special/recruitment/ | Company/game chronology and recruiting presentation tied to the Arknights visual language |
| Endfield CN | https://endfield.hypergryph.com/ | Pale vertical rail, white/charcoal/yellow shell, segmented key art, docked platform actions, large section identifiers, Next.js App Router/CSS Modules/Swiper patterns |
| Endfield operators | https://endfield.hypergryph.com/operator | Indexed character catalog, class/element filters, bilingual name labels, page progress |
| Ex Astris CN | https://exa.hypergryph.com/ | Midnight full-bleed composition, slim left navigation, outlined orbital controls, serif narrative typography, aqua/violet signals, Next.js/CSS Modules |
| POPUCOM CN | https://popucom.hypergryph.com/ | Dark dotted top bar, blue/yellow/orange illustrated field, rounded arrowed action capsules, floating character layers, Next.js/CSS Modules |
| Monster Siren Records | https://monster-siren.hypergryph.com/music | Restrained black music shell, content-led cover grid, API-updated releases, Umi production bundle |
| Terra Historicus | https://terra-historicus.hypergryph.com/ | Official comic/reading surface; useful for editorial pacing and content-first presentation |
| SKLAND | https://www.skland.com/ | Official community/product UI; search, feeds, product switching, and functional UI beyond campaign sites |
| Hypergryph careers | https://career.hypergryph.com/ | Contemporary recruiting brand, image-led storytelling, current company voice and role taxonomy |
| Gryphline products | https://www.gryphline.com/en-us/products/endfield | International publishing presentation and cross-product identity context |

## Production asset manifest

SHA-256 and decoded byte size were computed from HTTP responses on 2026-07-10. These files are evidence pointers, not bundled dependencies.

| SHA-256 | Bytes | Last-Modified | Public production asset |
|---|---:|---|---|
| `888ea1be139d3fb91399ced088fcce93c21627cea3f191986eceb6e10d3ef89a` | 47,680 | 2026-01-22 | https://web-ipv6.hycdn.cn/hypergryph/official/index.a0435f.css |
| `0f13cadea5dc01d24a62462ffcbc9e4ff8949827911651bec58bf3a4b726f5d5` | 332,550 | 2026-01-22 | https://web-ipv6.hycdn.cn/hypergryph/official/index.7c7ad8.js |
| `9137c0c84331633bfc53321a5b38fb398a2c09642488709ae0480fe0a24a99e8` | 45,240 | 2026-02-09 | https://web.hycdn.cn/arknights/official/_next/static/css/131005b7044cc903.css |
| `55b9681174b545b4b5fbabcc0127afd76a7fe753c2ce0a9ce302a8ea56f7c380` | 107,343 | 2026-02-09 | https://web.hycdn.cn/arknights/official/_next/static/css/3759d2520092f84b.css |
| `4df7e8fab2bbf2fca0d42fb1a99b8e2aa69612ca9fba4290f8775bbab6184720` | 106,744 | 2025-04-10 | https://web.hycdn.cn/arknights/special/anniversary/assets/anniversary.5abd8743.css |
| `ec36f1bfa6401017fcef07f6e0b9011799ec9817cd2e6fb20784bc6c42a5ef74` | 1,958,012 | 2025-04-10 | https://web.hycdn.cn/arknights/special/anniversary/assets/anniversary.d0cb08e5.js |
| `b6df66a3e8f908a02d429d495f31a442d15a3f0164c6f957df4346b41e8fd754` | 581,639 | 2025-04-10 | https://web.hycdn.cn/arknights/special/3rd-anniversary/3rd-anniversary.af19ae33.css |
| `59971cd530202027f29b412ff95d47ee770c8f58df0bfb746d610d1ea9db8eef` | 1,028,522 | 2025-04-10 | https://web.hycdn.cn/arknights/special/3rd-anniversary/3rd-anniversary.a2d54764.js |
| `b25f6cbbc3a0b1954de05bde3689f80e7a077eff8a02e84a1052c12bffe37724` | 99,716 | 2026-06-12 | https://web.hycdn.cn/endfield/official-v4/_next/static/css/db2d67bd9997cf37.css |
| `27664fa18d04b1a9b35348a763a45b6a480f1bb57a48b6aa8b0fd61acf4af1c7` | 7,668 | 2026-07-07 | https://web.hycdn.cn/endfield/official-v4/_next/static/css/4e376ab6096d83c7.css |
| `26885dc0821a3667028d28be0ff76e88433dfa305d69ba69ec434f0cea223f5c` | 34,291 | 2025-04-24 | https://web.hycdn.cn/exastris/official-v2/_next/static/css/afa39c2389d3e32e.css |
| `2adc174e1ddfe29a75de2ae161df2d32faa82fc2cdbc8fda2f4dd602363a4302` | 105,545 | 2025-04-24 | https://web.hycdn.cn/exastris/official-v2/_next/static/css/2adc512da22068ed.css |
| `9d348cd321890bfa253ccdabf9153a1651be8772bcf698b01746f0147cb1075d` | 12,136 | 2025-12-12 | https://web.hycdn.cn/popucom/official-v2/_next/static/css/6649633ecf91f25d.css |
| `1d30ea94f180e01a9af66fd01114e08c54125a1d2fd6642a5e70c4e019d45eab` | 100,571 | 2025-12-12 | https://web.hycdn.cn/popucom/official-v2/_next/static/css/65a96b931171e4ec.css |
| `5b20c209c6838e0b44202d02ed2ff7684963730c91cc50356dd8f8cac5ee2f79` | 113,428 | 2023-09-19 | https://web.hycdn.cn/siren/site/umi.62693412.css |
| `a9dff67b5afac2b0a1595997c24050469a27212d1f5b3a081fa5d57790e3fb4e` | 1,333,598 | 2023-09-19 | https://web.hycdn.cn/siren/site/umi.87fedd26.js |

### Direct token samples

- Corporate CSS: `#000`, `#fff`, `#333`, `#f3ff00`; Source Han Sans, Geometos, Bender; blurred charcoal header and black panels.
- Arknights current CSS: dominant `#000`, `#fff`, `#18d1ff`; Bender, Oswald, Novecento Sans Wide, Source Han Sans; masks, mix-blend overlays, 7rem section labels, orientation-specific layout.
- Endfield CSS: dominant `#191919`, `#fff`, `#fffa00`; optional `#00ffa2`; Gilroy, Space Grotesk, Novecento Sans Wide; clip paths, yellow load wipe, vertical rail, large identifiers.
- Ex Astris CSS: dominant `#000`, `#fff`, `#46f6e6`; optional `#925dff`; Source Han Serif, Source Han Sans, Sumerhan, Trajan; orbital rotation, sprite-step texture, masked tickers.
- POPUCOM CSS: `#3994ff`, `#ffa800`, `#ffcc1a`, `#3a5dad`, `#fff`; heavy CJK sans and product face; 2s floating layers, bouncing feedback, rounded capsules.

### 2026-07-20 live verification

- Arknights CN still exposes the black edge shell, cyan active state, bilingual indexed navigation, current news categories, and an operator/world/media hierarchy. Its main production stylesheet still matches SHA-256 `55b9681174b545b4b5fbabcc0127afd76a7fe753c2ce0a9ce302a8ea56f7c380`, with `#000`, `#fff`, and `#18d1ff` dominant, 14 mask declarations, 8 blend-mode declarations, and six keyframe families.
- Ex Astris still presents a journey/character/world/news archive. Its main production stylesheet still matches SHA-256 `2adc174e1ddfe29a75de2ae161df2d32faa82fc2cdbc8fda2f4dd602363a4302`, with serif-led typography, 44 mask declarations, orbital/point/glint keyframes, and aqua accents used sparingly against white and midnight surfaces.
- POPUCOM now presents release, platform, news, login, game-room, and showroom actions. Its main production stylesheet still matches SHA-256 `1d30ea94f180e01a9af66fd01114e08c54125a1d2fd6642a5e70c4e019d45eab`, with blue as the dominant structural color, yellow/orange as action signals, rounded actions, floating layers, bounce feedback, and rolling button backgrounds.
- Hypergryph corporate and recruiting pages continue to use image-led storytelling, sparse project/career navigation, monochrome panels, translucent dark headers, and `#f3ff00` as a restrained active signal. The corporate stylesheet still matches SHA-256 `888ea1be139d3fb91399ced088fcce93c21627cea3f191986eceb6e10d3ef89a`.

## Official commentary and recruiting

| Source | Evidence |
|---|---|
| https://www.sina.cn/news/detail/5215896102241360.html | Mirror of a verified Hypergryph Weibo post dated 2025-09-28 introducing UI designers 栊一水又、阿树、AZE、阿福 and a company discussion of how its game and external UI are created. Supported fact: UI is discussed as a cross-product craft by named internal designers. |
| https://www.bilibili.com/opus/1094593447877148672 | “鹰角网络 LOGO 设计杂谈,” part of the official “何以鹰角” communication series. Supported context for identity-system thinking. |
| https://career.hypergryph.com/ | Official recruiting site. Supported fact: interaction design and visual/game UI roles are distinct disciplines within current hiring taxonomy. |
| https://career.hypergryph.com/we-are-at-hypergryph | Official company culture and creative-development context. |
| https://www.nowcoder.com/jobs/detail/413535 | Third-party mirror of a senior game UI role. Treat exact wording as secondary evidence; it describes designing UI screens, icons, and materials to match an art direction. |

Do not treat fan video essays, Behance redesigns, or secondary job mirrors as official design rules.

## GitHub search findings

### Identity correction

- `https://github.com/HyperGryph` has one repository, `HyperGryph/hyperloop`, described as University of Guelph's Hyperloop Team Software. It is unrelated to Shanghai Hypergryph Network Technology. This prevents a common false attribution.
- `https://github.com/gryphline` had no public repositories in the research pass.

### Community repositories

| Repository | Commit inspected | License | Decision |
|---|---|---|---|
| https://github.com/Yue-plus/nextjs-starter-arknights | `18f51aa05d3d0131f8710113b47af3631724f77a` | MIT | Useful community Next.js theme reference. Not official; assets still require independent rights review. Not copied into this skill. |
| https://github.com/mikezw/msrplayer | `9cc17342e6170dba848bcd91ffd311f6e8b3c0cb` | MIT | Useful Monster Siren API/player integration reference. Not official; not a source for company UI ownership. |
| https://github.com/khanhn201/monster-siren-download | `b6f4bc3520cac718d4800581dda6d0f4c63e2c86` | MIT | Documents public Monster Siren data access patterns; not a UI source. |
| https://github.com/sayuriu/endfield | `c576b7c27f592102da4618a6080f7cd9bbc3d62a` | no detected license | Fan-made site. Do not copy. |
| https://github.com/Jet-Fighters/cyber-music | `5228c2a475ceafe757c224d4f17057d5607f7b1f` | no detected license | Fan-made Monster Siren imitation. Do not copy. |

Search results contain many downloaders, game-data tools, launchers, and fan themes. Public availability does not make them official or grant rights to bundled Hypergryph assets.

## Derived observations

These are inferences supported by repeated official surfaces:

1. The stable cross-product identity lies in information hierarchy, edge docking, bilingual micro-labels, and controlled accent—not one fixed color palette.
2. Each title is allowed a strong sub-identity: industrial cyan, field yellow, cosmic aqua, or playful blue/yellow.
3. Production marketing sites favor media-heavy full-screen sections and extensive portrait-specific styling.
4. Technical credibility comes from real layout structure, state, and restrained metadata, not random HUD decoration.
5. The company repeatedly uses custom/display fonts, but redistribution should use licensed substitutes.
