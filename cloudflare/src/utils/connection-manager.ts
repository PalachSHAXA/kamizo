import type { Env } from '../types';
import { createRequestLogger } from './logger';

const missingBindingWarnings = new WeakMap<object, Set<string>>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function warnMissingBindingOnce(env: Env, request: Request, operation: string): void {
  let warnedOperations = missingBindingWarnings.get(env);
  if (!warnedOperations) {
    warnedOperations = new Set();
    missingBindingWarnings.set(env, warnedOperations);
  }
  if (warnedOperations.has(operation)) return;

  warnedOperations.add(operation);
  createRequestLogger(request).warn(
    'Realtime operation skipped: CONNECTION_MANAGER unavailable',
    { operation },
  );
}

export function getConnectionManager(
  env: Env,
  request: Request,
  operation: string,
): DurableObjectStub | null {
  const namespace = env.CONNECTION_MANAGER;
  if (!namespace) {
    warnMissingBindingOnce(env, request, operation);
    return null;
  }

  try {
    return namespace.get(namespace.idFromName('global'));
  } catch (error) {
    createRequestLogger(request).warn('Realtime operation unavailable', {
      operation,
      error: errorMessage(error),
    });
    return null;
  }
}

export async function broadcastWithConnectionManager(
  env: Env,
  request: Request,
  operation: string,
  url: string,
  init: RequestInit,
): Promise<void> {
  const stub = getConnectionManager(env, request, operation);
  if (!stub) return;

  try {
    await stub.fetch(url, init);
  } catch (error) {
    createRequestLogger(request).warn('Realtime broadcast failed', {
      operation,
      error: errorMessage(error),
    });
  }
}
