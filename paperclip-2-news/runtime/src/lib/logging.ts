const levels = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = (typeof levels)[number];

function currentLevel(): LogLevel {
  const level = process.env.LOG_LEVEL;
  return levels.includes(level as LogLevel) ? (level as LogLevel) : 'info';
}

function enabled(level: LogLevel) {
  return levels.indexOf(level) >= levels.indexOf(currentLevel());
}

export const log = {
  debug(message: string, data?: unknown) {
    if (enabled('debug')) console.log(`[debug] ${message}`, data ?? '');
  },
  info(message: string, data?: unknown) {
    if (enabled('info')) console.log(`[info] ${message}`, data ?? '');
  },
  warn(message: string, data?: unknown) {
    if (enabled('warn')) console.warn(`[warn] ${message}`, data ?? '');
  },
  error(message: string, data?: unknown) {
    if (enabled('error')) console.error(`[error] ${message}`, data ?? '');
  },
};
