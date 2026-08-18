import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useModalStore } from '../../../../stores/modalStore';
import { StaffImportModal } from '../StaffImportModal';

describe('StaffImportModal', () => {
  beforeEach(() => useModalStore.setState({ count: 0 }));

  it('uses canonical modal presence, Escape, and a reachable safe-area footer', async () => {
    const onClose = vi.fn();
    render(
      <StaffImportModal
        language="ru"
        onClose={onClose}
        fileInputRef={createRef<HTMLInputElement>()}
        importFile={null}
        onFileSelect={vi.fn()}
        importResult={null}
        importLoading={false}
        onImport={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Импорт персонала' });
    await waitFor(() => expect(useModalStore.getState().count).toBe(1));
    expect(dialog).toHaveClass('overflow-hidden', 'flex', 'flex-col');
    expect(screen.getByRole('button', { name: 'Импортировать' }).parentElement).toHaveStyle({
      paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
    });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
