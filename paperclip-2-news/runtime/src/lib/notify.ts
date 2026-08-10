import { execFile } from 'node:child_process';

export function notify(message: string, title = 'Paperclip-2') {
  console.log(`[Paperclip-2] ${message}`);
  if (process.platform !== 'darwin') return;

  const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`;
  execFile('osascript', ['-e', script], (error) => {
    if (error && process.env.LOG_LEVEL === 'debug') {
      console.warn(`[notify] osascript failed: ${error.message}`);
    }
  });
}
