import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_NAV_ROLES, getAdminNavigation } from '../adminNavigation';
import { FEATURE_PATHS, featureForPath } from '../featureRoutes';

const here = dirname(fileURLToPath(import.meta.url));
const ROUTE_SOURCES = [
  resolve(here, '../../App.tsx'),
  resolve(here, '../../components/layout/Layout.tsx'),
];

/** Убираем комментарии: requiredFeature встречается и в них (история правок). */
function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Читает из JSX реальные пары «маршрут → requiredFeature».
 * Источник истины — сами <Route>, а не наша карта: тест сверяет карту с
 * тем, что действительно гейтит роутер.
 */
function gatedRoutesFromSource(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of ROUTE_SOURCES) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const gates = [...source.matchAll(/requiredFeature="([\w-]+)"/g)];
    for (const gate of gates) {
      const before = source.slice(0, gate.index);
      const paths = [...before.matchAll(/path="([^"]+)"/g)];
      const nearest = paths[paths.length - 1];
      if (nearest) found.set(nearest[1], gate[1]);
    }
  }
  return found;
}

describe('feature-gated navigation', () => {
  it('finds the gated routes it is supposed to police', () => {
    const gated = gatedRoutesFromSource();
    // Якорь: если парсер сломается, тест ниже станет пустым и «зелёным».
    expect(gated.get('/rentals-moderation')).toBe('rental_listings');
    expect(gated.get('/meetings')).toBe('meetings');
    expect(gated.size).toBeGreaterThan(10);
  });

  it.each(ADMIN_NAV_ROLES)('marks every gated %s drawer item as lockable', (role) => {
    const gated = gatedRoutesFromSource();

    // Пункт меню, маршрут которого гейтится фичей, обязан гейтиться той же
    // фичей и в карте — иначе Sidebar нарисует обычную ссылку, а
    // ProtectedRoute молча вернёт пользователя на главную.
    for (const item of getAdminNavigation(role, 'ru')) {
      const routeFeature = gated.get(item.path);
      if (!routeFeature) continue;
      expect(
        featureForPath(item.path),
        `${item.path} гейтится фичей "${routeFeature}", но не описан в FEATURE_PATHS`,
      ).toBe(routeFeature);
    }
  });

  it('does not describe a path that no route actually gates', () => {
    const gated = gatedRoutesFromSource();
    const navPaths = new Set(
      ADMIN_NAV_ROLES.flatMap(role => getAdminNavigation(role, 'ru').map(item => item.path)),
    );

    for (const [feature, paths] of Object.entries(FEATURE_PATHS)) {
      for (const path of paths) {
        if (!navPaths.has(path)) continue;
        const routeFeature = gated.get(path);
        if (!routeFeature) continue;
        expect(routeFeature, `${path} в карте числится за "${feature}"`).toBe(feature);
      }
    }
  });
});
