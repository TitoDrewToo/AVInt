import Link from "next/link"
import { ArrowUpRight, Layers3, MousePointer2, Orbit } from "lucide-react"
import { studioSections } from "@/components/studio-catalog-section"
import { studioAssetCount } from "@/components/studio-asset-data"

export default function StudioWorkspacePage() {
  return (
    <div className="space-y-8">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-surface rounded-3xl p-7 md:p-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Build once, reuse intelligently</p>
          <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">A working library for the next commission.</h2>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">Collect proven interface pieces, motion behaviors, environments, and visual backgrounds here. The catalogue grows only when an asset is useful enough to reuse.</p>
        </div>
        <div className="glass-surface rounded-3xl p-7 md:p-10">
          <div className="flex items-center gap-3 text-primary"><Layers3 className="h-5 w-5" /><span className="text-xs font-medium uppercase tracking-[0.2em]">Studio principle</span></div>
          <p className="mt-6 text-xl leading-relaxed text-foreground">Reuse the engineering system. Author the experience.</p>
          <div className="mt-7 grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground"><div className="rounded-xl border border-border bg-background/50 px-2 py-3"><MousePointer2 className="mx-auto mb-2 h-4 w-4 text-primary" />UI</div><div className="rounded-xl border border-border bg-background/50 px-2 py-3"><Orbit className="mx-auto mb-2 h-4 w-4 text-primary" />Motion</div><div className="rounded-xl border border-border bg-background/50 px-2 py-3"><Layers3 className="mx-auto mb-2 h-4 w-4 text-primary" />Scenes</div></div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Catalogue</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Choose a library</h2></div><span className="text-xs text-muted-foreground">6 foundations · {studioSections.reduce((total, section) => total + studioAssetCount(section.slug), 0)} studies</span></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {studioSections.map(({ slug, label, Icon, description, accent }) => <Link key={slug} href={`/systems/studio/${slug}`} className="glass-surface hover-bloom group rounded-2xl p-6"><div className="flex items-start justify-between gap-4"><div className="glass-surface-sm flex h-10 w-10 items-center justify-center rounded-xl text-primary"><Icon className="h-4 w-4" /></div><ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-primary" /></div><p className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-primary">{accent}</p><h3 className="mt-2 text-lg font-semibold">{label}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p><p className="mt-5 text-xs text-muted-foreground">{studioAssetCount(slug)} studies · ready to extend</p></Link>)}
        </div>
      </section>
    </div>
  )
}
