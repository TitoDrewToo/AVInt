const studioAssetCounts: Record<string, number> = {
  ui: 3,
  layouts: 3,
  motion: 3,
  backgrounds: 3,
  environments: 3,
  flows: 6,
}

export function studioAssetCount(slug: string) {
  return studioAssetCounts[slug] ?? 0
}
