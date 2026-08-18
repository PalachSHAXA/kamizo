import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sidebarSource = readFileSync(resolve('src/components/layout/Sidebar.tsx'), 'utf8');
const layoutSource = readFileSync(resolve('src/components/layout/Layout.tsx'), 'utf8');

describe('legacy payments frontend retirement', () => {
  it('does not expose a /payments navigation item', () => {
    expect(sidebarSource).not.toMatch(/\{\s*path:\s*['"]\/payments['"]/);
  });

  it('redirects /payments to canonical finance charges with history replacement', () => {
    expect(layoutSource).toMatch(
      /<Route\s+path="\/payments"\s+element=\{<Navigate\s+to="\/finance\/charges"\s+replace\s*\/>\}\s*\/>/,
    );
  });

  it('allows commercial owners to open the canonical resident charges route', () => {
    expect(layoutSource).toMatch(
      /path="\/finance\/charges"[\s\S]*?allowedRoles=\{\[[^\]]*'commercial_owner'[^\]]*\]\}/,
    );
  });
});
