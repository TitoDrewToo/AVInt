# AVIntelligence Design Language

## Purpose

This document is the single reference for AVIntelligence's visual and interaction vocabulary. It is prescriptive, not descriptive — new or refreshed surfaces should pull from this doc rather than reinvent patterns per page.

The canon surfaces are:
- homepage (`app/page.tsx`, sections under `components/sections/`)
- header / navbar (`components/navbar.tsx`)
- account panel (`components/account-panel.tsx`)
- button vocabulary (`components/ui/button.tsx` + `cw-button-flow` utility)
- motion patterns in `app/globals.css` (glass, hover-bloom, cw-*, retro-*)

When refreshing a surface (tools pages, product pages, dashboards), the rule is: **reuse, don't re-author.** If a needed pattern is not in this doc, extend the doc first, then apply it.

## Voice

The visual language is **retro-futurism over glass.** Calm at rest, alive on interaction. The red accent is the product's pulse — it should appear on interactive edges, hover moments, and focal points, never as ambient decoration. Restraint is a feature: one gradient headline per page, one retro-glow on the active interaction, never multiple competing glows.

## Color System

All tokens are OKLCH. Do not hand-pick hex values. Tokens come from `app/globals.css`:

### Light mode
- `--background: oklch(0.995 0 0)` — near-white
- `--foreground: oklch(0.175 0 0)` — near-black
- `--card: oklch(1 0 0)` — pure white for raised surfaces
- `--primary / --accent / --ring: oklch(0.55 0.2 25)` — signature red-orange
- `--muted-foreground: oklch(0.5 0 0)` — secondary text
- `--border: oklch(0.92 0 0)` — default border
- `--retro-glow-red: oklch(0.65 0.26 25 / 0.45)` — glow and hover accent
- `--retro-glow-cyan: oklch(0.78 0.15 210 / 0.3)` — secondary accent (sparingly)
- `--retro-grid: oklch(0.55 0.2 25 / 0.08)` — grid backdrops

### Dark mode
- `--background: oklch(0.16 0.005 285)` — deep cool charcoal (not true black)
- `--foreground: oklch(0.93 0 0)`
- `--card: oklch(0.19 0.005 285)` — slightly lifted from background
- `--primary: oklch(0.6 0.18 25)` — softened red so glow reads without burning
- `--retro-glow-red: oklch(0.65 0.26 25 / 0.55)` — higher alpha to punch through the dark backplate

### Using color
- Body copy → `text-foreground`
- Secondary copy → `text-muted-foreground` (never `text-foreground/60` etc. for body — use the token)
- Decorative accents and strokes → `color-mix(in oklab, var(--retro-glow-red) <N>%, transparent)`
- Never introduce a new named hex. If a new semantic color is needed, add it to `:root` and `.dark` together.

## Typography

Four fonts, each with a defined role. They are declared in `app/layout.tsx` and surfaced via CSS variables.

| Variable | Font | Role |
|---|---|---|
| `--font-aldrich` | Aldrich | Chrome UI — nav items, panel headings, data readouts |
| `--font-geist` | Geist | Body copy and everything unlabeled |
| `--font-geist-mono` | Geist Mono | Numbers, IDs, terminal-adjacent text |
| `--font-display` | Instrument Serif | Reserved for display moments — hero callouts, recap headings |

The chrome font stack (copy-paste directly):

```ts
const geistFontStyle = {
  fontFamily: 'var(--font-aldrich), "Aldrich", var(--font-geist), "Geist", "Geist Fallback", sans-serif',
} as const
```

Rules:
- Navbar / drawer / button / label text uses the chrome stack.
- Paragraph text uses the default Tailwind `font-sans` (Geist).
- Display serif appears at most once per page. Overuse kills the effect.
- `.text-gradient-retro` (red → amber → cyan) and `.text-gradient-red` are headline highlights; one span per headline, 1–3 highlighted headlines per page maximum.

### Type scale
Tailwind's default scale is used as-is. Canonical sizes from homepage:
- Hero headline: `text-4xl md:text-5xl lg:text-6xl`, `font-semibold`, `leading-[1.1]`
- Section eyebrow: `text-sm font-medium uppercase tracking-wider text-primary`
- Section supporting paragraph: `text-base md:text-lg text-muted-foreground`
- Card title: `text-base font-semibold text-foreground`
- Card body: `text-sm leading-relaxed text-muted-foreground`
- Micro label / tag: `text-xs` or `text-[10px]` with `tracking-wider uppercase` for section eyebrows

## Geometry

- `--radius: 0.75rem` base. Tailwind `rounded-lg` = radius, `rounded-xl` = radius + 4px, `rounded-2xl` used for nav and large glass panels.
- Navbar rail: `rounded-2xl` with `px-5 py-3`.
- Card interior padding: `p-5` for launcher cards, `p-4` for compact tiles.
- Section vertical rhythm: `py-20 md:py-28` for hero; `py-24 md:py-32` for content sections.
- Max content width: `max-w-6xl mx-auto` for hero, nav, and most sections.

## Glass Surface Recipe

The signature surface pattern. Two tiers:

### `.glass-surface` — primary (navbar, hero cards, account panel)
- `background: var(--glass-bg)` — translucent white (light) or translucent charcoal (dark)
- `backdrop-filter: blur(20px) saturate(180%)`
- `border: 1px solid var(--glass-border)`
- Layered shadow: inset top highlight, inset bottom shadow, mid drop shadow, far ambient shadow

### `.glass-surface-sm` — compact (icon buttons, footer, inline badges)
- `backdrop-filter: blur(12px) saturate(160%)`
- Lighter shadow stack

Rules:
- Glass requires contrast against something. Never stack `glass-surface` on `glass-surface` — the effect disappears.
- Glass over the home page sphere is the reference framing. Over a flat background, pair with a `retro-grid-bg` or ambient radial glow to preserve depth.
- Fallback for browsers without `backdrop-filter` is already baked in (`@supports not (...)` swaps to solid card).

## Interaction Vocabulary

Five reusable interaction patterns. Every interactive surface should pull from exactly one.

### 1. `cw-button-flow` — the primary interactive ring
Applied to icon buttons, pill buttons, and any affordance that benefits from an animated conic outline. What it provides:
- A subtle red-tinted conic gradient ring spinning at `3.4s linear infinite`.
- On hover / focus-visible: `0 0 0 1px` outer ring + `0 0 22px -8px var(--retro-glow-red)` bloom.
- On hover: `translateY(-1px)` lift.
- Transitions: 220ms, `cubic-bezier(0.22, 1, 0.36, 1)`.

Usage pattern (exact text-shadow and box-shadow combos used across navbar, account panel, and hero):

```tsx
// Text link — retro glow on hover
className="transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"

// Icon button — box glow on hover, wrapped in glass
className="cw-button-flow glass-surface-sm flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:text-foreground hover:[box-shadow:0_0_20px_-4px_var(--retro-glow-red)]"

// Filled primary CTA — background inverts to background color, text goes to primary
className="cw-button-flow inline-flex min-h-9 items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
```

### 2. `cw-launcher-card` — card-sized hover
Reserved for large tiles (hero launcher cards, workspace launchers).
- Hover: `translateY(-3px)` + glass shadow deepens + soft red ambient.
- Transition: 260ms on transform, 220ms on border/color.

### 3. `hover-bloom` — standard glass tile
For tertiary cards (how-it-works steps, content tiles).
- Hover: `translateY(-2px)` + layered glass shadow + 40px red bloom at -8px offset.
- Transition: 220ms transform, 280ms shadow.

### 4. `cw-border-flow` — static ring-wrapped panel
For framed modules that need a spinning ring edge without being buttons. Use sparingly — this is a focal effect.

### 5. `cw-ring-accent` — ambient orbit for icon focal points
Two concentric rings around an element: solid breathing ring + dashed slow-spinning ring. Use for drawing attention to a single icon or focal point (e.g. "active state" indicator on a tool tile). Never apply to more than one element per viewport.

### Hover palette, explicit
These three are the only sanctioned hover expressions. Everything else is a regression.

| Target | Hover class |
|---|---|
| Text / link | `hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]` |
| Icon button (glass-surface-sm) | `hover:text-foreground hover:[box-shadow:0_0_20px_-4px_var(--retro-glow-red)]` |
| Card / tile | `hover-bloom` or `cw-launcher-card` |

Muted text baseline → primary on hover. Never hover from primary → muted. Never hover with a color other than red/primary.

## Motion

One motion curve, three durations.

- **Curve:** `cubic-bezier(0.22, 1, 0.36, 1)` — ease-out with a soft tail. Used for transforms.
- **220ms:** button-scale interactions, text-shadow, border-color.
- **260–300ms:** card lift, panel slide-in, shadow bloom.
- **1.5–3s (infinite):** ambient loops (cw-angle-spin 3.4s, cw-outline-spin 9–14s, cw-ring-breathe 5.6s).

Slide-in drawers (account panel pattern):
- Backdrop: `bg-background/40 backdrop-blur-sm` + opacity fade-in.
- Panel: `translate-x-full → translate-x-0`, `duration-300 ease-out`.

Micro-animations (homepage how-it-works icons): per-SVG keyframes live inline with the component and are invoked via utility class names. If an animation is shared across 2+ components, hoist it to `globals.css`.

### Reduced motion
`@media (prefers-reduced-motion: reduce)` disables:
- `hover-bloom` transform
- `cw-border-flow`, `cw-ring-accent`, `cw-button-flow`, `cw-input-flow` animations

Every new motion pattern must respect this rule. If motion is essential to meaning (e.g. a chart redraw), ensure a non-animated equivalent still communicates the data.

## Surface Patterns

### Header rail
- Sticky `top-0 z-50`, `px-4 pt-4`.
- Inner: `glass-surface mx-auto max-w-6xl rounded-2xl px-5 py-3`.
- Dropdown menus: `glass-surface absolute left-0 top-full mt-3 w-48 rounded-xl p-2`.
- Dropdown items: `rounded-lg px-3 py-2 text-sm` with the text-link hover palette.

### Side drawer (account panel)
- Backdrop layer + fixed-width glass panel sliding from the right.
- Headings use `font-aldrich`, hover adds `text-shadow` glow.
- Internal accordion: `duration-200 ease-out` with chevron rotation.
- Dividers: `retro-divider` (1px red-gradient hairline).
- Close is a `cw-button-flow glass-surface-sm` icon button.

### Hero launcher card
- `cw-launcher-card glass-surface group relative min-h-[28rem] cursor-pointer`.
- Behind the content: an SVG animated graphic filling the card, then a linear-gradient scrim from background → transparent → background.
- Primary action is a filled `bg-primary` button; secondary is bordered `border-border/60`.
- The whole card is clickable; nested anchors call `e.stopPropagation()` so secondary actions don't double-fire.

### Content section (what-we-do, how-it-works, etc.)
- `retro-grid-bg` overlay at `opacity-40` for texture, with radial mask falloff.
- Eyebrow → headline → paragraph → supporting visual / step grid.
- `FadeUp` wrapper staggers entrance via the `delay` prop.

### Footer
- `glass-surface-sm` strip with `!rounded-none`, preceded by a 1px red-gradient hairline (`retro-divider` variant).
- Same hover palette as the navbar for every link.

## Layering Rules

1. **Background layer (z-0):** sphere, retro-grid, radial glow — `pointer-events-none`.
2. **Scrim layer:** linear-gradient overlays to protect legibility over graphic backgrounds.
3. **Content layer (z-[1]):** all readable content.
4. **Sticky chrome (z-50):** navbar, toasts.
5. **Modal / drawer (z-50+):** account panel, auth modal.

Never stack two glass surfaces without an intervening non-glass backplate.

## Accessibility

- Target minimum touch size: `h-9 w-9` (36px) for icon buttons, `min-h-9` for pill buttons.
- Focus ring: Tailwind `focus-visible:ring-ring/50 focus-visible:ring-[3px]` (provided by the base Button).
- Contrast: glass-backed copy must still pass 4.5:1 against the underlying composite. When in doubt, add a stronger scrim.
- Every interactive surface must be keyboard-reachable. Drawers close on `Escape`; dropdowns close on outer click.
- Animations never carry sole meaning — every animated state has a static equivalent.

## Component Provenance (canonical references)

If in doubt while building, open these files and match their patterns:

| Pattern | Canonical file |
|---|---|
| Glass panel + hover link vocabulary | `components/navbar.tsx` |
| Drawer + accordion + retro-glow text | `components/account-panel.tsx` |
| Launcher card (large interactive tile) | `components/sections/hero.tsx` |
| Step card with hover-bloom | `components/sections/how-it-works.tsx` |
| Gradient hairline divider + glass strip | `components/footer.tsx` |
| Trail / ambient backdrop | `components/home-interactive-trail.tsx` |
| Sphere motion grammar (for hero 3D drill-downs only) | `components/home-default-sphere.tsx` |
| Button base + variants | `components/ui/button.tsx` |
| Tokens, glass, cw-*, retro-* utilities | `app/globals.css` |

## Extension Rules

When a new surface needs something this doc doesn't cover:
1. Check whether an existing utility (glass-surface, cw-button-flow, hover-bloom, retro-divider) already solves it with a small composition.
2. If a genuinely new utility is required, add it to `app/globals.css` under the correct section (glass utilities, cw-* flow utilities, or retro-* decor) and document it here.
3. Do not introduce one-off inline styles that duplicate an existing utility with a different number. Tighten the utility instead.
4. Do not introduce animation libraries or motion systems beyond the established curve and durations without explicit approval — the point of this doc is coherence.

## What This Doc Is Not

- Not a component library spec. Components live in `components/ui/`.
- Not a content style guide — public page intent and copy direction live in `docs/page-details.md`.
- Not a dashboard data-viz spec — dashboard analytics behavior is governed by the product code and public capability notes, not this visual style guide.

This doc governs surface, motion, and interaction only.
