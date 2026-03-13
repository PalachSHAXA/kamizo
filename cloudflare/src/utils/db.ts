// Database abstraction layer
// Currently wraps Cloudflare D1. For datacenter migration:
// - Replace with PostgreSQL (pg/node-postgres) or MySQL (mysql2)
// - Keep the same interface, swap the implementation
// - D1 uses SQLite syntax; PostgreSQL uses $1,$2 params instead of ?
//
// Migration checklist when moving to datacenter:
// 1. Replace D1Database with your DB pool (e.g. pg.Pool)
// 2. Convert ? placeholders to $1,$2 (or use a query builder like Kysely/Drizzle)
// 3. Replace env.DB.prepare().bind().run/first/all with pool.query()
// 4. Update datetime('now') → NOW() for PostgreSQL
// 5. Update PRAGMA calls → information_schema queries
// 6. Replace KV rate limiter with Redis
// 7. Replace Durable Objects WebSocket with ws/socket.io
// 8. Replace env.ASSETS with express.static() or nginx

// This file documents the D1 → PostgreSQL mapping for future reference:
// D1: env.DB.prepare(sql).bind(...args).first()     → pg: pool.query(sql, args).then(r => r.rows[0])
// D1: env.DB.prepare(sql).bind(...args).all()        → pg: pool.query(sql, args).then(r => ({ results: r.rows }))
// D1: env.DB.prepare(sql).bind(...args).run()        → pg: pool.query(sql, args)
// D1: env.DB.batch([stmt1, stmt2])                   → pg: BEGIN; stmt1; stmt2; COMMIT;
// D1: datetime('now')                                → pg: NOW()
// D1: COALESCE                                       → pg: COALESCE (same)
// D1: || (string concat)                             → pg: || (same)
// D1: LIKE                                           → pg: ILIKE (case-insensitive)

export type { D1Database };
