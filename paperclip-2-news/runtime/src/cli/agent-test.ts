import { runAdWriter } from '../agents/ad-writer.js';
import { runAnimationEngineer } from '../agents/animation-engineer.js';
import { runEditorAssembler } from '../agents/editor-assembler.js';
import { runJokeDoctor } from '../agents/joke-doctor.js';
import { runProducer } from '../agents/producer.js';
import { runPublisher } from '../agents/publisher.js';
import { runResearcher } from '../agents/researcher.js';
import { runScriptWriter } from '../agents/script-writer.js';
import { runStoryboardArtist } from '../agents/storyboard-artist.js';
import { runThumbnailTitler } from '../agents/thumbnail-titler.js';
import { runVoiceDirector } from '../agents/voice-director.js';

const agent = process.argv[2];
if (!agent) throw new Error('Usage: npm run agent:test -- <agent-name>');

const today = new Date().toISOString().slice(0, 10);
const runners: Record<string, () => Promise<unknown>> = {
  researcher: () =>
    runResearcher({
      mode: 'daily',
      scopeStart: today,
      scopeEnd: today,
      brief: 'Tiny test: rank 3 AI news stories from supplied public sources.',
      outputTarget: 3,
    }),
  producer: () =>
    runProducer({
      mode: 'inventory',
      phase: 'brief_research',
      scope: { start: today, end: today },
      target: 1,
    }),
  'script-writer': () => runScriptWriter({ planId: '001', segmentSlot: 'cold_open' }),
  'joke-doctor': () => runJokeDoctor({ planId: '001', segmentSlot: 'cold_open' }),
  'storyboard-artist': () => runStoryboardArtist({ planId: '001' }),
  'ad-writer': () => runAdWriter({ planId: '001' }),
  'voice-director': () => runVoiceDirector({ planId: '001' }),
  'animation-engineer': () => runAnimationEngineer({ planId: '001' }),
  'editor-assembler': () => runEditorAssembler({ planId: '001' }),
  'thumbnail-titler': () => runThumbnailTitler({ planId: '001' }),
  publisher: () => runPublisher({ planId: '001' }),
};

const runner = runners[agent];
if (!runner) throw new Error(`Unknown agent: ${agent}`);
console.log(JSON.stringify(await runner(), null, 2));
