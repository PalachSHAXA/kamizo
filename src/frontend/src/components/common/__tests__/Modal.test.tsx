import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLanguageStore } from '../../../stores/languageStore';
import { useModalStore } from '../../../stores/modalStore';
import { Modal as UiModal } from '../../ui/Modal';
import { Modal } from '../Modal';

describe('common Modal compatibility wrapper', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'ru' });
    useModalStore.setState({ count: 0 });
  });

  it.each([
    ['sm', 'sm:max-w-sm'],
    ['md', 'sm:max-w-md'],
    ['lg', 'sm:!max-w-lg'],
    ['xl', 'sm:!max-w-xl'],
    ['2xl', 'sm:max-w-2xl'],
  ] as const)('maps the %s compatibility size', (size, widthClass) => {
    render(
      <Modal isOpen onClose={() => {}} title="Compatibility" size={size}>
        Body
      </Modal>,
    );

    expect(screen.getByRole('dialog', { name: 'Compatibility' })).toHaveClass(widthClass);
  });

  it('closes only the top common modal on Escape', async () => {
    function Harness() {
      const [outerOpen, setOuterOpen] = useState(true);
      const [innerOpen, setInnerOpen] = useState(true);
      return (
        <>
          <Modal isOpen={outerOpen} onClose={() => setOuterOpen(false)} title="Outer common">
            Outer body
          </Modal>
          <Modal isOpen={innerOpen} onClose={() => setInnerOpen(false)} title="Inner common">
            Inner body
          </Modal>
        </>
      );
    }

    render(<Harness />);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Inner common' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Outer common' })).toBeInTheDocument();
  });

  it('keeps a UI modal open when a common modal above it closes', () => {
    function Harness() {
      const [uiOpen, setUiOpen] = useState(true);
      const [commonOpen, setCommonOpen] = useState(true);
      return (
        <>
          <UiModal open={uiOpen} onClose={() => setUiOpen(false)} title="UI modal">
            UI body
          </UiModal>
          <Modal isOpen={commonOpen} onClose={() => setCommonOpen(false)} title="Common modal">
            Common body
          </Modal>
        </>
      );
    }

    render(<Harness />);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Common modal' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'UI modal' })).toBeInTheDocument();
  });

  it('traps focus and restores it to the trigger after close', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open common</button>
          <Modal isOpen={open} onClose={() => setOpen(false)} title="Focus modal">
            <button>First action</button>
            <button>Last action</button>
          </Modal>
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open common' });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus());

    const last = screen.getByRole('button', { name: 'Last action' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });

  it('keeps BottomBar presence active until the modal closes', async () => {
    const { rerender } = render(
      <Modal isOpen onClose={() => {}} title="Presence">
        Body
      </Modal>,
    );
    await waitFor(() => expect(useModalStore.getState().count).toBe(1));

    rerender(
      <Modal isOpen={false} onClose={() => {}} title="Presence">
        Body
      </Modal>,
    );
    await waitFor(() => expect(useModalStore.getState().count).toBe(0));
  });

  it('renders an accessible back header without the canonical close button', () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} onBack={onBack} title="Details">
        Body
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Details' });
    expect(dialog).toHaveTextContent('Details');
    expect(screen.queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('preserves the localized close label', () => {
    useLanguageStore.setState({ language: 'uz' });
    render(
      <Modal isOpen onClose={() => {}} title="Moslik">
        Body
      </Modal>,
    );

    expect(screen.getByRole('button', { name: 'Yopish' })).toBeInTheDocument();
  });

  it('keeps the compatibility body as the scroll and safe-area container', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Spacing">
        <span>Scrollable body</span>
      </Modal>,
    );

    const body = screen.getByText('Scrollable body').parentElement;
    expect(body).toHaveClass('overflow-y-auto', 'px-6', 'py-4');
    expect(body).toHaveStyle({ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' });
    expect(body).not.toHaveClass('fixed', 'inset-0', 'h-screen', 'min-h-screen');
  });
});
