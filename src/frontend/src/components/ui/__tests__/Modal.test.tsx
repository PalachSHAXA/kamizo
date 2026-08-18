import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useModalStore } from '../../../stores/modalStore';
import { Modal } from '../Modal';

describe('Modal accessibility lifecycle', () => {
  beforeEach(() => {
    useModalStore.setState({ count: 0 });
  });

  it('hides modal-aware navigation while open and restores it after close', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const modalCount = useModalStore((state) => state.count);
      return (
        <>
          {modalCount === 0 && <nav aria-label="Bottom navigation" />}
          <button onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Test dialog">
            <button>Inside</button>
          </Modal>
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Bottom navigation' })).not.toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBeInTheDocument());
  });

  it('portals the backdrop to the body so transformed page shells cannot offset it', () => {
    render(
      <div style={{ transform: 'translateY(300px)' }}>
        <Modal open onClose={() => {}} title="Portaled">
          Body
        </Modal>
      </div>,
    );

    expect(screen.getByRole('dialog', { name: 'Portaled' }).parentElement?.parentElement).toBe(document.body);
  });

  it('closes only the top nested dialog on Escape and restores focus to its trigger', async () => {
    function Harness() {
      const [outerOpen, setOuterOpen] = useState(false);
      const [innerOpen, setInnerOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOuterOpen(true)}>Open outer</button>
          <Modal open={outerOpen} onClose={() => setOuterOpen(false)} title="Outer">
            <button onClick={() => setInnerOpen(true)}>Open inner</button>
          </Modal>
          <Modal open={innerOpen} onClose={() => setInnerOpen(false)} title="Inner">
            <button>Inner action</button>
          </Modal>
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open outer' }));
    const innerTrigger = screen.getByRole('button', { name: 'Open inner' });
    innerTrigger.focus();
    fireEvent.click(innerTrigger);
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Inner' })).toContainElement(document.activeElement as HTMLElement));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Inner' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
    expect(innerTrigger).toHaveFocus();
  });

  it('makes the background inert while preserving attributes owned by another layer', async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <div>
          <main data-testid="plain-background" />
          <main data-testid="background" aria-hidden="true" {...({ inert: '' } as { inert: string })} />
          <Modal open={open} onClose={() => setOpen(false)} title="Foreground">
            <button onClick={() => setOpen(false)}>Close</button>
          </Modal>
        </div>
      );
    }

    render(<Harness />);
    const plainBackground = screen.getByTestId('plain-background');
    const background = screen.getByTestId('background');
    const appBranch = plainBackground.parentElement?.parentElement;
    expect(appBranch).toHaveAttribute('inert');
    expect(appBranch).toHaveAttribute('aria-hidden', 'true');
    expect(background).toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(appBranch).not.toHaveAttribute('inert');
    expect(appBranch).not.toHaveAttribute('aria-hidden');
    expect(background).toHaveAttribute('inert');
    expect(background).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the page locked and inert when a lower dialog unmounts before the top dialog', async () => {
    function Harness() {
      const [outerOpen, setOuterOpen] = useState(true);
      const [innerOpen, setInnerOpen] = useState(false);
      return (
        <main data-testid="app-content">
          <Modal open={outerOpen} onClose={() => setOuterOpen(false)} title="Outer lock">
            <button onClick={() => setInnerOpen(true)}>Open inner lock</button>
          </Modal>
          <Modal open={innerOpen} onClose={() => setInnerOpen(false)} title="Inner lock">
            <button onClick={() => setOuterOpen(false)}>Unmount outer</button>
            <button onClick={() => setInnerOpen(false)}>Close inner</button>
          </Modal>
        </main>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open inner lock' }));
    const appContent = screen.getByTestId('app-content');
    const appBranch = appContent.parentElement as HTMLElement;
    expect(document.body.style.overflow).toBe('hidden');
    expect(appBranch).toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', { name: 'Unmount outer' }));

    expect(screen.queryByRole('dialog', { name: 'Outer lock' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Inner lock' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    expect(appBranch).toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', { name: 'Close inner' }));
    await waitFor(() => expect(document.body.style.overflow).toBe(''));
    expect(appBranch).not.toHaveAttribute('inert');
  });

  it('restores the page trigger when a nested dialog and its parent close together', async () => {
    function Harness() {
      const [outerOpen, setOuterOpen] = useState(false);
      const [innerOpen, setInnerOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOuterOpen(true)}>Open parent</button>
          <Modal open={outerOpen} onClose={() => setOuterOpen(false)} title="Parent">
            <button onClick={() => setInnerOpen(true)}>Open child</button>
          </Modal>
          <Modal
            open={innerOpen}
            onClose={() => setInnerOpen(false)}
            title="Child"
          >
            <button onClick={() => {
              setInnerOpen(false);
              setOuterOpen(false);
            }}>
              Close both
            </button>
          </Modal>
        </>
      );
    }

    render(<Harness />);
    const pageTrigger = screen.getByRole('button', { name: 'Open parent' });
    pageTrigger.focus();
    fireEvent.click(pageTrigger);
    const childTrigger = screen.getByRole('button', { name: 'Open child' });
    childTrigger.focus();
    fireEvent.click(childTrigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close both' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(pageTrigger).toHaveFocus();
  });
});
