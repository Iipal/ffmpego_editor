# Design System: Glassmorphism

> Category: Morphism & Effects
> Frosted glass effect with translucent layers, subtle blur, and luminous borders for depth and modern elegance.

## 1. Visual Theme & Atmosphere

Frosted glass effect with translucent layers, subtle blur, and luminous borders for depth and modern elegance.

- Visual style: clean, high-contrast, bold, enterprise, liquidglass effect, glassmorphism
- Color stance: primary, neutral, success, warning, danger, info, surface/subtle layers
- Design intent: Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- Primary: #1856FF — Token from style foundations.
- Secondary: #3A344E — Token from style foundations.
- Success: #07CA6B — Token from style foundations.
- Warning: #E89558 — Token from style foundations.
- Danger: #EA2143 — Token from style foundations.
- Surface: rgba(255, 255, 255, 0.08) — Semi-opaque glass base for light mode.
- Text: #141414 — Token from style foundations.
- Neutral: rgba(255, 255, 255, 0.15) — Derived from the surface token for official format compatibility.

- Favor Primary (#1856FF) for CTA emphasis.
- Use Surface (glass base) for large backgrounds and cards.
- Keep body copy on Text (#141414) for legibility.

## 3. Glassmorphism Core Principles

### 3.1 Background Blur
A frosted effect using `backdrop-filter: blur()` that obscures shapes and colors behind the element.
- **Standard blur**: `blur(8px)` — Used on cards and panels.
- **Heavy blur**: `blur(16px)` — Used on modals and overlays.
- **Light blur**: `blur(4px)` — Used on navigation bars and floating elements.

### 3.2 Transparency & Opacity
Semi-opaque background layers that allow the vibrant background to show through.
- **Glass base (light)**: `bg-white/10` or `bg-white/5` for subtle presence.
- **Glass base (dark)**: `bg-black/20` or `bg-black/30` for depth over dark backgrounds.
- **Hover state**: Increase opacity by 10–15% on interactive elements.

### 3.3 Subtle Borders
A thin, semi-transparent white or light stroke to define the edge of the glass.
- **Border width**: `1px` (or `border-[1px]`).
- **Border color**: `rgba(255, 255, 255, 0.2)` or gradient using `bg-gradient-to-b from-white/20 to-white/5`.
- **Border radius**: Follow design tokens (`--radius`, `--radius-lg`, `--radius-xl`).

### 3.4 Vibrant Backgrounds
The app uses a dynamic animated gradient background so the glass effect stands out.
- **Gradient**: Multi-stop linear gradient with primary, secondary, and accent colors.
- **Animation**: Slow-moving gradient shift (20–30 second loop).

## 4. Typography

- Scale: mobile-first compact scale
- Families: primary=Plus Jakarta Sans, display=Plus Jakarta Sans, mono=JetBrains Mono
- Weights: 100, 200, 300, 400, 500, 600, 700, 800, 900
- Headings should carry the style personality; body text should optimize scanability and contrast.

## 5. Spacing & Grid

- Spacing scale: comfortable density mode
- Keep vertical rhythm consistent across sections and components.
- Align columns and modules to a predictable grid; avoid ad-hoc offsets.

## 6. Layout & Composition

- Prefer clear content blocks with consistent internal padding.
- Keep hierarchy obvious: headline → support text → primary action.
- Use whitespace to separate concerns before adding borders or shadows.

## 7. Components

### Cards
- Use glass card variant: `bg-white/10 backdrop-blur-md border border-white/20`.
- Add subtle inner shadow via box-shadow for depth.

### Buttons
- Primary action uses #1856FF; secondary actions stay neutral.
- Glass buttons: `bg-white/10 backdrop-blur-sm border border-white/20`.

### Inputs
- Strong focus-visible states, clear labels, and predictable error messaging.
- Glass inputs: `bg-black/20 backdrop-blur-sm border border-white/15`.

### Cards/sections
- Use consistent radii, spacing, and elevation strategy across the page.

### Dialogs/Modals
- Heavy blur background overlay: `backdrop-blur-xl bg-black/60`.
- Glass content panel: `bg-white/10 backdrop-blur-lg border border-white/20`.

## 8. Motion & Interaction

- Use subtle transitions that emphasize Primary (#1856FF) as the interaction signal.
- Default to short, purposeful transitions (150–250ms) with stable easing.
- Ensure hover, focus-visible, active, disabled, and loading states are explicit.
- Glass elements: add `transition-all duration-200` for hover effects.

## 9. Voice & Brand

- Tone should reflect the visual style: concise, confident, and product-specific.
- Keep microcopy action-oriented and avoid generic filler language.
- Preserve the style identity in headlines while keeping UI labels literal and clear.

## 10. Anti-patterns

- Do not introduce off-palette colors when an existing token can solve the problem.
- Do not flatten hierarchy by using the same type size/weight for all text.
- Do not add decorative effects that reduce readability or accessibility.
- Do not mix unrelated visual metaphors in the same interface.
- Do not over-blur — keep backdrop-filter values reasonable (4px–16px).
- Do not use solid backgrounds on glass elements — transparency is key.
