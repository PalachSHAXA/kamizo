// Framework-agnostic router
// Currently runs on Cloudflare Workers fetch API
// For datacenter migration: swap this file with Express/Hono/Fastify adapter

import type { Handler, Route } from './types';

const routes: Route[] = [];

export function route(method: string, path: string, handler: Handler) {
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
  routes.push({ method, path, pattern, handler });
}

export function matchRoute(method: string, path: string) {
  for (const r of routes) {
    if (r.method === method) {
      const match = path.match(r.pattern);
      if (match) {
        // Sprint 74 P0/F2: return the route pattern so the dispatcher
        // can key rate-limit buckets by template, not by resolved
        // pathname (which multiplied buckets per :id).
        return { handler: r.handler, params: match.groups || {}, path: r.path };
      }
    }
  }
  return null;
}

export function getRoutes() {
  return routes;
}
