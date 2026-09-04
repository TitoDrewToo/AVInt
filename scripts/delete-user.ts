import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const KEEP_EMAILS = new Set([
  "avinnilooban@outlook.com",
  "avinnilooban@gmail.com",
  "patty.malixi4@gmail.com",
])
const STORAGE_BUCKET = "documents"
const CHUNK_SIZE = 100

type AuthUser = {
  id: string
  email?: string
  last_sign_in_at?: string | null
  created_at?: string
}

type FileRow = { id: string; storage_path: string | null; user_id?: string }

function usage(): never {
  console.error("Usage: node --env-file=.env.local --import tsx scripts/delete-user.ts <email> [--confirm]")
  console.error("       node --env-file=.env.local --import tsx scripts/delete-user.ts --verify")
  process.exit(1)
}

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function assertNotKeep(email: string) {
  if (KEEP_EMAILS.has(email.toLowerCase())) {
    throw new Error(`REFUSED: ${email} is a protected keep account`)
  }
}

async function resolveUser(supabase: SupabaseClient, email: string): Promise<AuthUser> {
  const target = email.toLowerCase()
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Auth lookup failed: ${error.message}`)
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === target)
    if (user) return user
    if (data.users.length < 1000) break
  }
  throw new Error(`No auth user found for ${email}`)
}

async function listStoragePaths(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const paths: string[] = []

  async function walk(prefix: string): Promise<void> {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(prefix, { limit: 1000, offset })
      if (error) throw new Error(`Storage listing failed for ${prefix}: ${error.message}`)
      for (const entry of data ?? []) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.id) paths.push(path)
        else await walk(path)
      }
      if (!data || data.length < 1000) break
    }
  }

  await walk(userId)
  return paths
}

async function getPreview(supabase: SupabaseClient, userId: string) {
  const { data: files, error: filesError } = await supabase
    .from("files")
    .select("id, storage_path")
    .eq("user_id", userId)
  if (filesError) throw new Error(`File preview failed: ${filesError.message}`)

  const fileIds = (files ?? []).map((file) => file.id)
  const countForFileIds = async (table: "processing_jobs") => {
    if (!fileIds.length) return 0
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).in("file_id", fileIds)
    if (error) throw new Error(`${table} preview failed: ${error.message}`)
    return count ?? 0
  }

  const [{ count: subscriptions, error: subscriptionsError }, processingJobs, storagePaths] = await Promise.all([
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("user_id", userId),
    countForFileIds("processing_jobs"),
    listStoragePaths(supabase, userId),
  ])
  if (subscriptionsError) throw new Error(`Subscriptions preview failed: ${subscriptionsError.message}`)

  return {
    files: files?.length ?? 0,
    processing_jobs: processingJobs,
    subscriptions: subscriptions ?? 0,
    storage_objects: storagePaths.length,
    storage_paths: storagePaths,
  }
}

function printPreview(user: AuthUser, preview: Awaited<ReturnType<typeof getPreview>>) {
  console.log(JSON.stringify({
    mode: "dry-run",
    email: user.email,
    user_id: user.id,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at ?? null,
    would_remove: {
      files: preview.files,
      processing_jobs: preview.processing_jobs,
      subscriptions: preview.subscriptions,
      storage_objects: preview.storage_objects,
      auth_user: 1,
    },
    storage_paths: preview.storage_paths,
  }, null, 2))
}

async function removeStoragePaths(supabase: SupabaseClient, userId: string, paths: string[]) {
  const prefix = `${userId}/`
  if (paths.some((path) => !path.startsWith(prefix))) {
    throw new Error(`REFUSED: RPC returned a storage path outside ${prefix}`)
  }
  const uniquePaths = [...new Set(paths)]
  for (let index = 0; index < uniquePaths.length; index += CHUNK_SIZE) {
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(uniquePaths.slice(index, index + CHUNK_SIZE))
    if (error) throw new Error(`Storage removal failed: ${error.message}`)
  }
  const remaining = await listStoragePaths(supabase, userId)
  if (remaining.length) throw new Error(`Storage verification failed: ${remaining.length} objects remain under ${prefix}`)
  return uniquePaths.length
}

async function deleteUser(supabase: SupabaseClient, email: string, confirm: boolean) {
  assertNotKeep(email)
  const user = await resolveUser(supabase, email)
  const preview = await getPreview(supabase, user.id)
  if (!confirm) {
    printPreview(user, preview)
    return
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc("delete_user_data", { p_user_id: user.id })
  if (rpcError) throw new Error(`delete_user_data failed: ${rpcError.message}`)

  const rpcPaths = Array.isArray(rpcResult?.storage_paths) ? rpcResult.storage_paths.filter((path: unknown): path is string => typeof path === "string") : []
  const storagePaths = [...new Set([...rpcPaths, ...preview.storage_paths])]
  const storageRemoved = await removeStoragePaths(supabase, user.id, storagePaths)

  const { error: authError } = await supabase.auth.admin.deleteUser(user.id)
  if (authError) throw new Error(`Auth deletion failed after DB/storage cleanup: ${authError.message}`)

  console.log(JSON.stringify({
    mode: "confirmed",
    email: user.email,
    user_id: user.id,
    removed: {
      ...(rpcResult?.counts ?? {}),
      storage_objects: storageRemoved,
      auth_user: 1,
    },
  }, null, 2))
}

async function verify(supabase: SupabaseClient) {
  const users: AuthUser[] = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Auth verification failed: ${error.message}`)
    users.push(...data.users)
    if (data.users.length < 1000) break
  }

  const userIds = new Set(users.map((user) => user.id))
  const { data: files, error: filesError } = await supabase.from("files").select("id, user_id")
  if (filesError) throw new Error(`Files verification failed: ${filesError.message}`)
  const fileIds = new Set((files ?? []).map((file) => file.id))
  const { data: processingJobs, error: jobsError } = await supabase.from("processing_jobs").select("id, file_id")
  if (jobsError) throw new Error(`Processing jobs verification failed: ${jobsError.message}`)
  const { data: subscriptions, error: subscriptionsError } = await supabase.from("subscriptions").select("id, user_id")
  if (subscriptionsError) throw new Error(`Subscriptions verification failed: ${subscriptionsError.message}`)

  const orphanFiles = (files ?? []).filter((file) => !userIds.has(file.user_id)).length
  const orphanProcessingJobs = (processingJobs ?? []).filter((row) => !fileIds.has(row.file_id)).length
  const orphanSubscriptions = (subscriptions ?? []).filter((row) => row.user_id !== null && !userIds.has(row.user_id)).length
  const allStoragePaths = await listStoragePaths(supabase, "")
  const orphanStorage = allStoragePaths.filter((path) => !userIds.has(path.split("/")[0] ?? ""))
  const actualEmails = users.map((user) => user.email?.toLowerCase()).sort()
  const expectedEmails = [...KEEP_EMAILS].sort()
  const exactKeepAccounts = actualEmails.length === expectedEmails.length && actualEmails.every((email, index) => email === expectedEmails[index])

  const result = {
    auth_users: users.length,
    auth_emails: users.map((user) => user.email),
    exact_keep_accounts: exactKeepAccounts,
    orphaned: {
      files: orphanFiles,
      processing_jobs: orphanProcessingJobs,
      subscriptions: orphanSubscriptions,
      storage_objects: allStoragePaths.length,
      storage_objects_orphaned: orphanStorage.length,
    },
    expected: {
      auth_users: expectedEmails.length,
      orphaned_rows: 0,
      storage_objects_orphaned: 0,
    },
  }
  console.log(JSON.stringify(result, null, 2))
  if (!exactKeepAccounts || orphanFiles || orphanProcessingJobs || orphanSubscriptions || orphanStorage.length) process.exitCode = 2
}

async function main() {
  const args = process.argv.slice(2)
  const verifyOnly = args.includes("--verify")
  const confirm = args.includes("--confirm")
  const email = args.find((arg) => !arg.startsWith("--"))
  const supabase = getClient()

  if (verifyOnly) return verify(supabase)
  if (!email || args.some((arg) => !arg.startsWith("--") && arg !== email)) usage()
  return deleteUser(supabase, email, confirm)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
