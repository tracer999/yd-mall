---
name: figma-design
description: Figma design system reference (getdesign.md analysis) for building bold, joyful, color-blocked editorial UIs. This skill should be used when creating or restyling UI that should feel vivid and striking — a monochrome black/white frame interrupted by big saturated pastel color-block panels + a hot magenta accent — or when the user mentions "Figma 스타일", "figma design", "화려하게", "컬러블록", or asks to make a UI more colorful/vivid.
---

# Figma Design System

Design-token reference distilled from Figma's marketing site (getdesign.md analysis,
`references/DESIGN.md`). Use it to make UI **vivid and joyful without being noisy** — the opposite
of a single-accent minimal system. Vividness comes from **color-block section panels**, not scattered color.

## The core idea (read this first)
A rigorously **monochrome frame** — pure white canvas, pure black ink, black/white pill CTAs,
`figmaSans` (→ **Inter**) type — is **interrupted by oversized saturated pastel color BLOCKS**.
Each story section drops the page into a lime / lilac / cream / mint / pink / coral / navy panel that
reads like a sticky note on a clean desk. One hot **magenta `#ff3d8b`** accent for promos/badges.

## Workflow
1. **Read `references/DESIGN.md` first** — full tokens (colors, type at fine weights, radii, spacing,
   30+ components), color-block usage, layout, elevation. Do not restyle from memory.
2. Map the color blocks to SECTIONS (each major section = one saturated panel, rounded 24px,
   flat, generous margins, black editorial type inside). Return to white canvas between panels.
3. Verify against the Core Rules below.

## Core Rules (the identity)
- **Color-block panels are the primary depth device** — not shadows. Each section sits on a big
  saturated pastel block (`--block-*`), rounded `24px`, full-bleed inside, flat (no border/shadow).
  Alternate hues down the page; return to white between.
- **Monochrome type**: black ink on light blocks (weight, not gray, carries hierarchy — body at
  weight 320–340, emphasis at 480–540). White ink on `navy`/inverse panels.
- **Hot accent**: magenta `#ff3d8b` used sparingly for promo CTAs/badges. Primary CTA is a **black
  pill** (`rounded 50px`); secondary = white pill + 1px border. Success green `#1ea64a` for glyphs only.
- **Type**: figmaSans → **Inter**; figmaMono → **JetBrains/Geist Mono** for eyebrows & captions
  (uppercase, positive tracking). Display huge & tight (64–86px, line-height 1.0–1.1, negative
  letter-spacing that scales with size); body generous (1.4–1.45).
- **Shape**: radii 2/6/8/24/32, pill 50px, full 9999. Image frames 8px. Blocks 24px.
- **Spacing**: 8px base; **96px between sections**; 48px inside color blocks; poster-like side margins
  inside a block (type gets >1/4 block width of margin each side).
- **Shadow-light**: only floating template tiles get a soft `0 4px 16px rgba(0,0,0,.06)`.

## Quick Token Reference
| Token | Value |
|---|---|
| ink / canvas | `#000000` / `#ffffff` (navy inverse `#1f1d3d`) |
| magenta accent | `#ff3d8b` · success `#1ea64a` |
| block lime / lilac / cream | `#dceeb1` / `#c5b0f4` / `#f4ecd6` |
| block mint / pink / coral | `#c8e6cd` / `#efd4d4` / `#f3c9b6` |
| hairline | `#e6e6e6` / `#f1f1f1` · surface-soft `#f7f7f5` |
| radii | 2 / 6 / 8 / 24 / 32 · pill 50 · full 9999 |
| spacing | 4 / 8 / 12 / 16 / 24 / 32 / 48 · section 96 |

For exact per-section block assignments, component specs, and type table, read `references/DESIGN.md`.

## Project Notes (this monorepo)
- `store-theme-SH/`: this is the chosen vivid direction. Map blocks into `assets/sh-tokens.css`
  (`--sh-block-*`, `--sh-magenta`) and give each home section a color-block background setting.
  px only in sh CSS (no rem). See [[airbnb-design]] for the earlier restrained tokens it replaces.
- Independent analysis of publicly observable patterns — inspiration only, not official Figma assets.
  Do not ship the Figma name/logo.
