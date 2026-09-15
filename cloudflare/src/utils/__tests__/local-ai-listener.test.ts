import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import {
  classifyWithLocalAi,
  resetLocalAiListenerStateForTests,
} from '../local-ai-listener';
import prototypeVectors from '../ai-listener-prototype-vectors.json';

function env(overrides: Partial<Env> = {}): Env {
  return {
    AI_LISTENER_MODE: 'shadow',
    AI_LISTENER_URL: 'http://127.0.0.1:11434',
    ...overrides,
  } as Env;
}

describe('local AI listener', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetLocalAiListenerStateForTests();
  });

  it('is disabled unless explicitly configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await classifyWithLocalAi(env({ AI_LISTENER_MODE: 'off' }), 'машина мешает')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses non-loopback inference URLs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await classifyWithLocalAi(
      env({ AI_LISTENER_URL: 'https://external-ai.example' }), 'машина мешает',
    )).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the nearest validated prototype', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ embeddings: [prototypeVectors[19]] })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(classifyWithLocalAi(env(), 'автомобиль перекрыл дорогу')).resolves.toMatchObject({
      kind: 'navigation', intent: 'parking_issue', confidence: 0.99, lang: 'ru',
    });
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.model).toBe('qwen3-embedding:0.6b');
    expect(request.keep_alive).toBe('24h');
    expect(request.input[0]).toContain('автомобиль перекрыл дорогу');
  });

  it('compares the winner against a different class, not a duplicate prototype', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ embeddings: [prototypeVectors[24]] })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(classifyWithLocalAi(env(), 'қўриқчи жавоб бермаяпти')).resolves.toMatchObject({
      kind: 'navigation', intent: 'barrier_issue', confidence: 0.99, lang: 'uz',
    });
  });

  it('rejects an ambiguous vector even when its absolute similarity is high', async () => {
    const ambiguous = prototypeVectors[0].map((value, index) => value + prototypeVectors[1][index]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ embeddings: [ambiguous] })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(classifyWithLocalAi(env(), 'ambiguous')).resolves.toMatchObject({ kind: 'none' });
  });

  it('allows one bounded waiter and drops further requests while busy', async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { release = resolve; });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);

    const first = classifyWithLocalAi(env(), 'первое сообщение');
    await Promise.resolve();
    const second = classifyWithLocalAi(env(), 'второе сообщение');
    await Promise.resolve();
    await expect(classifyWithLocalAi(env(), 'третье сообщение')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release(new Response(JSON.stringify({ embeddings: [prototypeVectors[0]] })));
    await first;
    await second;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('opens the circuit after repeated inference failures', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    await classifyWithLocalAi(env(), 'one');
    await classifyWithLocalAi(env(), 'two');
    await classifyWithLocalAi(env(), 'three');
    await expect(classifyWithLocalAi(env(), 'four')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('treats malformed vectors as failures and blocks redirects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ embeddings: [[Number.NaN]] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await classifyWithLocalAi(env(), 'one');
    await classifyWithLocalAi(env(), 'two');
    await classifyWithLocalAi(env(), 'three');
    await classifyWithLocalAi(env(), 'four');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('error');
  });

  it('ships vectors matching every prototype and the fixed model dimensions', () => {
    expect(prototypeVectors).toHaveLength(44);
    expect(prototypeVectors.every(vector => vector.length === 128)).toBe(true);
    expect(prototypeVectors.flat().every(Number.isFinite)).toBe(true);
  });
});
