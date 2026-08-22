# AVIntelligence Studio — Web Architecture & Creative Tech Stack

**Status:** Studio-wide direction and handoff standard
**Owner:** AVIntelligence / Andrew
**Scope:** Public websites, product marketing surfaces, client builds, interactive showcases, storefronts, and studio delivery infrastructure
**Last reviewed:** 2026-08-22

## Purpose

AVIntelligence is a web and systems development studio. This document defines the web craft layer we should reuse across current projects and future client work.

It is intentionally separate from the data architecture handoffs. The data handoffs govern ingestion, extraction, persistence, source-to-work continuity, security, reporting, and operational systems. This document governs how the web experience is conceived, designed, rendered, delivered, measured, and handed off.

The goal is not to copy any one reference site. The goal is to reach the same level of authorship, interaction quality, visual confidence, and production discipline seen in high-end digital experiences such as Active Theory and the Santioni Spirits experience.

## Reference bar

The reference bar is higher than “a polished SaaS landing page.”

- **Active Theory:** WebGL is treated as a primary medium, supported by custom rendering tools, reusable effects, XR experiments, and deliberate performance engineering.
- **Santioni Spirits:** Real-time 3D and WebGL serve a brand narrative and interactive world, not decoration placed behind ordinary marketing copy.
- **GSAP:** The entire product surface treats motion as part of the interface system. Navigation, buttons, UI panels, text, modals, demos, and documentation all feel related because they share timing, easing, feedback, and hierarchy.
- **AVIntelligence:** We should build a recognizable world around the product or client, then use technology to make that world useful, memorable, and fast.

Reference research:

- https://v5.activetheory.net/
- https://xr.activetheory.net/
- https://medium.com/active-theory/the-story-of-technology-built-at-active-theory-5d17ae0e3fb4
- https://mesh3d.gallery/website/santioni-spirits-cocktails-to-indulge-now-atone-later
- https://gsap.com/

## Current foundation

The current AVIntelligence web foundation is good enough to support this direction:

- Next.js App Router 16
- React 19
- TypeScript
- Tailwind CSS 4
- Radix UI primitives and Lucide icons
- Framer Motion
- Three.js and custom GLSL/WebGL work
- Supabase for Postgres, RLS, Auth, Storage, and Edge Functions
- Vercel deployment
- Vercel Analytics, Microsoft Clarity, structured error capture, and report-only CSP
- Existing design tokens, glass surfaces, retro-grid utilities, hover vocabulary, and reduced-motion rules

The foundation does not need to be replaced. The missing layer is a reusable creative-web system around it.

## Studio web architecture

### 1. Experience shell

Use Next.js for:

- routing and metadata
- server-rendered content and structured data
- access-controlled product surfaces
- forms, inquiries, checkout handoffs, and API routes
- progressive enhancement and fallback content

Keep public content server-rendered where possible. Treat interactive scenes as progressively enhanced islands, not as a reason to turn the whole page into a client-rendered application.

### 2. Motion orchestration

Add a studio-standard motion layer:

- GSAP
- ScrollTrigger
- Lenis or an equivalent controlled-scroll layer
- a small scene/timeline state machine

Use this layer for scroll-linked narrative, pinned sections, camera movement, scene transitions, text choreography, and scroll-velocity responses.

Framer Motion remains appropriate for component motion, dialogs, drawers, route transitions, and ordinary UI feedback. Do not use two competing libraries for the same interaction.

### 2.1 GSAP-inspired interaction system

GSAP.com is a reference for the whole interface system, not only for animation code. We should adopt the principles behind its UI while keeping AVIntelligence's own visual identity.

#### Buttons and controls

- clear primary, secondary, and quiet action hierarchy;
- hover states that respond immediately without feeling noisy;
- directional motion that explains what the action will do;
- pressed, focused, disabled, loading, and success states;
- magnetic or cursor-following behavior only for focal actions;
- animated underlines, borders, fills, or masks used as feedback rather than decoration;
- touch behavior that remains useful without hover.

#### Navigation

- compact navigation with strong information hierarchy;
- menus that open with a short, deliberate reveal;
- active states that are visible before and after interaction;
- route changes that preserve a sense of continuity;
- mobile navigation treated as a designed panel, not a collapsed desktop menu.

#### Cards, panels, and modals

- panels enter from a clear spatial direction;
- overlays establish focus with opacity and backdrop changes;
- cards can expand or transition into detail views without a hard visual jump;
- modal close, escape, outside-click, and focus return behavior are designed together;
- layout transitions preserve the user's sense of where an object went.

#### Text and information

- headlines may reveal, split, scramble, or recompose when it supports the story;
- documentation and explanatory copy should still be easy to scan;
- motion should reinforce hierarchy, not make reading a puzzle;
- numbers, status, and progress can animate when the change itself is meaningful.

#### Whole-system rule

Every interactive surface should answer:

1. What is the resting state?
2. What does the pointer, keyboard, or touch input communicate?
3. What is the transition state?
4. What confirms completion?
5. What happens when the user interrupts it?

The result should feel like one authored instrument. Buttons, hover states, modals, navigation, scene transitions, and page scroll should use a shared motion grammar even when they are implemented by different components.

The GSAP site demonstrates this breadth through dedicated UI interaction, scroll, SVG, text, and React guidance, alongside its core animation system. [GSAP homepage](https://gsap.com/)

#### Reference adoption policy

GSAP's interface structure and interaction patterns are fair game for studio reuse. We may study and adapt:

- page layout and section hierarchy;
- navigation structure and tool grouping;
- button appearance, states, and hover behavior;
- modal, drawer, login, notification, and account-panel behavior;
- documentation and showcase layouts;
- animated text, scroll, SVG, and UI interaction patterns;
- spacing, rhythm, focus treatment, and interaction sequencing.

The boundary is originality of expression. Do not copy GSAP's logos, illustrations, branded assets, copy, source code, or distinctive campaign artwork. Adapt the underlying interaction and layout ideas into AVIntelligence's own tokens, typography, color system, content, and brand world.

This is the studio rule for all external references: reuse general interaction and composition patterns; author the visual identity, assets, copy, and signature moments ourselves.

### 3. Creative rendering layer

Treat Three.js as a reusable scene system, not as a single background component.

Each scene should have explicit ownership of:

- renderer and camera lifecycle
- asset loading and disposal
- scene state and timeline hooks
- resize and device-pixel-ratio policy
- pointer and touch input
- quality tier and fallback behavior
- WebGL context-loss recovery
- reduced-motion behavior

The current `components/home-default-sphere.tsx` is a useful prototype and visual primitive. Future work should extract reusable scene utilities before adding more scene-specific complexity.

Start with custom Three.js where low-level control helps the art direction. Introduce React Three Fiber only when several scenes benefit from declarative composition and the added abstraction is justified.

### 4. Shader and post-processing layer

Create a small, intentional house vocabulary rather than collecting effects:

- bloom
- grain and vignette
- distortion and displacement
- depth and focus shifts
- fluid gradients
- particle fields
- signed-distance or metaball forms where useful
- transition shaders between scenes

Use Three.js `EffectComposer`, `postprocessing`, or a small internal compositor. Every effect needs a quality tier and a reduced-motion or static equivalent.

### 5. Content and asset layer

Do not hardcode every project, case study, scene, or campaign into page JSX.

Preferred progression:

1. typed local content and an asset manifest for small projects;
2. a CMS such as Sanity or Payload when clients need editing access;
3. a shared content contract for case studies, products, media, scenes, testimonials, and inquiry CTAs.

The content model should support different presentation systems without forcing every project into the same page template.

### 6. Media delivery

Premium web work needs a real media pipeline.

Standardize on:

- responsive AVIF/WebP image delivery
- video posters and adaptive video formats
- explicit preload and lazy-load rules
- GLB compression with Meshopt or Draco
- KTX2/Basis textures for WebGL
- CDN caching and immutable asset versions
- scene-level loading and disposal

The current `images.unoptimized: true` setting in `next.config.mjs` is acceptable for early work but is a delivery ceiling for image-heavy or cinematic projects. Evaluate Cloudinary, Cloudflare Images, or an equivalent media service before a production-heavy client launch.

## Performance and reliability standard

Creative work must be measured as software, not judged only by a desktop demo.

Every interactive project should define:

- desktop and mobile frame-time budgets
- initial scene load budget
- maximum asset weight per route
- low-end device behavior
- WebGL-disabled behavior
- reduced-motion behavior
- fallback content and interaction path

Add or standardize:

- Sentry Performance or equivalent tracing
- Web Vitals collection
- GPU tier detection
- frame-time and long-task telemetry in development
- shader compile and asset decode timing
- WebGL context-loss reporting
- device-class render-quality switching

For expensive particle or geometry work, prefer precomputed morph buffers, shader-side interpolation, Web Workers, instancing, and GPU simulation over per-frame JavaScript loops.

WebGPU is an exploration lane, not a default dependency. Prove the experience and browser coverage with WebGL first unless the project genuinely needs WebGPU capabilities.

## Visual QA and delivery

The studio standard should include:

- Playwright for functional and responsive checks
- a local scene gallery or Storybook-like visual harness
- screenshot regression for important routes
- desktop, mobile Safari, low-end Android, and reduced-motion checks
- WebGL-disabled and slow-network checks
- production canary verification after deployment

For interactive projects, “the page loads” is not enough. Verify the first meaningful frame, scroll continuity, pointer behavior, fallback state, route transitions, and asset loading under realistic conditions.

## Design system direction

The existing `docs/design-language.md` remains the UI surface reference. It covers tokens, typography, glass, hover behavior, layering, accessibility, and reduced motion.

This architecture adds the missing creative layer:

- a visual premise for each project
- a narrative arc across sections
- a camera and composition language
- an image and material treatment
- transition rules
- sound policy, if sound is used
- a motion hierarchy
- a performance budget
- a fallback story for devices that cannot render the hero experience

“Retro-futurism over glass” is a useful AVIntelligence surface language. It is not sufficient as the complete brand world. Each future project should answer:

1. What world is the visitor entering?
2. What is the memorable interaction?
3. Why does the technology belong to this story?
4. What does the visitor understand or feel after the interaction?

## Recommended stack

### Adopt as the studio baseline

```text
Next.js / React / TypeScript
Tailwind CSS / Radix UI
Three.js / GLSL
GSAP / ScrollTrigger
Lenis or equivalent controlled scroll
EffectComposer or postprocessing
Web Workers
Meshopt or Draco
KTX2/Basis textures
Cloudinary, Cloudflare Images, or equivalent media CDN
Vercel
Supabase
Sentry Performance or equivalent
Playwright
```

### Use selectively

```text
React Three Fiber
WebGPU
WebXR
GPGPU particle simulation
Sanity or Payload CMS
HLS or adaptive video delivery
```

### Do not add by default

- another UI component library
- another general animation library for the same job
- WebGPU only because it is newer
- a CMS before content editing is a real need
- a custom renderer before Three.js and the scene architecture are genuinely limiting the work

## Relationship to data architecture handoffs

This document and the data handoffs are complementary, not competing.

### This document owns

- public web architecture
- interaction and motion systems
- WebGL, shaders, and creative rendering
- content presentation and asset delivery
- visual QA and frontend performance
- studio delivery standards
- client-facing web and systems experience

### The data architecture handoffs own

- source ingestion and versioning
- extraction and normalization
- maintained records and source-linked work
- Supabase schema, RLS, auth, and service-role boundaries
- reports, dashboards, exports, and workflow outputs
- AI provider routing and operational correctness
- data observability and security controls

### Shared boundary

Both layers use the same Next.js application shell, authentication, deployment, observability, and product identity. The web layer may visualize or narrate data, but it must not redefine the data model. The data layer may expose structured results, but it must not dictate the visual language of every client or public experience.

When a task crosses both layers, document the contract between them first:

```text
data system → typed, permission-checked experience contract → web scene/UI
web action → validated server action/API → data system
```

## Handoff rules for future projects

Before implementation, every studio web project should have:

1. a one-page visual premise;
2. a route and content map;
3. an interaction inventory;
4. a scene and asset budget;
5. desktop/mobile/fallback requirements;
6. a typed boundary to any data system;
7. a visual QA checklist;
8. a production verification plan.

The implementation team should reuse the studio shell and infrastructure, but not force every client into the same aesthetic. Reuse the engineering system. Author the experience.
