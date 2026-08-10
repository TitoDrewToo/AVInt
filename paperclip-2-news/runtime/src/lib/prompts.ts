import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR, SHARED_DIR } from './paths.js';

const agentSpecByRuntimeName: Record<string, string> = {
  researcher: 'news-scout',
  producer: 'showrunner',
  'script-writer': 'script-writer',
  'joke-doctor': 'joke-doctor',
  'storyboard-artist': 'storyboard-artist',
  'ad-writer': 'ad-writer',
  'voice-director': 'voice-director',
  'animation-engineer': 'animation-engineer',
  'editor-assembler': 'editor-assembler',
  'thumbnail-titler': 'thumbnail-titler',
  publisher: 'publisher',
};

export const runtimeAgentNames = Object.keys(agentSpecByRuntimeName);

export function agentSpecPath(agentName: string) {
  const spec = agentSpecByRuntimeName[agentName] ?? agentName;
  return path.join(AGENTS_DIR, `${spec}.md`);
}

export function extractSystemPrompt(markdown: string) {
  const heading = markdown.search(/^## System Prompt/m);
  const skeleton = markdown.search(/^## System Prompt \(skeleton/m);
  const start = skeleton >= 0 ? skeleton : heading;
  if (start < 0) throw new Error('System Prompt section not found');

  const section = markdown.slice(start);
  const fence = section.match(/```(?:[a-zA-Z]+)?\n([\s\S]*?)```/);
  if (fence?.[1]?.trim()) return fence[1].trim();

  const nextHeading = section.slice(1).search(/\n## /);
  const raw = nextHeading >= 0 ? section.slice(0, nextHeading + 1) : section;
  const prompt = raw.replace(/^## .*\n/, '').trim();
  if (!prompt) throw new Error('System Prompt section is empty');
  return prompt;
}

export function referencedSharedSpecs(markdown: string) {
  return Array.from(markdown.matchAll(/shared\/([a-z0-9-]+\.md)/gi))
    .map((match) => match[1])
    .filter((value, index, all) => all.indexOf(value) === index);
}

export async function loadPrompt(agentName: string) {
  const specPath = agentSpecPath(agentName);
  const spec = await fs.promises.readFile(specPath, 'utf8');
  const systemPrompt = extractSystemPrompt(spec);
  const shared = await Promise.all(
    referencedSharedSpecs(spec).map(async (fileName) => {
      const filePath = path.join(SHARED_DIR, fileName);
      const content = await fs.promises.readFile(filePath, 'utf8');
      if (!content.trim()) throw new Error(`Shared spec is empty: ${filePath}`);
      return `# shared/${fileName}\n\n${content}`;
    }),
  );

  const cacheableSystem = [`# Agent spec\n\n${spec}`, ...shared].join('\n\n---\n\n');
  return {
    system: `${systemPrompt}\n\nUse file-based backlog artifacts. Do not mention Supabase; this runtime stores outputs as local files.`,
    cacheableSystem,
  };
}
