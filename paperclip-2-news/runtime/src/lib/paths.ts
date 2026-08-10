import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const RUNTIME_DIR = runtimeDir;
export const PROJECT_DIR = path.resolve(runtimeDir, '..');
export const MAIN_AVINT_DIR = path.resolve(PROJECT_DIR, '..');
export const BACKLOG_DIR = path.join(PROJECT_DIR, 'backlog');
export const EPISODES_DIR = path.join(BACKLOG_DIR, 'episodes');
export const RESEARCH_RUNS_DIR = path.join(BACKLOG_DIR, 'research-runs');
export const SHARED_DIR = path.join(PROJECT_DIR, 'shared');
export const AGENTS_DIR = path.join(PROJECT_DIR, 'agents');
export const MAIN_ENV_LOCAL = path.join(MAIN_AVINT_DIR, '.env.local');
