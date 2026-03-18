// Sentry error reporting for Cloudflare Workers (via fetch API — no npm deps)
// Uses Sentry Envelope format: https://develop.sentry.dev/sdk/envelopes/
//
// Requires SENTRY_DSN secret in env (e.g. https://key@o123.ingest.sentry.io/456)
// If SENTRY_DSN is not set, falls back to structured console.error logging.

interface SentryContext {
  requestId: string;
  method: string;
  path: string;
  userId?: string;
}

interface SentryDsn {
  publicKey: string;
  host: string;
  projectId: string;
}

function parseDsn(dsn: string): SentryDsn | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const host = url.hostname;
    const projectId = url.pathname.replace('/', '');
    if (!publicKey || !host || !projectId) return null;
    return { publicKey, host, projectId };
  } catch {
    return null;
  }
}

/**
 * Report an error to Sentry via HTTP envelope format.
 * Safe to call in any context — never throws, never blocks.
 */
export function reportError(
  error: Error,
  context: SentryContext,
  env: { SENTRY_DSN?: string }
): void {
  const dsn = env.SENTRY_DSN;

  // Graceful fallback: just log structured JSON if no DSN
  if (!dsn) {
    console.error(JSON.stringify({
      level: 'error',
      message: error.message,
      stack: error.stack,
      ...context,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  const parsed = parseDsn(dsn);
  if (!parsed) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Invalid SENTRY_DSN format',
      dsn: dsn.substring(0, 20) + '...',
    }));
    return;
  }

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const timestamp = new Date().toISOString();

  // Sentry event payload
  const event = {
    event_id: eventId,
    timestamp,
    platform: 'node',
    level: 'error',
    server_name: 'kamizo-workers',
    environment: 'production',
    exception: {
      values: [{
        type: error.name || 'Error',
        value: error.message,
        stacktrace: error.stack ? {
          frames: parseStack(error.stack),
        } : undefined,
      }],
    },
    request: {
      method: context.method,
      url: context.path,
    },
    tags: {
      requestId: context.requestId,
      ...(context.userId ? { userId: context.userId } : {}),
    },
  };

  // Envelope format: header\nitem_header\npayload
  const envelopeHeader = JSON.stringify({
    event_id: eventId,
    dsn,
    sent_at: timestamp,
  });
  const itemHeader = JSON.stringify({
    type: 'event',
    content_type: 'application/json',
  });
  const envelope = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}`;

  const url = `https://${parsed.host}/api/${parsed.projectId}/envelope/`;

  // Fire-and-forget — never block the response
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=kamizo-workers/1.0, sentry_key=${parsed.publicKey}`,
    },
    body: envelope,
  }).catch(() => {
    // Silently ignore — Sentry is best-effort
  });
}

/** Parse a JS Error.stack into Sentry stack frames (reversed order). */
function parseStack(stack: string): Array<{ filename: string; lineno?: number; colno?: number; function: string }> {
  const lines = stack.split('\n').slice(1); // skip first "Error: message" line
  const frames = lines.map(line => {
    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) ||
                  line.match(/at\s+(.+?):(\d+):(\d+)/);
    if (match && match.length >= 4) {
      return {
        function: match[1] || '<anonymous>',
        filename: match[2] || '<unknown>',
        lineno: parseInt(match[3], 10) || undefined,
        colno: parseInt(match[4], 10) || undefined,
      };
    }
    return { function: line.trim(), filename: '<unknown>' };
  }).filter(f => f.function !== '');

  // Sentry expects frames in reverse order (most recent last)
  return frames.reverse();
}
