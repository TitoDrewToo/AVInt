"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { getStudioAssets, studioSections, type StudioAsset } from "@/components/studio/registry"
import { StudioPaletteSwitcher, StudioThemeProvider } from "@/components/studio/studio-theme"

function StudioStage({ asset }: { asset: StudioAsset }) {
  const Component = asset.component
  return <article className="border-b border-[var(--line)] py-10 first:pt-0 last:border-b-0"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs uppercase tracking-[0.18em] text-[var(--brand)]">{asset.section}</p><h3 className="mt-2 text-2xl font-medium text-[var(--text)]">{asset.title}</h3><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-dim)]">{asset.description}</p></div><StudioPaletteSwitcher /></div><div className="mt-6"><Component asset={asset} /></div><div className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5 text-sm md:grid-cols-2"><div><p className="text-xs uppercase tracking-[0.16em] text-[var(--text-dim)]">Usage</p><p className="mt-2 leading-relaxed text-[var(--text)]">{asset.usage}</p></div><div><p className="text-xs uppercase tracking-[0.16em] text-[var(--text-dim)]">Import</p><code className="mt-2 block break-all text-xs text-[var(--brand)]">{asset.importPath}</code></div></div></article>
}

export function StudioCatalogue({ section }: { section?: string }) {
  const selected = section ? studioSections.find((item) => item.id === section) : null
  const sections = selected ? [selected] : studioSections
  return <StudioThemeProvider><div className="space-y-8">
    <section className="border-b border-[var(--line)] pb-8"><p className="text-xs uppercase tracking-[0.2em] text-[var(--brand)]">Brand-agnostic component library</p><h2 className="mt-3 max-w-4xl text-4xl font-medium tracking-tight md:text-6xl">Systems without the studio’s skin.</h2><p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-dim)]">Every reference implementation reads the same small token contract, so it can move into a client project without carrying AVIntelligence’s visual language with it.</p><div className="mt-6"><StudioPaletteSwitcher /></div></section>
    <nav aria-label="Studio library sections" className="flex flex-wrap gap-2">{studioSections.map((item) => <Link key={item.id} href={`/systems/studio/${item.id}`} className="rounded-[var(--radius)] border border-[var(--line)] px-3 py-2 text-xs text-[var(--text-dim)] transition-[background,color,border,transform] duration-[var(--dur)] ease-[var(--ease)] hover:-translate-y-px hover:border-[var(--brand)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">{item.label}<ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></Link>)}</nav>
    {sections.map((item) => <section key={item.id} aria-labelledby={`studio-${item.id}`}><div className="mb-6"><p className="text-xs uppercase tracking-[0.18em] text-[var(--brand)]">Library section</p><h2 id={`studio-${item.id}`} className="mt-2 text-3xl font-medium text-[var(--text)]">{item.label}</h2><p className="mt-2 text-sm text-[var(--text-dim)]">{item.description}</p></div><div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 md:px-8">{getStudioAssets(item.id).map((asset) => <StudioStage key={asset.id} asset={asset} />)}</div></section>)}
  </div></StudioThemeProvider>
}
