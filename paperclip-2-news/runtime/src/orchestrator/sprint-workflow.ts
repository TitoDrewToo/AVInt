import { runAdWriter } from '../agents/ad-writer.js';
import { runJokeDoctor } from '../agents/joke-doctor.js';
import { runProducer } from '../agents/producer.js';
import { runResearcher } from '../agents/researcher.js';
import { runScriptWriter } from '../agents/script-writer.js';
import { runStoryboardArtist } from '../agents/storyboard-artist.js';
import { readEpisodeStatus, writeEpisodeStatus } from '../lib/files.js';
import { notify } from '../lib/notify.js';
import { waitForGate } from './review-gates.js';

export async function runSprint({
  scopeStart = '2025-04-01',
  scopeEnd = '2026-04-01',
  episodeTarget = 6,
}: {
  scopeStart?: string;
  scopeEnd?: string;
  episodeTarget?: number;
}) {
  const brief = await runProducer({
    mode: 'inventory',
    phase: 'brief_research',
    scope: { start: scopeStart, end: scopeEnd },
    target: episodeTarget,
  });
  if (!('briefText' in brief)) throw new Error('Producer did not return a research brief');

  const { runId, count } = await runResearcher({
    mode: 'backlog',
    scopeStart,
    scopeEnd,
    brief: brief.briefText,
    outputTarget: 500,
  });
  notify(`Researcher dropped ${count} candidates -> backlog/research-runs/${runId}.json`);

  const planned = await runProducer({
    mode: 'inventory',
    phase: 'plan_episodes',
    researchRunId: runId,
    target: episodeTarget,
  });
  if (!('plans' in planned)) throw new Error('Producer did not return episode plans');
  notify(`${planned.plans.length} episode plans drafted. Run: make review:list`);

  await waitForGate(planned.plans.map((plan) => plan.id), 'gate1');

  const lockedPlans = planned.plans.filter((plan) => readEpisodeStatus(plan.id).gate1?.decision === 'lock');
  for (const plan of lockedPlans) {
    await runScriptWriter({ planId: plan.id });
    await runJokeDoctor({ planId: plan.id });
    await runStoryboardArtist({ planId: plan.id });
    await runAdWriter({ planId: plan.id });
    const current = readEpisodeStatus(plan.id);
    writeEpisodeStatus(plan.id, { ...current, status: 'pending_gate2' });
  }
  notify(`Scripts ready for ${lockedPlans.length} episodes. Run: make review:list`);

  await waitForGate(lockedPlans.map((plan) => plan.id), 'gate2');

  const finalLocked = lockedPlans.filter((plan) => readEpisodeStatus(plan.id).gate2?.decision === 'lock');
  for (const plan of finalLocked) {
    const current = readEpisodeStatus(plan.id);
    writeEpisodeStatus(plan.id, { ...current, status: 'ready_for_production' });
  }
  notify(`Sprint complete. ${finalLocked.length} episodes ready for production.`);
}
