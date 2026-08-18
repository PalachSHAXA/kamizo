import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemberDetailsModal } from '../MemberDetailsModal';
import { useModalStore } from '../../../../stores/modalStore';

const member = {
  id: 'staff-7',
  login: 'n.rahimov',
  password: 'legacy-secret',
  name: 'Nodir Rahimov',
  phone: '+998901234567',
  role: 'manager' as const,
  created_at: '2026-08-01T00:00:00.000Z',
};

function renderModal(isEditing = false, isResettingPassword = false, canResetPassword = true) {
  const onResetPassword = vi.fn();
  const props = {
    member,
    language: 'ru',
    isEditing,
    isLoadingDetails: false,
    showPassword: false,
    editForm: {
      name: member.name,
      phone: member.phone,
      login: member.login,
      password: 'legacy-secret',
      specialization: '' as const,
    },
    setEditForm: vi.fn(),
    copiedField: null,
    roleLabel: 'Менеджер',
    roleColorClass: 'bg-purple-100',
    specLabel: null,
    statusBadge: null,
    onClose: vi.fn(),
    onToggleEditing: vi.fn(),
    onTogglePassword: vi.fn(),
    onSave: vi.fn(),
    onCopy: vi.fn(),
    onResetPassword,
    isResettingPassword,
    canResetPassword,
  };

  render(<MemberDetailsModal {...props} />);
  return { onResetPassword, onClose: props.onClose };
}

describe('MemberDetailsModal password hardening', () => {
  beforeEach(() => useModalStore.setState({ count: 0 }));

  it('uses the shared dialog lifecycle and a safe-area footer', async () => {
    const { onClose } = renderModal();
    const dialog = screen.getByRole('dialog', { name: member.name });

    await waitFor(() => expect(useModalStore.getState().count).toBe(1));
    expect(dialog).toHaveClass('overflow-hidden', 'flex', 'flex-col');
    expect(screen.getByRole('button', { name: 'Сбросить пароль' }).parentElement).toHaveStyle({
      paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
    });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('offers generated password reset without revealing or copying a stored password', () => {
    const { onResetPassword } = renderModal();

    expect(screen.queryByText('legacy-secret')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /показать пароль/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /копировать пароль/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Копировать логин' })).toHaveClass('min-w-[44px]', 'min-h-[44px]');

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить пароль' }));
    expect(onResetPassword).toHaveBeenCalledOnce();
  });

  it('does not render a password field while editing staff details', () => {
    renderModal(true);

    expect(screen.queryByLabelText('Новый пароль')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Оставьте пустым, чтобы не менять')).not.toBeInTheDocument();
  });

  it('disables the reset action while a generated password is loading', () => {
    renderModal(false, true);

    expect(screen.getByRole('button', { name: 'Сброс...' })).toBeDisabled();
  });

  it('hides reset when the caller cannot act on the target role', () => {
    renderModal(false, false, false);

    expect(screen.queryByRole('button', { name: 'Сбросить пароль' })).not.toBeInTheDocument();
  });
});
