import { readEpisodeStatus, writeEpisodeStatus } from '../lib/files.js';

const id = process.argv[2];
if (!id) throw new Error('Usage: npm run review:lock -- <episode-id>');

const status = readEpisodeStatus(id);
const now = new Date().toISOString();
if (status.status === 'pending_gate2' || status.status === 'scripts_ready') {
  writeEpisodeStatus(id, { ...status, status: 'gate2_locked', gate2: { decision: 'lock', notes: 'Locked from CLI.', decided_at: now } });
} else {
  writeEpisodeStatus(id, { ...status, status: 'gate1_locked', gate1: { decision: 'lock', notes: 'Locked from CLI.', decided_at: now } });
}
console.log(`Locked ${id}.`);
