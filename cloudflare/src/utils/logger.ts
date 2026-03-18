// Structured JSON logger for Cloudflare Workers
// Usage: const log = createRequestLogger(request);
//        log.info('Processing request', { userId: '123' });
// TODO: Migrate route files from console.log/error to use this logger

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  requestId: string;
  level: LogLevel;
  message: string;
  method: string;
  path: string;
  timestamp: string;
  durationMs?: number;
  data?: Record<string, unknown>;
  error?: string;
  stack?: string;
}

export interface RequestLogger {
  readonly requestId: string;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, err?: unknown, data?: Record<string, unknown>): void;
}

function generateRequestId(): string {
  // Short 8-char hex ID (collision-resistant enough for per-request use)
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function createRequestLogger(request: Request): RequestLogger {
  const url = new URL(request.url);
  const requestId = generateRequestId();
  const method = request.method;
  const path = url.pathname;

  function log(level: LogLevel, message: string, data?: Record<string, unknown>, err?: unknown): void {
    const entry: LogEntry = {
      requestId,
      level,
      message,
      method,
      path,
      timestamp: new Date().toISOString(),
      data: data || undefined,
    };

    if (err instanceof Error) {
      entry.error = err.message;
      entry.stack = err.stack;
    } else if (err !== undefined && err !== null) {
      entry.error = String(err);
    }

    // Single-line JSON output for log aggregation (Cloudflare Workers Logpush, etc.)
    const output = JSON.stringify(entry);

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  return {
    requestId,
    info: (message, data) => log('info', message, data),
    warn: (message, data) => log('warn', message, data),
    error: (message, err, data) => log('error', message, data, err),
  };
}
