import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendTelegramMessage } from '../telegram';

describe('sendTelegramMessage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps replies inside the originating forum topic', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 9 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await sendTelegramMessage(
      { TELEGRAM_BOT_TOKEN: 'test-token' } as never,
      '-100123',
      'Проверка',
      { messageThreadId: 42, replyToMessageId: 7 }
    );

    expect(result.ok).toBe(true);
    const request = fetchMock.mock.calls[0];
    expect(request[0]).toBe('https://api.telegram.org/bottest-token/sendMessage');
    expect(JSON.parse(String(request[1]?.body))).toMatchObject({
      chat_id: '-100123',
      message_thread_id: 42,
      reply_parameters: { message_id: 7, allow_sending_without_reply: true },
    });
  });

  it('omits topic fields for ordinary chats', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await sendTelegramMessage(
      { TELEGRAM_BOT_TOKEN: 'test-token' } as never,
      '123',
      'Проверка'
    );

    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload).not.toHaveProperty('message_thread_id');
    expect(payload).not.toHaveProperty('reply_parameters');
  });
});
