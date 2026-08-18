import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useIsMobile } from '../useBreakpoint';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === '(min-width: 768px)' ? width >= 768 : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('useIsMobile', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    [767, true],
    [768, false],
  ])('reports the 768px boundary consistently at %ipx', (width, expected) => {
    setViewportWidth(width);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(expected);
  });
});
