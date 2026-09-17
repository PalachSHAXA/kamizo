import { describe, expect, it } from 'vitest';
import type { Env } from '../../../types';
import { createFirstLoginActivation } from '../activation';

function createEnv() {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const env = {
    TELEGRAM_BOT_USERNAME: 'kamizobot',
    DB: {
      prepare(sql: string) {
        return {
          bind(...params: unknown[]) {
            const statement = { sql, params };
            statements.push(statement);
            return statement;
          },
        };
      },
      async batch() { return []; },
    },
  } as unknown as Env;
  return { env, statements };
}

describe('first-login Telegram activation', () => {
  it('creates separate one-time Telegram and browser capabilities without storing plaintext', async () => {
    const { env, statements } = createEnv();
    const result = await createFirstLoginActivation(env, {
      id: 'user-1', tenant_id: 'tenant-1', phone: '+998901234567',
    });

    expect(result).not.toBeNull();
    expect(result?.tenantId).toBe('tenant-1');
    expect(result?.challenge).toMatch(/^\d{2}$/);
    expect(result?.browserSecret).toMatch(/^[a-f0-9]{64}$/);
    const linkToken = new URL(result!.telegramUrl).searchParams.get('start');
    expect(linkToken).toMatch(/^[a-f0-9]{64}$/);
    expect(linkToken).not.toBe(result?.browserSecret);

    const insert = statements.find(statement => statement.sql.includes('INSERT INTO telegram_activation_requests'))!;
    expect(insert.params).not.toContain(linkToken);
    expect(insert.params).not.toContain(result?.browserSecret);
    expect(insert.params).toContain('tenant-1');
    expect(insert.params).toContain('user-1');
  });

  it('fails closed when tenant, phone or bot username is unavailable', async () => {
    const first = createEnv();
    expect(await createFirstLoginActivation(first.env, {
      id: 'user-1', tenant_id: 'tenant-1', phone: null,
    })).toBeNull();
    expect(first.statements).toHaveLength(0);

    const second = createEnv();
    second.env.TELEGRAM_BOT_USERNAME = undefined;
    expect(await createFirstLoginActivation(second.env, {
      id: 'user-1', tenant_id: 'tenant-1', phone: '+998901234567',
    })).toBeNull();
    expect(second.statements).toHaveLength(0);
  });
});
