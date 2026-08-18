import { describe, expect, it } from 'vitest';

import { parseRequestPhotos } from '../requestStore';

describe('request photo normalization', () => {
  const fallback = ['data:image/jpeg;base64,fallback'];

  it('parses server JSON photos', () => {
    expect(parseRequestPhotos('["data:image/jpeg;base64,server"]', fallback)).toEqual([
      'data:image/jpeg;base64,server',
    ]);
  });

  it('keeps already parsed server photos', () => {
    const photos = ['data:image/jpeg;base64,server'];

    expect(parseRequestPhotos(photos, fallback)).toBe(photos);
  });

  it('falls back when server photos are absent or malformed', () => {
    expect(parseRequestPhotos(undefined, fallback)).toBe(fallback);
    expect(parseRequestPhotos('{invalid', fallback)).toBe(fallback);
  });

  it('returns undefined without a fallback', () => {
    expect(parseRequestPhotos(undefined)).toBeUndefined();
    expect(parseRequestPhotos('{invalid')).toBeUndefined();
  });
});
