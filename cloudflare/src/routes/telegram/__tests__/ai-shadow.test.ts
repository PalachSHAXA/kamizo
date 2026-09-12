import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../types';

const mocks = vi.hoisted(() => ({
  classifyWithLocalAi: vi.fn(),
  sendTelegramMessage: vi.fn(),
}));

vi.mock('../../../utils/local-ai-listener', () => ({
  classifyWithLocalAi: mocks.classifyWithLocalAi,
  getAiListenerMode: () => 'shadow',
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

function envWithGroup(group: unknown) {
  return {
    AI_LISTENER_MODE: 'shadow',
    DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ first: vi.fn(async () => group) })),
      })),
    },
  } as unknown as Env;
}

describe('Telegram AI shadow privacy', () => {
  beforeEach(() => {
    mocks.classifyWithLocalAi.mockReset();
    mocks.sendTelegramMessage.mockReset();
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
});
