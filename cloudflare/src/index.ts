// UK CRM API - Cloudflare Workers with D1
// Modular architecture: imports from middleware/, utils/, cache, monitoring

// --- External modules ---
import {
  cachedQuery,
  cachedQueryWithArgs,
  invalidateOnChange,
  getCacheStats,
  CacheTTL,
  CachePrefix,
} from './cache';
import {
  metricsAggregator,
  withMonitoring,
  healthCheck,
  AlertManager,
  logAnalyticsEvent,
} from './monitoring';

// --- Internal modules (extracted from this file) ---
import type { Env, User } from './types';
import { route, matchRoute } from './router';
import { setCorsOrigin, getCurrentCorsOrigin, corsHeaders } from './middleware/cors';
import { getUser } from './middleware/auth';
import { getTenantId, setTenantForRequest, getTenantSlug, setCurrentTenant, getCurrentTenant } from './middleware/tenant';
import { getCached, setCache, invalidateCache } from './middleware/cache-local';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from './middleware/rateLimit';
import { json, error, generateId, isManagement, isAdminLevel, getPaginationParams, createPaginatedResponse } from './utils/helpers';
import { encryptPassword, decryptPassword, hashPassword, verifyPassword, createJWT } from './utils/crypto';
import { registerAllRoutes } from './routes';
// Re-export sendPushNotification for use by other route modules
import { sendPushNotification } from './routes/notifications';
export { sendPushNotification } from './routes/notifications';

// Register route modules (meetings, etc.)
registerAllRoutes();

// Helper to check super_admin role
export function isExecutorRole(role: string): boolean {
  return role === 'executor' || role === 'security';
}

export function isSuperAdmin(user: any): user is { role: string; id: string; [key: string]: any } {
  return user?.role === 'super_admin';
}

// ==================== DB MIGRATIONS ====================
// Track which migrations have been run in this worker instance
const migrationsRun = new Set<string>();

async function runMigrations(env: Env) {
  // Only run migrations once per worker instance
  if (migrationsRun.has('all_migrations')) return;

  try {
    // Migration 1: Create tenants table if not exists
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS tenants (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          url TEXT NOT NULL,
          admin_url TEXT,
          color TEXT DEFAULT '#6366f1',
          color_secondary TEXT DEFAULT '#a855f7',
          plan TEXT DEFAULT 'basic' CHECK (plan IN ('basic', 'pro', 'enterprise')),
          features TEXT DEFAULT '["requests","votes","qr","rentals","notepad","reports"]',
          admin_email TEXT,
          admin_phone TEXT,
          logo TEXT,
          users_count INTEGER DEFAULT 0,
          requests_count INTEGER DEFAULT 0,
          votes_count INTEGER DEFAULT 0,
          qr_count INTEGER DEFAULT 0,
          revenue REAL DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      console.log('Migration: Created tenants table');
    } catch (e) {
      // Table might already exist, ignore
    }

    // Migration: Add logo column to tenants
    try {
      const tenantInfo = await env.DB.prepare(`PRAGMA table_info(tenants)`).all();
      const tenantCols = (tenantInfo.results || []).map((col: any) => col.name);
      if (!tenantCols.includes('logo')) {
        await env.DB.prepare(`ALTER TABLE tenants ADD COLUMN logo TEXT`).run();
        console.log('Migration: Added logo column to tenants');
      }
      // Migration: Add is_demo flag to tenants (replaces slug-based demo checks)
      if (!tenantCols.includes('is_demo')) {
        await env.DB.prepare(`ALTER TABLE tenants ADD COLUMN is_demo INTEGER DEFAULT 0`).run();
        await env.DB.prepare(`UPDATE tenants SET is_demo = 1 WHERE slug IN ('kamizo-demo', 'demo')`).run();
        console.log('Migration: Added is_demo column to tenants');
      }
    } catch (e) {}

    // Migration: Add contract_template column to tenants
    try {
      const tenantInfo2 = await env.DB.prepare(`PRAGMA table_info(tenants)`).all();
      const tenantCols2 = (tenantInfo2.results || []).map((col: any) => col.name);
      if (!tenantCols2.includes('contract_template')) {
        await env.DB.prepare(`ALTER TABLE tenants ADD COLUMN contract_template TEXT`).run();
        console.log('Migration: Added contract_template column to tenants');
      }
    } catch (e) {}

    // Migration: Fix users login UNIQUE constraint (global → per-tenant)
    try {
      const indexList = await env.DB.prepare(`PRAGMA index_list(users)`).all();
      const hasCompositeIndex = (indexList.results || []).some((idx: any) =>
        idx.name === 'idx_users_login_tenant'
      );

      if (!hasCompositeIndex) {
        console.log('Migration: Fixing users login UNIQUE constraint for multi-tenancy...');

        // Get existing column names dynamically
        const tableInfo = await env.DB.prepare(`PRAGMA table_info(users)`).all();
        const existingCols = (tableInfo.results || []).map((col: any) => col.name as string);
        console.log('Existing users columns:', existingCols.join(', '));

        // All known columns in the new table
        const newTableCols = [
          'id', 'login', 'phone', 'password_hash', 'name', 'role',
          'specialization', 'email', 'avatar_url', 'address', 'apartment', 'building_id',
          'entrance', 'floor', 'branch', 'building', 'language', 'is_active', 'qr_code',
          'contract_signed_at', 'agreed_to_terms_at', 'contract_number', 'contract_start_date',
          'contract_end_date', 'contract_type', 'total_area', 'password_changed_at',
          'account_type', 'status', 'tenant_id', 'created_at', 'updated_at'
        ];

        // Only copy columns that exist in both old and new tables
        const commonCols = existingCols.filter(c => newTableCols.includes(c));
        const colList = commonCols.join(', ');

        // Disable foreign keys before table recreation
        await env.DB.prepare(`PRAGMA foreign_keys=OFF`).run();

        await env.DB.batch([
          env.DB.prepare(`CREATE TABLE users_new (
            id TEXT PRIMARY KEY,
            login TEXT NOT NULL,
            phone TEXT,
            password_hash TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT 'resident',
            specialization TEXT,
            email TEXT,
            avatar_url TEXT,
            address TEXT,
            apartment TEXT,
            building_id TEXT,
            entrance TEXT,
            floor TEXT,
            branch TEXT,
            building TEXT,
            language TEXT DEFAULT 'ru',
            is_active INTEGER DEFAULT 1,
            qr_code TEXT,
            contract_signed_at TEXT,
            agreed_to_terms_at TEXT,
            contract_number TEXT,
            contract_start_date TEXT,
            contract_end_date TEXT,
            contract_type TEXT DEFAULT 'standard',
            total_area REAL,
            password_changed_at TEXT,
            account_type TEXT DEFAULT 'standard',
            status TEXT DEFAULT 'available',
            tenant_id TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          )`),
          env.DB.prepare(`INSERT INTO users_new (${colList}) SELECT ${colList} FROM users`),
          env.DB.prepare(`DROP TABLE users`),
          env.DB.prepare(`ALTER TABLE users_new RENAME TO users`),
          env.DB.prepare(`CREATE UNIQUE INDEX idx_users_login_tenant ON users(login, COALESCE(tenant_id, '___global___'))`),
          env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`),
          env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`),
        ]);

        // Re-enable foreign keys
        await env.DB.prepare(`PRAGMA foreign_keys=ON`).run();

        console.log('Migration: Fixed users login constraint - now unique per tenant');
      }
    } catch (e) {
      console.error('Migration error (users login unique):', e);
    }

    // Migration 2: Add pause-related columns to requests table
    try {
      const tableInfo = await env.DB.prepare(`PRAGMA table_info(requests)`).all();
      const columns = (tableInfo.results || []).map((col: any) => col.name);

      // Add is_paused column if not exists
      if (!columns.includes('is_paused')) {
        await env.DB.prepare(`ALTER TABLE requests ADD COLUMN is_paused INTEGER DEFAULT 0`).run();
        console.log('Migration: Added is_paused column to requests');
      }

      // Add paused_at column if not exists
      if (!columns.includes('paused_at')) {
        await env.DB.prepare(`ALTER TABLE requests ADD COLUMN paused_at TEXT`).run();
        console.log('Migration: Added paused_at column to requests');
      }

      // Add total_paused_time column if not exists
      if (!columns.includes('total_paused_time')) {
        await env.DB.prepare(`ALTER TABLE requests ADD COLUMN total_paused_time INTEGER DEFAULT 0`).run();
        console.log('Migration: Added total_paused_time column to requests');
      }
    } catch (e) {
      // Table might not exist yet, ignore
    }

    // Migration: Add tenant_id to meeting sub-tables that were missed in 0003
    try {
      const meetingSubTables = [
        'meeting_schedule_options',
        'meeting_schedule_votes',
        'meeting_participated_voters',
        'meeting_eligible_voters',
        'meeting_protocols',
        'meeting_voting_units',
        'meeting_building_settings',
        'meeting_otp_records',
        'meeting_agenda_comments',
      ];

      for (const table of meetingSubTables) {
        try {
          const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
          const cols = (info.results || []).map((c: any) => c.name);
          if (cols.length > 0 && !cols.includes('tenant_id')) {
            await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN tenant_id TEXT`).run();
            console.log(`Migration: Added tenant_id to ${table}`);
          }
        } catch (e) {
          // Table might not exist yet
        }
      }
    } catch (e) {
      console.error('Migration error (meeting tenant_id):', e);
    }

    // Migration: Create meeting_vote_reconsideration_requests table
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS meeting_vote_reconsideration_requests (
          id TEXT PRIMARY KEY,
          meeting_id TEXT NOT NULL,
          agenda_item_id TEXT NOT NULL,
          resident_id TEXT NOT NULL,
          apartment_id TEXT NOT NULL,
          requested_by_user_id TEXT NOT NULL,
          requested_by_role TEXT NOT NULL,
          reason TEXT NOT NULL,
          message_to_resident TEXT,
          vote_at_request_time TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          viewed_at TEXT,
          responded_at TEXT,
          new_vote TEXT,
          expired_at TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reconsider_meeting ON meeting_vote_reconsideration_requests(meeting_id)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reconsider_resident ON meeting_vote_reconsideration_requests(resident_id)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reconsider_status ON meeting_vote_reconsideration_requests(status)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reconsider_resident_agenda ON meeting_vote_reconsideration_requests(resident_id, agenda_item_id)`).run();
      console.log('Migration: Created meeting_vote_reconsideration_requests table');
    } catch (e) {
      // Table might already exist
    }

    // Migration: Add is_revote column to meeting_vote_records
    try {
      const voteInfo = await env.DB.prepare(`PRAGMA table_info(meeting_vote_records)`).all();
      const voteCols = (voteInfo.results || []).map((c: any) => c.name);
      if (voteCols.length > 0 && !voteCols.includes('is_revote')) {
        await env.DB.prepare(`ALTER TABLE meeting_vote_records ADD COLUMN is_revote INTEGER DEFAULT 0`).run();
        console.log('Migration: Added is_revote to meeting_vote_records');
      }
      if (voteCols.length > 0 && !voteCols.includes('previous_vote_id')) {
        await env.DB.prepare(`ALTER TABLE meeting_vote_records ADD COLUMN previous_vote_id TEXT`).run();
        console.log('Migration: Added previous_vote_id to meeting_vote_records');
      }
    } catch (e) {}

    // Migration: Fix duplicate entries in meeting_participated_voters and add UNIQUE index
    try {
      const pvTableExists = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='meeting_participated_voters'`).first();
      if (pvTableExists) {
        const idxResult = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_meeting_participated_unique'`).first();
        if (!idxResult) {
          // Delete duplicates: keep only the row with earliest rowid per (meeting_id, user_id)
          await env.DB.prepare(`
            DELETE FROM meeting_participated_voters
            WHERE rowid NOT IN (
              SELECT MIN(rowid) FROM meeting_participated_voters GROUP BY meeting_id, user_id
            )
          `).run();
          // Create unique index to prevent future duplicates
          await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_participated_unique ON meeting_participated_voters(meeting_id, user_id)`).run();
          console.log('Migration: Deduplicated meeting_participated_voters and added UNIQUE index');
        }
      }
    } catch (e) {
      console.error('Migration: meeting_participated_voters dedup error:', e);
    }

    // Migration: Backfill tenant_id on orphaned child records
    // Records created before multi-tenancy have NULL tenant_id but their parent has one
    try {
      const needsBackfill = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM entrances WHERE tenant_id IS NULL AND building_id IN (SELECT id FROM buildings WHERE tenant_id IS NOT NULL)
      `).first() as any;

      if (needsBackfill?.count > 0) {
        console.log(`Migration: Backfilling tenant_id on ${needsBackfill.count} orphaned entrances...`);
        await env.DB.batch([
          // Entrances: inherit tenant_id from their building
          env.DB.prepare(`UPDATE entrances SET tenant_id = (SELECT tenant_id FROM buildings WHERE id = entrances.building_id) WHERE tenant_id IS NULL AND building_id IN (SELECT id FROM buildings WHERE tenant_id IS NOT NULL)`),
          // Apartments: inherit tenant_id from their building
          env.DB.prepare(`UPDATE apartments SET tenant_id = (SELECT tenant_id FROM buildings WHERE id = apartments.building_id) WHERE tenant_id IS NULL AND building_id IN (SELECT id FROM buildings WHERE tenant_id IS NOT NULL)`),
          // Building documents: inherit from building
          env.DB.prepare(`UPDATE building_documents SET tenant_id = (SELECT tenant_id FROM buildings WHERE id = building_documents.building_id) WHERE tenant_id IS NULL AND building_id IN (SELECT id FROM buildings WHERE tenant_id IS NOT NULL)`),
          // Users with building_id: inherit from their building
          env.DB.prepare(`UPDATE users SET tenant_id = (SELECT tenant_id FROM buildings WHERE id = users.building_id) WHERE tenant_id IS NULL AND building_id IS NOT NULL AND building_id IN (SELECT id FROM buildings WHERE tenant_id IS NOT NULL)`),
        ]);
        console.log('Migration: Backfilled tenant_id on orphaned records');
      }
    } catch (e) {
      console.error('Migration error (backfill tenant_id):', e);
    }

    // Migration: Create super_banners table
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS super_banners (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          image_url TEXT,
          link_url TEXT,
          placement TEXT NOT NULL DEFAULT 'marketplace',
          is_active INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      console.log('Migration: Created super_banners table');
    } catch (e) {
      // Table might already exist
    }

    migrationsRun.add('all_migrations');
  } catch (error) {
    console.error('Migration error:', error);
  }
}

// ==================== MAIN HANDLER ====================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
    // Run DB migrations (only once per worker instance)
    try {
      await runMigrations(env);
    } catch (migrationError) {
      console.error('Critical: runMigrations threw unhandled exception:', migrationError);
      // Continue — don't fail requests due to migration issues
    }

    // Set CORS origin for this request
    setCorsOrigin(request);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    const url = new URL(request.url);

    // Detect tenant from hostname
    const tenantSlug = getTenantSlug(url.hostname);
    if (tenantSlug) {
      try {
        const tenant = await env.DB.prepare(`
          SELECT * FROM tenants WHERE slug = ? AND is_active = 1
        `).bind(tenantSlug).first();

        if (!tenant) {
          return new Response(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Управляющая компания не найдена</title>
              <style>
                body {
                  font-family: system-ui, -apple-system, sans-serif;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                }
                .container {
                  text-align: center;
                  padding: 2rem;
                }
                h1 {
                  font-size: 3rem;
                  margin: 0 0 1rem 0;
                }
                p {
                  font-size: 1.25rem;
                  margin: 0.5rem 0;
                  opacity: 0.9;
                }
                .code {
                  font-family: monospace;
                  background: rgba(255,255,255,0.1);
                  padding: 0.25rem 0.5rem;
                  border-radius: 4px;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>404</h1>
                <p>Управляющая компания <span class="code">${tenantSlug}</span> не найдена</p>
                <p>Данный поддомен не зарегистрирован в системе</p>
              </div>
            </body>
            </html>
          `, {
            status: 404,
            headers: {
              'Content-Type': 'text/html;charset=UTF-8',
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
        }

        // Store tenant context for this request
        setCurrentTenant(tenant);
        setTenantForRequest(request, tenant);
      } catch (error) {
        console.error('Error fetching tenant:', error);
        return new Response('Error loading tenant', { status: 500 });
      }
    } else {
      setCurrentTenant(null);
    }

    // Try to match API routes
    if (url.pathname.startsWith('/api')) {
      const matched = matchRoute(request.method, url.pathname);
      if (matched) {
        // Wrap in monitoring middleware with safety net
        try {
          return await withMonitoring(request, async () => {
            try {
              // Apply rate limiting to non-auth endpoints (auth handles it internally)
              if (!url.pathname.startsWith('/api/auth/login') && !url.pathname.startsWith('/api/health')) {
                const user = await getUser(request, env);
                const identifier = getClientIdentifier(request, user);
                const endpoint = `${request.method}:${url.pathname}`;
                const rateLimit = await checkRateLimit(env, identifier, endpoint);

                if (!rateLimit.allowed) {
                  const resetIn = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
                  return new Response(JSON.stringify({
                    error: `Rate limit exceeded. Try again in ${resetIn} seconds.`
                  }), {
                    status: 429,
                    headers: {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
                      'X-RateLimit-Limit': (RATE_LIMITS[endpoint] || RATE_LIMITS['default']).maxRequests.toString(),
                      'X-RateLimit-Remaining': '0',
                      'X-RateLimit-Reset': rateLimit.resetAt.toString(),
                      'Retry-After': resetIn.toString()
                    }
                  });
                }

                // Add rate limit headers to successful response
                const response = await matched.handler(request, env, matched.params);

                // WebSocket responses have immutable headers, so we can't modify them
                // For WebSocket upgrade responses, skip adding rate limit headers
                if (response.status === 101 || response.headers.get('Upgrade') === 'websocket') {
                  return response;
                }

                // For regular responses, create a new Response with rate limit headers
                const newHeaders = new Headers(response.headers);
                newHeaders.set('X-RateLimit-Limit', (RATE_LIMITS[endpoint] || RATE_LIMITS['default']).maxRequests.toString());
                newHeaders.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
                newHeaders.set('X-RateLimit-Reset', rateLimit.resetAt.toString());

                return new Response(response.body, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: newHeaders
                });
              }

              return await matched.handler(request, env, matched.params);
            } catch (err: any) {
              console.error('API Error:', err);
              return error(err.message || 'Internal server error', 500);
            }
          });
        } catch (outerErr: any) {
          // Safety net: if withMonitoring itself crashes, still return a valid CORS response
          console.error('Critical API Error (outside monitoring):', outerErr);
          return new Response(JSON.stringify({ error: outerErr.message || 'Internal server error' }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
              'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
          });
        }
      }
      return error('Not found', 404);
    }

    // For SPA: serve static assets or fallback to index.html
    // BUT first verify tenant exists if this is a tenant subdomain
    if (tenantSlug && !getCurrentTenant()) {
      // This shouldn't happen as we checked above, but double-check for safety
      return new Response(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Управляющая компания не найдена</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
              padding: 2rem;
            }
            h1 {
              font-size: 3rem;
              margin: 0 0 1rem 0;
            }
            p {
              font-size: 1.25rem;
              margin: 0.5rem 0;
              opacity: 0.9;
            }
            .code {
              font-family: monospace;
              background: rgba(255,255,255,0.1);
              padding: 0.25rem 0.5rem;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>404</h1>
            <p>Управляющая компания <span class="code">${tenantSlug}</span> не найдена</p>
            <p>Данный поддомен не зарегистрирован в системе</p>
          </div>
        </body>
        </html>
      `, {
        status: 404,
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }

    // Helper: add no-cache headers to HTML responses (index.html)
    // This prevents browsers from caching old index.html that references stale JS hashes
    const withNoCacheIfHtml = (response: Response): Response => {
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('text/html')) {
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        newHeaders.set('Pragma', 'no-cache');
        newHeaders.set('Expires', '0');
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }
      return response;
    };

    // env.ASSETS is automatically provided by Cloudflare when using assets config
    try {
      // Try to serve the requested asset
      const assetResponse = await env.ASSETS.fetch(request);

      // If asset found, return it (with no-cache for HTML)
      if (assetResponse.status !== 404) {
        return withNoCacheIfHtml(assetResponse);
      }

      // For 404 (file not found), serve index.html for SPA routing
      const indexRequest = new Request(new URL('/', request.url).toString(), request);
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      return withNoCacheIfHtml(indexResponse);
    } catch (e) {
      // Fallback to index.html on any error
      try {
        const indexRequest = new Request(new URL('/', request.url).toString(), request);
        const indexResponse = await env.ASSETS.fetch(indexRequest);
        return withNoCacheIfHtml(indexResponse);
      } catch {
        return new Response('UK CRM - Service temporarily unavailable', {
          status: 503,
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }
    } catch (fatalError: any) {
      // Last-resort safety net — prevent Cloudflare error 1101 (Worker threw exception)
      console.error('FATAL unhandled error in fetch handler:', fatalError);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
};

// Export Durable Object
export { ConnectionManager } from './ConnectionManager';
