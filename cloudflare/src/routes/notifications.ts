// Notifications, File Upload & Web Push routes — extracted from index.ts
// Contains: notifications CRUD, file upload, push subscriptions, sendPushNotification

import type { Env } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId } from '../middleware/tenant';
import { json, error, generateId, isManagement } from '../utils/helpers';

// VAPID keys for Web Push
const VAPID_PUBLIC_KEY = 'BMTJw9s4vAY9Bzb05L8--r0XUDirigcJ0_yTTGuCLZL2uk8693U82ef7LLlWyLf9T-3PucveTAjYS_I36uv7RY4';
const VAPID_PRIVATE_KEY = 'Iryr3rbGuDTBPiBCH07-NCqEzwufF-EOcBIK--DJ9yk';

export function registerNotificationRoutes() {

// ==================== NOTIFICATIONS ROUTES ====================

// Get notifications for current user
route('GET', '/api/notifications', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const unreadOnly = url.searchParams.get('unread') === 'true';

  let query = `SELECT * FROM notifications WHERE user_id = ? ${tenantId ? 'AND (tenant_id = ? OR tenant_id IS NULL)' : ''}`;
  if (unreadOnly) {
    query += ' AND is_read = 0';
  }
  query += ' ORDER BY created_at DESC LIMIT ?';

  const { results } = await env.DB.prepare(query).bind(authUser.id, ...(tenantId ? [tenantId] : []), limit).all();

  // Parse data field
  const notifications = (results as any[]).map(n => ({
    ...n,
    data: n.data ? JSON.parse(n.data) : null,
    is_read: Boolean(n.is_read),
  }));

  return json({ notifications });
});

// Get unread count
route('GET', '/api/notifications/count', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const result = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0 ${tenantId ? 'AND (tenant_id = ? OR tenant_id IS NULL)' : ''}`
  ).bind(authUser.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ count: (result as any)?.count || 0 });
});

// Create notification (management only)
route('POST', '/api/notifications', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Management access required', 403);

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.user_id,
    body.type,
    body.title,
    body.body || null,
    body.data ? JSON.stringify(body.data) : null,
    getTenantId(request) || null
  ).run();

  return json({ id, success: true });
});

// Mark notification as read
route('PATCH', '/api/notifications/:id/read', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  await env.DB.prepare(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, authUser.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// Mark all notifications as read
route('POST', '/api/notifications/read-all', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  await env.DB.prepare(
    `UPDATE notifications SET is_read = 1 WHERE user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(authUser.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// Delete notification
route('DELETE', '/api/notifications/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  await env.DB.prepare(
    `DELETE FROM notifications WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, authUser.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// ==================== FILE UPLOAD ROUTES ====================
// Simple file upload that converts files to base64 data URLs
// Max file size: 5MB, supports images and documents

route('POST', '/api/upload', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
  const ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];

  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return error('No file provided', 400);
      }

      if (file.size > MAX_FILE_SIZE) {
        return error('File too large. Maximum size is 5MB', 400);
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        return error('File type not allowed', 400);
      }

      // Convert to base64 data URL (chunked to handle large files)
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 32768;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const base64 = btoa(binary);
      const dataUrl = `data:${file.type};base64,${base64}`;

      return json({
        success: true,
        file: {
          name: file.name,
          url: dataUrl,
          type: file.type,
          size: file.size
        }
      });
    } else if (contentType.includes('application/json')) {
      // Handle base64 JSON upload
      const body = await request.json() as any;

      if (!body.data || !body.name || !body.type) {
        return error('Missing required fields: data, name, type', 400);
      }

      // Validate file type
      if (!ALLOWED_TYPES.includes(body.type)) {
        return error('File type not allowed', 400);
      }

      // Calculate base64 size (approximate)
      const base64Size = Math.ceil(body.data.length * 0.75);
      if (base64Size > MAX_FILE_SIZE) {
        return error('File too large. Maximum size is 5MB', 400);
      }

      // The data should already be base64, just add data URL prefix if needed
      const dataUrl = body.data.startsWith('data:')
        ? body.data
        : `data:${body.type};base64,${body.data}`;

      return json({
        success: true,
        file: {
          name: body.name,
          url: dataUrl,
          type: body.type,
          size: body.size || base64Size
        }
      });
    } else {
      return error('Unsupported content type. Use multipart/form-data or application/json', 400);
    }
  } catch (e) {
    console.error('[Upload] Error:', e);
    return error('Failed to process upload', 500);
  }
});

// ==================== WEB PUSH SUBSCRIPTION ROUTES ====================

// Push: Subscribe
route('POST', '/api/push/subscribe', async (request, env) => {
  console.log('[Push] Subscribe request received');

  const authUser = await getUser(request, env);
  if (!authUser) {
    console.log('[Push] Subscribe failed: User not authenticated');
    return error('Unauthorized', 401);
  }

  console.log(`[Push] User ${authUser.id} (${authUser.name}) attempting to subscribe`);

  let body: { endpoint: string; keys: { p256dh: string; auth: string } };
  try {
    body = await request.json() as { endpoint: string; keys: { p256dh: string; auth: string } };
  } catch (e) {
    console.error('[Push] Failed to parse request body:', e);
    return error('Invalid JSON body', 400);
  }

  console.log('[Push] Subscription data:', {
    hasEndpoint: !!body.endpoint,
    endpointStart: body.endpoint?.substring(0, 60),
    hasP256dh: !!body.keys?.p256dh,
    hasAuth: !!body.keys?.auth,
    p256dhLength: body.keys?.p256dh?.length,
    authLength: body.keys?.auth?.length
  });

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    console.log('[Push] Invalid subscription data - missing fields');
    return error('Invalid subscription data', 400);
  }

  const id = generateId();

  try {
    // Upsert subscription (update if endpoint exists)
    await env.DB.prepare(`
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        last_used_at = datetime('now')
    `).bind(id, authUser.id, body.endpoint, body.keys.p256dh, body.keys.auth).run();

    console.log(`[Push] SUCCESS! User ${authUser.id} subscribed, endpoint: ${body.endpoint.substring(0, 60)}...`);

    // Verify subscription was saved
    const saved = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').bind(authUser.id).first();
    console.log('[Push] Verified saved subscription:', saved ? 'EXISTS' : 'NOT FOUND');

    return json({ success: true, subscriptionId: id });
  } catch (dbError) {
    console.error('[Push] Database error saving subscription:', dbError);
    return error('Failed to save subscription', 500);
  }
});

// Push: Unsubscribe
route('POST', '/api/push/unsubscribe', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  await env.DB.prepare(
    'DELETE FROM push_subscriptions WHERE user_id = ?'
  ).bind(authUser.id).run();

  console.log(`[Push] User ${authUser.id} unsubscribed`);

  return json({ success: true });
});

// Push: Get subscription status
route('GET', '/api/push/status', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const subscription = await env.DB.prepare(
    'SELECT * FROM push_subscriptions WHERE user_id = ?'
  ).bind(authUser.id).first();

  return json({
    subscribed: !!subscription,
    subscription: subscription ? {
      endpoint: (subscription as any).endpoint,
      createdAt: (subscription as any).created_at,
      lastUsedAt: (subscription as any).last_used_at
    } : null
  });
});

// Push: Get VAPID public key
route('GET', '/api/push/vapid-key', async () => {
  return json({ publicKey: VAPID_PUBLIC_KEY });
});

} // end registerNotificationRoutes

// ==================== WEB PUSH IMPLEMENTATION ====================
// Using proper Web Push with VAPID authentication for Cloudflare Workers

// Helper: Base64 URL encode
function b64UrlEncode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Helper: Base64 URL decode
function b64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Helper: Concatenate Uint8Arrays
function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Create VAPID JWT token for authentication
async function createVapidAuthHeader(
  endpoint: string,
  subject: string,
  publicKey: string,
  privateKey: string
): Promise<{ authorization: string; cryptoKey: string }> {
  const endpointUrl = new URL(endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

  // JWT Header
  const header = { typ: 'JWT', alg: 'ES256' };
  const headerB64 = b64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));

  // JWT Payload
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: subject
  };
  const payloadB64 = b64UrlEncode(new TextEncoder().encode(JSON.stringify(jwtPayload)));

  // Import private key for signing
  const privateKeyBytes = b64UrlDecode(privateKey);

  // Create JWK from raw private key
  const publicKeyBytes = b64UrlDecode(publicKey);
  const x = publicKeyBytes.slice(1, 33);
  const y = publicKeyBytes.slice(33, 65);

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64UrlEncode(x),
    y: b64UrlEncode(y),
    d: b64UrlEncode(privateKeyBytes),
  };

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign JWT
  const unsignedToken = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw format (64 bytes)
  const signatureBytes = new Uint8Array(signature);
  const signatureB64 = b64UrlEncode(signatureBytes);

  const jwt = `${unsignedToken}.${signatureB64}`;

  return {
    authorization: `vapid t=${jwt}, k=${publicKey}`,
    cryptoKey: publicKey
  };
}

// Encrypt payload using Web Push encryption (RFC 8291 - aes128gcm)
async function encryptPushPayload(
  payload: string,
  p256dhKey: string,
  authSecret: string
): Promise<{ body: Uint8Array; headers: Record<string, string> }> {
  // Decode subscriber keys
  const subscriberPubKey = b64UrlDecode(p256dhKey);
  const auth = b64UrlDecode(authSecret);

  // Generate local ephemeral key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  ) as CryptoKeyPair;

  // Export local public key
  const localPubKeyRaw = await crypto.subtle.exportKey('raw', localKeyPair.publicKey) as ArrayBuffer;
  const localPubKey = new Uint8Array(localPubKeyRaw);

  // Import subscriber public key
  const subscriberKey = await crypto.subtle.importKey(
    'raw',
    subscriberPubKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Derive shared secret via ECDH
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberKey } as any,
    localKeyPair.privateKey,
    256
  );

  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Create info for HKDF
  const keyInfoPrefix = new TextEncoder().encode('WebPush: info\0');
  const keyInfo = concatUint8Arrays(keyInfoPrefix, subscriberPubKey, localPubKey);

  // Import shared secret as HKDF key
  const sharedSecretKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  // Derive IKM (Input Key Material)
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: auth, info: keyInfo },
    sharedSecretKey,
    256
  );

  // Import IKM for further derivation
  const ikmKey = await crypto.subtle.importKey(
    'raw',
    ikm,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  // Derive Content Encryption Key (CEK)
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt, info: cekInfo },
    ikmKey,
    128
  );

  // Derive Nonce
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt, info: nonceInfo },
    ikmKey,
    96
  );

  // Import CEK for AES-GCM encryption
  const cekKey = await crypto.subtle.importKey(
    'raw',
    cek,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // Pad payload (add delimiter byte 0x02)
  const payloadBytes = new TextEncoder().encode(payload);
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // Padding delimiter

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(nonce) },
    cekKey,
    paddedPayload
  );

  // Build aes128gcm content
  // Format: salt (16) + rs (4) + idlen (1) + keyid (65) + ciphertext
  const recordSize = 4096;
  const header = new Uint8Array(86); // 16 + 4 + 1 + 65
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = 65; // Key ID length (uncompressed EC point)
  header.set(localPubKey, 21);

  const body = concatUint8Arrays(header, new Uint8Array(encrypted));

  return {
    body,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400'
    }
  };
}

// Send Web Push notification
async function sendWebPush(
  env: Env,
  endpoint: string,
  p256dh: string,
  auth: string,
  payloadJson: string
): Promise<{ success: boolean; status?: number; error?: string }> {
  console.log(`[Push] Sending to endpoint: ${endpoint.substring(0, 60)}...`);
  console.log(`[Push] p256dh length: ${p256dh.length}, auth length: ${auth.length}`);

  try {
    // Create VAPID authorization
    console.log('[Push] Creating VAPID auth header...');
    const vapid = await createVapidAuthHeader(
      endpoint,
      `mailto:${env.VAPID_EMAIL || 'admin@kamizo.uz'}`,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    console.log('[Push] VAPID auth created successfully');

    // Encrypt payload
    console.log('[Push] Encrypting payload...');
    const { body, headers } = await encryptPushPayload(payloadJson, p256dh, auth);
    console.log(`[Push] Payload encrypted, body size: ${body.length} bytes`);

    // Send request
    console.log('[Push] Sending HTTP request to push service...');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Authorization': vapid.authorization
      },
      body
    });

    console.log(`[Push] Response status: ${response.status}`);

    if (response.ok || response.status === 201) {
      console.log(`[Push] SUCCESS! Status: ${response.status}`);
      return { success: true, status: response.status };
    }

    const errorText = await response.text();
    console.error(`[Push] FAILED ${response.status}: ${errorText}`);
    return { success: false, status: response.status, error: errorText };
  } catch (err) {
    console.error('[Push] EXCEPTION:', err);
    return { success: false, error: String(err) };
  }
}

// Helper function to send push notification (for internal use)
export async function sendPushNotification(
  env: Env,
  userId: string,
  notification: {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    type?: string;
    data?: Record<string, any>;
    requireInteraction?: boolean;
    skipInApp?: boolean;
    tenantId?: string | null;
  }
): Promise<boolean> {
  // Get user's push subscriptions
  const { results } = await env.DB.prepare(
    'SELECT * FROM push_subscriptions WHERE user_id = ?'
  ).bind(userId).all();

  if (!results || results.length === 0) {
    console.log(`[Push] No subscriptions for user ${userId}`);
    return false;
  }

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    icon: notification.icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: notification.tag || 'kamizo-' + Date.now(),
    type: notification.type,
    data: notification.data || {},
    requireInteraction: notification.requireInteraction ?? true,
    vibrate: [200, 100, 200]
  });

  let successCount = 0;

  for (const sub of results as any[]) {
    try {
      // Send real Web Push notification
      const result = await sendWebPush(
        env,
        sub.endpoint,
        sub.p256dh,
        sub.auth,
        payload
      );

      if (result.success) {
        // Update last_used_at on success
        await env.DB.prepare(
          'UPDATE push_subscriptions SET last_used_at = datetime(\'now\') WHERE id = ?'
        ).bind(sub.id).run();

        successCount++;
        console.log(`[Push] Successfully sent to user ${userId}`);
      } else {
        console.error(`[Push] Failed for user ${userId}: ${result.error}`);

        // Remove invalid subscriptions (410 Gone or 404 Not Found)
        if (result.status === 410 || result.status === 404) {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
          console.log(`[Push] Removed expired subscription for user ${userId}`);
        }
      }
    } catch (err) {
      console.error(`[Push] Error sending to ${sub.endpoint}:`, err);
    }
  }

  // Store in-app notification (unless caller handles it separately via skipInApp flag)
  if (!notification.skipInApp) {
    const notifId = generateId();
    try {
      const existingNotif = notification.tag
        ? await env.DB.prepare(
            `SELECT id FROM notifications WHERE user_id = ? AND data LIKE ? AND created_at > datetime('now', '-1 minute')`
          ).bind(userId, `%"tag":"${notification.tag}"%`).first()
        : null;

      if (!existingNotif) {
        await env.DB.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), ?)
        `).bind(
          notifId,
          userId,
          notification.type || 'push',
          notification.title,
          notification.body,
          JSON.stringify({ ...notification.data, tag: notification.tag }),
          notification.tenantId || null
        ).run();
      }
    } catch (e) {
      console.error('[Notification] Failed to store in-app notification:', e);
    }
  }

  return successCount > 0;
}

// Push: Send test notification (for debugging)
route('POST', '/api/push/test', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const sent = await sendPushNotification(env, authUser.id, {
    title: '🔔 Тестовое уведомление',
    body: 'Push уведомления работают! Это тестовое сообщение от Kamizo.',
    type: 'test',
    tag: 'test-notification',
    data: { url: '/' }
  });

  return json({ success: sent, message: sent ? 'Notification sent' : 'No subscriptions found' });
});

// Push: Send notification to specific user (admin only)
route('POST', '/api/push/send', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || !['admin', 'director', 'manager'].includes(authUser.role)) {
    return error('Admin access required', 403);
  }

  const body = await request.json() as {
    userId: string;
    title: string;
    body: string;
    type?: string;
    data?: Record<string, any>;
  };

  if (!body.userId || !body.title || !body.body) {
    return error('userId, title, and body are required', 400);
  }

  const sent = await sendPushNotification(env, body.userId, {
    title: body.title,
    body: body.body,
    type: body.type,
    data: body.data,
    requireInteraction: true
  });

  return json({ success: sent });
});

// Push: Broadcast notification to multiple users (admin only)
route('POST', '/api/push/broadcast', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || !['admin', 'director', 'manager'].includes(authUser.role)) {
    return error('Admin access required', 403);
  }

  const body = await request.json() as {
    userIds?: string[];
    role?: string;
    buildingId?: string;
    title: string;
    body: string;
    type?: string;
    data?: Record<string, any>;
  };

  if (!body.title || !body.body) {
    return error('title and body are required', 400);
  }

  let userIds: string[] = [];

  if (body.userIds) {
    userIds = body.userIds;
  } else if (body.role || body.buildingId) {
    // Get users by criteria
    let query = 'SELECT id FROM users WHERE 1=1';
    const params: string[] = [];

    if (body.role) {
      query += ' AND role = ?';
      params.push(body.role);
    }
    if (body.buildingId) {
      query += ' AND building_id = ?';
      params.push(body.buildingId);
    }

    const { results } = await env.DB.prepare(query).bind(...params).all();
    userIds = (results as any[]).map(u => u.id);
  }

  let sentCount = 0;
  for (const userId of userIds) {
    const sent = await sendPushNotification(env, userId, {
      title: body.title,
      body: body.body,
      type: body.type || 'broadcast',
      data: body.data,
      requireInteraction: true
    });
    if (sent) sentCount++;
  }

  return json({ success: true, sentCount, totalUsers: userIds.length });
});

// Send notification to multiple users
route('POST', '/api/notifications/broadcast', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const { user_ids, type, title, body: notifBody, data } = body;

  if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return error('user_ids array required', 400);
  }

  const statements = user_ids.map((userId: string) => {
    const id = generateId();
    return env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, userId, type, title, notifBody || null, data ? JSON.stringify(data) : null);
  });

  await env.DB.batch(statements);

  return json({ success: true, count: user_ids.length });
});
