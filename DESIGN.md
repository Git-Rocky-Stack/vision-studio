# Design System — Vision Studio (desktop app)

**Aesthetic direction:** Carbon Pro Workshop (Instrument-Grade)
**Status:** Canonical · governs all UI work in this app
**Mirrors:** `Vision-Studio-X-website` DESIGN.md (Carbon Pro Workshop). The website is the *showroom*; this app is the *instrument*. Typography, palette, depth system, motion envelopes, and the hardware primitive vocabulary are shared.
**Source of truth in code:** `src/index.css` (`@theme` tokens + hardware-language layer) and `src/fonts.ts` (bundled IBM Plex).

> The website and app share the Carbon Pro palette by design — the website was originally recolored to match this app's tokens. This document records the reverse pass: the app now also inherits the website's **typography** (IBM Plex), **machined radii**, **hardware motion envelopes**, and the **four-layer raised-hardware depth system**.

---

## Product Context

- **What this is:** Vision Studio is a professional AI image and video generation desktop app (Electron) that runs entirely on the user's GPU. FLUX.1, SDXL, SD 1.5, LTX Video, Stable Video Diffusion, AnimateDiff. No cloud, no subscription, no usage caps.
- **Who it's for:** Creators with serious GPU rigs who want a polished, local-first console — the "I run my own ComfyUI but want professional gear" audience.
- **Project type:** Electron 33 + React 19 + TypeScript + Vite + Tailwind CSS v4. Dockview panel workspace, Konva canvas, Framer Motion, Zustand.
- **Memorable thing:** *"This isn't software. It's professional gear that happens to run on my machine. Built like a CDJ-3000."*

**App vs website (instrument vs showroom):** The website is a marketing surface you glance at; the app is a dense tool you operate for hours. The app inherits the *visual language* — IBM Plex type, mono-UPPERCASE labels, machined edges, hardware depth, mechanical motion, chrome accent — but applies hardware primitives (faceplates, LEDs, LCDs, VU meters) in service of real tool functions, never as decoration. Information density and usability win every tie.

---

## Typography

**IBM Plex family, bundled locally** via `@fontsource` in `src/fonts.ts` — never Google CDN at runtime (this is a local-first, offline-capable app). All weights SIL OFL.

| Role | Family | Token | Weights |
|------|--------|-------|---------|
| **Display** (heroes, big instrument labels, ≥48px) | **IBM Plex Sans Condensed** | `--font-cond` / `--font-family-cond` | 400 / 500 / 600 / 700 |
| **Body, headings & UI** | **IBM Plex Sans** | `--font-sans` / `--font-family-ui` | 300 / 400 / 500 / 600 / 700 |
| **Mono / data / UI labels** | **IBM Plex Mono** | `--font-mono` / `--font-family-mono` | 400 / 500 / 600 |

Only the `latin` + `latin-ext` subsets are bundled (mono is latin-only). The clean build ships a fixed set of woff2 with zero CDN references.

**Type utilities (in `index.css`):**
- `.display-xl` — Cond 84/88 · -2.5px · 600 (largest hero)
- `.display-lg` — Cond 64/68 · -1.8px · 500
- `.display-md` — Cond 48/52 · -1.0px · 500
- `.cond-display` — Cond 600 · -1.5px · lh 0.95 (generic condensed display)
- `.mono-label` — **Mono 11px UPPERCASE · +0.66px** — every UI label, badge, readout kicker
- `.data-mono` — Mono 12px — inspector values, metadata, LCD content

The app's existing `--font-size-*` rem scale and `.type-*` utilities remain for body/heading flow.

**Rules:**
- UI labels, status readouts, parameter values, metadata, and any LCD content are **always Mono**. Use `.mono-label` (it sets its own transform/tracking, so it is immune to the global `.uppercase`/`.tracking-*` resets the app applies elsewhere).
- Type ≥48px is **always Sans Condensed** (`.display-*` / `.cond-display`).
- Body and headings are Sans (the default body font is now IBM Plex Sans).

**Never use** as primary fonts: Inter, Roboto, Arial, Helvetica, Open Sans, Lato, Montserrat, Poppins, Space Grotesk, system-ui, `-apple-system`. (DM Sans / Instrument Sans / JetBrains Mono were the app's previous fonts — fully replaced.)

---

## Color — Carbon Pro Palette

Single accent: **chrome (`#E6E6E6`)** — not a hue. AMOLED-tuned cool neutrals everywhere; chromatic energy lives only in semantic LEDs. Already shared verbatim with the website.

The app's **canonical token names** are kept (the `carbon-pro-tokens.test.ts` contract depends on them). The website's hardware vocabulary is aliased on top in `index.css` so primitives port cleanly.

| App token (canonical) | Hex | Website alias | Use |
|---|---|---|---|
| `--color-void` | `#000000` | `--color-void` | OLED black, page/LCD bg |
| `--color-canvas` | `#050505` | `--color-carbon-950` | Canvas |
| `--color-surface` | `#0d0d0d` | `--color-carbon-900` | Surface |
| `--color-panel` | `#101010` | `--color-carbon-850` | Panel base |
| `--color-elevated` | `#141414` | `--color-carbon-800` | Elevated surface |
| `--color-panel-raised` | `#1a1a1a` | `--color-carbon-750` | Raised panel / modal |
| `--color-accent-primary` | `#e6e6e6` | `--color-chrome` | Primary CTA, focus ring, brand |
| `--color-accent-primary-hover` | `#ffffff` | `--color-chrome-bright` | Hover |
| `--color-accent-primary-pressed` | `#b8b8b8` | `--color-chrome-pressed` | Active |
| `--color-text-primary` | `#f5f5f5` | `--color-platinum` | Primary text |
| `--color-text-body` | `#b3b3b3` | `--color-silver` | Body text |
| `--color-text-muted` | `#888888` | `--color-silver-mute` | Tertiary text |
| `--color-border` | `rgba(255,255,255,0.08)` | `--color-hairline` | Default border |
| `--color-border-hover` | `rgba(255,255,255,0.16)` | `--color-hairline-strong` | Prominent border |

**LED palette (Pioneer-DJ semantic)** — aliased to the app's status/capability tokens. Render with `.led-glow` (`box-shadow: 0 0 8px currentColor`). Use only as pinpoint indicators / state badges, never as text or background fills.

| Website LED | App source token | Hex | Meaning |
|---|---|---|---|
| `--color-led-rec` | `--color-status-error` | `#ef4444` | REC, destructive, error |
| `--color-led-cue` | `--color-status-warning` | `#eab308` | Cue, warning, pending |
| `--color-led-play` | `--color-status-success` | `#22c55e` | Play, success, OK |
| `--color-led-jog` | `--color-status-info` | `#38bdf8` | Info, image capability |
| `--color-led-fx` | `--color-capability-edit` | `#e879f9` | Edit / FX |
| `--color-led-time` | `--color-capability-video` | `#f59e0b` | Video / render / clock |

**Capability colors** (`--color-capability-image/video/edit/local/cloud`, also aliased as `--color-cap-*`) tag model/runtime pipelines and are shared with the website.

### Theme policy

**Dark is canonical.** Unlike the website (dark-only), the app **retains its working light theme** (`[data-theme='light']`) — it is a shipped feature and stays functional. Because typography, radii, and motion are theme-independent tokens, the light theme inherits IBM Plex + machined edges + hardware motion automatically.

**Hardware primitives stay dark in both themes.** A `.raised-panel`, `.btn-chrome`, LCD, or VU meter is a physical instrument surface — it renders in carbon/chrome regardless of theme, exactly as a CDJ is black in a bright room. Do not attempt to "light-mode" the hardware recipes.

---

## Spacing

The app's **8-point `--space-*` grid** is retained (4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80 / 96). Do **not** introduce `--spacing-*` tokens — Tailwind v4 would generate conflicting spacing utilities and `tailwind-source.test.ts` enforces this. (The website's Fibonacci `--spacing-1..7` cadence is *not* mirrored, for this reason.) Density is **professional compact**.

---

## Border Radius — machined plate

Sharp, mirroring the website. The legacy `--radius-*` scale is re-pointed to machined values so existing components sharpen automatically.

```css
--radius-card:    2px;   /* faceplates, panels, cards */
--radius-control: 4px;   /* buttons, inputs, pads, switches */
--radius-overlay: 8px;   /* modals, dropdowns — the only soft surface */
--radius-pill:    9999px;/* chips, LED dots, avatars */
/* legacy re-pointed: sm 2 · md 4 · lg 6 · xl 8 · 2xl 8 · 3xl 10 · 4xl 12 · full 9999 */
```

**Rule:** never a uniform 16px. The varied, sharp hierarchy is itself anti-slop signal.

---

## Motion — hardware envelopes

Mechanical, click-detent. No floating blobs, no gradient drift, no decorative shimmer. All collapse to instant under `prefers-reduced-motion` (already globally enforced in `index.css`).

```css
--ease-click:  cubic-bezier(0.45, 0.05, 0.55, 0.95);  --duration-click:  80ms;
--ease-snap:   cubic-bezier(0.32, 0.72, 0,    1);      --duration-snap:  120ms;
--ease-glide:  cubic-bezier(0.16, 1,    0.3,  1);      --duration-glide: 240ms;
--ease-settle: cubic-bezier(0.34, 1.56, 0.64, 1);      --duration-settle:380ms;
--ease-vu:     cubic-bezier(0.2,  0.85, 0.15, 1);      --duration-vu-attack/release: 300ms;
--ease-led:    cubic-bezier(0.2,  0.7,  0.3,  1);      --duration-led-on: 80ms / led-off: 240ms;
--ease-decay:  cubic-bezier(0.4,  0,    0.6,  0.4);    --duration-meter: 600ms;
--ease-meter:  cubic-bezier(0.4,  0,    0.2,  1);
```

The app's legacy `--duration-fast/normal/slow/slower` remain for existing components.

---

## Four-Layer Raised-Hardware Depth System

The single most identity-bearing technique beyond color and type. Every major surface declares **one** depth layer — never mix raised and recessed shadows on the same element.

| Layer | Utility | What it is |
|-------|---------|------------|
| 0 · Chassis | (page bg) | Flat carbon. No shadow. |
| 1 · Raised faceplate | `.raised-panel` | Section panels proud of the chassis. Edge-light strip + corner key light baked in via `::before`/`::after`. |
| 2 · Recessed well | `.recessed-well` | Inner containers carved into the faceplate (LCD wells, tables, fader slots). |
| 3 · Raised control | `.raised-control` | Buttons, pads, caps that sit on a well. |
| CTA | `.btn-chrome` | Primary action — polished metal cap gradient (not a hue gradient). |

Supporting utilities: `.faceplate-stripe` (brushed-aluminum header material), `.hex-bolt` + `.tl/.tr/.bl/.br` (stout machined socket-cap bolts for faceplate corners), `.led-glow`, `.instrument-scanline` (opt-in display texture). Recipes are copy-paste ready in `index.css` and documented at length in the website DESIGN.md `§Raised Hardware Depth System`.

---

## Component Vocabulary

Hardware primitives live in `src/components/hardware/`. Each must do **real work** — drive a parameter, show real state, trigger an action. Cosplay-only primitives are anti-slop.

Ported / available: `MonoLabel`, `Led`, `SegmentLcd`, `Faceplate` (with `HexBolt`), `ChromeButton`. Extend from the website's library (`Knob`, `RockerSwitch`, VU meters, `JogWheel`, etc.) as real tool needs arise — port deliberately, wired to actual state.

---

## Iconography

**The app uses `lucide-react`.** This is a deliberate divergence from the website (which is intentionally icon-free / Phosphor-only). Lucide is the app's established icon system; keep it. Use a consistent stroke weight. (`ui-glyphs.test.ts` forbids emoji in app chrome — use lucide icons, never emoji.)

---

## Anti-Slop Validation

- ❌ NO Inter / Roboto / Arial / Helvetica / Open Sans / Lato / Montserrat / Poppins / Space Grotesk / system-ui / `-apple-system` as primary fonts
- ❌ NO purple-violet decorative gradients, indigo `#6366f1`, or cyan-blue Vercel accents
- ❌ NO 3-column feature grid with icons in colored circles
- ❌ NO uniform 16px border-radius (use the machined scale)
- ❌ NO hue-gradient CTAs (the chrome button is a metal-cap gradient — different semantics)
- ❌ NO softened dark `#0f0f11` — the app uses true black `#000000`
- ❌ NO flat-shadow components — every surface declares a depth layer; never mix inset directions on one element
- ❌ NO purely decorative hardware primitives — every knob/pad/VU/LCD must drive real state
- ❌ NO emoji in UI chrome (use lucide)
- ❌ NO Google Fonts / CDN at runtime — fonts are bundled

Re-validate on every UI change. Drift toward AI-default is a real risk in the AI-tools category specifically.

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-29 | Mirror the Vision-Studio-X website design language into the app | User request: the website launched with new typography + primitives; the app should mirror its typography and aesthetic. Scope chosen: **full hardware maximalism** (visual grammar + hardware primitives), with the **light theme kept and restyled** (dark canonical). |
| 2026-05-29 | Adopt IBM Plex (Cond/Sans/Mono), bundled locally via `@fontsource` | Mirrors website typography. Bundled (not Google CDN) because the app is local-first/offline/privacy-first; previous `local()`-only @font-face had no guaranteed font. Clean build ships latin/latin-ext woff2, zero CDN refs. |
| 2026-05-29 | Sharpen radii to machined 2/4/8 + add hardware motion envelopes + 4-layer depth system | Done at the token/utility layer so the entire existing app re-types in IBM Plex and sharpens automatically, with depth/motion primitives available for hardware surfaces. |
| 2026-05-29 | Keep canonical app token names; alias website vocabulary on top | `carbon-pro-tokens.test.ts` depends on `--color-void/canvas/accent-primary/...`. Website `chrome/carbon/silver/led/cap` names are aliased in `index.css` so ported primitives work verbatim without breaking the token contract. |
| 2026-05-29 | App keeps `lucide-react`; light theme retained | Divergences from the website (icon-free + dark-only). Lucide is the app's shipped icon system; the light theme is a shipped feature. Both stay; documented above. |

---

**This document is the source of truth for the app.** Where it is silent, fall back to the website `Vision-Studio-X-website/DESIGN.md` (the Carbon Pro Workshop progenitor). Where the app deliberately diverges (canonical token names, retained light theme, lucide icons, `--space-*` grid), the app wins.
