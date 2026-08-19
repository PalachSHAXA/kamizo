import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('LoginPage production credentials', () => {
  it('does not ship the retired demo passwords or plaintext gate secret', () => {
    const source = readFileSync('src/pages/LoginPage.tsx', 'utf8');
    expect(source).not.toMatch(/director1235|OLM\/8A\/49|Axelion27|setPassword\(['"]kamizo['"]\)/);
  });

  it('renders demo role choices as three compact columns', () => {
    const source = readFileSync('src/pages/LoginPage.tsx', 'utf8');
    expect(source.match(/min-\[340px\]:grid-cols-3/g)).toHaveLength(3);
    expect(source).toContain('flex-col justify-center text-center');
  });
});
