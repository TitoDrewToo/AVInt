import { runSprint } from '../orchestrator/sprint-workflow.js';

await runSprint({
  scopeStart: process.env.SPRINT_SCOPE_START ?? '2025-04-01',
  scopeEnd: process.env.SPRINT_SCOPE_END ?? '2026-04-01',
  episodeTarget: Number(process.env.SPRINT_EPISODE_TARGET ?? 6),
});
