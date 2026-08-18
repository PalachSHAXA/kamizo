import { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from '../Sidebar';
import { useAuthStore } from '../../../stores/authStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { useModalStore } from '../../../stores/modalStore';
import { useTenantStore } from '../../../stores/tenantStore';

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

function SidebarHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(true)}>Open drawer</button>
      <Sidebar
        onLogout={vi.fn()}
        isOpen={open}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
      />
    </>
  );
}

describe('Sidebar accessibility', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    useLanguageStore.setState({ language: 'ru' });
    useAuthStore.setState({
      user: { id: 'shop-1', login: 'shop', phone: '+998900000000', name: 'Shop manager', role: 'marketplace_manager' },
      token: 'token',
      isLoading: false,
      error: null,
      pickerTenants: null,
    });
    useTenantStore.setState({ config: null });
    useModalStore.setState({ count: 0 });
    document.body.style.overflow = '';
  });

  it('makes a closed mobile drawer hidden and inert at 767px', () => {
    setViewportWidth(767);
    render(<MemoryRouter><Sidebar onLogout={vi.fn()} isOpen={false} onClose={vi.fn()} /></MemoryRouter>);
    const drawer = document.querySelector('#app-sidebar');
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
    expect(drawer).toHaveAttribute('inert');
    expect(drawer?.querySelectorAll('a, button')).not.toHaveLength(0);
  });

  it('keeps the desktop sidebar exposed at 768px regardless of drawer state', () => {
    setViewportWidth(768);
    render(<MemoryRouter><Sidebar onLogout={vi.fn()} isOpen={false} onClose={vi.fn()} /></MemoryRouter>);
    const drawer = document.querySelector('#app-sidebar');
    expect(drawer).not.toHaveAttribute('aria-hidden');
    expect(drawer).not.toHaveAttribute('inert');
  });

  it('traps focus, closes on Escape, and restores focus to the trigger', async () => {
    setViewportWidth(767);
    render(<MemoryRouter><SidebarHarness /></MemoryRouter>);
    const trigger = screen.getByRole('button', { name: 'Open drawer' });
    fireEvent.click(trigger);

    const drawer = document.querySelector('#app-sidebar')!;
    const focusable = Array.from(drawer.querySelectorAll<HTMLElement>('a, button:not([disabled])'));
    await waitFor(() => expect(focusable[0]).toHaveFocus());
    expect(document.body.style.overflow).toBe('hidden');
    expect(useModalStore.getState().count).toBe(1);

    focusable.at(-1)!.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(focusable[0]).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
    expect(drawer).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
    expect(useModalStore.getState().count).toBe(0);
  });

  it('lets a nested logout confirmation consume Escape before the drawer', async () => {
    setViewportWidth(320);
    render(<MemoryRouter><SidebarHarness /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));

    const drawer = document.querySelector('#app-sidebar')!;
    await waitFor(() => expect(drawer).not.toHaveAttribute('inert'));
    fireEvent.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));
    expect(await screen.findByRole('dialog', { name: 'Выйти из аккаунта?' })).toBeInTheDocument();
    expect(useModalStore.getState().count).toBe(2);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Выйти из аккаунта?' })).not.toBeInTheDocument();
    expect(drawer).not.toHaveAttribute('inert');
    expect(drawer).not.toHaveAttribute('aria-hidden');
    expect(useModalStore.getState().count).toBe(1);
  });

  it('exposes the resident contract in the commercial-owner drawer', () => {
    setViewportWidth(320);
    useAuthStore.setState({
      user: { id: 'commercial-1', login: 'commercial', phone: '+998900000001', name: 'Commercial owner', role: 'commercial_owner' },
      token: 'token',
      isLoading: false,
      error: null,
      pickerTenants: null,
    });

    render(<MemoryRouter><Sidebar onLogout={vi.fn()} isOpen onClose={vi.fn()} /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /^Договор/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Собрания/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Пропуска/ })).toBeInTheDocument();
  });

  it('closes after navigation at 767px', async () => {
    setViewportWidth(767);
    render(<MemoryRouter><SidebarHarness /></MemoryRouter>);
    const trigger = screen.getByRole('button', { name: 'Open drawer' });
    fireEvent.click(trigger);

    const drawer = document.querySelector('#app-sidebar')!;
    fireEvent.click(screen.getByRole('link', { name: 'Управление магазином' }));

    await waitFor(() => expect(drawer).toHaveAttribute('inert'));
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
    expect(trigger).toHaveFocus();
  });
});
