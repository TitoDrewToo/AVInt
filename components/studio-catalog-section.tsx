import Link from "next/link"
import { ArrowUpRight, Box, Layers3, LayoutTemplate, MousePointer2, Orbit, Route } from "lucide-react"
import { StudioAssetInventory } from "@/components/studio-asset-inventory"
import { studioAssetCount } from "@/components/studio-asset-data"

export const studioSections = [
  { slug: "ui", label: "UI / UX", Icon: MousePointer2, description: "Buttons, modals, navigation, cards, forms, hover states, and interaction patterns.", accent: "Interface primitives" },
  { slug: "layouts", label: "Layouts", Icon: LayoutTemplate, description: "Page compositions for studios, products, portfolios, storefronts, and case studies.", accent: "Composition systems" },
  { slug: "motion", label: "Motion", Icon: Orbit, description: "GSAP-inspired choreography, scroll behavior, text reveals, transitions, and cursor responses.", accent: "Interaction grammar" },
  { slug: "backgrounds", label: "Backgrounds", Icon: Layers3, description: "Reusable visual fields, particle systems, gradients, grids, and atmospheric surfaces.", accent: "Visual primitives" },
  { slug: "environments", label: "Environments", Icon: Box, description: "Immersive worlds, product stages, living galleries, and scene-based landing experiences.", accent: "Narrative worlds" },
  { slug: "flows", label: "Experience Flows", Icon: Route, description: "Loading splashes, start menus, age gates, scroll chapters, scene transitions, and progress navigation.", accent: "Narrative choreography" },
] as const

export function StudioCatalogSection({ slug }: { slug: string }) {
  const section = studioSections.find((item) => item.slug === slug)
  if (!section) return null
  const { Icon } = section

  return (
    <section className="space-y-6">
      <div className="glass-surface rounded-3xl p-7 md:p-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="glass-surface-sm flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-primary"><Icon className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">{section.accent}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">{section.label}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">{section.description}</p>
            </div>
          </div>
          <span className="rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-medium uppercase tracking-wider text-primary">{studioAssetCount(slug)} studies</span>
        </div>
      </div>

      <StudioAssetInventory slug={slug} />
      <div className="flex justify-end"><Link href="/systems/studio" className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-foreground">Back to workspace overview <ArrowUpRight className="h-4 w-4" /></Link></div>
    </section>
  )
}
