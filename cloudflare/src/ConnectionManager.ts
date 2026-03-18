/**
 * Durable Object for managing WebSocket connections
 *
 * Architecture:
 * - Single DO instance per building (sharded by building_id)
 * - All WS connections managed in-memory with O(1) reverse lookup
 * - Parallel D1 polling every 3 seconds for change detection
 * - Direct push from API routes via POST /broadcast
 * - Broadcasts only to subscribed sessions with pre-serialized JSON
 */

import { DurableObject } from 'cloudflare:workers';

interface Env {
  DB: D1Database;
  RATE_LIMITER: KVNamespace;
}

interface WebSocketSession {
  ws: WebSocket;
  userId: string;
  userName: string;
  role: string;
  buildingId?: string;
  tenantId?: string;
  subscriptions: Set<string>;
  lastPing: number;
}

interface UpdateMessage {
  type: string;
  data: any;
  channels: string[];
}

export class ConnectionManager extends DurableObject {
  private sessions: Map<string, WebSocketSession>;
  private wsToSession: Map<WebSocket, string>; // O(1) reverse lookup
  private pollInterval: number | null;
  private lastHashes: Map<string, string>; // Unified hash tracking
  protected override env: Env;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sessions = new Map();
    this.wsToSession = new Map();
    this.pollInterval = null;
    this.lastHashes = new Map();
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade request
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // Direct broadcast from API routes (POST /broadcast)
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      try {
        const message = await request.json() as UpdateMessage;
        this.broadcastUpdate(message);
        return new Response('OK', { status: 200 });
      } catch (e) {
        return new Response('Invalid broadcast payload', { status: 400 });
      }
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        sessions: this.sessions.size,
        polling: !!this.pollInterval,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Expected WebSocket upgrade or /broadcast POST', { status: 400 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const userName = url.searchParams.get('userName');
    const role = url.searchParams.get('role');
    const buildingId = url.searchParams.get('buildingId') || undefined;
    const tenantId = url.searchParams.get('tenantId') || undefined;

    if (!userId || !userName || !role) {
      return new Response('Missing authentication parameters', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    const sessionId = crypto.randomUUID();
    const subscriptions = this.buildSubscriptions(userId, role, buildingId);

    const session: WebSocketSession = {
      ws: server,
      userId,
      userName,
      role,
      buildingId,
      tenantId,
      subscriptions,
      lastPing: Date.now(),
    };

    this.sessions.set(sessionId, session);
    this.wsToSession.set(server, sessionId);

    console.log(`[DO] New connection: ${userName} (${role}), total: ${this.sessions.size}`);

    server.send(JSON.stringify({
      type: 'connected',
      data: {
        sessionId,
        userId,
        role,
        subscriptions: Array.from(subscriptions),
        timestamp: new Date().toISOString(),
      },
    }));

    // Start polling if first connection
    if (this.sessions.size === 1) {
      this.startPolling();
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private buildSubscriptions(userId: string, role: string, buildingId?: string): Set<string> {
    const subs = new Set<string>();

    subs.add(`user:${userId}`);
    subs.add(`chat:user:${userId}`);

    if (role === 'resident') {
      subs.add(`requests:resident:${userId}`);
      subs.add(`reschedule:user:${userId}`);
      if (buildingId) {
        subs.add(`announcements:building:${buildingId}`);
        subs.add(`meetings:building:${buildingId}`);
      }
    } else if (role === 'executor') {
      subs.add(`requests:executor:${userId}`);
      subs.add(`requests:new`);
      subs.add(`reschedule:user:${userId}`);
      subs.add(`announcements:all`);
    } else if (['manager', 'admin', 'director', 'dispatcher', 'department_head'].includes(role)) {
      subs.add(`requests:all`);
      subs.add(`executors:all`);
      subs.add(`meetings:all`);
      subs.add(`announcements:all`);
      subs.add(`chat:all`);
    }

    return subs;
  }

  // Hibernation lifecycle hooks (primary message handler after wake)
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const sessionId = this.wsToSession.get(ws);
    if (sessionId) {
      this.handleMessage(sessionId, message);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const sessionId = this.wsToSession.get(ws);
    if (sessionId) {
      this.handleClose(sessionId);
    }
    this.wsToSession.delete(ws);
  }

  private handleMessage(sessionId: string, data: string | ArrayBuffer) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'ping') {
        session.lastPing = Date.now();
        session.ws.send('{"type":"pong"}');
        return;
      }

      if (message.type === 'subscribe') {
        const channels = Array.isArray(message.channels) ? message.channels : [message.channels];
        for (const ch of channels) {
          // Only allow subscribing to own user channels (prevent cross-tenant snooping)
          if (ch.includes(':user:') && !ch.endsWith(`:${session.userId}`)) continue;
          session.subscriptions.add(ch);
        }
      }

      if (message.type === 'unsubscribe') {
        const channels = Array.isArray(message.channels) ? message.channels : [message.channels];
        for (const ch of channels) session.subscriptions.delete(ch);
      }
    } catch (error) {
      console.error('[DO] Error handling message:', error);
    }
  }

  private handleClose(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.wsToSession.delete(session.ws);
      this.sessions.delete(sessionId);

      if (this.sessions.size === 0) {
        this.stopPolling();
      }
    }
  }

  private startPolling() {
    if (this.pollInterval) return;
    console.log('[DO] Starting parallel database polling');
    this.pollInterval = setInterval(() => { this.pollDatabase(); }, 3000) as any;
    this.pollDatabase();
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // Parallel polling — all checks run concurrently
  private async pollDatabase() {
    try {
      await Promise.all([
        this.checkRequestsUpdate(),
        this.checkMeetingsUpdate(),
        this.checkAnnouncementsUpdate(),
        this.checkChatUpdate(),
        this.checkRescheduleUpdate(),
      ]);
      this.cleanupDeadConnections();
    } catch (error) {
      console.error('[DO] Error polling database:', error);
    }
  }

  private async checkRequestsUpdate() {
    try {
      const result = await this.env.DB.prepare(`
        SELECT GROUP_CONCAT(id || status || updated_at ORDER BY updated_at DESC) as hash
        FROM (SELECT id, status, updated_at FROM requests WHERE updated_at > datetime('now', '-1 hour') ORDER BY updated_at DESC LIMIT 100)
      `).first() as any;

      const currentHash = result?.hash || '';
      if (!currentHash || currentHash === this.lastHashes.get('requests')) return;
      this.lastHashes.set('requests', currentHash);

      const { results } = await this.env.DB.prepare(`
        SELECT r.*, r.tenant_id, u.name as resident_name, u.phone as resident_phone,
               e.name as executor_name, e.phone as executor_phone
        FROM requests r
        LEFT JOIN users u ON r.resident_id = u.id
        LEFT JOIN users e ON r.executor_id = e.id
        WHERE r.updated_at > datetime('now', '-1 hour')
        ORDER BY r.updated_at DESC LIMIT 100
      `).all();

      // Group by tenant for isolated broadcasts
      const byTenant = new Map<string, any[]>();
      for (const req of results as any[]) {
        const tid = (req as any).tenant_id || '';
        if (!byTenant.has(tid)) byTenant.set(tid, []);
        byTenant.get(tid)!.push(req);
      }

      for (const [tid, tenantRequests] of byTenant) {
        // Broadcast to management (they see all within their tenant)
        this.broadcastUpdate({
          type: 'request_update',
          data: { requests: tenantRequests },
          channels: ['requests:all'],
          tenantId: tid || undefined,
        });

        // Group by user to avoid N+1 broadcasts
        const byResident = new Map<string, any[]>();
        const byExecutor = new Map<string, any[]>();

        for (const req of tenantRequests) {
          if (req.resident_id) {
            if (!byResident.has(req.resident_id)) byResident.set(req.resident_id, []);
            byResident.get(req.resident_id)!.push(req);
          }
          if (req.executor_id) {
            if (!byExecutor.has(req.executor_id)) byExecutor.set(req.executor_id, []);
            byExecutor.get(req.executor_id)!.push(req);
          }
        }

        for (const [residentId, reqs] of byResident) {
          this.broadcastUpdate({
            type: 'request_update',
            data: { requests: reqs },
            channels: [`requests:resident:${residentId}`],
            tenantId: tid || undefined,
          });
        }

        for (const [executorId, reqs] of byExecutor) {
          this.broadcastUpdate({
            type: 'request_update',
            data: { requests: reqs },
            channels: [`requests:executor:${executorId}`],
            tenantId: tid || undefined,
          });
        }
      }
    } catch (error) {
      console.error('[DO] Error checking requests:', error);
    }
  }

  private async checkMeetingsUpdate() {
    try {
      const result = await this.env.DB.prepare(`
        SELECT GROUP_CONCAT(id || status || updated_at ORDER BY updated_at DESC) as hash
        FROM (SELECT id, status, updated_at FROM meetings WHERE updated_at > datetime('now', '-24 hours') ORDER BY updated_at DESC LIMIT 50)
      `).first() as any;

      const currentHash = result?.hash || '';
      if (!currentHash || currentHash === this.lastHashes.get('meetings')) return;
      this.lastHashes.set('meetings', currentHash);

      const { results } = await this.env.DB.prepare(`
        SELECT *, tenant_id FROM meetings WHERE updated_at > datetime('now', '-24 hours') ORDER BY updated_at DESC LIMIT 50
      `).all();

      // Group by tenant for isolated broadcasts
      const byTenant = new Map<string, any[]>();
      for (const m of results as any[]) {
        const tid = m.tenant_id || '';
        if (!byTenant.has(tid)) byTenant.set(tid, []);
        byTenant.get(tid)!.push(m);
      }

      for (const [tid, tenantMeetings] of byTenant) {
        this.broadcastUpdate({
          type: 'meeting_update',
          data: { meetings: tenantMeetings },
          channels: ['meetings:all'],
          tenantId: tid || undefined,
        });

        // Group by building for residents
        const byBuilding = new Map<string, any[]>();
        for (const m of tenantMeetings) {
          if (m.building_id) {
            if (!byBuilding.has(m.building_id)) byBuilding.set(m.building_id, []);
            byBuilding.get(m.building_id)!.push(m);
          }
        }

        for (const [buildingId, meetings] of byBuilding) {
          this.broadcastUpdate({
            type: 'meeting_update',
            data: { meetings },
            channels: [`meetings:building:${buildingId}`],
            tenantId: tid || undefined,
          });
        }
      }
    } catch (error) {
      console.error('[DO] Error checking meetings:', error);
    }
  }

  private async checkAnnouncementsUpdate() {
    try {
      const result = await this.env.DB.prepare(`
        SELECT GROUP_CONCAT(id || created_at ORDER BY created_at DESC) as hash
        FROM (SELECT id, created_at FROM announcements WHERE created_at > datetime('now', '-24 hours') ORDER BY created_at DESC LIMIT 50)
      `).first() as any;

      const currentHash = result?.hash || '';
      if (!currentHash || currentHash === this.lastHashes.get('announcements')) return;
      this.lastHashes.set('announcements', currentHash);

      const { results } = await this.env.DB.prepare(`
        SELECT *, tenant_id FROM announcements WHERE created_at > datetime('now', '-24 hours') ORDER BY created_at DESC LIMIT 50
      `).all();

      // Group by tenant for isolated broadcasts
      const byTenant = new Map<string, any[]>();
      for (const a of results as any[]) {
        const tid = a.tenant_id || '';
        if (!byTenant.has(tid)) byTenant.set(tid, []);
        byTenant.get(tid)!.push(a);
      }

      for (const [tid, tenantAnnouncements] of byTenant) {
        this.broadcastUpdate({
          type: 'announcement_update',
          data: { announcements: tenantAnnouncements },
          channels: ['announcements:all'],
          tenantId: tid || undefined,
        });

        const byBuilding = new Map<string, any[]>();
        for (const a of tenantAnnouncements) {
          if (a.target_building_id) {
            if (!byBuilding.has(a.target_building_id)) byBuilding.set(a.target_building_id, []);
            byBuilding.get(a.target_building_id)!.push(a);
          }
        }

        for (const [buildingId, announcements] of byBuilding) {
          this.broadcastUpdate({
            type: 'announcement_update',
            data: { announcements },
            channels: [`announcements:building:${buildingId}`],
            tenantId: tid || undefined,
          });
        }
      }
    } catch (error) {
      console.error('[DO] Error checking announcements:', error);
    }
  }

  private async checkChatUpdate() {
    try {
      const result = await this.env.DB.prepare(`
        SELECT GROUP_CONCAT(id || created_at ORDER BY created_at DESC) as hash
        FROM (SELECT id, created_at FROM chat_messages WHERE created_at > datetime('now', '-10 seconds') ORDER BY created_at DESC LIMIT 50)
      `).first() as any;

      const currentHash = result?.hash || '';
      if (!currentHash || currentHash === this.lastHashes.get('chat')) return;
      this.lastHashes.set('chat', currentHash);

      const { results } = await this.env.DB.prepare(`
        SELECT m.id, m.channel_id, m.sender_id, m.content, m.created_at, m.tenant_id,
               u.name as sender_name, u.role as sender_role,
               c.type as channel_type, c.resident_id
        FROM chat_messages m
        LEFT JOIN users u ON m.sender_id = u.id
        LEFT JOIN chat_channels c ON m.channel_id = c.id
        WHERE m.created_at > datetime('now', '-10 seconds')
        ORDER BY m.created_at DESC LIMIT 50
      `).all();

      for (const msg of results as any[]) {
        const channels: string[] = ['chat:all'];
        if (msg.resident_id) channels.push(`chat:user:${msg.resident_id}`);
        if (msg.sender_id) channels.push(`chat:user:${msg.sender_id}`);

        this.broadcastUpdate({
          type: 'chat_message',
          data: {
            message: {
              id: msg.id,
              channel_id: msg.channel_id,
              sender_id: msg.sender_id,
              sender_name: msg.sender_name,
              sender_role: msg.sender_role,
              content: msg.content,
              created_at: msg.created_at,
            }
          },
          channels,
          tenantId: (msg as any).tenant_id || undefined,
        });
      }
    } catch (error) {
      console.error('[DO] Error checking chat:', error);
    }
  }

  private async checkRescheduleUpdate() {
    try {
      const result = await this.env.DB.prepare(`
        SELECT GROUP_CONCAT(id || status || created_at ORDER BY created_at DESC) as hash
        FROM (
          SELECT id, status, created_at FROM reschedule_requests
          WHERE created_at > datetime('now', '-10 seconds')
             OR (responded_at IS NOT NULL AND responded_at > datetime('now', '-10 seconds'))
          ORDER BY created_at DESC LIMIT 50
        )
      `).first() as any;

      const currentHash = result?.hash || '';
      if (!currentHash || currentHash === this.lastHashes.get('reschedule')) return;
      this.lastHashes.set('reschedule', currentHash);

      const { results } = await this.env.DB.prepare(`
        SELECT rr.*, rr.tenant_id, r.title as request_title, r.number as request_number
        FROM reschedule_requests rr
        LEFT JOIN requests r ON rr.request_id = r.id
        WHERE rr.created_at > datetime('now', '-10 seconds')
           OR (rr.responded_at IS NOT NULL AND rr.responded_at > datetime('now', '-10 seconds'))
        ORDER BY rr.created_at DESC LIMIT 50
      `).all();

      for (const reschedule of results as any[]) {
        const tid = (reschedule as any).tenant_id || undefined;
        if (reschedule.recipient_id) {
          this.broadcastUpdate({
            type: 'reschedule_update',
            data: { reschedule },
            channels: [`reschedule:user:${reschedule.recipient_id}`],
            tenantId: tid,
          });
        }
        if (reschedule.initiator_id) {
          this.broadcastUpdate({
            type: 'reschedule_update',
            data: { reschedule },
            channels: [`reschedule:user:${reschedule.initiator_id}`],
            tenantId: tid,
          });
        }
      }
    } catch (error) {
      console.error('[DO] Error checking reschedule:', error);
    }
  }

  // Pre-serialize JSON once, then send to all matching sessions
  // Tenant isolation: only delivers to sessions with the same tenantId
  private broadcastUpdate(message: UpdateMessage & { tenantId?: string }) {
    const serialized = JSON.stringify({
      type: message.type,
      data: message.data,
      timestamp: new Date().toISOString(),
    });

    let sentCount = 0;

    for (const session of this.sessions.values()) {
      // Tenant isolation: skip sessions from other tenants
      if (message.tenantId && session.tenantId && message.tenantId !== session.tenantId) continue;

      const isSubscribed = message.channels.some(ch => session.subscriptions.has(ch));
      if (!isSubscribed) continue;

      try {
        session.ws.send(serialized);
        sentCount++;
      } catch {
        // Will be cleaned up by cleanupDeadConnections
      }
    }
  }

  private cleanupDeadConnections() {
    const now = Date.now();
    const timeout = 90000;

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastPing > timeout) {
        try { session.ws.close(1000, 'Timeout'); } catch {}
        this.wsToSession.delete(session.ws);
        this.sessions.delete(sessionId);
      }
    }
  }
}
