import { readEpisodeStatus, writeEpisodeStatus } from '../lib/files.js';
import { notify } from '../lib/notify.js';

export type GateName = 'gate1' | 'gate2';

const pollMs = Number(process.env.REVIEW_GATE_POLL_MS ?? 30_000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDecided(id: string, gateName: GateName) {
  const status = readEpisodeStatus(id);
  const gate = status[gateName];
  if (gate?.decision === 'edit') {
    writeEpisodeStatus(id, {
      ...status,
      status: gateName === 'gate1' ? 'pending_gate1' : 'pending_gate2',
      [gateName]: null,
    });
    return false;
  }
  return gate?.decision === 'lock' || gate?.decision === 'kill';
}

export async function waitForGate(episodeIds: string[], gateName: GateName, timeoutMs = 24 * 60 * 60 * 1000) {
  const startedAt = Date.now();
  let lastNotifyAt = 0;

  while (true) {
    const pending = episodeIds.filter((id) => !isDecided(id, gateName));
    if (pending.length === 0) return;

    const elapsed = Date.now() - startedAt;
    if (elapsed > timeoutMs) {
      throw new Error(`Timed out waiting for ${gateName}: ${pending.join(', ')}`);
    }

    console.log(`[review] Waiting for ${gateName}: ${pending.join(', ')}`);
    if (Date.now() - lastNotifyAt > 30 * 60 * 1000) {
      notify(`Waiting for ${gateName}: ${pending.join(', ')}`);
      lastNotifyAt = Date.now();
    }
    await sleep(pollMs);
  }
}
