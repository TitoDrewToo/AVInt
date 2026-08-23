"use client"

import { useState } from "react"
import { ArrowRight, Check, Circle, CheckCircle2, MousePointer2, Move3d, PanelTop, Play, Route, X } from "lucide-react"

type Asset = {
  id: string
  title: string
  label: string
  description: string
  tags: string[]
  preview: "ui" | "layout" | "motion" | "background" | "environment" | "flow"
}

const assets: Record<string, Asset[]> = {
  ui: [
    { id: "signal-button", title: "Signal Button", label: "Primary action", description: "A focused CTA with an animated edge, lift, glow, and a clear active state.", tags: ["button", "focus", "CTA"], preview: "ui" },
    { id: "quiet-modal", title: "Quiet Modal", label: "Focused overlay", description: "A small modal pattern with a soft entrance, backdrop focus, and explicit close behavior.", tags: ["modal", "overlay", "keyboard"], preview: "ui" },
    { id: "tool-rail", title: "Tool Rail", label: "Navigation pattern", description: "A compact section switcher for internal tools, docs, and studio catalogues.", tags: ["nav", "tabs", "responsive"], preview: "ui" },
  ],
  layouts: [
    { id: "split-hero", title: "Split Hero", label: "Landing composition", description: "A text-led opening with a visual counterweight and one high-value action.", tags: ["hero", "asymmetry", "CTA"], preview: "layout" },
    { id: "proof-grid", title: "Proof Grid", label: "Case-study composition", description: "A flexible grid for products, outcomes, capabilities, and visual evidence.", tags: ["grid", "proof", "responsive"], preview: "layout" },
    { id: "story-rail", title: "Story Rail", label: "Narrative composition", description: "A vertical sequence that keeps one idea in focus while the visual layer evolves.", tags: ["scroll", "story", "pinned"], preview: "layout" },
  ],
  motion: [
    { id: "text-reveal", title: "Text Reveal", label: "Entrance behavior", description: "A restrained line-by-line reveal for section openings and product statements.", tags: ["text", "entry", "reduced-motion"], preview: "motion" },
    { id: "cursor-orbit", title: "Cursor Orbit", label: "Pointer behavior", description: "A small, bounded response that gives a focal object presence without becoming a gimmick.", tags: ["pointer", "depth", "hover"], preview: "motion" },
    { id: "progress-scrub", title: "Progress Scrub", label: "Scroll behavior", description: "A visual timeline for scene progress, chapter navigation, and long-form storytelling.", tags: ["scroll", "timeline", "state"], preview: "motion" },
  ],
  backgrounds: [
    { id: "signal-grid", title: "Signal Grid", label: "Atmospheric field", description: "A quiet technical grid with a moving signal and center-weighted falloff.", tags: ["grid", "CSS", "low-cost"], preview: "background" },
    { id: "aurora-wash", title: "Aurora Wash", label: "Gradient field", description: "A slow, layered color field for premium product, art, or editorial surfaces.", tags: ["gradient", "ambient", "CSS"], preview: "background" },
    { id: "particle-depth", title: "Particle Depth", label: "WebGL candidate", description: "A depth-led particle study reserved for scenes that need a stronger sense of space.", tags: ["particles", "WebGL", "GPU"], preview: "background" },
  ],
  environments: [
    { id: "product-stage", title: "Product Stage", label: "Interactive world", description: "A restrained 3D stage for a product, object, or service to become the hero.", tags: ["3D", "product", "camera"], preview: "environment" },
    { id: "living-gallery", title: "Living Gallery", label: "Immersive world", description: "A scroll-led collection space where visual work changes the atmosphere around it.", tags: ["gallery", "scroll", "media"], preview: "environment" },
    { id: "signal-room", title: "Signal Room", label: "Systems world", description: "A dark, data-shaped environment for technical products and operational narratives.", tags: ["systems", "data", "shader"], preview: "environment" },
  ],
  flows: [
    { id: "loading-splash", title: "Loading Splash", label: "Opening sequence", description: "A short preflight state that establishes atmosphere, readiness, and a clear handoff into the experience.", tags: ["loading", "preflight", "progress"], preview: "flow" },
    { id: "start-menu", title: "Start Menu", label: "Navigation reveal", description: "A designed entry panel for orienting people before they move through a scene, product, or collection.", tags: ["menu", "overlay", "route"], preview: "flow" },
    { id: "age-gate", title: "Age Gate", label: "Threshold interaction", description: "A respectful confirmation step for regulated or audience-specific experiences, with a clean exit path.", tags: ["gate", "consent", "access"], preview: "flow" },
    { id: "scroll-chapters", title: "Scroll Chapters", label: "Narrative scroll", description: "A chapter rail that makes long-form movement legible while the main scene changes around it.", tags: ["scroll", "chapters", "story"], preview: "flow" },
    { id: "scene-transition", title: "Scene Transition", label: "World change", description: "A controlled handoff between environments that preserves orientation while the visual world changes.", tags: ["scene", "transition", "continuity"], preview: "flow" },
    { id: "progress-nav", title: "Progress Nav", label: "Guided orientation", description: "A compact progress system for showing where someone is, what is next, and how to revisit a completed step.", tags: ["progress", "nav", "state"], preview: "flow" },
  ],
}

function UiPreview({ id }: { id: string }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const isToolRail = id === "tool-rail"
  return (
    <div className="studio-ui-preview relative flex min-h-48 flex-col justify-between overflow-hidden rounded-2xl border border-border bg-background/75 p-5">
      <div className="relative flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground"><span>{isToolRail ? "Navigation study" : "Interaction study"}</span><MousePointer2 className="h-3.5 w-3.5 text-primary" />{isToolRail ? <div className="absolute right-0 top-7 z-20"><button type="button" onClick={() => setMenuOpen((open) => !open)} className={`cw-button-flow inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-medium normal-case tracking-normal transition-colors ${menuOpen ? "border-primary/50 bg-primary/10 text-foreground" : "border-border bg-card/80 text-muted-foreground hover:text-foreground"}`}><span className="h-1.5 w-1.5 rounded-full bg-primary" />Tools<span className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}>⌄</span></button>{menuOpen ? <div className="studio-popover-in absolute right-0 top-11 w-44 rounded-2xl border border-primary/20 bg-background/95 p-1.5 text-left shadow-[0_18px_42px_-18px_var(--glass-shadow-far)] backdrop-blur-xl"><button type="button" onClick={() => setMenuOpen(false)} className="group flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-primary/10"><span className="mt-0.5 h-2 w-2 rounded-full border border-primary/70 group-hover:bg-primary" /><span><span className="block text-xs font-medium text-foreground">Core systems</span><span className="mt-0.5 block text-[10px] text-muted-foreground">Reusable foundations</span></span></button><button type="button" onClick={() => setMenuOpen(false)} className="group flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-primary/10"><span className="mt-0.5 h-2 w-2 rounded-full border border-primary/70 group-hover:bg-primary" /><span><span className="block text-xs font-medium text-foreground">Visual scenes</span><span className="mt-0.5 block text-[10px] text-muted-foreground">Motion and worlds</span></span></button></div> : null}</div> : null}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="cw-button-flow rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">Open preview <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => setModalOpen(true)} className="cw-button-flow rounded-xl border border-border bg-card/70 px-4 py-2 text-xs font-medium text-foreground">Test modal</button>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_var(--retro-glow-red)]" /> Hover, focus, click, interrupt.</div>
      {modalOpen ? <div className="studio-modal-backdrop absolute inset-0 z-10 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Interaction preview"><div className="cw-border-flow glass-surface relative w-full max-w-xs rounded-2xl p-5"><button type="button" onClick={() => setModalOpen(false)} className="cw-button-flow absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:text-foreground" aria-label="Close preview"><X className="h-4 w-4" /></button><p className="text-[10px] uppercase tracking-[0.18em] text-primary">Modal choreography</p><h4 className="mt-3 text-lg font-semibold">Keep the user oriented.</h4><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Backdrop, focus, close, and return are one interaction, not four separate details.</p><button type="button" onClick={() => setModalOpen(false)} className="cw-button-flow mt-5 w-full rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">Done</button></div></div> : null}
    </div>
  )
}

function LayoutPreview() {
  return <div className="studio-layout-preview grid min-h-48 gap-2 rounded-2xl border border-border bg-background/75 p-4 md:grid-cols-[1.15fr_0.85fr]"><div className="flex flex-col justify-between rounded-xl border border-primary/20 bg-primary/5 p-4"><div><span className="block h-1.5 w-16 rounded-full bg-primary/60" /><span className="mt-2 block h-2 w-32 rounded-full bg-foreground/15" /><span className="mt-2 block h-1.5 w-24 rounded-full bg-foreground/10" /></div><span className="cw-button-flow w-fit rounded-lg bg-primary px-3 py-1.5 text-[10px] text-primary-foreground">Start here</span></div><div className="grid grid-cols-2 gap-2"><div className="rounded-xl border border-border bg-card/70 p-3"><span className="block h-10 rounded-lg bg-primary/10" /><span className="mt-3 block h-1.5 w-12 rounded-full bg-foreground/15" /></div><div className="rounded-xl border border-border bg-card/70 p-3"><span className="block h-10 rounded-lg bg-foreground/5" /><span className="mt-3 block h-1.5 w-14 rounded-full bg-foreground/15" /></div><div className="col-span-2 rounded-xl border border-dashed border-primary/20 p-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Proof / visual counterweight</div></div></div>
}

function MotionPreview() {
  return <div className="studio-motion-preview flex min-h-48 flex-col justify-between overflow-hidden rounded-2xl border border-border bg-background/75 p-5"><div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground"><span>Timeline study</span><span className="font-mono text-primary">00:02.40</span></div><div className="studio-motion-word text-4xl font-semibold tracking-tight text-foreground">Move with intent.</div><div><div className="h-1 overflow-hidden rounded-full bg-muted"><div className="studio-progress-bar h-full w-2/3 rounded-full bg-primary" /></div><div className="mt-3 flex justify-between text-[10px] text-muted-foreground"><span>entry</span><span>hold</span><span>exit</span></div></div></div>
}

function BackgroundPreview({ id }: { id: string }) {
  return <div className={`studio-background-preview studio-background-${id} relative flex min-h-48 items-end overflow-hidden rounded-2xl border border-border p-5`}><div className="relative z-[1] flex items-end justify-between gap-4"><div><span className="block text-[10px] uppercase tracking-[0.2em] text-primary/80">Atmosphere study</span><span className="mt-2 block text-lg font-medium text-foreground">Depth before detail.</span></div><Move3d className="h-5 w-5 text-primary" /></div></div>
}

function EnvironmentPreview({ id }: { id: string }) {
  return <div className={`studio-environment-preview studio-environment-${id} relative min-h-48 overflow-hidden rounded-2xl border border-border p-5`}><div className="studio-environment-orb" /><div className="absolute inset-x-5 bottom-5 z-[1] flex items-end justify-between"><div><span className="block text-[10px] uppercase tracking-[0.2em] text-primary/80">Environment study</span><span className="mt-2 block text-lg font-medium text-foreground">A world with a reason.</span></div><PanelTop className="h-5 w-5 text-primary" /></div></div>
}

function FlowPreview({ id }: { id: string }) {
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [scene, setScene] = useState("A")
  const chapters = ["Arrival", "Signal", "Open"]

  if (id === "loading-splash") return <div className="studio-flow-preview studio-flow-splash flex min-h-48 flex-col justify-between overflow-hidden rounded-2xl border border-border p-5"><div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground"><span>Preflight / 01</span><span className="font-mono text-primary">{active ? "ready" : "loading"}</span></div><div className="studio-flow-splash-in"><p className="text-3xl font-semibold tracking-tight">Make an entrance.</p><p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">Atmosphere, readiness, and agency before the first click.</p></div><div><div className="h-1 overflow-hidden rounded-full bg-muted"><div className={`studio-progress-bar h-full rounded-full bg-primary ${active ? "w-full" : "w-2/3"}`} /></div><button type="button" onClick={() => setActive(1)} className="cw-button-flow mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"><Play className="h-3 w-3" />{active ? "Enter experience" : "Complete preflight"}</button></div></div>
  if (id === "start-menu") return <div className="studio-flow-preview relative min-h-48 overflow-hidden rounded-2xl border border-border bg-background/75 p-5"><div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground"><span>Entry / 02</span><button type="button" onClick={() => setOpen((value) => !value)} className="cw-button-flow rounded-lg border border-border px-2.5 py-1.5 text-foreground">{open ? "Close" : "Open menu"}</button></div>{open ? <div className="studio-flow-menu-in absolute inset-4 top-14 z-10 rounded-2xl border border-primary/20 bg-background/95 p-4 shadow-[0_18px_42px_-18px_var(--glass-shadow-far)] backdrop-blur-xl"><p className="text-[10px] uppercase tracking-[0.18em] text-primary">Choose a direction</p><div className="mt-3 grid gap-1.5">{["Overview", "Collection", "About the system"].map((item) => <button type="button" key={item} onClick={() => setOpen(false)} className="group flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-primary/10"><span>{item}</span><ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" /></button>)} </div></div> : <div className="flex h-32 items-center justify-center text-center"><div><Route className="mx-auto h-6 w-6 text-primary" /><p className="mt-3 text-sm font-medium">The menu is part of the world.</p><p className="mt-1 text-xs text-muted-foreground">Open it to test the spatial reveal.</p></div></div>}</div>
  if (id === "age-gate") return <div className="studio-flow-preview flex min-h-48 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background/75 p-5 text-center">{accepted ? <div className="studio-flow-splash-in"><CheckCircle2 className="mx-auto h-7 w-7 text-primary" /><p className="mt-3 text-lg font-semibold">Access confirmed.</p><button type="button" onClick={() => setAccepted(false)} className="cw-button-flow mt-4 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">Reset study</button></div> : <div><p className="text-[10px] uppercase tracking-[0.18em] text-primary">Threshold / 03</p><p className="mt-3 text-xl font-semibold">Confirm your access.</p><p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">Use a clear question, an informed choice, and an immediate way out.</p><div className="mt-5 flex justify-center gap-2"><button type="button" onClick={() => setAccepted(true)} className="cw-button-flow rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">Continue</button><button type="button" className="cw-button-flow rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">Leave</button></div></div>}</div>
  if (id === "scroll-chapters") return <div className="studio-flow-preview grid min-h-48 gap-4 overflow-hidden rounded-2xl border border-border bg-background/75 p-5 md:grid-cols-[auto_1fr]"><div className="flex md:flex-col md:justify-center">{chapters.map((chapter, index) => <button type="button" key={chapter} onClick={() => setActive(index)} className="group flex items-center gap-2 p-1.5 text-left"><span className={`h-2 w-2 rounded-full border ${active === index ? "border-primary bg-primary" : "border-muted-foreground/40"}`} /><span className={`text-[10px] uppercase tracking-wider ${active === index ? "text-foreground" : "text-muted-foreground"}`}>{chapter}</span></button>)}</div><div className="studio-scene-transition flex flex-col justify-between rounded-xl border border-primary/20 bg-primary/5 p-4" key={active}><div><span className="text-[10px] uppercase tracking-[0.18em] text-primary">Chapter 0{active + 1}</span><p className="mt-3 text-2xl font-semibold">{chapters[active]} the signal.</p></div><span className="text-xs text-muted-foreground">Scroll changes the scene; the rail keeps the story legible.</span></div></div>
  if (id === "scene-transition") return <div className={`studio-flow-preview studio-scene-${scene.toLowerCase()} relative flex min-h-48 flex-col justify-between overflow-hidden rounded-2xl border border-border p-5`}><div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground"><span>World change / 05</span><span className="font-mono text-primary">SCENE {scene}</span></div><div className="studio-scene-transition"><p className="text-3xl font-semibold">{scene === "A" ? "Signal room." : "Open field."}</p><p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">A transition carries context across the change.</p></div><button type="button" onClick={() => setScene(scene === "A" ? "B" : "A")} className="cw-button-flow w-fit rounded-xl border border-border px-3 py-2 text-xs text-foreground">Change scene <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></button></div>
  return <div className="studio-flow-preview flex min-h-48 flex-col justify-between overflow-hidden rounded-2xl border border-border bg-background/75 p-5"><div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground"><span>Orientation / 06</span><span className="font-mono text-primary">0{active + 1} / 03</span></div><div><p className="text-2xl font-semibold">{chapters[active]} in view.</p><div className="mt-5 flex gap-2">{chapters.map((chapter, index) => <button type="button" key={chapter} onClick={() => setActive(index)} aria-label={`Go to ${chapter}`} className={`h-1.5 flex-1 rounded-full transition-colors ${index <= active ? "bg-primary" : "bg-muted"}`} />)}</div></div><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Completed steps stay revisitable.</span><Circle className="h-4 w-4 text-primary" /></div></div>
}

function AssetPreview({ asset }: { asset: Asset }) {
  if (asset.preview === "ui") return <UiPreview id={asset.id} />
  if (asset.preview === "layout") return <LayoutPreview />
  if (asset.preview === "motion") return <MotionPreview />
  if (asset.preview === "background") return <BackgroundPreview id={asset.id} />
  if (asset.preview === "flow") return <FlowPreview id={asset.id} />
  return <EnvironmentPreview id={asset.id} />
}

export function StudioAssetInventory({ slug }: { slug: string }) {
  const sectionAssets = assets[slug] ?? []
  return <div className="grid gap-5 lg:grid-cols-2">{sectionAssets.map((asset) => <article key={asset.id} className="glass-surface hover-bloom rounded-3xl p-4"><AssetPreview asset={asset} /><div className="p-2 pt-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-medium uppercase tracking-[0.18em] text-primary">{asset.label}</p><h3 className="mt-2 text-xl font-semibold tracking-tight">{asset.title}</h3></div><span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-2 py-1 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300"><Check className="h-3 w-3" /> study</span></div><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{asset.description}</p><div className="mt-4 flex flex-wrap gap-1.5">{asset.tags.map((tag) => <span key={tag} className="rounded-md border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{tag}</span>)}</div></div></article>)}</div>
}
