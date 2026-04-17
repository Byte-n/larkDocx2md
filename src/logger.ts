import { LoggerLevel } from '@larksuiteoapi/node-sdk';

const COLORS: Record<number, string> = {
  [LoggerLevel.fatal]: '\x1b[35m', // magenta
  [LoggerLevel.error]: '\x1b[31m', // red
  [LoggerLevel.warn]: '\x1b[33m', // yellow
  [LoggerLevel.info]: '\x1b[36m', // cyan
  [LoggerLevel.debug]: '\x1b[32m', // green
  [LoggerLevel.trace]: '\x1b[90m', // gray
};
const RESET = '\x1b[0m';
const LEVEL_NAMES = ['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
let minLogLevel = LoggerLevel.trace;

function log (level: LoggerLevel, module: string, ...args: unknown[]) {
  if (level > minLogLevel) return;
  const time = new Date().toISOString();
  const color = COLORS[level] ?? '';
  const name = LEVEL_NAMES[level] ?? 'INFO';
  process.stderr.write(`${time} ${color}[${name}]${RESET} [${module}] ${args.map(String).join(' ')}\n`);
}

export function setLogLevel (level: LoggerLevel) {
  minLogLevel = level;
}

export function createLogger (module: string) {
  return {
    fatal: (...args: unknown[]) => log(LoggerLevel.fatal, module, ...args),
    error: (...args: unknown[]) => log(LoggerLevel.error, module, ...args),
    warn: (...args: unknown[]) => log(LoggerLevel.warn, module, ...args),
    info: (...args: unknown[]) => log(LoggerLevel.info, module, ...args),
    debug: (...args: unknown[]) => log(LoggerLevel.debug, module, ...args),
    trace: (...args: unknown[]) => log(LoggerLevel.trace, module, ...args),
  };
}
