import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { BACKLOG_DIR, EPISODES_DIR, RESEARCH_RUNS_DIR } from './paths.js';

const GateDecisionSchema = z.object({
  decision: z.enum(['lock', 'edit', 'kill']).nullable(),
  notes: z.string(),
  decided_at: z.string(),
});

export const EpisodeStatusSchema = z.object({
  id: z.string(),
  episode_number: z.number().int(),
  status: z.enum([
    'draft',
    'pending_gate1',
    'gate1_locked',
    'scripts_ready',
    'pending_gate2',
    'gate2_locked',
    'ready_for_production',
    'killed',
  ]),
  gate1: GateDecisionSchema.nullable(),
  gate2: GateDecisionSchema.nullable(),
  ad_slot_offer: z.string(),
  spine: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type EpisodeStatus = z.infer<typeof EpisodeStatusSchema>;
export type EpisodeMeta = EpisodeStatus & { dir: string };

export const ResearchCandidateSchema = z.object({
  source_url: z.preprocess((value) => value ?? 'https://news.ycombinator.com/', z.string().url()),
  source_name: z.string(),
  headline: z.string(),
  excerpt: z.string(),
  published_at: z.string(),
  topic_class: z.string(),
  comedy_potential: z.number(),
  comedy_angle: z.string(),
  best_characters: z.array(z.string()),
  recurring_bit_fit: z.string().nullable(),
  spine_potential: z.boolean(),
  sensitivity_flag: z.union([z.boolean(), z.string()]),
  evergreen_score: z.number().optional(),
  clustering_hints: z.array(z.string()).optional(),
});

export const ResearchRunSchema = z.object({
  id: z.string().optional(),
  mode: z.enum(['backlog', 'daily']),
  scope_start: z.string(),
  scope_end: z.string(),
  brief: z.string(),
  candidates: z.array(ResearchCandidateSchema),
  created_at: z.string(),
});

export type ResearchRun = z.infer<typeof ResearchRunSchema>;
export type ResearchRunMeta = { id: string; mode: string; created_at: string; count: number; path: string };

export type EpisodePlan = Record<string, unknown> & {
  id?: string;
  episode_number?: number;
  spine?: string;
  ad_slot_offer?: string;
  segments?: Array<Record<string, unknown> & { slot?: string }>;
};

export type Script = Record<string, unknown> & {
  episode_id?: string;
  segment_slot?: string;
  script?: unknown[];
};

export type Storyboard = Record<string, unknown>;
export type AdSlot = Record<string, unknown>;

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(filePath: string, schema?: z.ZodType<T>): T {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return schema ? schema.parse(parsed) : (parsed as T);
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function episodeDir(id: string) {
  return path.join(EPISODES_DIR, id);
}

function episodeFile(id: string, fileName: string) {
  return path.join(episodeDir(id), fileName);
}

export function ensureBacklog() {
  ensureDir(BACKLOG_DIR);
  ensureDir(EPISODES_DIR);
  ensureDir(RESEARCH_RUNS_DIR);
}

export function nextEpisodeId() {
  ensureBacklog();
  const ids = fs
    .readdirSync(EPISODES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{3}$/.test(entry.name))
    .map((entry) => Number(entry.name));
  const next = ids.length === 0 ? 1 : Math.max(...ids) + 1;
  return String(next).padStart(3, '0');
}

export function listEpisodes(): EpisodeMeta[] {
  ensureBacklog();
  return fs
    .readdirSync(EPISODES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const id = entry.name;
      const statusPath = episodeFile(id, 'status.json');
      if (!fs.existsSync(statusPath)) return null;
      return { ...readEpisodeStatus(id), dir: episodeDir(id) };
    })
    .filter((entry): entry is EpisodeMeta => entry !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function readEpisodeStatus(id: string): EpisodeStatus {
  return readJson(episodeFile(id, 'status.json'), EpisodeStatusSchema);
}

export function writeEpisodeStatus(id: string, status: EpisodeStatus): void {
  writeJson(episodeFile(id, 'status.json'), EpisodeStatusSchema.parse({ ...status, updated_at: new Date().toISOString() }));
}

export function readEpisodePlan(id: string): EpisodePlan {
  return readJson<EpisodePlan>(episodeFile(id, 'plan.json'));
}

export function writeEpisodePlan(id: string, plan: EpisodePlan): void {
  writeJson(episodeFile(id, 'plan.json'), plan);
}

function scriptFileName(slot: string) {
  return `script-${slot.replace(/_/g, '-')}.md`;
}

export function readScript(id: string, slot: string): Script {
  const raw = fs.readFileSync(episodeFile(id, scriptFileName(slot)), 'utf8');
  const fenced = raw.match(/```json\n([\s\S]*?)```/);
  if (fenced) return JSON.parse(fenced[1]) as Script;
  return { episode_id: id, segment_slot: slot, markdown: raw };
}

export function writeScript(id: string, slot: string, script: Script): void {
  const lines = Array.isArray(script.script)
    ? script.script
        .map((line) => {
          const item = line as { character?: string; action?: string; line?: string; visual_cue?: string };
          return `**${item.character ?? 'Unknown'}** ${item.action ?? ''}\n\n${item.line ?? ''}\n\n${item.visual_cue ? `_Visual: ${item.visual_cue}_\n` : ''}`;
        })
        .join('\n')
    : '';
  const markdown = `# ${slot.replace(/-/g, ' ')}\n\n${lines}\n\n## Structured JSON\n\n\`\`\`json\n${JSON.stringify(script, null, 2)}\n\`\`\`\n`;
  ensureDir(episodeDir(id));
  fs.writeFileSync(episodeFile(id, scriptFileName(slot)), markdown);
}

export function readStoryboard(id: string): Storyboard {
  return readJson<Storyboard>(episodeFile(id, 'storyboard.json'));
}

export function writeStoryboard(id: string, sb: Storyboard): void {
  writeJson(episodeFile(id, 'storyboard.json'), sb);
}

export function readAdSlot(id: string): AdSlot {
  const raw = fs.readFileSync(episodeFile(id, 'ad-slot.md'), 'utf8');
  const fenced = raw.match(/```json\n([\s\S]*?)```/);
  if (fenced) return JSON.parse(fenced[1]) as AdSlot;
  return { markdown: raw };
}

export function writeAdSlot(id: string, ad: AdSlot): void {
  const markdown = `# Ad Slot\n\n${typeof ad.script === 'string' ? ad.script : ''}\n\n## Structured JSON\n\n\`\`\`json\n${JSON.stringify(ad, null, 2)}\n\`\`\`\n`;
  ensureDir(episodeDir(id));
  fs.writeFileSync(episodeFile(id, 'ad-slot.md'), markdown);
}

export function listResearchRuns(): ResearchRunMeta[] {
  ensureBacklog();
  return fs
    .readdirSync(RESEARCH_RUNS_DIR)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => {
      const id = fileName.replace(/\.json$/, '');
      const run = readResearchRun(id);
      return { id, mode: run.mode, created_at: run.created_at, count: run.candidates.length, path: path.join(RESEARCH_RUNS_DIR, fileName) };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function readResearchRun(id: string): ResearchRun {
  return readJson(path.join(RESEARCH_RUNS_DIR, `${id}.json`), ResearchRunSchema);
}

export function writeResearchRun(run: ResearchRun): string {
  ensureBacklog();
  const date = run.created_at.slice(0, 10);
  const base = `${date}-${run.mode}`;
  let id = base;
  let suffix = 1;
  while (fs.existsSync(path.join(RESEARCH_RUNS_DIR, `${id}.json`))) {
    suffix += 1;
    id = `${base}-${suffix}`;
  }
  writeJson(path.join(RESEARCH_RUNS_DIR, `${id}.json`), ResearchRunSchema.parse({ ...run, id }));
  return id;
}

export function createOrUpdateStatusFromPlan(id: string, plan: EpisodePlan, status: EpisodeStatus['status']) {
  const now = new Date().toISOString();
  const existingPath = episodeFile(id, 'status.json');
  const current = fs.existsSync(existingPath) ? readEpisodeStatus(id) : null;
  const episodeNumber = Number(plan.episode_number ?? id);
  writeEpisodeStatus(id, {
    id,
    episode_number: Number.isFinite(episodeNumber) ? episodeNumber : Number(id),
    status,
    gate1: current?.gate1 ?? null,
    gate2: current?.gate2 ?? null,
    ad_slot_offer: String(plan.ad_slot_offer ?? current?.ad_slot_offer ?? 'Extension Rescue $199'),
    spine: String(plan.spine ?? current?.spine ?? ''),
    created_at: current?.created_at ?? now,
    updated_at: now,
  });
}
