import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { EPISODES_DIR } from '../lib/paths.js';

const id = process.argv[2];
if (!id) throw new Error('Usage: npm run review:edit -- <episode-id>');

const dir = path.join(EPISODES_DIR, id);
if (!fs.existsSync(dir)) throw new Error(`Episode folder does not exist: ${dir}`);

const editor = process.env.EDITOR || 'code';
const child = spawn(editor, [dir], { stdio: 'inherit', shell: true });
child.on('exit', (code) => {
  process.exit(code ?? 0);
});
