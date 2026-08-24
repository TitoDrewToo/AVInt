import type { ComponentType } from "react"
import { BlockInversion } from "@/components/studio/block-inversion"
import { Dropdown } from "@/components/studio/dropdown"
import { DisplayStatement } from "@/components/studio/display-statement"
import { DrawOnSvg } from "@/components/studio/draw-on-svg"
import { Drawer } from "@/components/studio/drawer"
import { FullScreenMenu } from "@/components/studio/full-screen-menu"
import { MarqueeBand } from "@/components/studio/marquee-band"
import { MegaMenu } from "@/components/studio/mega-menu"
import { NavLinkSet } from "@/components/studio/nav-link-set"
import { SplitText } from "@/components/studio/split-text"
import { StackedLabel } from "@/components/studio/stacked-label"
import { FilterChipRow } from "@/components/studio/filter-chip-row"
import { MagneticButton } from "@/components/studio/magnetic-button"
import { Modal } from "@/components/studio/modal"
import { PillButton } from "@/components/studio/pill-button"
import { SearchField } from "@/components/studio/search-field"
import { TextRollButton } from "@/components/studio/text-roll-button"

export type StudioSectionId = "controls" | "navigation" | "overlays" | "text-motion" | "layout" | "experience"
export type StudioStatus = "Built" | "Reference" | "Planned" | "Ad hoc"
export type StudioAsset = {
  id: string
  section: StudioSectionId
  title: string
  description: string
  usage: string
  status: StudioStatus
  importPath?: string
  referencePath?: string
  wide?: boolean
  bleed?: boolean
  component?: ComponentType
}

export const studioRegistry: Record<StudioSectionId, StudioAsset[]> = {
  controls: [
    { id: "pill-button", section: "controls", title: "Pill button", description: "Inset fill and a fixed frame for the primary action.", usage: "Use for the single highest-value action in a view.", status: "Built", importPath: "@/components/studio/pill-button", component: PillButton },
    { id: "text-roll-button", section: "controls", title: "Text-roll button", description: "Two identical labels roll upward into the accent state.", usage: "Use when the action benefits from movement without a layout shift.", status: "Built", importPath: "@/components/studio/text-roll-button", component: TextRollButton },
    { id: "magnetic-button", section: "controls", title: "Magnetic button", description: "The button leans toward the pointer while it is inside its field.", usage: "Use inside a bounded field for a focal action; disable under reduced motion.", status: "Built", importPath: "@/components/studio/magnetic-button", component: MagneticButton },
    { id: "filter-chip-row", section: "controls", title: "Filter chip row", description: "A compact set of peer filters with one visible selected state.", usage: "Use for short, mutually exclusive collection filters.", status: "Built", importPath: "@/components/studio/filter-chip-row", component: FilterChipRow },
    { id: "search-field", section: "controls", title: "Search field", description: "A quiet input with a clear affordance and visible focus.", usage: "Use when filtering needs text input and a direct reset.", status: "Built", importPath: "@/components/studio/search-field", component: SearchField },
  ],
  navigation: [
    { id: "mega-menu", section: "navigation", title: "Mega-menu", description: "A wide navigation panel with measured entry and trigger states.", usage: "Use when a navigation system needs room for grouped destinations.", status: "Built", importPath: "@/components/studio/mega-menu", referencePath: "/studio-reference/04-mega-menu.html", wide: true, component: MegaMenu },
    { id: "nav-link-set", section: "navigation", title: "Nav link set", description: "A grouped set of links with a clear active and hover grammar.", usage: "Use for primary navigation where a full menu would be too heavy.", status: "Built", component: NavLinkSet },
    { id: "full-screen-menu", section: "navigation", title: "Full-screen menu", description: "A full-viewport navigation layer for authored entrances.", usage: "Use when navigation is part of the opening experience.", status: "Built", importPath: "@/components/studio/full-screen-menu", wide: true, component: FullScreenMenu },
  ],
  overlays: [
    { id: "dropdown", section: "overlays", title: "Dropdown", description: "Items arrive one after another, then close as one piece.", usage: "Use for a short menu attached to an obvious trigger.", status: "Built", importPath: "@/components/studio/dropdown", component: Dropdown },
    { id: "modal", section: "overlays", title: "Modal", description: "A focused sheet with trapped focus, scrim dismissal, and return.", usage: "Use for consequential choices that need temporary focus.", status: "Built", importPath: "@/components/studio/modal", component: Modal },
    { id: "drawer", section: "overlays", title: "Drawer", description: "A secondary surface that enters without losing page context.", usage: "Use for detail, filters, or navigation on constrained screens.", status: "Built", component: Drawer },
  ],
  "text-motion": [
    { id: "split-text", section: "text-motion", title: "Split-text line reveal", description: "Lines reveal after layout grouping, not by arbitrary word chunks.", usage: "Use for a short statement whose line structure is part of the entrance.", status: "Built", importPath: "@/components/studio/split-text", referencePath: "/studio-reference/10-split-text.html", wide: true, component: SplitText },
    { id: "display-statement", section: "text-motion", title: "Display statement", description: "A typographic statement that carries the page’s main movement.", usage: "Use for one focal statement, not for every heading.", status: "Built", importPath: "@/components/studio/display-statement", wide: true, component: DisplayStatement },
    { id: "stacked-label", section: "text-motion", title: "Stacked label", description: "A compact label that changes state through vertical type movement.", usage: "Use for section chrome or a small repeated state indicator.", status: "Built", importPath: "@/components/studio/stacked-label", referencePath: "/studio-reference/11-stacked-label.html", component: StackedLabel },
    { id: "draw-on-svg", section: "text-motion", title: "Draw-on SVG", description: "Paths measure themselves and draw in as one continuous mark.", usage: "Use for a client-supplied mark or line illustration during an entrance.", status: "Built", importPath: "@/components/studio/draw-on-svg", referencePath: "/studio-reference/07-draw-on-mark.html", component: DrawOnSvg },
  ],
  layout: [
    { id: "block-inversion", section: "layout", title: "Block inversion", description: "One token set alternates ground and ink without becoming a second theme.", usage: "Use as a wrapper when adjacent blocks need a deliberate inversion.", status: "Built", importPath: "@/components/studio/block-inversion", component: BlockInversion, wide: true },
    { id: "marquee-band", section: "layout", title: "Marquee band", description: "A duplicated, masked track that separates two section blocks.", usage: "Use as a divider between blocks, never as decoration alone.", status: "Built", importPath: "@/components/studio/marquee-band", referencePath: "/studio-reference/09-marquee-band.html", wide: true, component: MarqueeBand , bleed: true },
    { id: "editorial-grid", section: "layout", title: "Editorial grid", description: "A responsive composition for content and visual evidence.", usage: "Use when the content hierarchy needs a designed grid rather than a card matrix.", status: "Planned", wide: true },
  ],
  experience: [
    { id: "preload-gate", section: "experience", title: "Preload gate", description: "An authored loading surface that resolves around a real preload.", usage: "Ad hoc: use only when there is something meaningful to preload.", status: "Ad hoc", referencePath: "/studio-reference/08-preload-gate.html", wide: true },
    { id: "page-transition-shell", section: "experience", title: "Page-transition shell", description: "A project-specific handoff between authored scenes.", usage: "Ad hoc: specify against the project’s actual route and scene model.", status: "Ad hoc", wide: true },
    { id: "custom-cursor", section: "experience", title: "Custom cursor", description: "A restrained pointer layer for an experience that has earned it.", usage: "Ad hoc: use only when pointer presence is part of the interaction grammar.", status: "Ad hoc", referencePath: "/studio-reference/13-cursor-and-sound.html" },
    { id: "sound-bus", section: "experience", title: "Sound bus + toggle", description: "A project-specific audio layer with explicit user control.", usage: "Ad hoc: never autoplay sound without an informed action.", status: "Ad hoc", referencePath: "/studio-reference/13-cursor-and-sound.html" },
    { id: "scroll-pinned-act", section: "experience", title: "Scroll-pinned act", description: "A long-form scene that pins one idea while progress changes around it.", usage: "Ad hoc: capture it against the project brief when the narrative needs it.", status: "Ad hoc", wide: true },
  ],
}

export const studioSections = [
  { id: "controls" as const, label: "Controls", description: "Things a person presses." },
  { id: "navigation" as const, label: "Navigation", description: "Getting from one place to another." },
  { id: "overlays" as const, label: "Overlays", description: "Things that sit on top of the page." },
  { id: "text-motion" as const, label: "Type motion", description: "Type behaving as a moving element." },
  { id: "layout" as const, label: "Layout", description: "Structure that other components sit inside." },
  { id: "experience" as const, label: "Experience", description: "Ad hoc project capability, not a roadmap promise." },
]

export function getStudioAssets(section: string) {
  return studioRegistry[section as StudioSectionId] ?? []
}

export function studioReadout() {
  const assets = Object.values(studioRegistry).flat()
  return assets.reduce<Record<StudioStatus, number>>((counts, asset) => { counts[asset.status] += 1; return counts }, { Built: 0, Reference: 0, Planned: 0, "Ad hoc": 0 })
}
