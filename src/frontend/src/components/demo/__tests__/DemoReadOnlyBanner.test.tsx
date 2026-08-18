import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useLanguageStore } from '../../../stores/languageStore';
import { DemoReadOnlyBanner } from '../DemoReadOnlyBanner';

describe('DemoReadOnlyBanner', () => {
  beforeEach(() => useLanguageStore.setState({ language: 'ru' }));

  it('renders the shared localized read-only status', () => {
    const { rerender } = render(<DemoReadOnlyBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('Демо-режим: изменения недоступны');

    act(() => useLanguageStore.setState({ language: 'uz' }));
    rerender(<DemoReadOnlyBanner />);
    expect(screen.getByRole('status')).toHaveTextContent("Demo rejim: o'zgarishlar mavjud emas");
  });

  it('supports the finance-specific explanation', () => {
    render(<DemoReadOnlyBanner scope="finance" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Демо-режим: финансовые данные доступны только для просмотра',
    );
  });
});
