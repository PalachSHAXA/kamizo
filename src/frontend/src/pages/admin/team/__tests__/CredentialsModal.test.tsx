import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CredentialsModal } from '../CredentialsModal';

function getBodyBranch(element: HTMLElement) {
  let branch = element;
  while (branch.parentElement && branch.parentElement !== document.body) {
    branch = branch.parentElement;
  }
  return branch;
}
import { useModalStore } from '../../../../stores/modalStore';

const credentials = {
  login: 'very.long.staff.login.that.must.wrap',
  password: 'Temporary-Password-That-Must-Wrap-9482',
};

function renderCredentials(mode: 'create' | 'reset' = 'create') {
  const onClose = vi.fn();
  render(
    <CredentialsModal
      credentials={credentials}
      mode={mode}
      language="ru"
      onClose={onClose}
      copiedField={null}
      onCopy={vi.fn()}
    />,
  );
  return { onClose };
}

describe('CredentialsModal', () => {
  beforeEach(() => useModalStore.setState({ count: 0 }));

  it('uses reset-specific title and guidance', () => {
    renderCredentials('reset');

    expect(screen.getByRole('heading', { name: 'Пароль сброшен!' })).toBeInTheDocument();
    expect(screen.queryByText('Сотрудник создан!')).not.toBeInTheDocument();
  });

  it('is a labelled modal with mobile-safe credential rows and accessible touch controls', () => {
    renderCredentials();

    const dialog = screen.getByRole('dialog', { name: 'Сотрудник создан!' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(credentials.login).parentElement?.parentElement).toHaveClass('flex-col', 'sm:flex-row');
    expect(screen.getByText(credentials.password)).toHaveClass('break-all', 'min-w-0');
    expect(screen.getByRole('button', { name: 'Копировать логин' })).toHaveClass('min-w-[44px]', 'min-h-[44px]');
    expect(screen.getByRole('button', { name: 'Копировать пароль' })).toHaveClass('min-w-[44px]', 'min-h-[44px]');
    expect(screen.getByRole('button', { name: 'Готово' })).toHaveClass('min-h-[44px]');
    expect(dialog).toHaveClass('overflow-hidden', 'flex', 'flex-col');
    expect(screen.getByRole('button', { name: 'Готово' }).parentElement).toHaveStyle({
      paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
    });
  });

  it('focuses inside, closes on Escape, and restores trigger focus', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open credentials</button>
          {open && (
            <CredentialsModal
              credentials={credentials}
              mode="create"
              language="ru"
              onClose={() => setOpen(false)}
              copiedField={null}
              onCopy={vi.fn()}
            />
          )}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open credentials' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');

    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('wraps Tab and Shift+Tab within the credential controls', () => {
    renderCredentials();
    const first = screen.getByRole('button', { name: 'Копировать логин' });
    const last = screen.getByRole('button', { name: 'Готово' });

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('locks scroll, inerts background siblings, and restores both on unmount', () => {
    function Surface() {
      return (
        <div>
          <button data-testid="background-action">Background action</button>
          <CredentialsModal
            credentials={credentials}
            mode="create"
            language="ru"
            onClose={vi.fn()}
            copiedField={null}
            onCopy={vi.fn()}
          />
        </div>
      );
    }

    const { unmount } = render(<Surface />);
    const background = screen.getByTestId('background-action');
    const backgroundBranch = getBodyBranch(background);
    expect(document.body.style.overflow).toBe('hidden');
    expect(backgroundBranch).toHaveAttribute('inert');
    expect(backgroundBranch).toHaveAttribute('aria-hidden', 'true');

    unmount();
    expect(document.body.style.overflow).toBe('');
    expect(backgroundBranch).not.toHaveAttribute('inert');
    expect(backgroundBranch).not.toHaveAttribute('aria-hidden');
  });

  it('restores external focus when directly unmounted', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(
      <CredentialsModal
        credentials={credentials}
        mode="create"
        language="ru"
        onClose={vi.fn()}
        copiedField={null}
        onCopy={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement));
    unmount();

    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('keeps one lifecycle across copy rerenders and restores the original trigger', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const [copiedField, setCopiedField] = useState<string | null>(null);
      const [closedWith, setClosedWith] = useState('');
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open stable lifecycle</button>
          <span>{closedWith}</span>
          {open && (
            <CredentialsModal
              credentials={credentials}
              mode="create"
              language="ru"
              onClose={() => {
                setClosedWith(copiedField ? 'latest callback' : 'initial callback');
                setOpen(false);
              }}
              copiedField={copiedField}
              onCopy={(field) => setCopiedField(field)}
            />
          )}
        </div>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open stable lifecycle' });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement));
    const backgroundBranch = getBodyBranch(trigger);
    const removeAttribute = vi.spyOn(backgroundBranch, 'removeAttribute');

    fireEvent.click(screen.getByRole('button', { name: 'Копировать логин' }));

    expect(document.body.style.overflow).toBe('hidden');
    expect(backgroundBranch).toHaveAttribute('inert');
    expect(removeAttribute).not.toHaveBeenCalledWith('inert');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('latest callback')).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
