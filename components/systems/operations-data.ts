import { systemsConfig } from "@/lib/systems-config"

export type SurfaceState = "operational" | "degraded" | "down" | "unknown"

export type ChangelogEntry = {
  sha: string
  title: string
  type: "feat" | "fix" | "perf"
  date: string
  dateLabel: string
  url: string
}

export type ChangelogDay = {
  date: string
  label: string
  entries: ChangelogEntry[]
}

export type ChangelogResult = {
  days: ChangelogDay[]
  error: string | null
}

export type DeploymentSummary = {
  state: SurfaceState
  stateLabel: string
  lastSuccessfulBuild: string | null
  deploymentUrl: string | null
  error: string | null
}

export type StatusComponent = {
  name: string
  detail: string
  state: SurfaceState
}

export type StatusOverview = {
  overall: SurfaceState
  overallLabel: string
  lastDeploy: string | null
  siteComponents: StatusComponent[]
  upstreamComponents: StatusComponent[]
}

type GitHubCommit = {
  sha: string
  html_url: string
  commit: {
    message: string
    author: { date: string } | null
  }
}

type VercelDeployment = {
  state?: string
  url?: string
  createdAt?: number
  ready?: number | null
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "Asia/Manila",
  }).format(new Date(date))
}

function parseCommit(commit: GitHubCommit): ChangelogEntry | null {
  const subject = commit.commit.message.split("\n", 1)[0].trim()
  const match = /^(feat|fix|perf)(?:\([^)]*\))?!?:\s*(.+)$/i.exec(subject)
  const date = commit.commit.author?.date
  if (!match || !date) return null
  const type = match[1].toLowerCase() as ChangelogEntry["type"]
  return {
    sha: commit.sha,
    title: match[2].trim(),
    type,
    date,
    dateLabel: dateLabel(date),
    url: commit.html_url,
  }
}

export async function getLiveChangelog(): Promise<ChangelogResult> {
  const { owner, repo, branch } = systemsConfig.github
  const token = process.env.GITHUB_TOKEN
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=100`, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`)
    const commits = await response.json() as GitHubCommit[]
    const grouped = new Map<string, ChangelogEntry[]>()
    for (const commit of commits) {
      const entry = parseCommit(commit)
      if (!entry) continue
      const key = entry.date.slice(0, 10)
      grouped.set(key, [...(grouped.get(key) ?? []), entry])
    }
    return {
      days: [...grouped.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, entries]) => ({
        date,
        label: entries[0]?.dateLabel ?? date,
        entries,
      })),
      error: null,
    }
  } catch (error) {
    return { days: [], error: error instanceof Error ? error.message : "Unable to reach GitHub" }
  }
}

function mapProviderState(value: string | undefined): SurfaceState {
  if (value === "operational" || value === "none") return "operational"
  if (value === "degraded" || value === "minor" || value === "maintenance") return "degraded"
  if (value === "outage" || value === "major" || value === "critical") return "down"
  return "unknown"
}

function deploymentState(state: string | undefined): SurfaceState {
  if (state === "READY") return "operational"
  if (state === "BUILDING" || state === "QUEUED" || state === "INITIALIZING") return "degraded"
  if (state === "ERROR" || state === "CANCELED") return "down"
  return "unknown"
}

async function fetchStatusFeed(url: string): Promise<SurfaceState> {
  try {
    const response = await fetch(url, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return "unknown"
    const payload = await response.json() as { status?: { indicator?: string } }
    return mapProviderState(payload.status?.indicator)
  } catch {
    return "unknown"
  }
}

async function getDeploymentSummary(): Promise<DeploymentSummary> {
  const token = process.env.VERCEL_TOKEN
  if (!token) {
    return {
      state: "unknown",
      stateLabel: "Not connected",
      lastSuccessfulBuild: null,
      deploymentUrl: null,
      error: "Vercel deployment credentials are not configured.",
    }
  }
  try {
    const url = new URL("https://api.vercel.com/v6/deployments")
    url.searchParams.set("projectId", systemsConfig.vercel.projectId)
    url.searchParams.set("target", "production")
    url.searchParams.set("limit", "20")
    if (process.env.VERCEL_TEAM_ID) url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID)
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`Vercel returned ${response.status}`)
    const payload = await response.json() as { deployments?: VercelDeployment[] }
    const deployments = payload.deployments ?? []
    const current = deployments[0]
    const successful = deployments.find((deployment) => deployment.state === "READY" && deployment.ready)
    const state = deploymentState(current?.state)
    return {
      state,
      stateLabel: current?.state ?? "Unknown",
      lastSuccessfulBuild: successful?.ready ? new Date(successful.ready).toISOString() : null,
      deploymentUrl: current?.url ? `https://${current.url}` : null,
      error: null,
    }
  } catch (error) {
    return {
      state: "unknown",
      stateLabel: "Unavailable",
      lastSuccessfulBuild: null,
      deploymentUrl: null,
      error: error instanceof Error ? error.message : "Unable to reach Vercel",
    }
  }
}

async function getSupabaseState(): Promise<SurfaceState> {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) return "unknown"
  try {
    const response = await fetch(`https://${systemsConfig.supabase.projectRef}.supabase.co/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    })
    return response.status < 500 ? "operational" : "down"
  } catch {
    return "down"
  }
}

function overallState(states: SurfaceState[]): SurfaceState {
  if (states.includes("down")) return "down"
  if (states.includes("degraded") || states.includes("unknown")) return "degraded"
  return "operational"
}

export async function getStatusOverview(): Promise<StatusOverview> {
  const [deployment, supabase, vercelPlatform, openai, anthropic] = await Promise.all([
    getDeploymentSummary(),
    getSupabaseState(),
    fetchStatusFeed("https://www.vercel-status.com/api/v2/status.json"),
    fetchStatusFeed("https://status.openai.com/api/v2/status.json"),
    fetchStatusFeed("https://status.anthropic.com/api/v2/status.json"),
  ])
  // If this code is executing, the server rendered this page.
  const webApplicationState: SurfaceState = "operational"
  const siteComponents: StatusComponent[] = [
    { name: "Web application", detail: `This status page rendered successfully · deployment: ${deployment.stateLabel}`, state: webApplicationState },
    { name: "Production deployment", detail: deployment.error ?? "Current production deployment state", state: deployment.state },
    { name: "Supabase", detail: "Database and service reachability", state: supabase },
  ]
  const upstreamComponents: StatusComponent[] = [
    { name: "Vercel platform", detail: "Dependency status feed", state: vercelPlatform },
    { name: "OpenAI", detail: "Dependency status feed", state: openai },
    { name: "Anthropic", detail: "Dependency status feed", state: anthropic },
  ]
  return {
    overall: overallState([webApplicationState, supabase]),
    overallLabel: overallState([webApplicationState, supabase]),
    lastDeploy: deployment.lastSuccessfulBuild,
    siteComponents,
    upstreamComponents,
  }
}
