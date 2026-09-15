import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../types';

const mocks = vi.hoisted(() => ({
  mode: 'shadow' as 'shadow' | 'active',
  classifyWithLocalAi: vi.fn(),
  sendTelegramMessage: vi.fn(),
}));

vi.mock('../../../utils/local-ai-listener', () => ({
  classifyWithLocalAi: mocks.classifyWithLocalAi,
  getAiListenerMode: () => mocks.mode,
}));

vi.mock('../../../utils/zhkh-dictionary', () => ({
  ensureDictionaryLoaded: vi.fn(async () => {}),
}));

vi.mock('../../../utils/telegram', () => ({
  sendTelegramMessage: mocks.sendTelegramMessage,
  editTelegramMessage: vi.fn(),
  answerCallbackQuery: vi.fn(),
  escapeHtml: (value: string) => value,
}));

import { handleGroupMessage } from '../dispatcher';

const message = {
  message_id: 10,
  from: { id: 20, is_bot: false },
  chat: { id: -30, type: 'group' },
  text: 'Не могу попасть домой, дежурный молчит и проезд закрыт',
};

function envWithGroup(group: unknown, mode: 'shadow' | 'active' = 'shadow') {
  return {
    AI_LISTENER_MODE: mode,
    DB: {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (sql.includes('FROM telegram_groups')) return group;
            if (sql.includes('SELECT url, features')) {
              return { url: 'https://app.kamizo.uz', features: '[]' };
            }
            return null;
          }),
          all: vi.fn(async () => ({ results: [] })),
          run: vi.fn(async () => ({ meta: { changes: 1 } })),
        })),
      })),
    },
  } as unknown as Env;
}

describe('Telegram AI shadow privacy', () => {
  beforeEach(() => {
    mocks.mode = 'shadow';
    mocks.classifyWithLocalAi.mockReset();
    mocks.sendTelegramMessage.mockReset();
    mocks.sendTelegramMessage.mockResolvedValue({ ok: true });
  });

  it('never sends an unconnected group message to AI', async () => {
    await handleGroupMessage(envWithGroup(null), message, { info: vi.fn() });
    expect(mocks.classifyWithLocalAi).not.toHaveBeenCalled();
  });

  it('returns immediately and never replies with a shadow result', async () => {
    let release!: (value: unknown) => void;
    mocks.classifyWithLocalAi.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const handled = handleGroupMessage(
      envWithGroup({ id: 'group-1', tenant_id: 'tenant-1' }),
      message,
      { info: vi.fn() },
    );

    await expect(Promise.race([
      handled.then(() => 'done'),
      new Promise(resolve => setTimeout(() => resolve('waiting'), 25)),
    ])).resolves.toBe('done');

    release({ kind: 'navigation', intent: 'barrier_issue', confidence: 0.95, similarity: 0.8, margin: 0.1, lang: 'ru' });
    await Promise.resolve();
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('returns immediately but sends a named reply for a confident active result', async () => {
    mocks.mode = 'active';
    let release!: (value: unknown) => void;
    mocks.classifyWithLocalAi.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const handled = handleGroupMessage(
      envWithGroup({ id: 'group-1', tenant_id: 'tenant-1' }, 'active'),
      message,
      { info: vi.fn() },
    );

    await expect(Promise.race([
      handled.then(() => 'done'),
      new Promise(resolve => setTimeout(() => resolve('waiting'), 25)),
    ])).resolves.toBe('done');

    release({ kind: 'navigation', intent: 'barrier_issue', confidence: 0.95, similarity: 0.8, margin: 0.1, lang: 'ru' });
    await vi.waitFor(() => expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1));
    expect(mocks.sendTelegramMessage.mock.calls[0][2]).toContain('<b>Kamizo</b>');
  });

  it('accepts a close garbage/cleaning match only for a short maintenance request', async () => {
    mocks.mode = 'active';
    mocks.classifyWithLocalAi.mockResolvedValue({
      kind: 'maintenance', category: 'garbage', confidence: 0.716,
      similarity: 0.715, margin: 0.022, lang: 'ru',
    });
    await handleGroupMessage(
      envWithGroup({ id: 'group-1', tenant_id: 'tenant-1' }, 'active'),
      { ...message, text: 'надо мусор выбросить' },
      { info: vi.fn() },
    );

    await vi.waitFor(() => expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1));
  });

  it('rejects the same weak margin for a long multi-issue message', async () => {
    mocks.mode = 'active';
    mocks.classifyWithLocalAi.mockResolvedValue({
      kind: 'maintenance', category: 'cleaning', confidence: 0.731,
      similarity: 0.711, margin: 0.027, lang: 'uz',
    });
    await handleGroupMessage(
      envWithGroup({ id: 'group-1', tenant_id: 'tenant-1' }, 'active'),
      {
        ...message,
        text: 'надо мусор выбросить. Assalomu aleykum, 117-dom 7-podezd 5-etaj lampochkasi kuygan. Tuzatib berolisilami, iltimos.',
      },
      { info: vi.fn() },
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
  });
});
