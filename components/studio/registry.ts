import type { ComponentType } from "react"
import { StudioAssetPlaceholder } from "@/components/studio/placeholder"

export type StudioSectionId = "controls" | "overlays" | "text-motion" | "thresholds"
export type StudioAsset = {
  id: string
  section: StudioSectionId
  title: string
  description: string
  usage: string
  importPath: string
  component: ComponentType<{ asset: StudioAsset }>
}

export const studioRegistry: Record<StudioSectionId, StudioAsset[]> = {
  controls: [
    { id: "primary-button", section: "controls", title: "Primary Button", description: "A clear action with a restrained state change.", usage: "Use for the single highest-value action in a view.", importPath: "@/components/studio/primary-button", component: StudioAssetPlaceholder },
    { id: "icon-button", section: "controls", title: "Icon Button", description: "A compact affordance with an explicit accessible label.", usage: "Use for secondary actions where the icon is already understood.", importPath: "@/components/studio/icon-button", component: StudioAssetPlaceholder },
    { id: "segmented-control", section: "controls", title: "Segmented Control", description: "A mutually exclusive choice with a visible selected state.", usage: "Use for two to four peer views or modes.", importPath: "@/components/studio/segmented-control", component: StudioAssetPlaceholder },
    { id: "disclosure-rail", section: "controls", title: "Disclosure Rail", description: "A compact navigation control for revealing a secondary layer.", usage: "Use when a menu needs to stay close to its trigger.", importPath: "@/components/studio/disclosure-rail", component: StudioAssetPlaceholder },
    { id: "range-control", section: "controls", title: "Range Control", description: "A bounded continuous input with a legible value state.", usage: "Use for visual tuning where the current value must remain visible.", importPath: "@/components/studio/range-control", component: StudioAssetPlaceholder },
  ],
  overlays: [
    { id: "modal", section: "overlays", title: "Modal", description: "A focused decision surface with a controlled return path.", usage: "Use for consequential choices that need temporary focus.", importPath: "@/components/studio/modal", component: StudioAssetPlaceholder },
    { id: "dropdown", section: "overlays", title: "Dropdown", description: "A positioned list of actions or destinations.", usage: "Use for short menus attached to an obvious trigger.", importPath: "@/components/studio/dropdown", component: StudioAssetPlaceholder },
    { id: "drawer", section: "overlays", title: "Drawer", description: "A larger secondary surface that enters without losing context.", usage: "Use for detail, filters, or navigation on constrained screens.", importPath: "@/components/studio/drawer", component: StudioAssetPlaceholder },
    { id: "toast", section: "overlays", title: "Toast", description: "A transient confirmation that does not interrupt the task.", usage: "Use for low-risk feedback after an action completes.", importPath: "@/components/studio/toast", component: StudioAssetPlaceholder },
  ],
  "text-motion": [
    { id: "line-reveal", section: "text-motion", title: "Line Reveal", description: "A progressive text entrance that remains readable without motion.", usage: "Use for short editorial or product statements.", importPath: "@/components/studio/line-reveal", component: StudioAssetPlaceholder },
    { id: "word-scrub", section: "text-motion", title: "Word Scrub", description: "A stateful text transition tied to a controlled progress value.", usage: "Use when text changes should track an intentional sequence.", importPath: "@/components/studio/word-scrub", component: StudioAssetPlaceholder },
    { id: "cursor-response", section: "text-motion", title: "Cursor Response", description: "A bounded pointer response that adds presence without blocking input.", usage: "Use on a single focal object, never as ambient decoration everywhere.", importPath: "@/components/studio/cursor-response", component: StudioAssetPlaceholder },
    { id: "progress-scrub", section: "text-motion", title: "Progress Scrub", description: "A visual timeline for moving through a readable sequence.", usage: "Use for chapters, steps, or long-form narrative progress.", importPath: "@/components/studio/progress-scrub", component: StudioAssetPlaceholder },
  ],
  thresholds: [
    { id: "loading-splash", section: "thresholds", title: "Loading Splash", description: "A short preflight state that establishes readiness and agency.", usage: "Use only when the experience has a meaningful loading boundary.", importPath: "@/components/studio/loading-splash", component: StudioAssetPlaceholder },
    { id: "start-menu", section: "thresholds", title: "Start Menu", description: "A designed entry point that orients someone before exploration.", usage: "Use when a scene or collection needs an intentional beginning.", importPath: "@/components/studio/start-menu", component: StudioAssetPlaceholder },
    { id: "age-gate", section: "thresholds", title: "Age Gate", description: "A respectful confirmation step with a clear exit path.", usage: "Use only for regulated or audience-specific experiences.", importPath: "@/components/studio/age-gate", component: StudioAssetPlaceholder },
  ],
}

export const studioSections = [
  { id: "controls" as const, label: "Controls", description: "Buttons, choices, navigation, and bounded inputs." },
  { id: "overlays" as const, label: "Overlays", description: "Focused layers that open, close, and return context." },
  { id: "text-motion" as const, label: "Text motion", description: "Readable motion for statements, sequences, and progress." },
  { id: "thresholds" as const, label: "Thresholds", description: "Opening states and intentional entry boundaries." },
]

export function getStudioAssets(section: string) {
  return studioRegistry[section as StudioSectionId] ?? []
}
