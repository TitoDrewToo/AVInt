import { notFound } from "next/navigation"
import { StudioCatalogue } from "@/components/studio/catalogue"
import { studioSections } from "@/components/studio/registry"

export function generateStaticParams() {
  return studioSections.map(({ id }) => ({ section: id }))
}

export default async function StudioCatalogPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!studioSections.some((item) => item.id === section)) notFound()
  return <StudioCatalogue section={section} />
}
