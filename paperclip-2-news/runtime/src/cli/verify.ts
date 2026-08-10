import fs from 'node:fs';
import path from 'node:path';
import { runJokeDoctor } from '../agents/joke-doctor.js';
import { runProducer } from '../agents/producer.js';
import { runResearcher } from '../agents/researcher.js';
import { runScriptWriter } from '../agents/script-writer.js';
import { createOrUpdateStatusFromPlan, readEpisodePlan, readEpisodeStatus, writeEpisodeStatus } from '../lib/files.js';
import { requireAnthropicKey } from '../lib/anthropic.js';
import { AGENTS_DIR, SHARED_DIR } from '../lib/paths.js';
import { agentSpecPath, extractSystemPrompt, loadPrompt, runtimeAgentNames } from '../lib/prompts.js';
import { renderReviewList } from './review-list.js';

const requiredSharedSpecs = [
  'cast.md',
  'character-visual-specs.md',
  'show-bible.md',
  'voice-and-comedy-guide.md',
  'ad-insertion-guide.md',
  'legal-and-parody-guardrails.md',
  'product-positioning.md',
];

function isoDate(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function fetchTinyHackerNewsScope() {
  const base = process.env.HACKER_NEWS_API_BASE ?? 'https://hn.algolia.com/api/v1';
  const after = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;
  const url = `${base}/search_by_date?query=AI&tags=story&numericFilters=created_at_i>${after}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HN smoke fetch failed: ${response.status} ${response.statusText}`);
  const json = (await response.json()) as { hits?: Array<Record<string, unknown>> };
  return (json.hits ?? []).slice(0, 10).map((hit) => ({
    title: hit.title,
    url: hit.url,
    hn_url: hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : null,
    points: hit.points,
    author: hit.author,
    created_at: hit.created_at,
  }));
}

async function verifyPrompts() {
  console.log('[verify] Checking env and prompt files');
  requireAnthropicKey();

  for (const agentName of runtimeAgentNames) {
    const specPath = agentSpecPath(agentName);
    const spec = await fs.promises.readFile(specPath, 'utf8');
    const prompt = extractSystemPrompt(spec);
    if (!prompt.trim()) throw new Error(`Empty system prompt extracted from ${specPath}`);
    await loadPrompt(agentName);
  }

  const agentFiles = await fs.promises.readdir(AGENTS_DIR);
  if (agentFiles.filter((name) => name.endsWith('.md')).length < runtimeAgentNames.length) {
    throw new Error('Agent spec directory is missing expected markdown files.');
  }

  for (const fileName of requiredSharedSpecs) {
    const filePath = path.join(SHARED_DIR, fileName);
    const content = await fs.promises.readFile(filePath, 'utf8');
    if (!content.trim()) throw new Error(`Shared spec is empty: ${filePath}`);
  }
}

async function main() {
  await verifyPrompts();

  console.log('[verify] Fetching tiny HN scope');
  const hnStories = await fetchTinyHackerNewsScope();
  if (hnStories.length === 0) throw new Error('HN smoke fetch returned zero stories.');

  console.log('[verify] Calling Researcher');
  const research = await runResearcher({
    mode: 'daily',
    scopeStart: isoDate(3),
    scopeEnd: isoDate(0),
    brief: `Smoke test only. Rank these Hacker News AI stories for Paperclip-2 satire candidates and return about 10 candidates:\n${JSON.stringify(hnStories, null, 2)}`,
    outputTarget: 10,
  });
  if (research.count === 0) throw new Error('Researcher returned zero candidates.');

  console.log('[verify] Calling Producer');
  const producer = await runProducer({
    mode: 'weekly',
    phase: 'plan_episodes',
    researchRunId: research.runId,
    target: 1,
  });
  if (!('plans' in producer) || producer.plans.length === 0) throw new Error('Producer returned zero plans.');

  const planId = String(producer.plans[0].id);
  const plan = readEpisodePlan(planId);
  const firstSegment = Array.isArray(plan.segments) ? plan.segments[0] : null;
  const firstSlot = firstSegment?.slot ? String(firstSegment.slot) : 'cold_open';

  console.log('[verify] Calling Script Writer');
  const script = await runScriptWriter({ planId, segmentSlot: firstSlot });
  if (script.written.length === 0) throw new Error('Script Writer wrote zero segments.');

  console.log('[verify] Calling Joke Doctor');
  const jokeDoctor = await runJokeDoctor({ planId, segmentSlot: script.written[0] });
  if (jokeDoctor.punched.length === 0) throw new Error('Joke Doctor punched zero segments.');

  console.log('[verify] Checking review-list against a locked gate');
  const status = readEpisodeStatus(planId);
  const now = new Date().toISOString();
  writeEpisodeStatus(planId, {
    ...status,
    status: 'gate1_locked',
    gate1: { decision: 'lock', notes: 'Smoke-test lock.', decided_at: now },
  });
  createOrUpdateStatusFromPlan(planId, plan, 'gate1_locked');
  const reviewList = renderReviewList();
  if (!reviewList.includes(planId) || !reviewList.includes('Locked episodes')) {
    throw new Error('review:list did not include the smoke-test locked episode.');
  }

  console.log('✅ Team ready');
}

main().catch((error) => {
  console.error('[verify] failed');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
