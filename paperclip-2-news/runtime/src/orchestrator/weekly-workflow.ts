import { runAdWriter } from '../agents/ad-writer.js';
import { runJokeDoctor } from '../agents/joke-doctor.js';
import { runProducer } from '../agents/producer.js';
import { runResearcher } from '../agents/researcher.js';
import { runScriptWriter } from '../agents/script-writer.js';
import { runStoryboardArtist } from '../agents/storyboard-artist.js';
import { readEpisodeStatus, writeEpisodeStatus } from '../lib/files.js';
import { notify } from '../lib/notify.js';
import { waitForGate } from './review-gates.js';

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function runWeekly() {
  const scopeStart = isoDaysAgo(7);
  const scopeEnd = new Date().toISOString().slice(0, 10);
  const { runId, count } = await runResearcher({
    mode: 'daily',
    scopeStart,
    scopeEnd,
    brief: 'Weekly AI After Dark scan. Prefer the last 7 days, high comedy potential, legal-safe parody angles.',
    outputTarget: 50,
  });
  notify(`Daily-mode researcher dropped ${count} candidates -> backlog/research-runs/${runId}.json`);

  const planned = await runProducer({
    mode: 'weekly',
    phase: 'plan_episodes',
    researchRunId: runId,
    target: 1,
  });
  if (!('plans' in planned) || planned.plans.length === 0) throw new Error('Producer did not return a weekly episode plan');
  const plan = planned.plans[0];
  notify(`Weekly plan ${plan.id} drafted. Run: make review:list`);

  const timeout = Number(process.env.WEEKLY_GATE_TIMEOUT_MS ?? 4 * 60 * 60 * 1000);
  await waitForGate([plan.id], 'gate1', timeout);

  if (readEpisodeStatus(plan.id).gate1?.decision !== 'lock') {
    notify(`Weekly plan ${plan.id} was not locked; stopping.`);
    return;
  }

  await runScriptWriter({ planId: plan.id });
  await runJokeDoctor({ planId: plan.id });
  await runStoryboardArtist({ planId: plan.id });
  await runAdWriter({ planId: plan.id });
  const current = readEpisodeStatus(plan.id);
  writeEpisodeStatus(plan.id, { ...current, status: 'pending_gate2' });
  notify(`Weekly scripts ready for ${plan.id}. Run: make review:list`);

  await waitForGate([plan.id], 'gate2', timeout);
  const finalStatus = readEpisodeStatus(plan.id);
  if (finalStatus.gate2?.decision === 'lock') {
    writeEpisodeStatus(plan.id, { ...finalStatus, status: 'ready_for_production' });
    notify(`Weekly cycle complete. Episode ${plan.id} ready for production.`);
  }
}
