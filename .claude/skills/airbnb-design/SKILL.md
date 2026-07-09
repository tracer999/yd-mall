---
name: airbnb-design
description: Airbnb design system reference (getdesign.md analysis) for building warm, photography-driven consumer marketplace UIs. This skill should be used when creating or restyling UI with an Airbnb-like look — coral/Rausch accent, pill search bars, rounded photo-first cards — or when the user mentions "Airbnb 스타일", "airbnb design", or asks to apply this design system to pages, components, or themes.
---

# Airbnb Design System

Design-token reference distilled from Airbnb's public web (getdesign.md analysis, `references/DESIGN.md`).
Apply it when building marketplace-style UI: listing grids, search bars, detail pages, booking cards.

## Workflow

1. **Read `references/DESIGN.md` first** before writing any UI code. It contains the full token set
   (colors, typography scale, radii, spacing, 30+ component specs) plus layout, elevation,
   and responsive rules. Do not restyle from memory.
2. Map tokens to the project's styling system (CSS variables, Tailwind config, or inline values).
3. Verify output against the Core Rules below — they are the identity of this design language.

## Core Rules (non-negotiable)

- **One accent color**: Rausch `#ff385c` carries every primary CTA, search orb, and save-heart.
  Pages stay ~90% white + ink with only one or two Rausch moments. Never add a second brand color.
- **Canvas & ink**: pure white `#ffffff` background, near-black `#222222` text. Never pure black.
  No dark mode. Hairlines `#dddddd` / `#ebebeb` for all 1px borders and dividers.
- **Font**: Airbnb Cereal VF → fallback Circular → system stack. If unavailable, use **Inter**
  (closest open substitute; tighten display line-height ~2%).
- **Modest display weights**: headlines 22–28px at weight 500–700 only. Photography carries visual
  weight, not typography. The single loud type moment is the 64px/700 rating number.
- **Soft shape language**: buttons 8px radius, cards ~14px, search bar & badges fully pill
  (`9999px`), icon buttons circular. No hard corners on interactive elements.
- **One shadow tier only**: `rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.1) 0 4px 8px`
  — used on hover-floated cards, the search bar, and dropdowns. Everything else is flat.
- **Spacing**: 4px base unit; section bands 64px; card grids compressed to 16px gutters
  ("open hero, dense marketplace below").
- **Buttons**: primary = Rausch fill, white text, 48px height, 8px radius; active `#e00b41`;
  disabled `#ffd1da`. Secondary = white fill + 1px ink outline.

## Quick Token Reference

| Token | Value |
|---|---|
| primary (Rausch) | `#ff385c` (active `#e00b41`, disabled `#ffd1da`) |
| ink / body / muted | `#222222` / `#3f3f3f` / `#6a6a6a` |
| canvas / surface-soft / surface-strong | `#ffffff` / `#f7f7f7` / `#f2f2f2` |
| hairline / soft | `#dddddd` / `#ebebeb` |
| error text | `#c13515` |
| radii xs–xl | 4 / 8 / 14 / 20 / 32px, full `9999px` |
| spacing | 2 / 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px |
| body / meta text | 16px 400 lh1.5 / 14px 400 lh1.43 |

For exact component specs (search-bar-pill, property-card, reservation-card, date-picker,
footer, responsive breakpoints 744/1128/1440px), grep or read `references/DESIGN.md`.

## Project Notes (this monorepo)

- `store-theme-Rise/`: its guide bans rem — convert any rem values to **px** before use
  (values above are already px).
- `spf-mall/`: map tokens into Tailwind 4 theme variables rather than hardcoding hex per component.
- This is an independent analysis of publicly observable patterns — use as inspiration for demo UI,
  not as official Airbnb brand assets. Do not ship the Airbnb name/logo.
