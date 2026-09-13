import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { archiveVirtualDatasetDefinition, VirtualDatasetDependencyError } from "@/lib/virtual-dataset-store"
import { archiveDataMappingProfile, DataMappingProfileDependencyError } from "@/lib/data-mapping-store"
import { archiveDataRelationship, DataRelationshipDependencyError } from "@/lib/data-relationship-store"
import { serverError } from "@/lib/api-error"

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ kind: string; slug: string }> }) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { kind, slug } = await params
  try {
    if (kind === "virtual-datasets") return NextResponse.json({ virtualDataset: await archiveVirtualDatasetDefinition(auth.user.id, slug) })
    if (kind === "mapping-profiles") return NextResponse.json({ mappingProfile: await archiveDataMappingProfile(auth.user.id, slug) })
    if (kind === "relationships") return NextResponse.json({ relationship: await archiveDataRelationship(auth.user.id, slug) })
    return NextResponse.json({ error: "Unknown structure type" }, { status: 404 })
  } catch (error) {
    if (error instanceof VirtualDatasetDependencyError || error instanceof DataMappingProfileDependencyError || error instanceof DataRelationshipDependencyError) return NextResponse.json({ error: error.message }, { status: 409 })
    if (error instanceof Error && /not found/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 404 })
    return serverError(error, { route: "smart-storage/structures/[kind]/[slug]", stage: "delete", userId: auth.user.id })
  }
}
