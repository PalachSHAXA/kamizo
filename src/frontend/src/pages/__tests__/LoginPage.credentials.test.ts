import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('LoginPage production credentials', () => {
  it('does not ship the retired demo passwords or plaintext gate secret', () => {
    const source = readFileSync('src/pages/LoginPage.tsx', 'utf8');
    expect(source).not.toMatch(/director1235|OLM\/8A\/49|Axelion27|setPassword\(['"]kamizo['"]\)/);
  });
});
