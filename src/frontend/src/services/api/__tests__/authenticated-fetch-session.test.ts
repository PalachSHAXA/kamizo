import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionChangedError, resetApiSession } from '../client';
import { uploadApi } from '../announcements';
import { meetingsFullApi } from '../meetings';

function deferredResponse(response: Response) {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((next) => { resolve = next; });
  return { promise, resolve: () => resolve(response) };
}

describe('authenticated non-JSON requests', () => {
  beforeEach(() => {
    localStorage.clear();
    resetApiSession();
    vi.restoreAllMocks();
  });

  it('rejects a stale file upload after the session changes', async () => {
    const delayed = deferredResponse({
      ok: true,
      status: 200,
      json: async () => ({ file: { name: 'a.txt', url: 'data:', type: 'text/plain', size: 1 } }),
    } as Response);
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(delayed.promise);

    const upload = uploadApi.uploadFile(new File(['a'], 'a.txt', { type: 'text/plain' }));
    resetApiSession();
    delayed.resolve();

    await expect(upload).rejects.toBeInstanceOf(SessionChangedError);
  });

  it('rejects stale protocol text after the session changes', async () => {
    const delayed = deferredResponse({
      ok: true,
      status: 200,
      text: async () => '<html>tenant-a</html>',
    } as Response);
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(delayed.promise);

    const html = meetingsFullApi.getProtocolHtml('meeting-a');
    resetApiSession();
    delayed.resolve();

    await expect(html).rejects.toBeInstanceOf(SessionChangedError);
  });
});
