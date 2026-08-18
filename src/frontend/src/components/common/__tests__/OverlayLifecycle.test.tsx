import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useLanguageStore } from '../../../stores/languageStore';
import { useModalStore } from '../../../stores/modalStore';
import { Modal } from '../../ui/Modal';
import { ConfirmDialog } from '../ConfirmDialog';
import { Sheet } from '../Sheet';

describe('shared overlay lifecycle', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'ru' });
    useModalStore.setState({ count: 0 });
  });

  it('closes only the top layer across Modal, Sheet, and ConfirmDialog and restores focus', async () => {
    function Harness() {
      const [modalOpen, setModalOpen] = useState(true);
      const [sheetOpen, setSheetOpen] = useState(false);
      const [confirmOpen, setConfirmOpen] = useState(false);
      return (
        <>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Outer modal">
            <button onClick={() => setSheetOpen(true)}>Open sheet</button>
          </Modal>
          <Sheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Nested sheet">
            <button onClick={() => setConfirmOpen(true)}>Open confirmation</button>
          </Sheet>
          <ConfirmDialog
            isOpen={confirmOpen}
            title="Nested confirmation"
            confirmLabel="Confirm"
            cancelLabel="Cancel"
            onConfirm={() => setConfirmOpen(false)}
            onClose={() => setConfirmOpen(false)}
          />
        </>
      );
    }

    render(<Harness />);
    const sheetTrigger = screen.getByRole('button', { name: 'Open sheet' });
    sheetTrigger.focus();
    fireEvent.click(sheetTrigger);
    const confirmTrigger = screen.getByRole('button', { name: 'Open confirmation' });
    confirmTrigger.focus();
    fireEvent.click(confirmTrigger);

    await waitFor(() => expect(useModalStore.getState().count).toBe(3));
    expect(screen.getByRole('dialog', { name: 'Nested confirmation' })).toContainElement(document.activeElement as HTMLElement);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Nested confirmation' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Nested sheet' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Outer modal', hidden: true })).toBeInTheDocument();
    expect(confirmTrigger).toHaveFocus();
    expect(useModalStore.getState().count).toBe(2);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Nested sheet' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Outer modal' })).toBeInTheDocument();
    expect(sheetTrigger).toHaveFocus();
    expect(useModalStore.getState().count).toBe(1);
  });

  it('keeps force-action Sheet open and preserves its motion and safe-area footer', () => {
    render(
      <Sheet
        isOpen
        forceAction
        onClose={() => {}}
        title="Required action"
        footer={<button>Continue</button>}
      >
        Body
      </Sheet>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Required action' });
    const footer = screen.getByRole('button', { name: 'Continue' }).parentElement;
    expect(dialog).toHaveClass('transition-transform', 'duration-200', 'ease-out');
    expect(footer).toHaveStyle({ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
  });
});
