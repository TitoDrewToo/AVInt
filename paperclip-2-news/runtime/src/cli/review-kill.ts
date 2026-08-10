import { readEpisodeStatus, writeEpisodeStatus } from '../lib/files.js';

const id = process.argv[2];
if (!id) throw new Error('Usage: npm run review:kill -- <episode-id>');

const status = readEpisodeStatus(id);
const now = new Date().toISOString();
const gate = status.status === 'pending_gate2' || status.status === 'scripts_ready' ? 'gate2' : 'gate1';
writeEpisodeStatus(id, {
  ...status,
  status: 'killed',
  [gate]: { decision: 'kill', notes: 'Killed from CLI.', decided_at: now },
});
console.log(`Killed ${id}.`);
