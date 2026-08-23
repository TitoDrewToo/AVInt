import type { StudioAsset } from "@/components/studio/registry"

export function StudioAssetPlaceholder({ asset }: { asset: StudioAsset }) {
  return <div className="flex min-h-[320px] items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-8 text-center"><div><p className="text-xs uppercase tracking-[0.18em] text-[var(--brand)]">Reference implementation next</p><p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--text-dim)]">{asset.title} is registered and ready for its standalone behavior implementation.</p></div></div>
}

export const usage = "Use the registry entry to render this component inside a themed StudioStage."
