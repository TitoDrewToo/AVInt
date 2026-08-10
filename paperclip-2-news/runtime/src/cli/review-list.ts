import { listEpisodes } from '../lib/files.js';

function age(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.max(0, Math.floor(ms / 3_600_000));
  if (hours < 1) return '<1h ago';
  return `${hours}h ago`;
}

export function renderReviewList() {
  const episodes = listEpisodes();
  const gate1 = episodes.filter((episode) => episode.status === 'pending_gate1');
  const gate2 = episodes.filter((episode) => episode.status === 'pending_gate2' || episode.status === 'scripts_ready');
  const locked = episodes.filter((episode) => episode.gate1?.decision === 'lock' || episode.gate2?.decision === 'lock');

  const lines = ['PENDING REVIEW', '', 'Gate 1 (episode plans):'];
  if (gate1.length === 0) lines.push('  (none)');
  for (const episode of gate1) {
    lines.push(`  ${episode.id}  spine: "${episode.spine}"     waiting ${age(episode.updated_at)}`);
  }

  lines.push('', 'Gate 2 (final scripts):');
  if (gate2.length === 0) lines.push('  (none)');
  for (const episode of gate2) {
    lines.push(`  ${episode.id}  spine: "${episode.spine}"     waiting ${age(episode.updated_at)}`);
  }

  lines.push('', 'Locked episodes:');
  if (locked.length === 0) lines.push('  (none)');
  for (const episode of locked) {
    lines.push(`  ${episode.id}  status: ${episode.status}  spine: "${episode.spine}"`);
  }

  lines.push(
    '',
    'To review:',
    '  Open paperclip-2-news/backlog/episodes/<id>/ in your editor.',
    '  Run: make review:lock id=<id>    (approves and continues pipeline)',
    '  Run: make review:kill id=<id>    (drops the episode)',
    '  Run: make review:edit id=<id>    (opens the episode folder)',
  );

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(renderReviewList());
}
