import { notFound } from "next/navigation"
import { StudioCatalogSection, studioSections } from "@/components/studio-catalog-section"

export function generateStaticParams() {
  return studioSections.map(({ slug }) => ({ section: slug }))
}

export default async function StudioCatalogPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!studioSections.some((item) => item.slug === section)) notFound()
  return <StudioCatalogSection slug={section} />
}
