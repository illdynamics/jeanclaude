import { redactObject } from './redact.js';

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  constructor(level) {
    this.minLevel = LEVELS[level] ?? LEVELS.info;
  }

  write(level, message, meta) {
    if (LEVELS[level] < this.minLevel) return;

    const entry = {
      ts: new Date().toISOString(),
      level,
      msg: message,
    };

    if (meta) {
      // Use key-aware redaction instead of blanket string redaction
      entry.meta = redactObject(meta);
    }

    process.stderr.write(JSON.stringify(entry) + '\n');
  }

  debug(message, meta) {
    this.write('debug', message, meta);
  }

  info(message, meta) {
    this.write('info', message, meta);
  }

  warn(message, meta) {
    this.write('warn', message, meta);
  }

  error(message, meta) {
    this.write('error', message, meta);
  }
}

let _logger = null;

export function createLogger(level) {
  _logger = new Logger(level);
  return _logger;
}

export function getLogger() {
  if (!_logger) {
    _logger = new Logger('info');
  }
  return _logger;
}

export function configureLogging(level) {
  _logger = new Logger(level);
  return _logger;
}
