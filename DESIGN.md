---
version: alpha
name: Agent101 Observatory
description: A bilingual, source-linked instrument bench for learning real agent execution.
colors:
  background: "#F4F6FA"
  surface: "#FFFFFF"
  ink: "#1D2841"
  muted: "#66728A"
  primary: "#4D56C8"
  primary-soft: "#ECEEFC"
  border: "#DCE2EC"
  success: "#137862"
  danger: "#B43F50"
  console: "#202A40"
  console-ink: "#E0E7F4"
  focus: "#6673E0"
  scrollbar: "#A0ABC0"
typography:
  display:
    fontFamily: '"Avenir Next", "Segoe UI", "PingFang SC", sans-serif'
  body:
    fontFamily: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
  mono:
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
components:
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  muted-label:
    textColor: "{colors.muted}"
  selected-event:
    backgroundColor: "{colors.primary-soft}"
  success-label:
    textColor: "{colors.success}"
  error-notice:
    textColor: "{colors.danger}"
  source-view:
    backgroundColor: "{colors.background}"
  raw-console:
    backgroundColor: "{colors.console}"
    textColor: "{colors.console-ink}"
  focus-outline:
    backgroundColor: "{colors.focus}"
  separator:
    backgroundColor: "{colors.border}"
  scrollbar-thumb:
    backgroundColor: "{colors.scrollbar}"
---

# Agent101 Observatory design

## Overview

An instrument bench for developers learning DSH. The central task is to run a bounded experiment, inspect an actual event, and connect its evidence to readable source code. Product register, desktop-first with a usable narrow layout. Chinese and English are equal UI locales; source identifiers and unmodified raw logs retain their original language. No Japan-market or regulated flow is implied.

The signature is a four-stage execution ribbon, joined to a source reader and event ledger. The visual reference is a technical notebook beside a logic analyzer: pale cool surfaces, quiet violet controls, and a slate console. Avoid marketing heroes, decorative gradients, fake terminal typing, and fabricated progress percentages.

The canonical runtime tokens are `web/public/tokens.css` (Model B). This document mirrors accepted values; `npm run check` verifies every color mapping. No other stylesheet owns palette values. No prior application UI or sibling component exists; the two experiment workflows share all controls and states.

## Colors

Background and surface separate the workbench from its instruments. Ink and muted are text hierarchy. Primary marks actions and selected source; primary-soft is its low-emphasis selection. Success and danger always accompany text outcomes. Console and console-ink belong only to raw logs. Focus and scrollbar remain visible on every owned scroller.

## Typography

Display uses Avenir Next with locale-capable system fallbacks; body uses Segoe UI/PingFang. Code and elapsed values use the mono stack. No network font requests or font-swap layout changes. Body 14–16px with 1.65 line-height; code 12–13px with 1.75 line-height. Chinese text is never italicized. Technical identifiers are not translated.

## Layout

At 1180px and up, use a 216px curriculum rail with a flexible workspace. Source and event panels share a 1.2:1 row. At 900px the rail becomes a horizontal lesson list; at 720px the panels stack and keep independent bounded code/log scroll areas. The document remains the page scroll owner. No clipping the whole page to a viewport height.

## Elevation & Depth

Borders and tonal surfaces carry hierarchy. A restrained panel shadow is optional; no backdrop blur. Controls retain fixed height and width during loading. Reserve the status banner and stage ribbon footprint.

## Shapes

16px panel radius, 10px controls, 6px compact labels. A rectangular code selection is deliberate: it encodes source lines rather than a decorative card. Icons are small inline SVG with consistent 1.7px strokes and accessible adjacent labels.

## Components

Shared owners: actions use `.button`; feedback uses `#notice` with a live status; lesson navigation uses anchors; mode selection uses native buttons with `aria-pressed`; the source file picker uses a native select (OS-owned popup accepted). No modal, date, search, table selection, auth, arbitrary command editor, or secret entry is required.

Runtime mapping: `colors.<name>` → `--color-<name>` in `tokens.css` → shared controls/panels in `app.css`. `typography` maps to `--font-display/body/mono`; rounded maps to `--radius-sm/md/lg`; spacing maps to `--space-small/medium/large`.

Loading is an indeterminate spinner with a text state, never fake completion. Status changes do not steal focus. All actions have hover, focus-visible, pressed and disabled states. Event selection is a native button inside an ordered list. Raw data and source use text nodes, never HTML injection.

Live events are shown as they arrive. Replay is explicitly labeled and uses a playback clock, not a claimed historical execution duration. Selecting an event freezes source following; “Follow latest” restores it. Reduced motion disables nonessential transitions and smooth scrolling. Forced colors keep system scrollbars and focus.

## Do's and Don'ts

- Do keep provenance, actual events, source revision and teaching interpretation distinguishable.
- Do use the same source/event/feedback owners for both experiments and both locales.
- Don't claim source associations are line-by-line instrumentation.
- Don't turn recorded evidence into a live-looking execution or imply the fixed adapter is a real reasoning model.
