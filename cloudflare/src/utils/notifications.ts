// Shared notification helpers — batch DB inserts + parallel push

import type { Env } from '../types';
import { generateId } from './helpers';
import { sendPushNotification } from '../routes/notifications';

/**
 * Fire-and-forget wrapper for push notifications and other side-effect promises.
 * Logs the failure with context instead of swallowing it silently.
 */
export function firePushAndForget(promise: Promise<unknown>, context: string): void {
  promise.catch((err) => {
    console.error(`[fire-and-forget] ${context} failed:`, err);
  });
}

/**
 * Notify all managers/admins/directors of a tenant in one DB round-trip,
 * then fire push notifications in parallel (non-blocking).
 */
export async function notifyManagers(
  env: Env,
  tenantId: string | undefined | null,
  notification: {
    title: string;
    body: string;
    type: string;
    tag?: string;
    data?: Record<string, any>;
    requireInteraction?: boolean;
  }
) {
  const managers = await env.DB.prepare(
    `SELECT id FROM users WHERE role IN (?, ?, ?, ?) AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind('admin', 'director', 'manager', 'department_head', ...(tenantId ? [tenantId] : [])).all();

  if (!managers.results?.length) return;

  // Batch all notification INSERTs into a single round-trip
  const stmts = managers.results.map((m: any) =>
    env.DB.prepare(
      'INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, ?, ?, ?, ?, 0, datetime("now"), ?)'
    ).bind(
      generateId(),
      m.id,
      notification.type,
      notification.title,
      notification.body,
      notification.data ? JSON.stringify(notification.data) : null,
      tenantId || ''
    )
  );
  await env.DB.batch(stmts);

  // Fire push notifications in parallel — don't block the response
  Promise.allSettled(
    managers.results.map((m: any) =>
      sendPushNotification(env, m.id, {
        title: notification.title,
        body: notification.body,
        type: notification.type,
        tag: notification.tag,
        data: notification.data,
        requireInteraction: notification.requireInteraction,
      })
    )
  ).catch(() => {});
}
